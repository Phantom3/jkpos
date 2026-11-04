const express = require('express');
const cors = require('cors');
const config = require('./config');
const { getPool, sql } = require('./db');
const { printOrderToKitchen, KITCHEN_PRINTERS, sendToPrinter, formatKitchenTicket } = require('./printer');
const { createToken, verifyToken, requireAuth } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// AUTHENTICATION ENDPOINTS
// ==========================================

// POST /api/auth/login - Master login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    if (username.trim().toLowerCase() === config.auth.username.toLowerCase() && password === config.auth.password) {
        const token = createToken(config.auth.username);
        return res.json({
            success: true,
            token,
            username: config.auth.username,
            storeName: 'Dunes Deli & Catering'
        });
    }

    return res.status(401).json({ error: 'Invalid username or password.' });
});

// GET /api/auth/verify - Verify current token
app.get('/api/auth/verify', (req, res) => {
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    const decoded = verifyToken(token);
    if (decoded) {
        return res.json({ valid: true, user: decoded.username });
    }
    return res.status(401).json({ valid: false, error: 'Token invalid or expired.' });
});

// Protect all other /api/* endpoints
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/auth/')) {
        return next();
    }
    return requireAuth(req, res, next);
});

// ==========================================
// MOBILE POS & KITCHEN PRINTING ENDPOINTS
// ==========================================

