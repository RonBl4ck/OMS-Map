// api/verify-config-pin.js
// Endpoint Serverless para verificar la clave maestra de Configuración (perfil PLUZ)

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
        const { pin, password } = body || {};
        const inputPin = String(pin || password || '').trim();

        if (!inputPin) {
            const payload = JSON.stringify({ success: false, message: 'Se requiere la contraseña de configuración' });
            if (typeof res.status === 'function') return res.status(400).send(payload);
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }

        // Claves válidas: Variable de entorno o clave por defecto
        const masterPin = process.env.CONFIG_MASTER_PASSWORD || process.env.PLUZ_CONFIG_PIN || "";

        if (masterPin && inputPin === masterPin) {
            const usersSheetUrl = process.env.SHEETS_URL_USERS || process.env.SHEETS_URL_ACCESOS || "";
            const payload = JSON.stringify({
                success: true,
                authorized: true,
                hasUsersSheet: !!usersSheetUrl,
                sheetUrl: usersSheetUrl ? usersSheetUrl.replace(/pub\?.*$/, '') : ""
            });
            if (typeof res.status === 'function') return res.status(200).send(payload);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        } else {
            const payload = JSON.stringify({
                success: false,
                message: 'Contraseña de configuración incorrecta'
            });
            if (typeof res.status === 'function') return res.status(401).send(payload);
            res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(payload);
        }
    } catch (error) {
        console.error("Error en verify-config-pin:", error);
        const payload = JSON.stringify({ success: false, message: 'Error interno del servidor' });
        if (typeof res.status === 'function') return res.status(500).send(payload);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    }
};
