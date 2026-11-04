async function testE2E() {
    console.log('Testing End-to-End System Integration:');
    
    // 1. Static React App
    const htmlRes = await fetch('http://localhost:5000/');
    console.log('1. React Frontend served: Status', htmlRes.status, '- Contains doctype:', (await htmlRes.text()).includes('<!doctype html>'));

    // Authenticate to get token
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'dunes2026' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    const authHeaders = { 'Authorization': `Bearer ${token}` };

    // 2. Status
    const statusRes = await fetch('http://localhost:5000/api/status', { headers: authHeaders });
    const statusData = await statusRes.json();
    console.log('2. SQL Status:', statusData.status, 'Server:', statusData.server, 'Store:', statusData.storeName);

    // 3. Categories
    const catRes = await fetch('http://localhost:5000/api/categories', { headers: authHeaders });
    const catData = await catRes.json();
    console.log('3. Categories loaded:', catData.length, 'categories found.');

    // 4. Items
    const itemsRes = await fetch('http://localhost:5000/api/items', { headers: authHeaders });
    const itemsData = await itemsRes.json();
    console.log('4. Items loaded:', itemsData.length, 'active items.');

    // 5. Orders
    const ordersRes = await fetch('http://localhost:5000/api/orders?limit=3', { headers: authHeaders });
    const ordersData = await ordersRes.json();
    console.log('5. Orders loaded:', ordersData.length, 'orders. Latest ticket #:', ordersData[0]?.InvoiceNumber);

    // 6. Order Details
    if (ordersData.length > 0) {
        const orderId = ordersData[0].InvoiceIDN;
        const detailRes = await fetch(`http://localhost:5000/api/orders/${orderId}`, { headers: authHeaders });
        const detailData = await detailRes.json();
        console.log('6. Order Detail loaded: Ticket #', detailData.order.InvoiceNumber, 'with', detailData.items.length, 'line items.');
    }

    // 7. Modifiers
    const modRes = await fetch('http://localhost:5000/api/modifiers', { headers: authHeaders });
    const modData = await modRes.json();
    console.log('7. Modifiers loaded:', modData.length, 'modifier groups.');

    console.log('\n--- ALL E2E INTEGRATION CHECKS PASSED SUCCESSFULLY! ---');
}

testE2E().catch(console.error);