// GET /api/pos/open-tickets - Fetch all currently active/open tables or tabs
app.get('/api/pos/open-tickets', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT 
                i.InvoiceIDN,
                i.InvoiceNumber,
                i.OrderNum,
                i.TableNum,
                i.GuestName,
                i.CreateDate,
                i.Subtotal,
                i.Tax,
                i.Total,
                COUNT(t.IDN) AS ItemCount
            FROM tInvoice i
            LEFT JOIN tItem t ON i.InvoiceIDN = t.InvoiceIDN AND t.IsActive = 1
            WHERE i.IsDone = 0 AND i.IsVoid = 0
            GROUP BY i.InvoiceIDN, i.InvoiceNumber, i.OrderNum, i.TableNum, i.GuestName, i.CreateDate, i.Subtotal, i.Tax, i.Total
            ORDER BY i.CreateDate DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/pos/ticket - Create a new order/ticket and optionally send items to kitchen
app.post('/api/pos/ticket', async (req, res) => {
    try {
        const { tableNum, guestName, items = [], serverName = 'Tablet' } = req.body;
        const pool = await getPool();

        // 1. Calculate next InvoiceNumber and OrderNum
        const numberRes = await pool.request().query(`
            SELECT 
                ISNULL(MAX(InvoiceNumber), 0) + 1 AS nextInvoiceNumber,
                (SELECT ISNULL(MAX(OrderNum), 0) + 1 FROM tInvoice WHERE CAST(CreateDate AS DATE) = CAST(GETDATE() AS DATE)) AS nextOrderNum
            FROM tInvoice
        `);
        const nextInvoiceNumber = numberRes.recordset[0].nextInvoiceNumber;
        const nextOrderNum = numberRes.recordset[0].nextOrderNum;
        const nextInvoiceIDN = nextInvoiceNumber * 100000 + 1000;
        const now = new Date();

        // Calculate totals
        let subtotal = 0;
        let totalTax = 0;
        const taxRate = 0.08625; // 8.625% NY Nassau County standard sales tax

        items.forEach(item => {
            const qty = item.qty || 1;
            const price = Number(item.price || item.Price || 0);
            const lineSubtotal = qty * price;
            subtotal += lineSubtotal;
            totalTax += lineSubtotal * taxRate;
        });

        const total = subtotal + totalTax;

        // 2. Insert into tInvoice
        await pool.request()
            .input('invoiceIdn', sql.Money, nextInvoiceIDN)
            .input('invoiceNumber', sql.Int, nextInvoiceNumber)
            .input('orderNum', sql.SmallInt, nextOrderNum)
            .input('tableNum', sql.NVarChar, String(tableNum || ''))
            .input('guestName', sql.NVarChar, String(guestName || ''))
            .input('subtotal', sql.Money, subtotal)
            .input('tax', sql.Money, totalTax)
            .input('total', sql.Money, total)
            .input('now', sql.DateTime, now)
            .query(`
                INSERT INTO tInvoice (
                    InvoiceIDN, InvoiceNumber, OrderNum, TableNum, GuestName,
                    Subtotal, Tax, Total, Payment, IsDone, IsVoid, IsActive,
                    CreateDate, ModifyDate, StoreID, StationID
                ) VALUES (
                    @invoiceIdn, @invoiceNumber, @orderNum, @tableNum, @guestName,
                    @subtotal, @tax, @total, 0, 0, 0, 1,
                    @now, @now, 1000, 1
                )
            `);

        // 3. Insert line items into tItem if any
        if (items.length > 0) {
            const maxItemRes = await pool.request().query('SELECT ISNULL(MAX(ItemIDN), 0) AS maxItemIdn FROM tItem');
            let nextItemIdn = Number(maxItemRes.recordset[0].maxItemIdn);

            for (const item of items) {
                nextItemIdn += 100000;
                const qty = item.qty || 1;
                const price = Number(item.price || item.Price || 0);
                const lineSubtotal = qty * price;
                const lineTax = lineSubtotal * taxRate;
                const lineTotal = lineSubtotal + lineTax;
                const refIdn = item.itemIdn || item.ItemIDN || 0;
                const memo = item.notes || item.memo || '';

                await pool.request()
                    .input('itemIdn', sql.Money, nextItemIdn)
                    .input('invoiceIdn', sql.Money, nextInvoiceIDN)
                    .input('refIdn', sql.Money, refIdn)
                    .input('qty', sql.SmallInt, qty)
                    .input('price', sql.Money, price)
                    .input('subtotal', sql.Money, lineSubtotal)
                    .input('tax', sql.Money, lineTax)
                    .input('total', sql.Money, lineTotal)
                    .input('memo', sql.NVarChar, memo)
                    .input('now', sql.DateTime, now)
                    .query(`
                        INSERT INTO tItem (
                            ItemIDN, InvoiceIDN, ReferenceIDN, Qty, Price,
                            Subtotal, Tax, Total, Memo, IsActive,
                            CreateDate, ModifyDate, StoreID, StationID
                        ) VALUES (
                            @itemIdn, @invoiceIdn, @refIdn, @qty, @price,
                            @subtotal, @tax, @total, @memo, 1,
                            @now, @now, 1000, 1
                        )
                    `);
            }

            // 4. Send to Kitchen Printers
            var printResults = await printOrderToKitchen({
                orderNum: nextOrderNum,
                invoiceNumber: nextInvoiceNumber,
                tableNum,
                guestName,
                serverName,
                date: now,
                items
            });
        }

        res.json({
            success: true,
            invoiceIDN: nextInvoiceIDN,
            invoiceNumber: nextInvoiceNumber,
            orderNum: nextOrderNum,
            tableNum,
            guestName,
            subtotal,
            tax: totalTax,
            total,
            printResults: printResults || []
        });
    } catch (err) {
        console.error('Error creating ticket:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/pos/ticket/:id/items - Add items to an existing open ticket and send to kitchen
app.post('/api/pos/ticket/:id/items', async (req, res) => {
    try {
        const invoiceId = req.params.id;
        const { items = [], serverName = 'Tablet' } = req.body;
        const pool = await getPool();

        // 1. Get existing invoice
        const invRes = await pool.request()
            .input('id', sql.Money, invoiceId)
            .query('SELECT * FROM tInvoice WHERE InvoiceIDN = @id');

        if (invRes.recordset.length === 0) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        const invoice = invRes.recordset[0];
        const now = new Date();
        const taxRate = 0.08625;

        // 2. Insert new items into tItem
        let addedSubtotal = 0;
        let addedTax = 0;

        const maxItemRes = await pool.request().query('SELECT ISNULL(MAX(ItemIDN), 0) AS maxItemIdn FROM tItem');
        let nextItemIdn = Number(maxItemRes.recordset[0].maxItemIdn);

        for (const item of items) {
            nextItemIdn += 100000;
            const qty = item.qty || 1;
            const price = Number(item.price || item.Price || 0);
            const lineSubtotal = qty * price;
            const lineTax = lineSubtotal * taxRate;
            const lineTotal = lineSubtotal + lineTax;
            const refIdn = item.itemIdn || item.ItemIDN || 0;
            const memo = item.notes || item.memo || '';

            addedSubtotal += lineSubtotal;
            addedTax += lineTax;

            await pool.request()
                .input('itemIdn', sql.Money, nextItemIdn)
                .input('invoiceIdn', sql.Money, invoiceId)
                .input('refIdn', sql.Money, refIdn)
                .input('qty', sql.SmallInt, qty)
                .input('price', sql.Money, price)
                .input('subtotal', sql.Money, lineSubtotal)
                .input('tax', sql.Money, lineTax)
                .input('total', sql.Money, lineTotal)
                .input('memo', sql.NVarChar, memo)
                .input('now', sql.DateTime, now)
                .query(`
                    INSERT INTO tItem (
                        ItemIDN, InvoiceIDN, ReferenceIDN, Qty, Price,
                        Subtotal, Tax, Total, Memo, IsActive,
                        CreateDate, ModifyDate, StoreID, StationID
                    ) VALUES (
                        @itemIdn, @invoiceIdn, @refIdn, @qty, @price,
                        @subtotal, @tax, @total, @memo, 1,
                        @now, @now, 1000, 1
                    )
                `);
        }

        // 3. Update invoice totals
        const newSubtotal = Number(invoice.Subtotal || 0) + addedSubtotal;
        const newTax = Number(invoice.Tax || 0) + addedTax;
        const newTotal = newSubtotal + newTax;

        await pool.request()
            .input('id', sql.Money, invoiceId)
            .input('subtotal', sql.Money, newSubtotal)
            .input('tax', sql.Money, newTax)
            .input('total', sql.Money, newTotal)
            .input('now', sql.DateTime, now)
            .query(`
                UPDATE tInvoice
                SET Subtotal = @subtotal, Tax = @tax, Total = @total, ModifyDate = @now
                WHERE InvoiceIDN = @id
            `);

        // 4. Send ONLY the new items to the kitchen
        const printResults = await printOrderToKitchen({
            orderNum: invoice.OrderNum,
            invoiceNumber: invoice.InvoiceNumber,
            tableNum: invoice.TableNum,
            guestName: invoice.GuestName,
            serverName,
            date: now,
            items
        });

        res.json({
            success: true,
            invoiceNumber: invoice.InvoiceNumber,
            orderNum: invoice.OrderNum,
            newSubtotal,
            newTotal,
            printResults
        });
    } catch (err) {
        console.error('Error adding items to ticket:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/pos/test-print - Test print a slip to kitchen printer 1 or 2
app.post('/api/pos/test-print', async (req, res) => {
    try {
        const { printerId = 1 } = req.body;
        const printer = KITCHEN_PRINTERS[printerId] || KITCHEN_PRINTERS[1];
        
        const testTicket = formatKitchenTicket({
            orderNum: 99,
            invoiceNumber: 99999,
            tableNum: 'TEST',
            guestName: 'PRINTER TEST',
            serverName: 'TABLET',
            date: new Date(),
            items: [
                { qty: 1, name: 'TEST PRINT ITEM (HOT)', notes: 'Testing connection to POS-80C' }
            ],
            kitchenName: printer.name
        });

        const printRes = await sendToPrinter(printer, testTicket);
        res.json({ success: true, printer: printer.name, details: printRes });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// UTILITY: TOP 5 ORDERED SANDWICHES
// ==========================================
app.get('/api/utilities/top-sandwiches', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;
        const limit = parseInt(req.query.limit) || 5;
        const pool = await getPool();

        // 1. Get Top Sandwiches
        const topResult = await pool.request()
            .input('days', sql.Int, days)
            .input('limit', sql.Int, limit)
            .query(`
                SELECT TOP (@limit)
                    r.ItemIDN,
                    r.Name,
                    c.Name AS Category,
                    SUM(t.Qty) AS TotalQuantity,
                    SUM(t.Total) AS TotalRevenue,
                    ROUND(SUM(t.Total) / NULLIF(SUM(t.Qty), 0), 2) AS AvgPrice
                FROM tItem t
                INNER JOIN tInvoice i ON t.InvoiceIDN = i.InvoiceIDN
                INNER JOIN rItem r ON t.ReferenceIDN = r.ItemIDN
                INNER JOIN rCategory c ON r.CategoryIDN = c.CategoryIDN
                WHERE i.IsVoid = 0
                  AND i.CreateDate >= DATEADD(DAY, -@days, GETDATE())
                  AND (
                      c.CategoryIDN IN (201000, 1001000, 1101000, 1201000, 1301000, 1501000, 1701000, 1801000)
                      OR r.Name LIKE '%Sandwich%'
                      OR r.Name LIKE '%Hero%'
                      OR r.Name LIKE '%Panini%'
                      OR r.Name LIKE '%Wrap%'
                  )
                  AND r.Name NOT IN ('Buttered Roll')
                GROUP BY r.ItemIDN, r.Name, c.Name
                ORDER BY TotalQuantity DESC
            `);

        // 2. Get Grand Totals for Sandwiches in this period
        const totalResult = await pool.request()
            .input('days', sql.Int, days)
            .query(`
                SELECT 
                    SUM(t.Qty) AS GrandTotalQty,
                    SUM(t.Total) AS GrandTotalRevenue
                FROM tItem t
                INNER JOIN tInvoice i ON t.InvoiceIDN = i.InvoiceIDN
                INNER JOIN rItem r ON t.ReferenceIDN = r.ItemIDN
                INNER JOIN rCategory c ON r.CategoryIDN = c.CategoryIDN
                WHERE i.IsVoid = 0
                  AND i.CreateDate >= DATEADD(DAY, -@days, GETDATE())
                  AND (
                      c.CategoryIDN IN (201000, 1001000, 1101000, 1201000, 1301000, 1501000, 1701000, 1801000)
                      OR r.Name LIKE '%Sandwich%'
                      OR r.Name LIKE '%Hero%'
                      OR r.Name LIKE '%Panini%'
                      OR r.Name LIKE '%Wrap%'
                  )
                  AND r.Name NOT IN ('Buttered Roll')
            `);

        const grandTotalQty = totalResult.recordset[0]?.GrandTotalQty || 0;
        const grandTotalRevenue = totalResult.recordset[0]?.GrandTotalRevenue || 0;

        const sandwichesWithRank = topResult.recordset.map((item, idx) => {
            const share = grandTotalQty > 0 ? ((item.TotalQuantity / grandTotalQty) * 100).toFixed(1) : 0;
            return {
                rank: idx + 1,
                ...item,
                sharePercent: Number(share)
            };
        });

        res.json({
            days,
            startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date().toISOString(),
            grandTotalQty,
            grandTotalRevenue,
            sandwiches: sandwichesWithRank
        });
    } catch (err) {
        console.error('Error fetching top sandwiches:', err);
        res.status(500).json({ error: err.message });
    }
});

// 1. System & Connection Status
app.get('/api/status', async (req, res) => {
    try {
        const pool = await getPool();
        const counts = await pool.request().query(`
            SELECT 
                (SELECT COUNT(*) FROM rCategory WHERE IsActive = 1) AS categoryCount,
                (SELECT COUNT(*) FROM rItem WHERE IsActive = 1 AND Name <> '' AND Name IS NOT NULL) AS itemCount,
                (SELECT COUNT(*) FROM tInvoice) AS totalInvoices,
                (SELECT TOP 1 Name FROM rStore) AS storeName
        `);
        
        res.json({
            status: 'connected',
            server: config.db.server,
            instance: config.db.options.instanceName,
            database: config.db.database,
            storeName: counts.recordset[0]?.storeName || 'Dunes Deli & Catering',
            categoryCount: counts.recordset[0]?.categoryCount || 0,
            itemCount: counts.recordset[0]?.itemCount || 0,
            totalInvoices: counts.recordset[0]?.totalInvoices || 0,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// 2. Categories List
app.get('/api/categories', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT 
                c.CategoryIDN,
                c.Name,
                c.ItemOrder,
                c.IsActive,
                COUNT(i.IDN) AS ItemCount
            FROM rCategory c
            LEFT JOIN rItem i ON c.CategoryIDN = i.CategoryIDN AND i.IsActive = 1 AND i.Name <> '' AND i.Name IS NOT NULL
            WHERE c.IsActive = 1
            GROUP BY c.CategoryIDN, c.Name, c.ItemOrder, c.IsActive
            ORDER BY c.ItemOrder, c.Name
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Items List (filterable by category, search, sold out)
app.get('/api/items', async (req, res) => {
    try {
        const { categoryId, search, soldOut } = req.query;
        const pool = await getPool();
        const request = pool.request();
        
        let query = `
            SELECT 
                i.ItemIDN,
                i.Name,
                i.Price,
                i.PriceLunch,
                i.CategoryIDN,
                c.Name AS CategoryName,
                i.IsActive,
                i.IsSoldOut,
                i.ItemOrder,
                i.KitchenPrinterNum,
                i.UpchargeRequiredCount
            FROM rItem i
            LEFT JOIN rCategory c ON i.CategoryIDN = c.CategoryIDN
            WHERE i.IsActive = 1 AND i.Name <> '' AND i.Name IS NOT NULL
        `;

        if (categoryId) {
            query += ` AND i.CategoryIDN = @categoryId`;
            request.input('categoryId', sql.Money, categoryId);
        }

        if (search) {
            query += ` AND (i.Name LIKE @search OR c.Name LIKE @search)`;
            request.input('search', sql.NVarChar, `%${search}%`);
        }

        if (soldOut !== undefined) {
            query += ` AND i.IsSoldOut = @soldOut`;
            request.input('soldOut', sql.Bit, soldOut === 'true' ? 1 : 0);
        }

        query += ` ORDER BY c.ItemOrder, i.ItemOrder, i.Name`;

        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Single Item Detail with modifier groups
app.get('/api/items/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const itemResult = await pool.request()
            .input('id', sql.Money, req.params.id)
            .query(`
                SELECT 
                    i.*,
                    c.Name AS CategoryName
                FROM rItem i
                LEFT JOIN rCategory c ON i.CategoryIDN = c.CategoryIDN
                WHERE i.ItemIDN = @id
            `);

        if (itemResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }

        const item = itemResult.recordset[0];
        res.json(item);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Update Item Price
app.post('/api/items/:id/price', async (req, res) => {
    try {
        const { price } = req.body;
        if (price === undefined || isNaN(price) || price < 0) {
            return res.status(400).json({ error: 'Invalid price value' });
        }
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Money, req.params.id)
            .input('price', sql.Money, price)
            .input('now', sql.DateTime, new Date())
            .query(`
                UPDATE rItem 
                SET Price = @price, ModifyDate = @now 
                WHERE ItemIDN = @id
            `);

        res.json({ success: true, message: 'Price updated successfully', price: Number(price) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Toggle Item Sold Out Status
app.post('/api/items/:id/soldout', async (req, res) => {
    try {
        const { isSoldOut } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Money, req.params.id)
            .input('isSoldOut', sql.Bit, isSoldOut ? 1 : 0)
            .input('now', sql.DateTime, new Date())
            .query(`
                UPDATE rItem 
                SET IsSoldOut = @isSoldOut, ModifyDate = @now 
                WHERE ItemIDN = @id
            `);

        res.json({ success: true, isSoldOut: !!isSoldOut });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Modifiers & Modifier Groups (consolidated by unique group name)
app.get('/api/modifiers', async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT 
                g.Name AS GroupName,
                MAX(g.MinQty) AS MinQty,
                MAX(g.MaxQty) AS MaxQty,
                u.Name AS ModifierName,
                u.Price
            FROM rUpcharge u
            INNER JOIN rUpchargeGroup g ON u.UpchargeGroupIDN = g.UpchargeGroupIDN
            WHERE g.IsActive = 1 AND u.IsActive = 1 AND g.Name <> '' AND u.Name <> ''
            GROUP BY g.Name, u.Name, u.Price
            ORDER BY g.Name, u.Price, u.Name
        `);

        const groupsMap = new Map();
        for (const row of result.recordset) {
            if (!groupsMap.has(row.GroupName)) {
                groupsMap.set(row.GroupName, {
                    UpchargeGroupIDN: row.GroupName,
                    Name: row.GroupName,
                    MinQty: row.MinQty,
                    MaxQty: row.MaxQty,
                    modifiers: []
                });
            }
            groupsMap.get(row.GroupName).modifiers.push({
                UpchargeIDN: `${row.GroupName}_${row.ModifierName}_${row.Price}`,
                Name: row.ModifierName,
                Price: row.Price
            });
        }

        res.json(Array.from(groupsMap.values()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Orders / Invoices List (recent orders)
app.get('/api/orders', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const pool = await getPool();
        const result = await pool.request()
            .input('limit', sql.Int, limit)
            .query(`
                SELECT TOP (@limit)
                    InvoiceIDN,
                    InvoiceNumber,
                    CreateDate,
                    Subtotal,
                    Tax,
                    Discount,
                    Total,
                    Payment,
                    IsDone,
                    IsVoid,
                    GuestName,
                    TableNum,
                    OrderNum
                FROM tInvoice
                ORDER BY InvoiceIDN DESC
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. Single Order Detail with line items
app.get('/api/orders/:id', async (req, res) => {
    try {
        const pool = await getPool();
        const invoiceResult = await pool.request()
            .input('id', sql.Money, req.params.id)
            .query(`
                SELECT * FROM tInvoice WHERE InvoiceIDN = @id
            `);

        if (invoiceResult.recordset.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const itemsResult = await pool.request()
            .input('id', sql.Money, req.params.id)
            .query(`
                SELECT 
                    t.ItemIDN,
                    t.InvoiceIDN,
                    t.ReferenceIDN,
                    t.Qty,
                    t.Price,
                    t.Subtotal,
                    t.Tax,
                    t.Total,
                    ISNULL(r.Name, 'Item #' + CAST(t.ReferenceIDN AS VARCHAR)) AS ItemName
                FROM tItem t
                LEFT JOIN rItem r ON t.ReferenceIDN = r.ItemIDN
                WHERE t.InvoiceIDN = @id
            `);

        const paymentsResult = await pool.request()
            .input('id', sql.Money, req.params.id)
            .query(`
                SELECT * FROM tPayment WHERE InvoiceIDN = @id
            `);

        res.json({
            order: invoiceResult.recordset[0],
            items: itemsResult.recordset,
            payments: paymentsResult.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. Dashboard Stats (summary)
app.get('/api/stats', async (req, res) => {
    try {
        const pool = await getPool();
        const statsResult = await pool.request().query(`
            SELECT 
                (SELECT COUNT(*) FROM rCategory WHERE IsActive = 1) AS totalCategories,
                (SELECT COUNT(*) FROM rItem WHERE IsActive = 1 AND Name <> '' AND Name IS NOT NULL) AS totalItems,
                (SELECT COUNT(*) FROM rItem WHERE IsActive = 1 AND IsSoldOut = 1) AS soldOutItems,
                (SELECT COUNT(*) FROM tInvoice) AS totalOrders,
                (SELECT ISNULL(SUM(Total), 0) FROM tInvoice WHERE IsVoid = 0) AS lifetimeRevenue,
                (SELECT COUNT(*) FROM tCustomer) AS totalCustomers
        `);

        // Recent 5 sales
        const recentOrders = await pool.request().query(`
            SELECT TOP 5 InvoiceNumber, CreateDate, Total, GuestName
            FROM tInvoice
            WHERE IsVoid = 0
            ORDER BY InvoiceIDN DESC
        `);

        res.json({
            overview: statsResult.recordset[0],
            recentOrders: recentOrders.recordset
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve static frontend files if built
const path = require('path');
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
const fs = require('fs');

// Dedicated Standalone Utility Route
app.get('/top-sandwiches', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'top-sandwiches.html'));
});

if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

const PORT = config.port;
app.listen(PORT, () => {
    console.log(`[JKRestaurant API] Server running on http://localhost:${PORT}`);
});
