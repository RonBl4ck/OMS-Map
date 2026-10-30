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
            tickets,
            sed,
            horaInicio,
            hora_inicio,
            fechaInicio,
            fecha_inicio,
            alimentador,
            empresa,
            contratista,
            estado, 
            detalle, 
            estadoOperativo, 
            detalleOperativo, 
            estadoCritico, 
            detalleCritico, 
            jefeCuadrilla,
            jc,
            finEstimado,
            horaFinEstimada,
            fechaFinEstimada,
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

        const sanitize = (val) => {
            if (!val) return '';
            const s = String(val).trim();
            return (/^n\/?a$/i.test(s) || s === '--' || s === 'null' || s === 'undefined') ? '' : s;
        };

        const cleanTicket = sanitize(ticket);
        const cleanSed = sanitize(sed);
        const cleanHoraInicio = sanitize(horaInicio || hora_inicio || fechaInicio || fecha_inicio);
        const cleanAlimentador = sanitize(alimentador);
        const cleanEmpresa = sanitize(empresa || contratista);

        const cleanEstadoOperativo = sanitize(estadoOperativo !== undefined ? estadoOperativo : (estado || '')).toUpperCase();
        const cleanDetalleOperativo = sanitize(detalleOperativo !== undefined ? detalleOperativo : (detalle || ''));
        const cleanJefeCuadrilla = sanitize(jefeCuadrilla !== undefined ? jefeCuadrilla : (jc || '')).toUpperCase();
        const cleanFinEstimado = sanitize(finEstimado || horaFinEstimada || fechaFinEstimada || '');
        const cleanEstadoCritico = sanitize(estadoCritico || '').toUpperCase();
        const cleanDetalleCritico = sanitize(detalleCritico || '');

        const isBatch = Array.isArray(tickets) && tickets.length > 0;

        if (!isBatch && !cleanTicket) {
            const payload = JSON.stringify({ success: false, message: 'El número de ticket es obligatorio.' });
            if (typeof res.status === 'function') return res.status(400).send(payload);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }

        if (!isBatch && !cleanEstadoOperativo && !cleanEstadoCritico && !cleanJefeCuadrilla) {
            const payload = JSON.stringify({ success: false, message: 'Debe ingresar al menos un estado operativo o nivel de criticidad.' });
            if (typeof res.status === 'function') return res.status(400).send(payload);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }

        const timestampStr = getPeruDateTimeString();
        let logEntries = [];

        if (isBatch) {
            tickets.forEach(item => {
                const tNum = sanitize(typeof item === 'object' && item !== null ? item.ticket : item);
                if (!tNum) return;

                const itemSed = sanitize(typeof item === 'object' && item !== null ? item.sed : '') || cleanSed;
                const itemHoraIni = sanitize(typeof item === 'object' && item !== null ? (item.horaInicio || item.hora_inicio || item.fechaInicio || item.fecha_inicio) : '') || cleanHoraInicio;
                const itemAli = sanitize(typeof item === 'object' && item !== null ? item.alimentador : '') || cleanAlimentador;
                const itemEmp = sanitize(typeof item === 'object' && item !== null ? (item.empresa || item.contratista) : '') || cleanEmpresa;

                const itemEstOp = sanitize(typeof item === 'object' && item !== null ? (item.estadoOperativo || item.estado) : '').toUpperCase() || cleanEstadoOperativo || 'EN EJECUCION';
                const itemDetOp = sanitize(typeof item === 'object' && item !== null ? (item.detalleOperativo || item.detalle) : '') || cleanDetalleOperativo;
                const itemJc = sanitize(typeof item === 'object' && item !== null ? (item.jefeCuadrilla || item.jc) : '').toUpperCase() || cleanJefeCuadrilla;
                const itemFinEst = sanitize(typeof item === 'object' && item !== null ? (item.finEstimado || item.horaFinEstimada || item.fechaFinEstimada) : '') || cleanFinEstimado;
                const itemEstCrit = sanitize(typeof item === 'object' && item !== null ? item.estadoCritico : '').toUpperCase() || cleanEstadoCritico;
                const itemDetCrit = sanitize(typeof item === 'object' && item !== null ? item.detalleCritico : '') || cleanDetalleCritico;

                logEntries.push({
                    fecha: timestampStr,
                    ticket: tNum,
                    sed: itemSed,
                    horaInicio: itemHoraIni,
                    alimentador: itemAli,
                    empresa: itemEmp,
                    estadoOperativo: itemEstOp,
                    detalleOperativo: itemDetOp,
                    jefeCuadrilla: itemJc,
                    jc: itemJc,
                    finEstimado: itemFinEst,
                    Fin_Estimado: itemFinEst,
                    horaFinEstimada: itemFinEst,
                    Hora_Fin_Estimada: itemFinEst,
                    fechaFinEstimada: itemFinEst,
                    estadoCritico: itemEstCrit,
                    detalleCritico: itemDetCrit,
                    estado: itemEstOp || itemEstCrit,
                    detalle: itemDetOp || itemDetCrit,
                    usuario: 'PLUZ'
                });
            });

            if (logEntries.length === 0) {
                const payload = JSON.stringify({ success: false, message: 'No se detectaron tickets válidos en la lista enviada.' });
                if (typeof res.status === 'function') return res.status(400).send(payload);
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                return res.end(payload);
            }
        } else {
            logEntries.push({
                fecha: timestampStr,
                ticket: cleanTicket,
                sed: cleanSed,
                horaInicio: cleanHoraInicio,
                alimentador: cleanAlimentador,
                empresa: cleanEmpresa,
                estadoOperativo: cleanEstadoOperativo,
                detalleOperativo: cleanDetalleOperativo,
                jefeCuadrilla: cleanJefeCuadrilla,
                jc: cleanJefeCuadrilla,
                finEstimado: cleanFinEstimado,
                Fin_Estimado: cleanFinEstimado,
                horaFinEstimada: cleanFinEstimado,
                Hora_Fin_Estimada: cleanFinEstimado,
                fechaFinEstimada: cleanFinEstimado,
                estadoCritico: cleanEstadoCritico,
                detalleCritico: cleanDetalleCritico,
                estado: cleanEstadoOperativo || cleanEstadoCritico,
                detalle: cleanDetalleOperativo || cleanDetalleCritico,
                usuario: 'PLUZ'
            });
        }

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

        let syncSuccessCount = 0;
        let syncMsg = '';

        // Helper para despachar peticiones a Google Apps Script con concurrencia controlada
        async function sendToGoogleScript(entry) {
            if (!webhookUrl || !webhookUrl.startsWith('http')) return false;
            try {
                const gasResp = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'append_supervisor_log',
                        ...entry
                    }),
                    redirect: 'follow'
                });
                return gasResp.ok;
            } catch (err) {
                console.error(`Error enviando ticket ${entry.ticket} a Google Apps Script:`, err);
                return false;
            }
        }

        // 1. Envío al Webhook de Google Apps Script para anexar filas en Google Sheets
        if (webhookUrl && webhookUrl.startsWith('http')) {
            const chunkSize = 3; // Lotes de hasta 3 concurrentes para no saturar Apps Script
            for (let i = 0; i < logEntries.length; i += chunkSize) {
                const chunk = logEntries.slice(i, i + chunkSize);
                const results = await Promise.allSettled(chunk.map(entry => sendToGoogleScript(entry)));
                results.forEach(res => {
                    if (res.status === 'fulfilled' && res.value === true) {
                        syncSuccessCount++;
                    }
                });
            }
            if (syncSuccessCount > 0) {
                syncMsg = `${syncSuccessCount} de ${logEntries.length} novedades sincronizadas con Google Sheets.`;
            } else {
                syncMsg = 'No se pudo conectar con Google Sheets (guardado localmente).';
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
            logEntries.forEach(entry => logs.push(entry));
            fs.writeFileSync(backupPath, JSON.stringify(logs, null, 2), 'utf-8');
        } catch (e) {
            console.warn("No se pudo escribir en el respaldo local data_supervisor_logs.json:", e);
        }

        const payload = JSON.stringify({
            success: true,
            batch: isBatch,
            count: logEntries.length,
            syncedToSheets: syncSuccessCount > 0,
            message: syncMsg || `${logEntries.length} tickets registrados exitosamente en Supervisión PLUZ.`,
            entries: logEntries,
            logEntry: logEntries[0]
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
