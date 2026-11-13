// api/sed-layers.js
// Endpoint Serverless para leer y guardar capas personalizadas de SEDs (ej. "DAN") en la hoja CAPAS_SED de Google Sheets

const fs = require('fs');
const path = require('path');
const { verifyAuthToken } = require('./_lib/auth-token');

function getPeruDateTimeString() {
    const now = new Date();
    const limaDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = limaDate.getFullYear();
    const mm = pad(limaDate.getMonth() + 1);
    const dd = pad(limaDate.getDate());
    const hh = pad(limaDate.getHours());
    const min = pad(limaDate.getMinutes());
    const ss = pad(limaDate.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function normalizeSedItem(val) {
    if (!val) return '';
    let s = String(val).trim().toUpperCase();
    s = s.replace(/^SED[\s\.\:\-_]*/i, '').trim();
    s = s.replace(/\s+/g, ' ');
    if (!s || /^N\/?A$/i.test(s) || s === 'SED' || s === 'SUBESTACION' || s === 'SUBESTACIÓN' || s === 'CODIGO' || s === 'CÓDIGO' || s === '--' || s === '-') {
        return '';
    }
    return s;
}

function normalizeLayersArray(rawLayers) {
    if (!Array.isArray(rawLayers)) return [];
    const timestamp = getPeruDateTimeString();
    const map = new Map();

    rawLayers.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const name = String(item.name || item.nombre || item.Nombre_Capa || '').trim().toUpperCase();
        if (!name) return;

        let rawSeds = item.seds || item.SEDs || item.seds_list || [];
        if (typeof rawSeds === 'string') {
            rawSeds = rawSeds.split(/[\s,;|\t\r\n]+/);
        }
        if (!Array.isArray(rawSeds)) return;

        const uniqueSeds = [];
        const seen = new Set();
        rawSeds.forEach(raw => {
            const clean = normalizeSedItem(raw);
            if (clean && !seen.has(clean)) {
                seen.add(clean);
                uniqueSeds.push(clean);
            }
        });

        if (uniqueSeds.length > 0) {
            map.set(name, {
                name,
                seds: uniqueSeds,
                updatedAt: String(item.updatedAt || item.Fecha_Actualizacion || timestamp).trim(),
                usuario: String(item.usuario || item.Usuario || 'PLUZ').trim()
            });
        }
    });

    return Array.from(map.values());
}

function resolveWebhookUrl(scriptUrlOverride) {
    let webhookUrl = process.env.GOOGLE_SCRIPT_SUPERVISOR_URL ||
                     process.env.GOOGLE_SCRIPT_USERS_URL ||
                     scriptUrlOverride || '';

    if (!webhookUrl) {
        try {
            const configPath = path.join(process.cwd(), 'config.json');
            if (fs.existsSync(configPath)) {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                webhookUrl = cfg.google_script_supervisor_url || cfg.google_script_url || cfg.sheets_webhook_url || '';
            }
        } catch (_) {}
    }

    if (!webhookUrl) {
        webhookUrl = 'https://script.google.com/macros/s/AKfycbyUkkCUBRkPU6q0mM36l43LPWc5vUiKVlB2uz0d8p942T37B7YEz75w2YIl8K_O9X__/exec';
    }
    return webhookUrl;
}

function readLocalBackupLayers() {
    try {
        const backupPath = path.join(process.cwd(), 'data_sed_layers.json');
        if (fs.existsSync(backupPath)) {
            const parsed = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
            return normalizeLayersArray(parsed);
        }
    } catch (_) {}
    return [];
}

function writeLocalBackupLayers(layers) {
    if (process.env.VERCEL === '1') return;
    try {
        const backupPath = path.join(process.cwd(), 'data_sed_layers.json');
        fs.writeFileSync(backupPath, JSON.stringify(layers, null, 2), 'utf-8');
    } catch (_) {}
}

