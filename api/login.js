// api/login.js
// Endpoint Serverless compatible con Vercel y Node.js para autenticación con tokens HMAC-SHA256

const { createAuthToken } = require('./_lib/auth-token');

module.exports = async (req, res) => {
    // Cabeceras CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        if (typeof res.status === 'function') {
            return res.status(200).end();
        } else {
            res.writeHead(200);
            return res.end();
        }
    }

    if (req.method !== 'POST') {
        const payload = JSON.stringify({ success: false, message: 'Método no permitido' });
        if (typeof res.status === 'function') return res.status(405).send(payload);
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    }

    try {
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch(e) {}
        }
        const { user, password } = body || {};

        if (!user || !password) {
            const payload = JSON.stringify({ success: false, message: 'Falta usuario o contraseña' });
            if (typeof res.status === 'function') return res.status(400).send(payload);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }

        const usersSheetUrl = process.env.SHEETS_URL_USERS || process.env.SHEETS_URL_ACCESOS;
        let users = [];

        // 1. Si existe la URL de la hoja de Google Sheets para usuarios, la consultamos en servidor
        if (usersSheetUrl) {
            try {
                const fetchUrl = usersSheetUrl + (usersSheetUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
                const response = await fetch(fetchUrl);
                if (response.ok) {
                    const csvText = await response.text();
                    users = parseUsersCsv(csvText);
                }
            } catch (err) {
                console.error("Error consultando Google Sheet de Usuarios:", err);
            }
        }

        // Obtener Carto Key de entorno o config local
        let resolvedCartoKey = process.env.CARTO_API_KEY || 
                               process.env.CARTO_KEY || 
                               process.env.CARTO_APIKEY || 
                               process.env.CARTODB_API_KEY || 
                               process.env.CARTO_TOKEN || 
                               process.env.CARTO_MAP_KEY || 
                               process.env.CARTO_BASEMAP_KEY || 
                               process.env.CARTO_CLIENT_ID ||
                               process.env.NEXT_PUBLIC_CARTO_API_KEY || 
                               process.env.NEXT_PUBLIC_CARTO_KEY || "";

        // 2. Fallback con variables de entorno o archivo local si la hoja no está configurada aún
        if (!users || users.length === 0 || !resolvedCartoKey) {
            const fs = require('fs');
            const path = require('path');
            try {
                const configPath = path.join(process.cwd(), 'config.json');
                if (fs.existsSync(configPath)) {
                    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    if ((!users || users.length === 0) && Array.isArray(cfg.users) && cfg.users.length > 0) {
                        users = cfg.users;
                    }
                    if (!resolvedCartoKey && (cfg.carto_api_key || cfg.cartoApiKey || cfg.carto_key)) {
                        resolvedCartoKey = cfg.carto_api_key || cfg.cartoApiKey || cfg.carto_key;
                    }
                }
            } catch(e) {}
        }

        const cleanUser = String(user).trim().toUpperCase();
        const cleanPass = String(password).trim();

        // 3. Cuando no hay usuarios configurados en Sheets ni config.json
        if (!users || users.length === 0) {
            // Perfil de desarrollo ALFACO / FACO con contraseña estricta
            if (cleanUser === 'ALFACO' || cleanUser === 'FACO') {
                if (cleanPass !== 'alfaco-2026') {
                    const payload = JSON.stringify({ success: false, message: 'Usuario o contraseña incorrectos' });
                    if (typeof res.status === 'function') return res.status(401).send(payload);
                    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
                    return res.end(payload);
                }
                const canonicalUser = 'ALFACO';
                const resolvedRole = 'contractor';
                const token = createAuthToken({ user: canonicalUser, role: resolvedRole });
                const resObj = {
                    success: true,
                    user: canonicalUser,
                    contractor: canonicalUser,
                    role: resolvedRole,
                    cartoApiKey: resolvedCartoKey,
                    token: token,
                    config: buildUserConfig(resolvedRole, resolvedCartoKey)
                };
                const payload = JSON.stringify(resObj);
                if (typeof res.status === 'function') return res.status(200).send(payload);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(payload);
            }

            // Se elimina el fallback vulnerable donde perfiles entraban sin contraseña
            const payload = JSON.stringify({
                success: false,
                message: 'No hay accesos configurados. Configura SHEETS_URL_USERS en Vercel.'
            });
            if (typeof res.status === 'function') return res.status(503).send(payload);
            res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }

        // 4. Validación contra usuarios registrados
        const match = users.find(u => 
            String(u.user || '').trim().toUpperCase() === cleanUser &&
            String(u.password || '').trim() === cleanPass &&
            (u.estado ? String(u.estado).trim().toLowerCase() !== 'inactivo' : true)
        );

        if (match) {
            const resolvedUser = match.user;
            const resolvedRole = match.role || (match.user.toUpperCase() === 'PLUZ' ? 'admin' : 'contractor');
            const resolvedContractor = match.contractor || (match.user.toUpperCase() === 'PLUZ' ? '*' : match.user);
            const token = createAuthToken({ user: resolvedUser, role: resolvedRole });

            const resObj = {
                success: true,
                user: resolvedUser,
                contractor: resolvedContractor,
                role: resolvedRole,
                cartoApiKey: resolvedCartoKey,
                token: token,
                config: buildUserConfig(resolvedRole, resolvedCartoKey)
            };
            const payload = JSON.stringify(resObj);
            if (typeof res.status === 'function') return res.status(200).send(payload);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        } else {
            const payload = JSON.stringify({
                success: false,
                message: 'Usuario o contraseña incorrectos'
            });
            if (typeof res.status === 'function') return res.status(401).send(payload);
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }
    } catch (error) {
        console.error("Error en login:", error);
        const payload = JSON.stringify({ success: false, message: 'Error interno del servidor' });
        if (typeof res.status === 'function') return res.status(500).send(payload);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    }
};

