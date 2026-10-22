// api/update-supervisor-status.js
// Endpoint Serverless para registrar estados y detalles de supervisión PLUZ en Google Sheets

const fs = require('fs');
const path = require('path');

function getPeruDateTimeString() {
    const now = new Date();
    // Offset para Lima, Perú (UTC-5)
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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-User-Role');

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
        const { 
            ticket, 
            estado, 
            detalle, 
            estadoOperativo, 
            detalleOperativo, 
            estadoCritico, 
            detalleCritico, 
            role, 
            scriptUrl 
        } = body || {};

        // Validar rol de administrador (exclusivo para perfil PLUZ)
        const headerRole = (req.headers && req.headers['x-user-role']) ? String(req.headers['x-user-role']).trim().toLowerCase() : '';
        const effectiveRole = (headerRole || String(role || '').trim().toLowerCase());

        if (effectiveRole !== 'admin') {
            const payload = JSON.stringify({ success: false, message: 'No autorizado. Solo el perfil PLUZ puede actualizar la supervisión.' });
            if (typeof res.status === 'function') return res.status(403).send(payload);
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }

        const cleanTicket = String(ticket || '').trim();
        // Compatibilidad hacia adelante y hacia atrás:
        // Operativo: estadoOperativo || estado
        // Detalle Operativo: detalleOperativo || detalle
        const cleanEstadoOperativo = String(estadoOperativo !== undefined ? estadoOperativo : (estado || '')).trim().toUpperCase();
        const cleanDetalleOperativo = String(detalleOperativo !== undefined ? detalleOperativo : (detalle || '')).trim();
        const cleanEstadoCritico = String(estadoCritico || '').trim().toUpperCase();
        const cleanDetalleCritico = String(detalleCritico || '').trim();

        if (!cleanTicket) {
            const payload = JSON.stringify({ success: false, message: 'El número de ticket es obligatorio.' });
            if (typeof res.status === 'function') return res.status(400).send(payload);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }

        if (!cleanEstadoOperativo && !cleanEstadoCritico) {
            const payload = JSON.stringify({ success: false, message: 'Debe ingresar al menos un estado operativo o nivel de criticidad.' });
            if (typeof res.status === 'function') return res.status(400).send(payload);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }

        const timestampStr = getPeruDateTimeString();
        const logEntry = {
            fecha: timestampStr,
            ticket: cleanTicket,
            estadoOperativo: cleanEstadoOperativo,
            detalleOperativo: cleanDetalleOperativo,
            estadoCritico: cleanEstadoCritico,
            detalleCritico: cleanDetalleCritico,
            // Campos de compatibilidad con versiones previas:
            estado: cleanEstadoOperativo || cleanEstadoCritico,
            detalle: cleanDetalleOperativo || cleanDetalleCritico,
            usuario: 'PLUZ'
        };

        let webhookUrl = process.env.GOOGLE_SCRIPT_SUPERVISOR_URL || 
                         process.env.GOOGLE_SCRIPT_USERS_URL || 
                         scriptUrl || "";

        if (!webhookUrl) {
            try {
                const configPath = path.join(process.cwd(), 'config.json');
                if (fs.existsSync(configPath)) {
                    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    webhookUrl = cfg.google_script_supervisor_url || cfg.google_script_url || cfg.sheets_webhook_url || "";
                }
            } catch(e) {}
        }

        if (!webhookUrl) {
            webhookUrl = "https://script.google.com/macros/s/AKfycbyUkkCUBRkPU6q0mM36l43LPWc5vUiKVlB2uz0d8p942T37B7YEz75w2YIl8K_O9X__/exec";
        }

        let syncSuccess = false;
        let syncMsg = '';

        // 1. Envío al Webhook de Google Apps Script para anexar fila en Google Sheets
        if (webhookUrl && webhookUrl.startsWith('http')) {
            try {
                const gasResp = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'append_supervisor_log',
                        ...logEntry
                    }),
                    redirect: 'follow'
                });

                if (gasResp.ok) {
                    syncSuccess = true;
                    syncMsg = 'Novedad registrada exitosamente en Google Sheets.';
                } else {
                    const text = await gasResp.text();
                    syncMsg = `Google Apps Script respondió con estado ${gasResp.status}: ${text}`;
                }
            } catch (err) {
                console.error("Error sincronizando con Google Apps Script:", err);
                syncMsg = `Error al conectar con Google Sheets: ${err.message}`;
            }
        }

        // 2. Persistencia local de respaldo (data_supervisor_logs.json)
        try {
            const backupPath = path.join(process.cwd(), 'data_supervisor_logs.json');
            let logs = [];
            if (fs.existsSync(backupPath)) {
                try {
                    logs = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
                    if (!Array.isArray(logs)) logs = [];
                } catch(e) { logs = []; }
            }
            logs.push(logEntry);
            fs.writeFileSync(backupPath, JSON.stringify(logs, null, 2), 'utf-8');
        } catch (e) {
            console.warn("No se pudo escribir en el respaldo local data_supervisor_logs.json:", e);
        }

        const payload = JSON.stringify({
            success: true,
            syncedToSheets: syncSuccess,
            message: syncSuccess ? syncMsg : (syncMsg || 'Registrado localmente.'),
            logEntry: logEntry
        });

        if (typeof res.status === 'function') return res.status(200).send(payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);

    } catch (error) {
        console.error("Error en update-supervisor-status:", error);
        const payload = JSON.stringify({ success: false, message: 'Error interno del servidor: ' + error.message });
        if (typeof res.status === 'function') return res.status(500).send(payload);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    }
};
