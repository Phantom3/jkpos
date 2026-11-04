// Database, server, and authentication configuration
module.exports = {
    port: process.env.PORT || 5000,
    auth: {
        username: process.env.AUTH_USER || 'admin',
        password: process.env.AUTH_PASSWORD || 'dunes2026',
        secret: process.env.AUTH_SECRET || 'jkrestaurant_secure_secret_key_81723'
    },
    db: {
        user: process.env.DB_USER || 'sa',
        password: process.env.DB_PASSWORD || 'crusher22betacharlie',
        server: process.env.DB_SERVER || 'DUNESSERVER',
        database: process.env.DB_NAME || 'JKRTDB',
        options: {
            instanceName: 'JKSOFT',
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true
        },
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    }
};