function buildUserConfig(role, cartoApiKey) {
    const isAdmin = role === 'admin';
    let sheetsUrl = process.env.SHEETS_URL_BASE || process.env.SHEETS_URL || "";
    let sheetsUrlEjecutados = process.env.SHEETS_URL_EJECUTADOS || "";
    let sheetsUrlLlamadas = process.env.SHEETS_URL_LLAMADAS || "";
    let sheetsUrlTecnicos = process.env.SHEETS_URL_TECNICOS || "";
    let sheetsUrlSedCriticas = process.env.SHEETS_URL_SED_CRITICAS || "";
    let sheetsUrlSupervisor = process.env.SHEETS_URL_SUPERVISOR || "";

    if (!sheetsUrl || !sheetsUrlEjecutados || !sheetsUrlLlamadas || !sheetsUrlTecnicos || !sheetsUrlSedCriticas || !sheetsUrlSupervisor) {
        try {
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(process.cwd(), 'config.json');
            if (fs.existsSync(configPath)) {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                if (!sheetsUrl && cfg.sheets_url) sheetsUrl = cfg.sheets_url;
                if (!sheetsUrlEjecutados && cfg.sheets_url_ejecutados) sheetsUrlEjecutados = cfg.sheets_url_ejecutados;
                if (!sheetsUrlLlamadas && cfg.sheets_url_llamadas) sheetsUrlLlamadas = cfg.sheets_url_llamadas;
                if (!sheetsUrlTecnicos && cfg.sheets_url_tecnicos) sheetsUrlTecnicos = cfg.sheets_url_tecnicos;
                if (!sheetsUrlSedCriticas && cfg.sheets_url_sed_criticas) sheetsUrlSedCriticas = cfg.sheets_url_sed_criticas;
                if (!sheetsUrlSupervisor && cfg.sheets_url_supervisor) sheetsUrlSupervisor = cfg.sheets_url_supervisor;
            }
        } catch (_) {}
    }

    if (!sheetsUrlSupervisor && sheetsUrl && sheetsUrl.includes('docs.google.com/spreadsheets') && !sheetsUrl.includes('/d/e/')) {
        const match = sheetsUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match && match[1] !== 'e') {
            sheetsUrlSupervisor = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&sheet=SEGUIMIENTO_SUPERVISOR`;
        }
    }

    if (!sheetsUrlSedCriticas) {
        sheetsUrlSedCriticas = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRzHH9n7otRwazt1x3iWe9qDNVHeHBo0oMGM4i9LiO-Y3VM504bgNx7GihLR0Yb81DtqoiLt3QIRrmY/pub?output=csv&single=true&gid=1398943131";
    }

    if (!sheetsUrlSupervisor) {
        sheetsUrlSupervisor = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRzHH9n7otRwazt1x3iWe9qDNVHeHBo0oMGM4i9LiO-Y3VM504bgNx7GihLR0Yb81DtqoiLt3QIRrmY/pub?output=csv&single=true&gid=143086031";
    }

    return {
        sheets_url: sheetsUrl,
        sheets_url_ejecutados: sheetsUrlEjecutados,
        sheets_url_llamadas: isAdmin ? sheetsUrlLlamadas : "",
        sheets_url_tecnicos: sheetsUrlTecnicos,
        sheets_url_sed_criticas: isAdmin ? sheetsUrlSedCriticas : "",
        sheets_url_supervisor: isAdmin ? sheetsUrlSupervisor : "",
        carto_api_key: cartoApiKey
    };
}

function parseUsersCsv(csvText) {
    if (!csvText) return [];
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    
    const userIdx = headers.findIndex(h => h === 'usuario' || h === 'user' || h === 'perfil');
    const passIdx = headers.findIndex(h => h === 'password' || h === 'contrasena' || h === 'clave' || h === 'pass');
    const contrIdx = headers.findIndex(h => h === 'contratista' || h === 'contractor' || h === 'empresa');
    const roleIdx = headers.findIndex(h => h === 'rol' || h === 'role' || h === 'tipo');
    const estadoIdx = headers.findIndex(h => h === 'estado' || h === 'status' || h === 'activo');

    if (userIdx === -1 || passIdx === -1) return [];

    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]);
        if (cols.length > Math.max(userIdx, passIdx)) {
            const u = (cols[userIdx] || '').trim();
            const p = (cols[passIdx] || '').trim();
            if (u && p) {
                result.push({
                    user: u,
                    password: p,
                    contractor: contrIdx !== -1 ? (cols[contrIdx] || u).trim() : (u.toUpperCase() === 'PLUZ' ? '*' : u),
                    role: roleIdx !== -1 ? (cols[roleIdx] || (u.toUpperCase() === 'PLUZ' ? 'admin' : 'contractor')).trim().toLowerCase() : (u.toUpperCase() === 'PLUZ' ? 'admin' : 'contractor'),
                    estado: estadoIdx !== -1 ? (cols[estadoIdx] || 'activo').trim() : 'activo'
                });
            }
        }
    }
    return result;
}

function splitCsvLine(line) {
    const res = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            res.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    res.push(current);
    return res.map(s => s.trim().replace(/^"(.*)"$/, '$1'));
}
