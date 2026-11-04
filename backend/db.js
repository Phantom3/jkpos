const sql = require('mssql');
const config = require('./config');

let pool = null;

async function getPool() {
    if (!pool) {
        try {
            pool = await sql.connect(config.db);
            console.log('[DB] Connected to MS SQL Server at ' + config.db.server + '\\' + config.db.options.instanceName);
            
            pool.on('error', err => {
                console.error('[DB] Unexpected error on idle client:', err);
                pool = null;
            });
        } catch (err) {
            console.error('[DB] Failed to connect to MS SQL Server:', err);
            pool = null;
            throw err;
        }
    }
    return pool;
}

module.exports = {
    sql,
    getPool
};
