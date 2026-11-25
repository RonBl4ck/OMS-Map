const test = require('node:test');
const assert = require('node:assert/strict');
const MapPopups = require('../assets/js/templates/mapPopups.js');

test('formatCoordsDms convierte coordenadas decimales a formato DMS exacto', () => {
    assert.equal(MapPopups.formatCoordsDms(-11.895417, -77.021500), `11°53'43.5"S 77°01'17.4"W`);
    assert.equal(MapPopups.formatCoordsDms(12.5, 45.25), `12°30'00.0"N 45°15'00.0"E`);
    // Edge case: segundos redondeando a 60.0 deben sumar 1 minuto
    assert.equal(MapPopups.formatCoordsDms(-11.999999, -77.0), `12°00'00.0"S 77°00'00.0"W`);
    assert.equal(MapPopups.formatCoordsDms(NaN, -77), '');
});

test('buildIncidentWhatsappSummary genera ficha completa (Formato A) con JC, DMS y enlace Google Maps', () => {
    const loc = {
        ticket: '2600256807',
        odm: '600366912',
        estado: 'PENDIENTE',
        empresa: 'ALFACO',
        falla: 'RED SUBTERRANEA',
        sed: '03032A',
        alimentador: 'CV-15',
        suministro: '1088920',
        llamadas: '2',
        fecha_inicio: '24/11/2026 12:31:39',
        direccion: 'MZ.G LT. 4 CMT.54,R.PORRAS B.CARABAYLLO.',
        distrito: 'CARABAYLLO',
        lat: -11.895417,
        lon: -77.021500,
        sla: { elapsed: '21.6', maxHours: '12', label: 'Fuera de plazo (+9h 36m)' }
    };

    const supData = {
        latest: {
            estadoOperativo: 'EN EJECUCION',
            detalleOperativo: 'Cuadrilla excavando en punto',
            jefeCuadrilla: 'ROBERTO MEZA ORDINOLA',
            fecha: '2026-11-25 09:41:58'
        },
        history: []
    };

    const text = MapPopups.buildIncidentWhatsappSummary(loc, supData);

    assert.match(text, /\*OMS 2600256807\* \| PENDIENTE/);
    assert.match(text, /⏱️ \*SLA:\* 21\.6h \/ 12h — Fuera de plazo \(\+9h 36m\)/);
    assert.match(text, /• \*ODM:\* 600366912/);
    assert.match(text, /• \*Empresa:\* ALFACO/);
    assert.match(text, /• \*Falla:\* RED SUBTERRANEA/);
    assert.match(text, /• \*SED \/ Alim:\* 03032A \/ CV-15/);
    assert.match(text, /• \*Suministro:\* 1088920 \| \*Llamadas:\* 2/);
    assert.match(text, /• \*Inicio:\* 24\/11\/2026 12:31:39/);
    assert.match(text, /• \*Dirección:\* MZ\.G LT\. 4 CMT\.54,R\.PORRAS B\.CARABAYLLO\. - CARABAYLLO/);
    assert.match(text, /• \*Supervisión PLUZ:\* EN EJECUCION/);
    assert.match(text, /• \*Detalle PLUZ:\* Cuadrilla excavando en punto/);
    assert.match(text, /• \*Jefe de cuadrilla:\* ROBERTO MEZA ORDINOLA/);
    assert.match(text, /📍 \*Coordenadas:\* 11°53'43\.5"S 77°01'17\.4"W/);
    assert.match(text, /🗺️ https:\/\/www\.google\.com\/maps\?q=-11\.895417,-77\.021500/);
});

test('buildIncidentWhatsappSummary deja Jefe de cuadrilla vacío cuando no existe JC y hereda del historial si aplica', () => {
    const loc = {
        ticket: '2600999001',
        odm: '600399999',
        estado: 'PENDIENTE',
        empresa: 'COBRA',
        falla: 'SUMINISTRO',
        sed: '01234A',
        alimentador: 'LI-01',
        suministro: '5551234',
        llamadas: '1',
        fecha_inicio: '25/11/2026 08:00:00',
        direccion: 'AV. TEST 123',
        distrito: 'LIMA',
        lat: -12.046374,
        lon: -77.042793,
        sla: { elapsed: '1.0', maxHours: '4', label: 'En plazo' }
    };

    // Sin JC en ningún registro -> debe quedar vacío (no poner el detalle libre como JC)
    const sinJc = MapPopups.buildIncidentWhatsappSummary(loc, {
        latest: { estadoOperativo: 'EN CAMINO', detalleOperativo: 'Cliente ausente, reja con candado', jefeCuadrilla: '' },
        history: [{ estadoOperativo: 'EN CAMINO', detalleOperativo: 'Cliente ausente, reja con candado', jefeCuadrilla: '' }]
    });
    assert.match(sinJc, /• \*Jefe de cuadrilla:\*(\r?\n|$)/);
    assert.match(sinJc, /• \*Detalle PLUZ:\* Cliente ausente, reja con candado/);

    // Con JC en registro previo del historial -> lo hereda
    const conJcHistorial = MapPopups.buildIncidentWhatsappSummary(loc, {
        latest: { estadoOperativo: 'EN SITIO', detalleOperativo: '', jefeCuadrilla: '' },
        history: [
            { estadoOperativo: 'EN SITIO', jefeCuadrilla: '' },
            { estadoOperativo: 'EN CAMINO', jefeCuadrilla: 'CARLOS RAMOS' }
        ]
    });
    assert.match(conJcHistorial, /• \*Jefe de cuadrilla:\* CARLOS RAMOS/);
});

test('renderIncidentPopup muestra botón 📋 y JC solo para perfil PLUZ (admin)', () => {
    const prevIsAdmin = globalThis.isCurrentUserAdmin;
    const prevGetSup = globalThis.getSupervisorDataForTicket;

    try {
        const loc = {
            ticket: '2600256807',
            odm: '600366912',
            estado: 'PENDIENTE',
            empresa: 'ALFACO',
            falla: 'RED SUBTERRANEA',
            sed: '03032A',
            alimentador: 'CV-15',
            suministro: '1088920',
            llamadas: '2',
            fecha_inicio: '24/11/2026 12:31:39',
            direccion: 'MZ.G LT. 4',
            distrito: 'CARABAYLLO',
            lat: -11.895417,
            lon: -77.021500,
            sla: { statusClass: 'sla-danger', elapsed: '21.6', maxHours: '12', label: 'Fuera de plazo' }
        };

        globalThis.getSupervisorDataForTicket = () => ({
            latest: {
                estadoOperativo: 'EN EJECUCION',
                jefeCuadrilla: 'ROBERTO MEZA ORDINOLA',
                detalleOperativo: 'En maniobra',
                fecha: '2026-11-25 09:41:58'
            },
            history: [{ estadoOperativo: 'EN EJECUCION', jefeCuadrilla: 'ROBERTO MEZA ORDINOLA' }]
        });

        // Perfil PLUZ (admin)
        globalThis.isCurrentUserAdmin = () => true;
        const adminHtml = MapPopups.renderIncidentPopup(loc);
        assert.match(adminHtml, /class="popup-copy-btn"/);
        assert.match(adminHtml, /copyIncidentSummary\('2600256807', this\)/);
        assert.match(adminHtml, /📋/);
        assert.match(adminHtml, /👷 JC:<\/b> ROBERTO MEZA ORDINOLA/);

        // Perfil contratista (no admin)
        globalThis.isCurrentUserAdmin = () => false;
        const contractorHtml = MapPopups.renderIncidentPopup(loc);
        assert.doesNotMatch(contractorHtml, /popup-copy-btn/);
        assert.doesNotMatch(contractorHtml, /copyIncidentSummary/);
        assert.doesNotMatch(contractorHtml, /ROBERTO MEZA ORDINOLA/);
    } finally {
        globalThis.isCurrentUserAdmin = prevIsAdmin;
        globalThis.getSupervisorDataForTicket = prevGetSup;
    }
});

test('copyIncidentSummary copia texto al portapapeles para PLUZ y bloquea a contratistas', async () => {
    const prevIsAdmin = globalThis.isCurrentUserAdmin;
    const prevMarkerMap = globalThis.markerMap;
    const prevGetSup = globalThis.getSupervisorDataForTicket;
    const prevNavigator = globalThis.navigator;

    let copiedText = '';
    try {
        const loc = {
            ticket: '2600256807',
            odm: '600366912',
            estado: 'PENDIENTE',
            empresa: 'ALFACO',
            falla: 'RED SUBTERRANEA',
            sed: '03032A',
            alimentador: 'CV-15',
            suministro: '1088920',
            llamadas: '2',
            fecha_inicio: '24/11/2026 12:31:39',
            direccion: 'MZ.G LT. 4',
            distrito: 'CARABAYLLO',
            lat: -11.895417,
            lon: -77.021500,
            sla: { elapsed: '21.6', maxHours: '12', label: 'Fuera de plazo' }
        };

        globalThis.markerMap = new Map([['2600256807', { loc }]]);
        globalThis.getSupervisorDataForTicket = () => ({
            latest: { estadoOperativo: 'EN EJECUCION', jefeCuadrilla: 'ROBERTO MEZA ORDINOLA' },
            history: []
        });
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: {
                clipboard: {
                    writeText: async (txt) => { copiedText = txt; }
                }
            }
        });

        // Contratista -> bloqueado
        globalThis.isCurrentUserAdmin = () => false;
        const denied = await MapPopups.copyIncidentSummary('2600256807');
        assert.equal(denied, false);
        assert.equal(copiedText, '');

        // PLUZ -> copia y actualiza feedback del botón
        globalThis.isCurrentUserAdmin = () => true;
        const mockBtn = { textContent: '📋', style: { backgroundColor: '#475569' }, dataset: {}, title: '' };
        const ok = await MapPopups.copyIncidentSummary('2600256807', mockBtn);
        assert.equal(ok, true);
        assert.match(copiedText, /\*OMS 2600256807\* \| PENDIENTE/);
        assert.match(copiedText, /ROBERTO MEZA ORDINOLA/);
        assert.equal(mockBtn.textContent, '✅');
        if (mockBtn._copyResetTimer) clearTimeout(mockBtn._copyResetTimer);
    } finally {
        globalThis.isCurrentUserAdmin = prevIsAdmin;
        globalThis.markerMap = prevMarkerMap;
        globalThis.getSupervisorDataForTicket = prevGetSup;
        if (prevNavigator === undefined) {
            delete globalThis.navigator;
        } else {
            Object.defineProperty(globalThis, 'navigator', { configurable: true, value: prevNavigator });
        }
    }
});