function resolveEffectiveRole(req, body) {
    let role = '';
    let token = '';

    if (req.headers && req.headers['authorization']) {
        const authHeader = String(req.headers['authorization']).trim();
        token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : authHeader;
    }
    if (!token && req.headers && req.headers['x-auth-token']) {
        token = String(req.headers['x-auth-token']).trim();
    }

    if (token) {
        const authResult = verifyAuthToken(token);
        if (authResult && authResult.valid && authResult.payload && authResult.payload.role) {
            role = String(authResult.payload.role).trim().toLowerCase();
        }
    }

    if (!role && req.headers && req.headers['x-user-role']) {
        role = String(req.headers['x-user-role']).trim().toLowerCase();
    }
    if (!role && body && body.role) {
        role = String(body.role).trim().toLowerCase();
    }
    if (!role && req.url && req.url.includes('?')) {
        try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            role = String(parsedUrl.searchParams.get('role') || '').trim().toLowerCase();
        } catch (_) {}
    }
    return role;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-User-Role, Authorization, X-Auth-Token');

    if (req.method === 'OPTIONS') {
        if (typeof res.status === 'function') return res.status(200).end();
        res.writeHead(200);
        return res.end();
    }

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    body = body || {};

    const effectiveRole = resolveEffectiveRole(req, body);
    const isGetAction = req.method === 'GET' || body.action === 'get_sed_layers' || body.action === 'get';

    if (effectiveRole !== 'admin') {
        const payload = JSON.stringify({ success: false, message: 'No autorizado. Solo el perfil PLUZ puede acceder o gestionar capas de SEDs.', layers: [] });
        if (typeof res.status === 'function') return res.status(403).send(payload);
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    }

    if (isGetAction) {
        const webhookUrl = resolveWebhookUrl(body.scriptUrl);
        let layers = null;

        if (webhookUrl && webhookUrl.startsWith('http')) {
            try {
                const gasResp = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'get_sed_layers' }),
                    redirect: 'follow'
                });
                if (gasResp && gasResp.ok) {
                    const data = await gasResp.json();
                    if (data && data.success && Array.isArray(data.layers)) {
                        layers = normalizeLayersArray(data.layers);
                    }
                }
            } catch (_) {}
        }

        if (!layers) {
            layers = readLocalBackupLayers();
        }

        const payload = JSON.stringify({ success: true, layers });
        if (typeof res.status === 'function') return res.status(200).send(payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    }

    if (req.method !== 'POST') {
        const payload = JSON.stringify({ success: false, message: 'Método no permitido' });
        if (typeof res.status === 'function') return res.status(405).send(payload);
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    }

    if (effectiveRole !== 'admin') {
        const payload = JSON.stringify({ success: false, message: 'No autorizado. Solo el perfil PLUZ puede gestionar capas de SEDs.' });
        if (typeof res.status === 'function') return res.status(403).send(payload);
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    }

    try {
        const rawLayers = Array.isArray(body.layers) ? body.layers : [];
        const normalizedLayers = normalizeLayersArray(rawLayers);
        const webhookUrl = resolveWebhookUrl(body.scriptUrl);

        let syncedToSheets = false;
        let syncMsg = '';

        if (webhookUrl && webhookUrl.startsWith('http')) {
            try {
                const gasResp = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'save_sed_layers',
                        layers: normalizedLayers,
                        usuario: 'PLUZ'
                    }),
                    redirect: 'follow'
                });
                if (gasResp && gasResp.ok) {
                    const gasData = await gasResp.json().catch(() => ({}));
                    if (gasData && gasData.success !== false) {
                        syncedToSheets = true;
                        syncMsg = gasData.message || 'Capas sincronizadas en Google Sheets (CAPAS_SED).';
                    }
                }
            } catch (err) {
                syncMsg = 'Guardado localmente (no se pudo conectar con Google Sheets).';
            }
        }

        writeLocalBackupLayers(normalizedLayers);

        const payload = JSON.stringify({
            success: true,
            syncedToSheets,
            layers: normalizedLayers,
            message: syncMsg || 'Capas de SEDs actualizadas exitosamente.'
        });
        if (typeof res.status === 'function') return res.status(200).send(payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    } catch (error) {
        const payload = JSON.stringify({ success: false, message: 'Error al guardar capas: ' + error.message });
        if (typeof res.status === 'function') return res.status(500).send(payload);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    }
};
