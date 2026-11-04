const sql = require('mssql');
const config = require('./config');

async function testConnection() {
    console.log('Attempting to connect to SQL Server at:', config.db.server, 'instance:', config.db.options.instanceName);
    try {
        const pool = await sql.connect(config.db);
        console.log('Connected successfully!');
        
        const catResult = await pool.request().query('SELECT COUNT(*) AS categoryCount FROM rCategory WHERE IsActive = 1');
        console.log('Active Categories Count:', catResult.recordset[0].categoryCount);
        
        const itemResult = await pool.request().query('SELECT COUNT(*) AS itemCount FROM rItem WHERE IsActive = 1');
        console.log('Active Items Count:', itemResult.recordset[0].itemCount);

        const catList = await pool.request().query('SELECT CategoryIDN, Name, ItemOrder FROM rCategory WHERE IsActive = 1 ORDER BY ItemOrder, Name');
        console.log('Categories:', catList.recordset);

        const sampleItems = await pool.request().query("SELECT TOP 10 ItemIDN, Name, Price, CategoryIDN FROM rItem WHERE IsActive = 1 AND Name <> '' AND Name IS NOT NULL ORDER BY Name");
        console.log('Sample Items with Name:', sampleItems.recordset);

        await pool.close();
        console.log('Connection closed cleanly.');
    } catch (err) {
        console.error('Connection failed:', err);
    }
}

testConnection();
