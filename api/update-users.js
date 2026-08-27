// api/update-users.js
// Endpoint Serverless para actualizar usuarios y contraseñas en Google Sheets (Apps Script Webhook)

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        if (typeof res.status === 'function') return res.status(200).end();
        res.writeHead(200);
        return res.end();
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
        const { pin, users, scriptUrl } = body || {};
        const inputPin = String(pin || '').trim();

        const masterPin = process.env.CONFIG_MASTER_PASSWORD || process.env.PLUZ_CONFIG_PIN || "PLUZ_2026_PLUZ";

        if (!inputPin || inputPin !== masterPin) {
            const payload = JSON.stringify({ success: false, message: 'No autorizado. PIN de configuración incorrecto.' });
            if (typeof res.status === 'function') return res.status(401).send(payload);
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }

        if (!Array.isArray(users) || users.length === 0) {
            const payload = JSON.stringify({ success: false, message: 'La lista de usuarios está vacía.' });
            if (typeof res.status === 'function') return res.status(400).send(payload);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }

        const webhookUrl = scriptUrl || process.env.GOOGLE_SCRIPT_USERS_URL || process.env.GOOGLE_SCRIPT_URL;

        let syncSuccess = false;
        let syncMsg = '';

        // 1. Si tenemos URL de Google Apps Script Webhook, enviamos los datos para escribir en Google Sheets
        if (webhookUrl && webhookUrl.startsWith('http')) {
            try {
                const gasResp = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ users: users }),
                    redirect: 'follow'
                });

                if (gasResp.ok) {
                    syncSuccess = true;
                    syncMsg = '¡Usuarios y contraseñas sincronizados exitosamente en Google Sheets!';
                } else {
                    const text = await gasResp.text();
                    syncMsg = `Google Apps Script respondió con error: ${gasResp.status}`;
                }
            } catch (err) {
                console.error("Error sincronizando con Google Apps Script:", err);
                syncMsg = `Error al conectar con Google Sheets: ${err.message}`;
            }
        }

        // 2. Persistencia local en config.json (para entorno local)
        try {
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(process.cwd(), 'config.json');
            if (fs.existsSync(configPath)) {
                const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                cfg.users = users;
                fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8');
            }
        } catch (e) {}

        const payload = JSON.stringify({
            success: true,
            syncedToSheets: syncSuccess,
            message: syncSuccess 
                ? '¡Contraseñas actualizadas en Google Sheets correctamente!' 
                : (webhookUrl ? syncMsg : 'Cambios guardados localmente. Configura la URL del Webhook de Apps Script para sincronizar con Google Sheets.')
        });

        if (typeof res.status === 'function') return res.status(200).send(payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);

    } catch (error) {
        console.error("Error en update-users:", error);
        const payload = JSON.stringify({ success: false, message: 'Error interno del servidor' });
        if (typeof res.status === 'function') return res.status(500).send(payload);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    }
};
