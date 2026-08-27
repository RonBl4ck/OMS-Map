// api/config-data.js
// Endpoint Serverless que entrega URLs de Google Sheets de datos y configuraciones públicas sin exponer contraseñas

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        if (typeof res.status === 'function') return res.status(200).end();
        res.writeHead(200);
        return res.end();
    }

    try {
        let sheetsUrl = process.env.SHEETS_URL_BASE || process.env.SHEETS_URL || "";
        let sheetsUrlEjecutados = process.env.SHEETS_URL_EJECUTADOS || "";
        let sheetsUrlLlamadas = process.env.SHEETS_URL_LLAMADAS || "";
        let sheetsUrlTecnicos = process.env.SHEETS_URL_TECNICOS || "";

        // Fallback local a config.json si no están en process.env
        if (!sheetsUrl || !sheetsUrlEjecutados) {
            const fs = require('fs');
            const path = require('path');
            try {
                const configPath = path.join(process.cwd(), 'config.json');
                if (fs.existsSync(configPath)) {
                    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    if (!sheetsUrl && cfg.sheets_url) sheetsUrl = cfg.sheets_url;
                    if (!sheetsUrlEjecutados && cfg.sheets_url_ejecutados) sheetsUrlEjecutados = cfg.sheets_url_ejecutados;
                    if (!sheetsUrlLlamadas && cfg.sheets_url_llamadas) sheetsUrlLlamadas = cfg.sheets_url_llamadas;
                    if (!sheetsUrlTecnicos && cfg.sheets_url_tecnicos) sheetsUrlTecnicos = cfg.sheets_url_tecnicos;
                }
            } catch(e) {}
        }

        const payload = JSON.stringify({
            sheets_url: sheetsUrl,
            sheets_url_ejecutados: sheetsUrlEjecutados,
            sheets_url_llamadas: sheetsUrlLlamadas,
            sheets_url_tecnicos: sheetsUrlTecnicos
        });

        if (typeof res.status === 'function') return res.status(200).send(payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    } catch (error) {
        console.error("Error en config-data:", error);
        const payload = JSON.stringify({ success: false, message: 'Error obteniendo configuración' });
        if (typeof res.status === 'function') return res.status(500).send(payload);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(payload);
    }
};
