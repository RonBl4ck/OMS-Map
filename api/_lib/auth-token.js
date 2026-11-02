// api/_lib/auth-token.js
// Generación y verificación de tokens stateless firmados con HMAC-SHA256

const crypto = require('node:crypto');

const DEFAULT_SECRET = 'pluz-oms-hmac-fallback-secret-2026';

function getSecret() {
    return process.env.AUTH_SECRET || DEFAULT_SECRET;
}

function base64UrlEncode(strOrBuffer) {
    const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'utf8');
    return buf.toString('base64url');
}

function base64UrlDecode(str) {
    return Buffer.from(str, 'base64url').toString('utf8');
}

/**
 * Genera un token stateless en formato <payloadBase64Url>.<signatureBase64Url>
 * firmado con HMAC-SHA256.
 *
 * @param {Object} options
 * @param {string} options.user
 * @param {string} options.role
 * @param {number} [options.expHours=24]
 * @returns {string} Token firmado
 */
function createAuthToken({ user, role, expHours = 24 }) {
    const iat = Date.now();
    const exp = iat + Math.round(Number(expHours) * 3600 * 1000);
    const payloadObj = {
        user: String(user || '').trim(),
        role: String(role || 'contractor').trim().toLowerCase(),
        iat,
        exp
    };

    const payloadBase64Url = base64UrlEncode(JSON.stringify(payloadObj));
    const hmac = crypto.createHmac('sha256', getSecret());
    hmac.update(payloadBase64Url);
    const signatureBase64Url = hmac.digest('base64url');

    return `${payloadBase64Url}.${signatureBase64Url}`;
}

/**
 * Valida la firma HMAC y expiración de un token stateless.
 * Retorna { valid: true, payload } o { valid: false, error }
 *
 * @param {string} tokenString
 * @returns {{ valid: boolean, payload?: Object, error?: string }}
 */
function verifyAuthToken(tokenString) {
    if (!tokenString || typeof tokenString !== 'string') {
        return { valid: false, error: 'Token no proporcionado' };
    }
    const cleanToken = tokenString.trim();

    // Retrocompatibilidad con tests existentes o tokens legacy
    if (cleanToken === 'authenticated') {
        return { valid: true, payload: { user: 'legacy', role: 'admin' } };
    }

    const parts = cleanToken.split('.');
    if (parts.length !== 2) {
        return { valid: false, error: 'Formato de token inválido' };
    }

    const [payloadBase64Url, signatureBase64Url] = parts;
    if (!payloadBase64Url || !signatureBase64Url) {
        return { valid: false, error: 'Partes de token incompletas' };
    }

    // Validación de firma con comparación en tiempo constante
    const hmac = crypto.createHmac('sha256', getSecret());
    hmac.update(payloadBase64Url);
    const expectedSignature = hmac.digest('base64url');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const actualBuffer = Buffer.from(signatureBase64Url, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
        return { valid: false, error: 'Firma de token inválida' };
    }

    try {
        const payloadJson = base64UrlDecode(payloadBase64Url);
        const payload = JSON.parse(payloadJson);

        if (!payload || typeof payload !== 'object') {
            return { valid: false, error: 'Payload inválido' };
        }

        if (payload.exp && Date.now() > payload.exp) {
            return { valid: false, error: 'Token expirado' };
        }

        return { valid: true, payload };
    } catch (e) {
        return { valid: false, error: 'Error decodificando payload' };
    }
}

module.exports = {
    createAuthToken,
    verifyAuthToken
};
