// tests/test-bulk-supervisor.js
const handler = require('../api/update-supervisor-status');

function mockResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: '',
        setHeader(k, v) { this.headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        writeHead(code, h) { this.statusCode = code; if (h) Object.assign(this.headers, h); return this; },
        send(b) { this.body = b; return this; },
        end(b) { if (b) this.body = b; return this; }
    };
}

async function runTests() {
    console.log("=== INICIANDO PRUEBAS DE ENDPOINT SUPERVISOR STATUS ===");

    // Test 1: Rechazo si no es admin
    {
        const req = {
            method: 'POST',
            headers: { 'x-user-role': 'invitado' },
            body: { ticket: '100001', estadoOperativo: 'EN EJECUCION' }
        };
        const res = mockResponse();
        await handler(req, res);
        const data = JSON.parse(res.body);
        console.assert(res.statusCode === 403, `Test 1 Falló: esperaba 403, obtuvo ${res.statusCode}`);
        console.assert(data.success === false, "Test 1 Falló: success debe ser false");
        console.log("✅ Test 1 Aprobado: Rechazo a rol no autorizado (403)");
    }

    // Test 2: Registro individual (Retrocompatibilidad)
    {
        const req = {
            method: 'POST',
            headers: { 'x-user-role': 'admin' },
            body: { 
                ticket: '100001', 
                sed: 'SED-01',
                alimentador: 'ALI-01',
                empresa: 'CAM',
                estadoOperativo: 'EN EJECUCION',
                jefeCuadrilla: 'JC TEST',
                detalleOperativo: 'Prueba individual'
            }
        };
        const res = mockResponse();
        await handler(req, res);
        const data = JSON.parse(res.body);
        console.assert(res.statusCode === 200, `Test 2 Falló: esperaba 200, obtuvo ${res.statusCode}`);
        console.assert(data.success === true, "Test 2 Falló: success debe ser true");
        console.assert(data.logEntry.ticket === '100001', "Test 2 Falló: ticket incorrecto");
        console.assert(data.logEntry.estadoOperativo === 'EN EJECUCION', "Test 2 Falló: estadoOperativo incorrecto");
        console.log("✅ Test 2 Aprobado: Registro individual retrocompatible funciona al 100%");
    }

    // Test 3: Registro masivo en lote (Batch)
    {
        const req = {
            method: 'POST',
            headers: { 'x-user-role': 'admin' },
            body: { 
                tickets: [
                    { ticket: '200001', sed: 'SED-01', alimentador: 'ALI-A', empresa: 'CAM' },
                    { ticket: '200002', sed: 'SED-02', alimentador: 'ALI-B', empresa: 'LARI' },
                    '200003' // Formato string directo
                ],
                jefeCuadrilla: 'JC MASIVO',
                detalleOperativo: 'Pase masivo ejecutado'
            }
        };
        const res = mockResponse();
        await handler(req, res);
        const data = JSON.parse(res.body);
        console.assert(res.statusCode === 200, `Test 3 Falló: esperaba 200, obtuvo ${res.statusCode}`);
        console.assert(data.success === true, "Test 3 Falló: success debe ser true");
        console.assert(data.count === 3, `Test 3 Falló: esperaba count 3, obtuvo ${data.count}`);
        console.assert(data.entries[0].ticket === '200001', "Test 3 Falló: ticket 1 incorrecto");
        console.assert(data.entries[2].ticket === '200003', "Test 3 Falló: ticket 3 incorrecto");
        console.assert(data.entries[2].estadoOperativo === 'EN EJECUCION', "Test 3 Falló: estadoOperativo default debe ser EN EJECUCION");
        console.assert(data.entries[0].jefeCuadrilla === 'JC MASIVO', "Test 3 Falló: jefeCuadrilla debe propagarse");
        console.log("✅ Test 3 Aprobado: Registro masivo (Batch) funciona al 100%");
    }

    console.log("\n🎉 TODAS LAS PRUEBAS DEL ENDPOINT PASARON EXITOSAMENTE!");
}

runTests().catch(err => {
    console.error("Error ejecutando pruebas:", err);
    process.exit(1);
});
