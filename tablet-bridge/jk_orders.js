/**
 * JKRestaurant MS SQL Server Order Integration
 * Inserts parsed delivery orders into tInvoice and tItem as Open Orders
 */

const { getPool, sql } = require('C:/Users/Dunesuser/jkrestaurant-web/backend/db');

/**
 * Parses raw OCR text lines from a printed delivery receipt
 */
function parseReceiptText(lines) {
  if (!lines || lines.length === 0) {
    return null;
  }

  // 0. Sanitize lines: remove Unicode replacement chars, bullets, noise
  const cleanLines = lines.map(l => {
    return l.replace(/[\uFFFD\u2022\u2023\u25E6\u2043\u2219]/g, ' ')
            .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
            .replace(/[^\x20-\x7E]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
  }).filter(l => l.length > 0 && !/^[-=_*•~|\\\/+#\s]+$/.test(l));

  const fullText = cleanLines.join('\n');
  let platform = 'Delivery';
  if (/uber/i.test(fullText)) {
    platform = 'Uber Eats';
  } else if (/grubhub|seamless/i.test(fullText)) {
    platform = 'Grubhub';
  }

  // 1. Order ID
  let orderId = '';
  for (const line of cleanLines) {
    const m = line.match(/(?:Order|Receipt|Invoice|#)\s*#?:?\s*([A-Za-z0-9\-]{4,15})/i);
    if (m) {
      orderId = m[1];
      break;
    }
  }
  if (!orderId) {
    orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
  }

  // 2. Customer Name
  let customerName = '';
  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i];
    const matchCust = line.match(/^(?:Customer|Deliver\s*to|Delivery\s*for|For|Name|Ship\s*to)\s*[:\-]?\s*(.+)$/i);
    if (matchCust) {
      customerName = matchCust[1].trim();
      break;
    }
    if (/^(?:Customer|Deliver\s*to|Delivery\s*for|For|Ship\s*to)$/i.test(line) && i + 1 < cleanLines.length) {
      customerName = cleanLines[i + 1].trim();
      break;
    }
  }

  // Fallback: look for typical customer name pattern "FirstName L." or "FirstName LastName"
  if (!customerName) {
    for (let i = 0; i < Math.min(cleanLines.length, 8); i++) {
      const line = cleanLines[i].trim();
      if (/^[A-Z][a-z]{1,15}\s+[A-Z]\.?$/.test(line) || /^[A-Z][a-z]{1,15}\s+[A-Z][a-z]{1,15}$/.test(line)) {
        if (!/uber|eats|grubhub|order|receipt|ticket|invoice|pickup|delivery/i.test(line)) {
          customerName = line;
          break;
        }
      }
    }
  }

  // 3. Totals
  let total = 0;
  let subtotal = 0;
  let tax = 0;

  for (const line of cleanLines) {
    const subtotalMatch = line.match(/\b(?:SUBTOTAL|Items\s*Subtotal)\b\s*[:\$]?\s*\$?(\d+\.\d{2})/i);
    if (subtotalMatch && !subtotal) {
      subtotal = parseFloat(subtotalMatch[1]);
    }
    const totalMatch = line.match(/\b(?:TOTAL|Amount\s*Due|Total\s*Charge)\b\s*[:\$]?\s*\$?(\d+\.\d{2})/i);
    if (totalMatch && !total && !/subtotal/i.test(line)) {
      total = parseFloat(totalMatch[1]);
    }
    const taxMatch = line.match(/\b(?:TAX|Sales\s*Tax)\b\s*[:\$]?\s*\$?(\d+\.\d{2})/i);
    if (taxMatch && !tax) {
      tax = parseFloat(taxMatch[1]);
    }
  }

  if (total > 0 && subtotal === 0) {
    subtotal = total;
  }

  // 4. Extract Line Items
  const items = [];
  const itemRegex = /^(?:\[?(\d+)\]?\s*(?:x|\*|\.|\-)?\s+)(.+)$/i;

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i].trim();

    // Skip headers and totals
    if (/total|subtotal|tax|discount|order|uber|grubhub|receipt|deliver|ship|date|time|estimated|prep time/i.test(line)) {
      continue;
    }

    const itemMatch = line.match(itemRegex);
    if (itemMatch) {
      const qty = parseInt(itemMatch[1], 10) || 1;
      let name = itemMatch[2].replace(/\$[\d\.]+.*$/, '').trim();
      
      // Skip if matched time, header, or price mistakenly
      if (/^(?:estimated|prep|min|mins|minute|minutes|hour|hours|am|pm|pickup|dropoff|ready)\b/i.test(name)) {
        continue;
      }
      if (/^\$?[\d\.]+\$?$/.test(name)) {
        continue;
      }

      // Collect all following modifier / instruction lines
      const modifierLines = [];
      while (i + 1 < cleanLines.length) {
        const nextLine = cleanLines[i + 1].trim();
        // Stop at next item or header/total
        if (!nextLine || itemRegex.test(nextLine) || /\b(?:total|subtotal|tax|discount|order|uber|grubhub|receipt|deliver|ship)\b/i.test(nextLine)) {
          break;
        }
        // Skip time lines and standalone price lines
        if (!/^\d+\s*(?:min|mins|minute|minutes)\b/i.test(nextLine) && !/^\$\d+\.\d{2}$/.test(nextLine)) {
          let cleanMod = nextLine.replace(/^(?:customer\s*notes?|special\s*instructions?)\s*[:\-]?\s*/i, '')
                                 .replace(/^[*\-•\(\)]+/g, '')
                                 .trim();
          if (cleanMod.length > 1) {
            modifierLines.push(cleanMod);
          }
        }
        i++;
      }
      const notes = modifierLines.join(', ');

      if (name.length >= 2) {
        items.push({
          qty,
          name,
          notes,
          price: 0
        });
      }
    }
  }

  return {
    platform,
    orderId,
    customerName,
    items,
    subtotal,
    tax,
    total,
    rawLines: cleanLines
  };
}

/**
 * Inserts the parsed order into JKRestaurant's tInvoice and tItem tables
 */
async function insertJkOpenOrder(orderData) {
  if (!orderData) return null;

  const pool = await getPool();

  // 1. Check if this OnlineOrderNumber already exists to prevent duplicates
  if (orderData.orderId) {
    const existing = await pool.request()
      .input('oid', sql.NVarChar, String(orderData.orderId))
      .query('SELECT TOP 1 InvoiceIDN, InvoiceNumber, OrderNum FROM tInvoice WHERE OnlineOrderNumber = @oid');
    if (existing.recordset.length > 0) {
      console.log(`[JK-DB] Order ${orderData.orderId} already exists in tInvoice (Invoice #${existing.recordset[0].InvoiceNumber})`);
      return { duplicate: true, invoiceNumber: existing.recordset[0].InvoiceNumber };
    }
  }

  // 2. Query active ShiftIDN and next Invoice/Order numbers
  const numberRes = await pool.request().query(`
    SELECT 
      ISNULL(MAX(InvoiceNumber), 0) + 1 AS nextInvoiceNumber,
      (SELECT ISNULL(MAX(OrderNum), 0) + 1 FROM tInvoice WHERE CAST(CreateDate AS DATE) = CAST(GETDATE() AS DATE)) AS nextOrderNum,
      (SELECT TOP 1 ShiftIDN FROM tShift WHERE Status = 1 ORDER BY ShiftIDN DESC) AS activeShiftIdn
    FROM tInvoice
  `);

  const nextInvoiceNumber = numberRes.recordset[0].nextInvoiceNumber;
  const nextOrderNum = numberRes.recordset[0].nextOrderNum;
  const activeShiftIdn = numberRes.recordset[0].activeShiftIdn || 301000;
  const nextInvoiceIDN = nextInvoiceNumber * 100000 + 1000;
  const now = new Date();

  // Combine platform and customer name (e.g. "UBER JOHN" or "GH SARAH")
  const prefix = (orderData.platform && /uber/i.test(orderData.platform)) ? 'UBER' : 
                 (orderData.platform && /grub/i.test(orderData.platform)) ? 'GH' : 'ONLINE';
  const rawCust = orderData.customerName ? orderData.customerName.replace(/^(customer|name|for):?/i, '').trim() : '';
  const posGuestName = rawCust ? `${prefix} ${rawCust}`.slice(0, 50) : `${prefix} #${nextOrderNum}`;

  // Online delivery orders are prepaid on the platform - store at $0.00 on the POS
  const totalAmount = 0.00;
  const subtotalAmount = 0.00;
  const taxAmount = 0.00;

  // 3. Insert into tInvoice with native POS Tab schema ($0.00 prepaid)
  await pool.request()
    .input('invoiceIdn', sql.Money, nextInvoiceIDN)
    .input('invoiceNumber', sql.Int, nextInvoiceNumber)
    .input('orderNum', sql.SmallInt, nextOrderNum)
    .input('shiftIdn', sql.Money, activeShiftIdn)
    .input('guestName', sql.NVarChar, posGuestName)
    .input('subtotal', sql.Money, subtotalAmount)
    .input('tax', sql.Money, taxAmount)
    .input('total', sql.Money, totalAmount)
    .input('onlineOrderNumber', sql.NVarChar, String(orderData.orderId || ''))
    .input('now', sql.DateTime, now)
    .query(`
      INSERT INTO tInvoice (
        InvoiceIDN, InvoiceNumber, OrderNum, TypeIDC, TableNum, GuestName,
        Subtotal, Tax, Tax1, Total, Balance, Payment, IsDone, IsClosed, IsVoid, IsActive,
        CreateDate, ModifyDate, StoreID, StationID, CustomerIDN, CreateUserIDN, ServerIDN, PriceGroupIDN,
        EditCount, SyncStatus, IsOnlineOrder, OnlineOrderNumber
      ) VALUES (
        @invoiceIdn, @invoiceNumber, @orderNum, 'B', '', @guestName,
        @subtotal, @tax, @tax, @total, @total, 0, 0, 0, 0, 1,
        @now, @now, 1000, 1, 101000, 701000, 701000, 101000,
        1, 1, 1, @onlineOrderNumber
      )
    `);

  console.log(`[JK-DB] Created Open Order in tInvoice: Invoice #${nextInvoiceNumber}, Order #${nextOrderNum}, Tab: ${posGuestName} ($0.00 Prepaid)`);

  // 4. Insert Items into tItem ($0.00 prices)
  if (orderData.items && orderData.items.length > 0) {
    const maxItemRes = await pool.request().query('SELECT ISNULL(MAX(ItemIDN), 0) AS maxItemIdn FROM tItem');
    let nextItemIdn = Number(maxItemRes.recordset[0].maxItemIdn);

    // Cache menu items for name matching
    const menuItemsRes = await pool.request().query('SELECT ItemIDN, Name, Price FROM rItem WHERE IsActive = 1');
    const menuItems = menuItemsRes.recordset;

    let itemOrderIdx = 0;
    for (const item of orderData.items) {
      nextItemIdn += 100000;
      const qty = item.qty || 1;

      // Try matching name against rItem
      const matched = menuItems.find(m => m.Name.toLowerCase() === item.name.toLowerCase()) ||
                      menuItems.find(m => m.Name.toLowerCase().includes(item.name.toLowerCase()));

      const refIdn = matched ? matched.ItemIDN : 0;
      const price = 0.00;
      const lineSubtotal = 0.00;
      const lineTax = 0.00;
      const lineTotal = 0.00;
      const summaryText = item.notes ? `${item.name}\r\n* ${item.notes}` : item.name;

      await pool.request()
        .input('itemIdn', sql.Money, nextItemIdn)
        .input('invoiceIdn', sql.Money, nextInvoiceIDN)
        .input('refIdn', sql.Money, refIdn)
        .input('qty', sql.SmallInt, qty)
        .input('price', sql.Money, price)
        .input('subtotal', sql.Money, lineSubtotal)
        .input('tax', sql.Money, lineTax)
        .input('total', sql.Money, lineTotal)
        .input('summary', sql.NVarChar, summaryText)
        .input('memo', sql.NVarChar, item.notes || '')
        .input('shiftIdn', sql.Money, activeShiftIdn)
        .input('itemOrder', sql.Int, itemOrderIdx++)
        .input('now', sql.DateTime, now)
        .query(`
          INSERT INTO tItem (
            ItemIDN, InvoiceIDN, ReferenceIDN, Qty, Price,
            Subtotal, Tax, Tax1, Total, Balance, Summary, Memo, IsActive, IsVoid,
            CreateDate, ModifyDate, StoreID, StationID, CustomerIDN, EmployeeIDN, ShiftIDN,
            ItemOrder, SyncStatus, IsOnlineOrder, IsPrinted
          ) VALUES (
            @itemIdn, @invoiceIdn, @refIdn, @qty, @price,
            @subtotal, @tax, @tax, @total, @total, @summary, @memo, 1, 0,
            @now, @now, 1000, 1, 101000, 701000, @shiftIdn,
            @itemOrder, 1, 1, 1
          )
        `);
    }
  }

  return {
    success: true,
    invoiceIDN: nextInvoiceIDN,
    invoiceNumber: nextInvoiceNumber,
    orderNum: nextOrderNum
  };
}

module.exports = {
  parseReceiptText,
  insertJkOpenOrder
};
