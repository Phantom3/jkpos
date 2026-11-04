async function testPosApi() {
    console.log('Testing Mobile POS & Printing Endpoints:');

    // 1. Open Tickets
    const openRes = await fetch('http://localhost:5000/api/pos/open-tickets');
    const openData = await openRes.json();
    console.log('1. Open Tickets query success. Count:', openData.length);

    // 2. Kitchen Printer Test (Hot Kitchen: 192.168.2.246:9100)
    console.log('2. Testing Kitchen Printer Dispatch...');
    const printRes = await fetch('http://localhost:5000/api/pos/test-print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId: 1 })
    });
    const printData = await printRes.json();
    console.log('Printer Test Result:', printData);
}

testPosApi().catch(console.error);
