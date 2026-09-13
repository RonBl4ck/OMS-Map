const path = require('path');

function resolvePublicFile(publicDir, requestPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(String(requestPath || '/'));
    } catch {
        return null;
    }
    if (decoded.includes('\0')) return null;
    const relativePath = (decoded === '/' ? 'index.html' : decoded).replace(/^[/\\]+/, '');
    const root = path.resolve(publicDir);
    const target = path.resolve(root, relativePath);
    return target === root || target.startsWith(root + path.sep) ? target : null;
}

function cacheControlFor(extension) {
    if (['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp'].includes(String(extension).toLowerCase())) {
        return 'public, max-age=31536000, immutable';
    }
    return 'no-cache, max-age=0, must-revalidate';
}

function securityHeaders() {
    return {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'same-origin',
        'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()'
    };
}

module.exports = { resolvePublicFile, cacheControlFor, securityHeaders };

