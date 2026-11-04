const crypto = require('crypto');
const config = require('./config');

/**
 * Create a signed token with expiration (7 days by default)
 */
function createToken(username, expiresInHours = 168) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        username,
        exp: Date.now() + (expiresInHours * 60 * 60 * 1000)
    })).toString('base64url');

    const signature = crypto
        .createHmac('sha256', config.auth.secret)
        .update(`${header}.${payload}`)
        .digest('base64url');

    return `${header}.${payload}.${signature}`;
}

/**
 * Verify a signed token
 */
function verifyToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const expectedSig = crypto
        .createHmac('sha256', config.auth.secret)
        .update(`${header}.${payload}`)
        .digest('base64url');

    if (signature !== expectedSig) {
        return null; // Invalid signature
    }

    try {
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (decoded.exp && decoded.exp < Date.now()) {
            return null; // Expired
        }
        return decoded;
    } catch (e) {
        return null;
    }
}

/**
 * Express Authentication Middleware
 */
function requireAuth(req, res, next) {
    // Check Authorization header or query param
    let token = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
    } else if (req.query && req.query.token) {
        token = req.query.token;
    }

    const user = verifyToken(token);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized. Please log in with valid credentials.' });
    }

    req.user = user;
    next();
}

module.exports = {
    createToken,
    verifyToken,
    requireAuth
};
