// api/login.js
// Endpoint Serverless compatible con Vercel y Node.js

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

        // 2. Fallback con variables de entorno o archivo local si la hoja no está configurada aún
        if (!users || users.length === 0) {
            const fs = require('fs');
            const path = require('path');
            try {
                const configPath = path.join(process.cwd(), 'config.json');
                if (fs.existsSync(configPath)) {
                    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    if (Array.isArray(cfg.users) && cfg.users.length > 0) {
                        users = cfg.users;
                    }
                }
            } catch(e) {}
        }

        // Fallback para desarrollo local si la hoja de Google Sheets no está en entorno local
        if (!users || users.length === 0) {
            const cleanUser = String(user).trim().toUpperCase();
            const devProfiles = ['PLUZ', 'COBRA', 'DOMINION', 'INMEL', 'LARI', 'PA'];
            if (devProfiles.includes(cleanUser)) {
                const resObj = {
                    success: true,
                    user: cleanUser,
                    contractor: cleanUser === 'PLUZ' ? '*' : cleanUser,
                    role: cleanUser === 'PLUZ' ? 'admin' : 'contractor',
                    cartoApiKey: "cb1_27lw_1_d612fa2bb664e7fb0d1f742c"
                };
                const payload = JSON.stringify(resObj);
                if (typeof res.status === 'function') return res.status(200).send(payload);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(payload);
            }

            const payload = JSON.stringify({
                success: false,
                message: 'No hay accesos configurados. Configura SHEETS_URL_USERS en Vercel.'
            });
            if (typeof res.status === 'function') return res.status(503).send(payload);
            res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }

        const cleanUser = String(user).trim().toUpperCase();
        const cleanPass = String(password).trim();

        const match = users.find(u => 
            String(u.user || '').trim().toUpperCase() === cleanUser &&
            String(u.password || '').trim() === cleanPass &&
            (u.estado ? String(u.estado).trim().toLowerCase() !== 'inactivo' : true)
        );

        if (match) {
            const cartoKey = process.env.CARTO_API_KEY || "cb1_27lw_1_d612fa2bb664e7fb0d1f742c";
            const resObj = {
                success: true,
                user: match.user,
                contractor: match.contractor || (match.user.toUpperCase() === 'PLUZ' ? '*' : match.user),
                role: match.role || (match.user.toUpperCase() === 'PLUZ' ? 'admin' : 'contractor'),
                cartoApiKey: cartoKey
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
