// tests/api-security-hmac.test.js
// Pruebas automatizadas de seguridad HMAC-SHA256, Serverless tokens y cuotas

const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthToken, verifyAuthToken } = require('../api/_lib/auth-token');
const loginHandler = require('../api/login');
const configDataHandler = require('../api/config-data');
const getUsersAdminHandler = require('../api/get-users-admin');

test('auth-token: genera y valida tokens firmados HMAC-SHA256', () => {
    const token = createAuthToken({ user: 'OPERADOR_1', role: 'contractor', expHours: 2 });
    assert.ok(typeof token === 'string' && token.includes('.'), 'Token debe tener formato base64Url.base64Url');

    const result = verifyAuthToken(token);
    assert.equal(result.valid, true, 'Token recién firmado debe ser válido');
    assert.equal(result.payload.user, 'OPERADOR_1');
    assert.equal(result.payload.role, 'contractor');
    assert.ok(result.payload.exp > Date.now(), 'Token debe tener fecha de expiración futura');
});

test('auth-token: detecta tokens manipulados y firmas fraudulentas', () => {
    const validToken = createAuthToken({ user: 'OPERADOR_1', role: 'contractor' });
    const [payloadB64, signature] = validToken.split('.');

    // 1. Manipulación del payload (cambiar contractor por admin)
    const tamperedPayloadObj = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    tamperedPayloadObj.role = 'admin';
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(tamperedPayloadObj)).toString('base64url');
    const forgedToken = `${tamperedPayloadB64}.${signature}`;

    const forgeResult = verifyAuthToken(forgedToken);
    assert.equal(forgeResult.valid, false, 'Token con payload manipulado debe ser rechazado');
    assert.match(forgeResult.error, /Firma de token inválida/i);

    // 2. Manipulación de la firma
    const brokenSignatureToken = `${payloadB64}.${signature.slice(0, -3)}xyz`;
    const brokenResult = verifyAuthToken(brokenSignatureToken);
    assert.equal(brokenResult.valid, false, 'Token con firma corrupta debe ser rechazado');

    // 3. Formato totalmente inválido
    assert.equal(verifyAuthToken('garbage.data.extra').valid, false);
    assert.equal(verifyAuthToken('').valid, false);
    assert.equal(verifyAuthToken(null).valid, false);
});

test('auth-token: detecta tokens expirados', () => {
    // expHours negativo para forzar expiración inmediata
    const expiredToken = createAuthToken({ user: 'EXPIRED_USER', role: 'contractor', expHours: -1 });
    const result = verifyAuthToken(expiredToken);

    assert.equal(result.valid, false, 'Token expirado debe ser inválido');
    assert.match(result.error, /Token expirado/i);
});

test('auth-token: mantiene retrocompatibilidad con token legacy "authenticated"', () => {
    const result = verifyAuthToken('authenticated');
    assert.equal(result.valid, true);
    assert.equal(result.payload.role, 'admin');
    assert.equal(result.payload.user, 'legacy');
});

