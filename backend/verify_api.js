async function test() {
    try {
        console.log('--- Testing /api/status ---');
        let res = await fetch('http://localhost:5000/api/status');
        let data = await res.json();
        console.log('Status Response:', data);

        console.log('\n--- Testing /api/categories ---');
        res = await fetch('http://localhost:5000/api/categories');
        data = await res.json();
        console.log('Categories Count:', data.length, 'First 3:', data.slice(0, 3));

        console.log('\n--- Testing /api/items (Custom Sandwich: 201000) ---');
        res = await fetch('http://localhost:5000/api/items?categoryId=201000');
        data = await res.json();
        console.log('Items Count:', data.length, 'Sample:', data.slice(0, 2));

        console.log('\n--- Testing /api/orders ---');
        res = await fetch('http://localhost:5000/api/orders?limit=2');
        data = await res.json();
        console.log('Orders sample:', data);

        console.log('\n--- Testing /api/stats ---');
        res = await fetch('http://localhost:5000/api/stats');
        data = await res.json();
        console.log('Stats:', data);
    } catch (e) {
        console.error('API Verification error:', e);
    }
}

test();
