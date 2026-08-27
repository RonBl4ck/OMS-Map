const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = urlObj.pathname;

    // Rutas API Serverless para emulación local
    if (pathname.startsWith('/api/')) {
        const endpoint = pathname.replace('/api/', '').split('/')[0];
        const apiPath = path.join(__dirname, 'api', `${endpoint}.js`);

        if (fs.existsSync(apiPath)) {
            let bodyData = '';
            req.on('data', chunk => { bodyData += chunk; });
            req.on('end', () => {
                try {
                    req.body = bodyData ? JSON.parse(bodyData) : {};
                } catch(e) {
                    req.body = bodyData;
                }
                const handler = require(apiPath);
                return handler(req, res);
            });
            return;
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Endpoint API no encontrado' }));
            return;
        }
    }

    let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
        } else {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 Servidor Web de OMS Map corriendo en Node.js!`);
    console.log(`🌐 Abre tu navegador en: http://localhost:${PORT}\n`);
});