test('api/login: no permite inicio de sesión con clave incorrecta y emite token HMAC al autenticar', async () => {
    // 1. Intento con clave incorrecta
    let errStatus = 200;
    let errPayload = null;
    const reqWrong = {
        method: 'POST',
        body: { user: 'ALFACO', password: 'clave-totalmente-incorrecta' },
        headers: {}
    };
    const resWrong = {
        setHeader() {},
        writeHead(c) { errStatus = c; },
        end(d) { errPayload = JSON.parse(d); },
        status(c) { errStatus = c; return { send(d) { errPayload = JSON.parse(d); } }; }
    };
    await loginHandler(reqWrong, resWrong);

    assert.equal(errStatus, 401, 'Debe retornar 401 Unauthorized');
    assert.equal(errPayload.success, false);
    assert.match(errPayload.message, /Usuario o contraseña incorrectos/i);

    // 2. Intento de inicio de sesión sin credenciales
    let missingStatus = 200;
    let missingPayload = null;
    const reqMissing = {
        method: 'POST',
        body: { user: '', password: '' },
        headers: {}
    };
    const resMissing = {
        setHeader() {},
        writeHead(c) { missingStatus = c; },
        end(d) { missingPayload = JSON.parse(d); },
        status(c) { missingStatus = c; return { send(d) { missingPayload = JSON.parse(d); } }; }
    };
    await loginHandler(reqMissing, resMissing);
    assert.equal(missingStatus, 400);

    // 3. Intento de bypass para perfiles sin contraseña cuando users está vacío -> debe dar 503
    let bypassStatus = 200;
    let bypassPayload = null;
    const reqBypass = {
        method: 'POST',
        body: { user: 'PLUZ', password: 'cualquier-clave-sin-configurar' },
        headers: {}
    };
    const resBypass = {
        setHeader() {},
        writeHead(c) { bypassStatus = c; },
        end(d) { bypassPayload = JSON.parse(d); },
        status(c) { bypassStatus = c; return { send(d) { bypassPayload = JSON.parse(d); } }; }
    };
    await loginHandler(reqBypass, resBypass);
    assert.equal(bypassStatus, 503, 'No debe permitir acceso a PLUZ sin configuración');
    assert.equal(bypassPayload.success, false);

    // 4. Inicio de sesión exitoso emitiendo token HMAC
    let okStatus = 200;
    let okPayload = null;
    const reqOk = {
        method: 'POST',
        body: { user: 'ALFACO', password: 'alfaco-2026' },
        headers: {}
    };
    const resOk = {
        setHeader() {},
        writeHead(c) { okStatus = c; },
        end(d) { okPayload = JSON.parse(d); },
        status(c) { okStatus = c; return { send(d) { okPayload = JSON.parse(d); } }; }
    };
    await loginHandler(reqOk, resOk);

    assert.equal(okStatus, 200);
    assert.equal(okPayload.success, true);
    assert.ok(okPayload.token, 'La respuesta exitosa debe incluir un token');

    const verify = verifyAuthToken(okPayload.token);
    assert.equal(verify.valid, true);
    assert.equal(verify.payload.user, 'ALFACO');
    assert.equal(verify.payload.role, 'contractor');
});

test('api/config-data: prioriza el rol verificado en token HMAC sobre query params no autenticados', async () => {
    // Generar un token con rol contractor
    const contractorToken = createAuthToken({ user: 'COBRA', role: 'contractor' });

    // Petición donde un atacante intenta inyectar ?role=admin pero envía su token de contratista
    let payload = null;
    const reqSpoof = {
        method: 'GET',
        url: '/api/config-data?role=admin',
        query: { role: 'admin' },
        headers: {
            authorization: `Bearer ${contractorToken}`
        }
    };
    const res = {
        setHeader() {},
        writeHead() {},
        end(d) { payload = JSON.parse(d); },
        status() { return { send(d) { payload = JSON.parse(d); } }; }
    };
    await configDataHandler(reqSpoof, res);

    assert.equal(payload.sheets_url_sed_criticas, '', 'No debe entregar SEDs críticas porque el token es contractor');
    assert.equal(payload.sheets_url_supervisor, '', 'No debe entregar supervisor porque el token es contractor');
});

test('api/get-users-admin: valida PIN mediante cabecera x-config-pin ahorrando invocación previa', async () => {
    // PIN maestro por defecto o de entorno
    const pin = process.env.CONFIG_MASTER_PASSWORD || process.env.PLUZ_CONFIG_PIN || "PLUZ_2026_PLUZ";

    // 1. PIN incorrecto por cabecera
    let errStatus = 200;
    let errPayload = null;
    const reqWrong = {
        method: 'POST',
        headers: { 'x-config-pin': 'PIN_INCORRECTO' },
        body: {}
    };
    const resWrong = {
        setHeader() {},
        writeHead(c) { errStatus = c; },
        end(d) { errPayload = JSON.parse(d); },
        status(c) { errStatus = c; return { send(d) { errPayload = JSON.parse(d); } }; }
    };
    await getUsersAdminHandler(reqWrong, resWrong);
    assert.equal(errStatus, 401);
    assert.equal(errPayload.success, false);

    // 2. PIN correcto por cabecera x-config-pin
    let okStatus = 200;
    let okPayload = null;
    const reqOk = {
        method: 'POST',
        headers: { 'x-config-pin': pin },
        body: {}
    };
    const resOk = {
        setHeader() {},
        writeHead(c) { okStatus = c; },
        end(d) { okPayload = JSON.parse(d); },
        status(c) { okStatus = c; return { send(d) { okPayload = JSON.parse(d); } }; }
    };
    await getUsersAdminHandler(reqOk, resOk);
    assert.equal(okStatus, 200);
    assert.equal(okPayload.success, true);
    assert.ok(Array.isArray(okPayload.users));
});
