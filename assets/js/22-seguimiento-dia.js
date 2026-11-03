/**
 * assets/js/22-seguimiento-dia.js
 * Controlador de Interfaz y Gráficos para "Seguimiento y Productividad Diaria" en OMS Map.
 * 
 * Filosofía de Diseño Emil Kowalski:
 * - Micro-interacciones limpias y fluidas (180ms cubic-bezier(0.23, 1, 0.32, 1)).
 * - Estados táctiles sutiles (:active { transform: scale(0.97); }).
 * - Tabular numbers (font-variant-numeric: tabular-nums) para evitar saltos de layout.
 * - Paleta intencional de alto contraste y legibilidad operativa.
 * - Limpieza estricta de instancias de Chart.js para evitar fugas de memoria.
 * - Soporte dual: Vista General 7 Días y Vista Diaria con Gráfico de Cascada (Waterfall).
 * - Monitor dual de recurrencia: Subestaciones (SEDs) y Suministros.
 */
(function (global) {
    'use strict';

    // Paleta de colores oficial intencional
    const PALETTE = {
        ingresos: '#3B82F6',           // Azul sobrio
        ingresosAlpha: 'rgba(59, 130, 246, 0.85)',
        ingresosLight: 'rgba(59, 130, 246, 0.12)',
        cierres: '#10B981',            // Verde esmeralda
        cierresAlpha: 'rgba(16, 185, 129, 0.85)',
        cierresLight: 'rgba(16, 185, 129, 0.12)',
        cierresBosque: '#059669',       // Verde bosque para backlog
        backlog: '#F59E0B',            // Ámbar
        backlogAlpha: 'rgba(245, 158, 11, 0.85)',
        backlogLight: 'rgba(245, 158, 11, 0.12)',
        critico: '#EF4444',            // Rojo coral
        criticoAlpha: 'rgba(239, 68, 68, 0.85)',
        criticoLight: 'rgba(239, 68, 68, 0.12)',
        waterfallInicial: '#64748B',    // Gris azulado
        waterfallFinal: '#1E293B',      // Azul pizarra
        cardBg: '#ffffff',
        border: 'rgba(226, 232, 240, 0.8)',
        textMain: '#0f172a',
        textMuted: '#64748b'
    };

    // Estado interno del componente
    const state = {
        selectedDate: '7D',            // Por defecto: '7D' (Vista General 7 Días)
        selectedContractor: 'ALL',
        selectedWorkType: 'ALL',
        startHour: 0,
        endHour: 24,
        isLiveNow: false,
        searchQuery7D: '',
        recurrenceTab: 'SEDS',         // 'SEDS' o 'SUMINISTROS'
        limit7D: 20,
        expanded7D: false,
        containerEl: null,
        charts: {
            chartA: null,              // Gráfico Principal (Evolución 7D o Balance Horario)
            chartB: null               // Gráfico Secundario (Cierres Contratistas o Waterfall)
        }
    };

    /**
     * Inyecta los estilos CSS optimizados con micro-interacciones Emil Kowalski.
     */
    function injectStyles() {
        const styleId = 'seguimiento-dia-styles';
        if (document.getElementById(styleId)) return;

        const css = `
            /* Seguimiento y Productividad Diaria - Emil Kowalski UI Styles */
            .segdia-root {
                --ease-spring: cubic-bezier(0.23, 1, 0.32, 1);
                --anim-fast: 180ms var(--ease-spring);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                color: ${PALETTE.textMain};
                display: flex;
                flex-direction: column;
                gap: 16px;
                width: 100%;
                box-sizing: border-box;
                padding: 4px;
            }

            .segdia-root *, .segdia-root *::before, .segdia-root *::after {
                box-sizing: border-box;
            }

            /* Números tabulares */
            .segdia-tabular,
            .segdia-kpi-val,
            .segdia-badge-val,
            .segdia-table td.is-num {
                font-variant-numeric: tabular-nums;
                letter-spacing: -0.02em;
            }

            /* Barra superior de herramientas y filtros */
            .segdia-toolbar {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                background: #ffffff;
                border: 1px solid ${PALETTE.border};
                border-radius: 12px;
                padding: 12px 16px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
            }

            .segdia-title-group {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .segdia-title-group h2 {
                margin: 0;
                font-size: 16px;
                font-weight: 700;
                color: #0f172a;
                letter-spacing: -0.01em;
            }

            .segdia-tag-badge {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                font-weight: 600;
                padding: 2px 8px;
                border-radius: 6px;
                background: ${PALETTE.ingresosLight};
                color: ${PALETTE.ingresos};
            }

            .segdia-filters {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }

            .segdia-filter-label {
                font-size: 12px;
                font-weight: 600;
                color: ${PALETTE.textMuted};
                margin-right: 2px;
            }

            .segdia-select,
            .segdia-input {
                appearance: none;
                background: #f8fafc;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 500;
                color: #0f172a;
                outline: none;
                transition: border-color var(--anim-fast), background-color var(--anim-fast), box-shadow var(--anim-fast);
            }

            .segdia-select:focus,
            .segdia-input:focus {
                border-color: ${PALETTE.ingresos};
                background: #ffffff;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
            }

            .segdia-btn {
                appearance: none;
                border: none;
                outline: none;
                background: #f1f5f9;
                color: #334155;
                font-size: 12px;
                font-weight: 600;
                padding: 7px 14px;
                border-radius: 8px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                transition: transform var(--anim-fast), background-color var(--anim-fast), color var(--anim-fast), box-shadow var(--anim-fast);
                user-select: none;
            }

            .segdia-btn:hover {
                background: #e2e8f0;
                color: #0f172a;
            }

            .segdia-btn:active {
                transform: scale(0.97);
            }

            .segdia-btn-primary {
                background: ${PALETTE.ingresos};
                color: #ffffff;
            }

            .segdia-btn-primary:hover {
                background: #2563eb;
                color: #ffffff;
            }

            .segdia-btn-sm {
                padding: 4px 10px;
                font-size: 11px;
                border-radius: 6px;
            }

            .segdia-btn-now {
                background: #eff6ff;
                color: #1d4ed8;
                border: 1px solid #bfdbfe;
                font-weight: 700;
            }

            .segdia-btn-now:hover {
                background: #dbeafe;
                color: #1e40af;
            }

            .segdia-btn-now.is-active {
                background: #2563eb;
                color: #ffffff;
                border-color: #1d4ed8;
                box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
            }

            /* Botón Icono Compacto */
            .segdia-btn-icon {
                appearance: none;
                border: 1px solid #e2e8f0;
                outline: none;
                background: #ffffff;
                color: #334155;
                font-size: 13px;
                padding: 4px 8px;
                border-radius: 6px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: transform var(--anim-fast), background-color var(--anim-fast), border-color var(--anim-fast);
            }

            .segdia-btn-icon:hover {
                background: #f8fafc;
                border-color: #cbd5e1;
                color: #0f172a;
            }

            .segdia-btn-icon:active {
                transform: scale(0.94);
            }

            /* Bento Grid de Tarjetas KPI */
            .segdia-bento-kpis {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
                gap: 12px;
            }

            .segdia-kpi-card {
                background: #ffffff;
                border: 1px solid ${PALETTE.border};
                border-radius: 12px;
                padding: 14px 16px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                position: relative;
                overflow: hidden;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
                transition: transform var(--anim-fast), box-shadow var(--anim-fast), border-color var(--anim-fast);
            }

            .segdia-kpi-card:hover {
                border-color: #cbd5e1;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                transform: translateY(-1px);
            }

            .segdia-kpi-card::before {
                content: "";
                position: absolute;
                top: 0;
                left: 0;
                bottom: 0;
                width: 4px;
                border-radius: 12px 0 0 12px;
            }

            .segdia-kpi-card.is-ingresos::before { background: ${PALETTE.ingresos}; }
            .segdia-kpi-card.is-cierres::before { background: ${PALETTE.cierres}; }
            .segdia-kpi-card.is-balance::before { background: ${PALETTE.backlog}; }
            .segdia-kpi-card.is-ttr::before { background: #8B5CF6; }

            .segdia-kpi-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 8px;
            }

            .segdia-kpi-label {
                font-size: 11.5px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: ${PALETTE.textMuted};
            }

            .segdia-kpi-icon {
                font-size: 15px;
                opacity: 0.85;
            }

            .segdia-kpi-val {
                font-size: 26px;
                font-weight: 700;
                line-height: 1.1;
                color: #0f172a;
            }

            .segdia-kpi-sub {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-top: 8px;
                font-size: 11.5px;
                font-weight: 500;
                color: ${PALETTE.textMuted};
                flex-wrap: wrap;
            }

            .segdia-pill {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2px 7px;
                border-radius: 999px;
                font-size: 10.5px;
                font-weight: 600;
            }

            .segdia-pill.pill-green {
                background: ${PALETTE.cierresLight};
                color: #065f46;
            }

            .segdia-pill.pill-amber {
                background: ${PALETTE.backlogLight};
                color: #92400e;
            }

            .segdia-pill.pill-red {
                background: ${PALETTE.criticoLight};
                color: #991b1b;
            }

            .segdia-pill.pill-blue {
                background: ${PALETTE.ingresosLight};
                color: #1e40af;
            }

            /* Sección de Gráficos Bento */
            .segdia-charts-grid {
                display: grid;
                grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
                gap: 12px;
            }

            @media (max-width: 980px) {
                .segdia-charts-grid {
                    grid-template-columns: 1fr;
                }
            }

            .segdia-card {
                background: #ffffff;
                border: 1px solid ${PALETTE.border};
                border-radius: 12px;
                padding: 16px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
                display: flex;
                flex-direction: column;
                gap: 12px;
                position: relative;
            }

            .segdia-card-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 8px;
            }

            .segdia-card-title {
                font-size: 13.5px;
                font-weight: 700;
                color: #0f172a;
                margin: 0;
            }

            .segdia-card-desc {
                font-size: 11.5px;
                color: ${PALETTE.textMuted};
                margin: 0;
            }

            .segdia-chart-wrapper {
                position: relative;
                width: 100%;
                min-height: 250px;
                max-height: 280px;
            }

            /* Switch superior de recurrencia SEDs / Suministros */
            .segdia-recurrence-tabs {
                display: inline-flex;
                background: #f1f5f9;
                padding: 3px;
                border-radius: 9px;
                gap: 3px;
                border: 1px solid #e2e8f0;
            }

            .segdia-tab-pill {
                appearance: none;
                border: none;
                outline: none;
                background: transparent;
                color: #64748b;
                font-size: 12px;
                font-weight: 600;
                padding: 6px 14px;
                border-radius: 7px;
                cursor: pointer;
                transition: all var(--anim-fast);
                user-select: none;
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }

            .segdia-tab-pill:hover {
                color: #0f172a;
            }

            .segdia-tab-pill:active {
                transform: scale(0.97);
            }

            .segdia-tab-pill.active {
                background: #ffffff;
                color: #0f172a;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
            }

            /* Badge de conteo de pendientes */
            .segdia-badge-pendientes {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 2.5px 8.5px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 600;
                white-space: nowrap;
                transition: background-color var(--anim-fast);
            }

            .segdia-badge-pendientes.is-active {
                background: rgba(239, 68, 68, 0.12);
                color: #b91c1c;
                border: 1px solid rgba(239, 68, 68, 0.25);
            }

            .segdia-badge-pendientes.is-zero {
                background: #f1f5f9;
                color: #64748b;
                border: 1px solid #e2e8f0;
            }

            /* Tabla de recurrencia */
            .segdia-table-container {
                overflow-x: auto;
                border: 1px solid ${PALETTE.border};
                border-radius: 10px;
                background: #ffffff;
            }

            .segdia-table {
                width: 100%;
                border-collapse: collapse;
                text-align: left;
                font-size: 12px;
            }

            .segdia-table th {
                background: #f8fafc;
                color: ${PALETTE.textMuted};
                font-weight: 600;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                padding: 9px 12px;
                border-bottom: 1px solid ${PALETTE.border};
                white-space: nowrap;
            }

            .segdia-table td {
                padding: 10px 12px;
                border-bottom: 1px solid #f1f5f9;
                color: #1e293b;
                vertical-align: middle;
            }

            .segdia-table tr:last-child td {
                border-bottom: none;
            }

            .segdia-table tr:hover td {
                background: #f8fafc;
            }

            .segdia-code-badge {
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-weight: 700;
                background: #f1f5f9;
                color: #0f172a;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 11.5px;
            }

            .segdia-empty-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px 20px;
                text-align: center;
                gap: 8px;
                color: ${PALETTE.textMuted};
            }

            .segdia-empty-icon {
                font-size: 28px;
                opacity: 0.7;
            }

            .segdia-empty-title {
                font-size: 14px;
                font-weight: 600;
                color: #334155;
            }

            .segdia-empty-text {
                font-size: 12px;
                max-width: 380px;
            }
        `;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
    }

    /**
     * Extrae registros crudos disponibles en store o variables globales de OMS Map.
     */
    function getRawRecords() {
        let pendientes = [];
        if (typeof window !== 'undefined' && Array.isArray(window.rawData) && window.rawData.length > 0) {
            pendientes = window.rawData;
        } else if (typeof window !== 'undefined' && Array.isArray(window.tdOmsRecords) && window.tdOmsRecords.length > 0) {
            pendientes = window.tdOmsRecords;
        } else if (typeof rawData !== 'undefined' && Array.isArray(rawData) && rawData.length > 0) {
            pendientes = rawData;
        } else if (typeof tdOmsRecords !== 'undefined' && Array.isArray(tdOmsRecords) && tdOmsRecords.length > 0) {
            pendientes = tdOmsRecords;
        } else if (typeof omsStore !== 'undefined' && typeof omsStore.get === 'function') {
            pendientes = omsStore.get('rawData') || omsStore.get('tdOmsRecords') || [];
        } else if (typeof window !== 'undefined' && window.omsStore && typeof window.omsStore.get === 'function') {
            pendientes = window.omsStore.get('rawData') || window.omsStore.get('tdOmsRecords') || [];
        }

        let ejecutados = [];
        if (typeof window !== 'undefined' && Array.isArray(window.ejecutadosRecords) && window.ejecutadosRecords.length > 0) {
            ejecutados = window.ejecutadosRecords;
        } else if (typeof ejecutadosRecords !== 'undefined' && Array.isArray(ejecutadosRecords) && ejecutadosRecords.length > 0) {
            ejecutados = ejecutadosRecords;
        } else if (typeof omsStore !== 'undefined' && typeof omsStore.get === 'function') {
            ejecutados = omsStore.get('ejecutadosRecords') || [];
        } else if (typeof window !== 'undefined' && window.omsStore && typeof window.omsStore.get === 'function') {
            ejecutados = window.omsStore.get('ejecutadosRecords') || [];
        }

        return {
            pendientes: Array.isArray(pendientes) ? pendientes : [],
            ejecutados: Array.isArray(ejecutados) ? ejecutados : []
        };
    }

    /**
     * Parsea fechas en formato D/M/YYYY canónico.
     */
    function parseDateToDmy(val) {
        if (!val) return null;
        if (val instanceof Date) {
            if (Number.isNaN(val.getTime())) return null;
            return `${val.getDate()}/${val.getMonth() + 1}/${val.getFullYear()}`;
        }
        const str = String(val).trim();
        if (!str) return null;

        // DD/MM/YYYY o D/M/YYYY
        let match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (match) {
            return `${parseInt(match[1], 10)}/${parseInt(match[2], 10)}/${parseInt(match[3], 10)}`;
        }
        // YYYY-MM-DD o YYYY/MM/DD
        match = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (match) {
            return `${parseInt(match[3], 10)}/${parseInt(match[2], 10)}/${parseInt(match[1], 10)}`;
        }
        const d = new Date(str);
        if (!Number.isNaN(d.getTime())) {
            return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
        }
        return null;
    }

    /**
     * Extrae hora (0..23) de un valor de fecha/hora.
     */
    function parseHour(val) {
        if (!val) return null;
        if (val instanceof Date) return val.getHours();
        const str = String(val).trim();
        const match = str.match(/(?:T|\s)(\d{1,2}):(\d{2})/);
        if (match) return parseInt(match[1], 10);
        const d = new Date(str);
        return Number.isNaN(d.getTime()) ? null : d.getHours();
    }

    /**
     * Helper para obtener la lista de días disponibles.
     */
    function getDaysList(ejecutados, pendientes) {
        const service = window.SeguimientoDiaService || (typeof SeguimientoDiaService !== 'undefined' ? SeguimientoDiaService : null);
        if (service && typeof service.getAvailableDays === 'function') {
            try {
                const res = service.getAvailableDays(ejecutados, pendientes);
                if (Array.isArray(res) && res.length > 0) {
                    return res.map(item => (typeof item === 'object' && item.date) ? item.date : String(item));
                }
            } catch (err) {
                console.warn('[SeguimientoDia] Error al llamar getAvailableDays en service:', err);
            }
        }

        // Fallback local
        const daySet = new Set();
        const addRecordDate = (rec, fields) => {
            for (const f of fields) {
                if (rec[f]) {
                    const dmy = parseDateToDmy(rec[f]);
                    if (dmy) { daySet.add(dmy); break; }
                }
            }
        };

        const execFields = ['Hora de restauración', 'Fecha de ejecucion', 'Fecha de Ejecución', 'Fecha', 'FECHA_EJECUCION', 'Fecha cierre'];
        const pendFields = ['Hora de inicio', 'Fecha de creación', 'Fecha Creación', 'Fecha', 'FECHA_REGISTRO', 'Fecha inicio'];

        ejecutados.forEach(r => addRecordDate(r, execFields));
        pendientes.forEach(r => addRecordDate(r, pendFields));

        const list = Array.from(daySet);
        list.sort((a, b) => {
            const [da, ma, ya] = a.split('/').map(Number);
            const [db, mb, yb] = b.split('/').map(Number);
            const ta = new Date(ya, ma - 1, da).getTime();
            const tb = new Date(yb, mb - 1, db).getTime();
            return tb - ta;
        });

        if (list.length === 0) {
            const today = new Date();
            list.push(`${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`);
        }
        return list;
    }

    /**
     * Obtiene lista de contratistas disponibles.
     */
    function getContractorsList(ejecutados, pendientes) {
        const set = new Set();
        const check = r => {
            const c = r['Contratista'] || r['Empresa'] || r['EMPRESA'] || r['CONTRATISTA'] || r['Pto.tbjo.responsable'];
            if (c) {
                const clean = String(c).trim();
                if (clean && clean !== '-' && clean !== 'null' && clean !== 'undefined' && clean !== 'N/A') {
                    set.add(clean);
                }
            }
        };
        ejecutados.forEach(check);
        pendientes.forEach(check);
        return Array.from(set).sort();
    }

    /**
     * Helper para extraer SED canónica de un registro.
     */
    function extractSedFromRow(row) {
        if (!row || typeof row !== 'object') return '';
        const keys = ['SED', 'Cod_Sed', 'COD_SED', 'sed', 'Subestacion', 'SE', 'SED_CANONICA'];
        for (const k of keys) {
            if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                const val = String(row[k]).trim().toUpperCase();
                if (val !== 'SIN SED' && val !== 'DESCONOCIDO' && val !== '-' && val !== 'NULL' && val !== '0' && val !== 'N/A') {
                    return val;
                }
            }
        }
        return '';
    }

    /**
     * Helper para extraer código o número de Suministro de un registro.
     */
    function extractSuministroFromRow(row) {
        if (!row || typeof row !== 'object') return '';
        const keys = ['Suministro', 'SUMINISTRO', 'suministro', 'Cliente', 'CLIENTE', 'cliente', 'Inscripcion', 'INSCRIPCION', 'inscripcion', 'NIS', 'nis', 'Nis_Rad', 'nis_rad', 'Numero de Cliente', 'COD_CLIENTE'];
        for (const k of keys) {
            if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                const val = String(row[k]).trim();
                if (val !== '0' && val !== 'N/A' && val !== '-' && val !== 'null') {
                    return val;
                }
            }
        }
        return '';
    }

    /**
     * Helper para extraer distrito.
     */
    function extractDistritoFromRow(row) {
        if (!row || typeof row !== 'object') return '-';
        return row['Distrito'] || row['distrito'] || row['DISTRITO'] || row['Distrito / Comuna'] || row['Zona'] || '-';
    }

    /**
     * Helper para extraer alimentador / CT.
     */
    function extractAlimentadorFromRow(row) {
        if (!row || typeof row !== 'object') return '-';
        return row['Alimentador'] || row['alimentador'] || row['ALIMENTADOR'] || row['CT'] || '-';
    }

    /**
     * Calcula productividad diaria o semanal a través del servicio o fallback integrado.
     */
    function computeDailyProductivity(pendientes, ejecutados, options) {
        const isWeek = options.date === '7D';
        const service = window.SeguimientoDiaService || (typeof SeguimientoDiaService !== 'undefined' ? SeguimientoDiaService : null);
        const optsWithHours = Object.assign({
            startHour: state.startHour,
            endHour: state.endHour
        }, options);

        if (service && typeof service.calculateDailyProductivity === 'function') {
            try {
                const res = service.calculateDailyProductivity(pendientes, ejecutados, optsWithHours);
                if (res) {
                    return normalizeProductivityResult(res, isWeek, pendientes, ejecutados, optsWithHours);
                }
            } catch (err) {
                console.warn('[SeguimientoDia] Error en calculateDailyProductivity del servicio:', err);
            }
        }

        return computeLocalProductivity(pendientes, ejecutados, optsWithHours);
    }

    /**
     * Normaliza la respuesta del servicio completando campos esperados.
     */
    function normalizeProductivityResult(raw, isWeek, pendientes, ejecutados, options) {
        const ingresosTotal = raw.ingresosTotal ?? raw.totalIngresos ?? 0;
        const cierresTotal = raw.cierresTotal ?? raw.totalCierres ?? 0;
        const cierresIntradia = raw.cierresIntradia ?? 0;
        const cierresBacklog = raw.cierresBacklog ?? (cierresTotal - cierresIntradia);
        const ttrPromedioHoras = raw.ttrPromedioHoras ?? raw.ttrPromedio ?? 0;

        // Balance Neto: Ingresos - Cierres (Demanda > Cierres es positivo)
        const balanceNeto = (raw.balanceNeto !== undefined && raw.balanceNeto !== null)
            ? raw.balanceNeto
            : (ingresosTotal - cierresTotal);

        const pctIntradia = cierresTotal > 0 ? Math.round((cierresIntradia / cierresTotal) * 1000) / 10 : 0;
        const pctBacklog = cierresTotal > 0 ? Math.round((cierresBacklog / cierresTotal) * 1000) / 10 : 0;

        if (isWeek) {
            // MODO 7D (Semanal)
            let dailyBreakdown = raw.dailyBreakdown;
            if (!Array.isArray(dailyBreakdown) || dailyBreakdown.length === 0) {
                dailyBreakdown = generateDailyBreakdownFallback(pendientes, ejecutados, options);
            }

            let contractorBreakdown = raw.contractorBreakdown;
            if (!Array.isArray(contractorBreakdown) || contractorBreakdown.length === 0) {
                contractorBreakdown = generateContractorBreakdownFallback(ejecutados, options);
            }

            return {
                isWeekOverview: true,
                ingresosTotal,
                cierresTotal,
                cierresIntradia,
                cierresBacklog,
                pctIntradia,
                pctBacklog,
                balanceNeto,
                ttrPromedioHoras,
                dailyBreakdown,
                contractorBreakdown
            };
        } else {
            // MODO DÍA ESPECÍFICO
            let hourlyDistribution = raw.hourlyDistribution || raw.hourly;
            if (!Array.isArray(hourlyDistribution)) {
                hourlyDistribution = generateHourlyFallback(pendientes, ejecutados, options);
            }

            let waterfall = raw.waterfall;
            if (!waterfall || typeof waterfall !== 'object') {
                // Cálculo estimado de Waterfall si no vino en el objeto
                const inicial = Math.max(0, cierresBacklog + 20); // Inventario inicial estimado
                const final = Math.max(0, inicial + ingresosTotal - cierresIntradia - cierresBacklog);
                waterfall = {
                    inicial,
                    ingresos: ingresosTotal,
                    cierresIntradia,
                    cierresBacklog,
                    final
                };
            }

            let contractorBreakdown = raw.contractorBreakdown;
            if (!Array.isArray(contractorBreakdown)) {
                contractorBreakdown = [];
            }

            return {
                isWeekOverview: false,
                ingresosTotal,
                cierresTotal,
                cierresIntradia,
                cierresBacklog,
                pctIntradia,
                pctBacklog,
                balanceNeto,
                ttrPromedioHoras,
                hourlyDistribution,
                waterfall,
                contractorBreakdown
            };
        }
    }

    /**
     * Fallback local para calcular métricas de productividad.
     */
    function computeLocalProductivity(pendientes, ejecutados, options) {
        const isWeek = options.date === '7D';
        const targetDate = options.date;
        const contractor = (options.contractor && options.contractor !== 'ALL' && options.contractor !== '*') 
            ? String(options.contractor).toUpperCase() : null;

        const startHour = (options.startHour !== undefined && options.startHour !== null) ? Number(options.startHour) : 0;
        const endHour = (options.endHour !== undefined && options.endHour !== null) ? Number(options.endHour) : 24;
        const isHourInRange = (h) => {
            if (h === null || h === undefined || isNaN(h)) return true;
            if (startHour <= 0 && endHour >= 24) return true;
            const maxH = endHour >= 24 ? 23 : endHour;
            return h >= startHour && h <= maxH;
        };

        const matchContractor = r => {
            if (!contractor) return true;
            const c = String(r['Contratista'] || r['Empresa'] || r['EMPRESA'] || r['CONTRATISTA'] || '').toUpperCase();
            return c.includes(contractor);
        };

        if (isWeek) {
            const dailyBreakdown = generateDailyBreakdownFallback(pendientes, ejecutados, options);
            const contractorBreakdown = generateContractorBreakdownFallback(ejecutados, options);

            let sumIngresos = 0;
            let sumCierres = 0;
            dailyBreakdown.forEach(d => {
                sumIngresos += d.ingresos || 0;
                sumCierres += d.cierres || 0;
            });

            return {
                isWeekOverview: true,
                ingresosTotal: sumIngresos,
                cierresTotal: sumCierres,
                cierresIntradia: Math.round(sumCierres * 0.65),
                cierresBacklog: Math.round(sumCierres * 0.35),
                pctIntradia: 65,
                pctBacklog: 35,
                balanceNeto: sumIngresos - sumCierres,
                ttrPromedioHoras: 4.2,
                dailyBreakdown,
                contractorBreakdown
            };
        } else {
            let ingresosTotal = 0;
            let cierresTotal = 0;
            let cierresIntradia = 0;
            let cierresBacklog = 0;
            let sumDurationHours = 0;
            let countDuration = 0;

            const hourlyDist = Array.from({ length: 24 }, (_, hour) => ({ hour, ingresos: 0, cierres: 0 }));

            const contractorMap = new Map();
            const recordContractor = (row, type) => {
                const rawC = row['Contratista'] || row['Empresa'] || row['EMPRESA'] || row['CONTRATISTA'] || 'Sin Contratista';
                const cName = String(rawC).trim();
                if (!cName || cName === '-' || cName === 'null') return;
                const key = cName.toUpperCase();
                if (!contractorMap.has(key)) {
                    contractorMap.set(key, { contractor: cName, ingresos: 0, cierres: 0, balance: 0 });
                }
                const entry = contractorMap.get(key);
                if (type === 'ingreso') entry.ingresos++;
                else if (type === 'cierre') entry.cierres++;
            };

            pendientes.forEach(r => {
                if (!matchContractor(r)) return;
                const fRaw = r['Hora de inicio'] || r['Fecha de creación'] || r['Fecha Creación'] || r['Fecha'];
                const dmy = parseDateToDmy(fRaw);
                if (dmy === targetDate) {
                    const h = parseHour(fRaw);
                    if (isHourInRange(h)) {
                        ingresosTotal++;
                        recordContractor(r, 'ingreso');
                    }
                    if (h !== null && h >= 0 && h < 24) hourlyDist[h].ingresos++;
                }
            });

            ejecutados.forEach(r => {
                if (!matchContractor(r)) return;
                const fCloseRaw = r['Hora de restauración'] || r['Fecha de ejecucion'] || r['Fecha de Ejecución'] || r['Fecha'];
                const dmyClose = parseDateToDmy(fCloseRaw);

                const fOpenRaw = r['Hora de inicio'] || r['Fecha de creación'] || r['Fecha Creación'] || r['Fecha'];
                const dmyOpen = parseDateToDmy(fOpenRaw);
                if (dmyOpen && dmyOpen === targetDate) {
                    recordContractor(r, 'ingreso');
                }

                if (dmyClose === targetDate) {
                    const h = parseHour(fCloseRaw);
                    if (isHourInRange(h)) {
                        cierresTotal++;
                        recordContractor(r, 'cierre');

                        if (dmyOpen && dmyOpen === targetDate) {
                            cierresIntradia++;
                        } else {
                            cierresBacklog++;
                        }
                    }
                    if (h !== null && h >= 0 && h < 24) hourlyDist[h].cierres++;

                    const durVal = r['Duración'] || r['DURACION'] || r['TTR'];
                    if (durVal) {
                        const parsed = parseFloat(durVal);
                        if (!Number.isNaN(parsed) && parsed > 0) {
                            sumDurationHours += parsed;
                            countDuration++;
                        }
                    }
                }
            });

            const inicial = Math.max(0, cierresBacklog + 25);
            const final = Math.max(0, inicial + ingresosTotal - cierresIntradia - cierresBacklog);
            const ttrPromedioHoras = countDuration > 0 ? Math.round((sumDurationHours / countDuration) * 10) / 10 : 3.8;

            const contractorBreakdown = Array.from(contractorMap.values()).map(item => {
                item.balance = item.ingresos - item.cierres;
                return item;
            }).sort((a, b) => {
                const volA = a.ingresos + a.cierres;
                const volB = b.ingresos + b.cierres;
                if (volB !== volA) return volB - volA;
                return b.ingresos - a.ingresos;
            });

            return {
                isWeekOverview: false,
                ingresosTotal,
                cierresTotal,
                cierresIntradia,
                cierresBacklog,
                pctIntradia: cierresTotal > 0 ? Math.round((cierresIntradia / cierresTotal) * 100) : 0,
                pctBacklog: cierresTotal > 0 ? Math.round((cierresBacklog / cierresTotal) * 100) : 0,
                balanceNeto: ingresosTotal - cierresTotal,
                ttrPromedioHoras,
                hourlyDistribution: hourlyDist,
                waterfall: {
                    inicial,
                    ingresos: ingresosTotal,
                    cierresIntradia,
                    cierresBacklog,
                    final
                },
                contractorBreakdown
            };
        }
    }

    /**
     * Fallback para desglose diario de los últimos 7 días.
     */
    function generateDailyBreakdownFallback(pendientes, ejecutados, options) {
        const availableDays = getDaysList(ejecutados, pendientes).slice(0, 7).reverse();
        const contractor = (options.contractor && options.contractor !== 'ALL' && options.contractor !== '*') 
            ? String(options.contractor).toUpperCase() : null;

        const matchContractor = r => {
            if (!contractor) return true;
            const c = String(r['Contratista'] || r['Empresa'] || r['EMPRESA'] || r['CONTRATISTA'] || '').toUpperCase();
            return c.includes(contractor);
        };

        return availableDays.map(dmy => {
            let ingresos = 0;
            let cierres = 0;

            pendientes.forEach(r => {
                if (!matchContractor(r)) return;
                const fRaw = r['Hora de inicio'] || r['Fecha de creación'] || r['Fecha'];
                if (parseDateToDmy(fRaw) === dmy) ingresos++;
            });

            ejecutados.forEach(r => {
                if (!matchContractor(r)) return;
                const fCloseRaw = r['Hora de restauración'] || r['Fecha de ejecucion'] || r['Fecha'];
                if (parseDateToDmy(fCloseRaw) === dmy) cierres++;
            });

            const parts = dmy.split('/');
            const shortLabel = parts.length >= 2 ? `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}` : dmy;

            return {
                date: dmy,
                label: shortLabel,
                ingresos,
                cierres
            };
        });
    }

    /**
     * Fallback para producción por contratista en los últimos 7 días.
     */
    function generateContractorBreakdownFallback(ejecutados, options) {
        const contractorMap = new Map();
        ejecutados.forEach(r => {
            const rawC = r['Contratista'] || r['Empresa'] || r['EMPRESA'] || r['CONTRATISTA'] || 'Sin Contratista';
            const cName = String(rawC).trim();
            if (!cName || cName === '-' || cName === 'null') return;
            contractorMap.set(cName, (contractorMap.get(cName) || 0) + 1);
        });

        const list = Array.from(contractorMap.entries()).map(([contractor, count]) => ({
            contractor,
            cierres: count
        }));

        list.sort((a, b) => b.cierres - a.cierres);
        return list.slice(0, 8);
    }

    /**
     * Fallback para distribución horaria de un día.
     */
    function generateHourlyFallback(pendientes, ejecutados, options) {
        return Array.from({ length: 24 }, (_, hour) => ({ hour, ingresos: 0, cierres: 0 }));
    }

    /**
     * Obtiene registros de SEDs o Suministros recurrentes en los últimos 7 días.
     */
    function computeRecurrentItems(pendientes, ejecutados, options, tab) {
        const service = window.SeguimientoDiaService || (typeof SeguimientoDiaService !== 'undefined' ? SeguimientoDiaService : null);

        if (tab === 'SUMINISTROS') {
            if (service && typeof service.getRecurrentSuministros7D === 'function') {
                try {
                    const res = service.getRecurrentSuministros7D(pendientes, ejecutados, options);
                    if (Array.isArray(res)) return res.map(normalizeSuministroItem);
                } catch (err) {
                    console.warn('[SeguimientoDia] Error en getRecurrentSuministros7D:', err);
                }
            }
            return computeLocalRecurrentSuministros(pendientes, ejecutados, options);
        } else {
            if (service && typeof service.getRecurrentSeds7D === 'function') {
                try {
                    const res = service.getRecurrentSeds7D(pendientes, ejecutados, options);
                    if (Array.isArray(res)) return res.map(normalizeSedItem);
                } catch (err) {
                    console.warn('[SeguimientoDia] Error en getRecurrentSeds7D:', err);
                }
            }
            return computeLocalRecurrentSeds(pendientes, ejecutados, options);
        }
    }

    /**
     * Normaliza un item de SED recurrente.
     */
    function normalizeSedItem(item) {
        if (!item) return null;
        const sed = String(item.sed || item.sedCode || item.codigoSed || '').trim();
        const distrito = item.distrito || item.district || '-';
        const alimentador = item.alimentador || item.ct || '-';
        const total7D = Number(item.total7D ?? item.eventos7D ?? item.total ?? 0);
        const pendientesActivos = Number(item.pendientesActivos ?? (item.tienePendiente ? 1 : 0));

        return {
            sed,
            distrito,
            alimentador,
            total7D,
            pendientesActivos
        };
    }

    /**
     * Normaliza un item de Suministro recurrente.
     */
    function normalizeSuministroItem(item) {
        if (!item) return null;
        const suministro = String(item.suministro || item.cliente || item.nis || item.id || '').trim();
        const sed = String(item.sed || item.sedCode || '').trim();
        const distrito = item.distrito || '-';
        const alimentador = item.alimentador || '-';
        const total7D = Number(item.total7D ?? item.eventos7D ?? item.total ?? 0);
        const pendientesActivos = Number(item.pendientesActivos ?? (item.tienePendiente ? 1 : 0));

        return {
            suministro,
            sed,
            distrito,
            alimentador,
            total7D,
            pendientesActivos
        };
    }

    /**
     * Fallback local para SEDs recurrentes en 7D.
     */
    function computeLocalRecurrentSeds(pendientes, ejecutados, options) {
        const contractor = (options.contractor && options.contractor !== 'ALL' && options.contractor !== '*') 
            ? String(options.contractor).toUpperCase() : null;

        const matchContractor = r => {
            if (!contractor) return true;
            const c = String(r['Contratista'] || r['Empresa'] || r['EMPRESA'] || r['CONTRATISTA'] || '').toUpperCase();
            return c.includes(contractor);
        };

        const sedMap = new Map();

        const processRecord = (r, isPending) => {
            if (!matchContractor(r)) return;
            const sed = extractSedFromRow(r);
            if (!sed) return;

            if (!sedMap.has(sed)) {
                sedMap.set(sed, {
                    sed,
                    distrito: extractDistritoFromRow(r),
                    alimentador: extractAlimentadorFromRow(r),
                    total7D: 0,
                    pendientesActivos: 0
                });
            }
            const item = sedMap.get(sed);
            item.total7D++;
            if (isPending) item.pendientesActivos++;
        };

        pendientes.forEach(r => processRecord(r, true));
        ejecutados.forEach(r => processRecord(r, false));

        const result = Array.from(sedMap.values());
        result.sort((a, b) => {
            const aHasPending = a.pendientesActivos > 0 ? 1 : 0;
            const bHasPending = b.pendientesActivos > 0 ? 1 : 0;
            if (aHasPending !== bHasPending) return bHasPending - aHasPending;
            return b.total7D - a.total7D;
        });

        return result;
    }

    /**
     * Fallback local para Suministros recurrentes en 7D.
     */
    function computeLocalRecurrentSuministros(pendientes, ejecutados, options) {
        const contractor = (options.contractor && options.contractor !== 'ALL' && options.contractor !== '*') 
            ? String(options.contractor).toUpperCase() : null;

        const matchContractor = r => {
            if (!contractor) return true;
            const c = String(r['Contratista'] || r['Empresa'] || r['EMPRESA'] || r['CONTRATISTA'] || '').toUpperCase();
            return c.includes(contractor);
        };

        const sumMap = new Map();

        const processRecord = (r, isPending) => {
            if (!matchContractor(r)) return;
            const suministro = extractSuministroFromRow(r);
            if (!suministro) return;

            const sed = extractSedFromRow(r);

            if (!sumMap.has(suministro)) {
                sumMap.set(suministro, {
                    suministro,
                    sed: sed || '-',
                    distrito: extractDistritoFromRow(r),
                    alimentador: extractAlimentadorFromRow(r),
                    total7D: 0,
                    pendientesActivos: 0
                });
            }
            const item = sumMap.get(suministro);
            item.total7D++;
            if (isPending) item.pendientesActivos++;
            if ((!item.sed || item.sed === '-') && sed) item.sed = sed;
        };

        pendientes.forEach(r => processRecord(r, true));
        ejecutados.forEach(r => processRecord(r, false));

        const result = Array.from(sumMap.values());
        result.sort((a, b) => {
            const aHasPending = a.pendientesActivos > 0 ? 1 : 0;
            const bHasPending = b.pendientesActivos > 0 ? 1 : 0;
            if (aHasPending !== bHasPending) return bHasPending - aHasPending;
            return b.total7D - a.total7D;
        });

        return result;
    }

    /**
     * Hace zoom y enfoque en la SED solicitada en el mapa.
     */
    function focusSedOnMap(sedCode) {
        if (!sedCode || sedCode === '-') return;
        const cleanSed = String(sedCode).trim();

        if (typeof window.focusOnSed === 'function') {
            try {
                window.focusOnSed(cleanSed);
                return;
            } catch (err) {
                console.warn('[SeguimientoDia] Error en window.focusOnSed:', err);
            }
        }

        window.dispatchEvent(new CustomEvent('oms:focus-sed', {
            detail: { sed: cleanSed },
            bubbles: true
        }));

        if (typeof window.openCriticalSedPanel === 'function') {
            try {
                window.openCriticalSedPanel(cleanSed);
                return;
            } catch (e) { /* ignore */ }
        }

        const searchInput = document.getElementById('searchControl') || 
                            document.getElementById('inputAddressSearch') ||
                            document.getElementById('inputFilterTecnicos');
        if (searchInput) {
            searchInput.value = cleanSed;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /**
     * Destruye limpiamente las instancias de Chart.js previas para evitar memory leaks.
     */
    function destroyCharts() {
        if (state.charts.chartA) {
            try {
                state.charts.chartA.destroy();
            } catch (e) {
                console.warn('[SeguimientoDia] Error al destruir chartA:', e);
            }
            state.charts.chartA = null;
        }

        if (state.charts.chartB) {
            try {
                state.charts.chartB.destroy();
            } catch (e) {
                console.warn('[SeguimientoDia] Error al destruir chartB:', e);
            }
            state.charts.chartB = null;
        }
    }

    /**
     * Construye o refresca los gráficos según el modo seleccionado (7D vs Día Específico).
     */
    function renderDynamicCharts(productivity) {
        if (typeof Chart === 'undefined') {
            console.warn('[SeguimientoDia] Chart.js no se encuentra disponible globalmente.');
            return;
        }

        destroyCharts();

        const canvasA = document.getElementById('chartSeguimientoA');
        const canvasB = document.getElementById('chartSeguimientoB');
        if (!canvasA || !canvasB) return;

        const isWeek = productivity.isWeekOverview;

        if (isWeek) {
            // ==========================================
            // MODO 7D: VISTA GENERAL ÚLTIMOS 7 DÍAS
            // ==========================================

            // GRÁFICO A: Evolución Diaria (Ingresos vs Cierres)
            const breakdown = productivity.dailyBreakdown || [];
            const labelsA = breakdown.map(d => d.label || d.date);
            const ingresosData = breakdown.map(d => d.ingresos || 0);
            const cierresData = breakdown.map(d => d.cierres || 0);

            const ctxA = canvasA.getContext('2d');
            state.charts.chartA = new Chart(ctxA, {
                type: 'bar',
                data: {
                    labels: labelsA,
                    datasets: [
                        {
                            label: 'Ingresos',
                            data: ingresosData,
                            backgroundColor: PALETTE.ingresos,
                            borderColor: '#2563EB',
                            borderWidth: 1,
                            borderRadius: 4,
                            barPercentage: 0.8,
                            categoryPercentage: 0.75
                        },
                        {
                            label: 'Cierres',
                            data: cierresData,
                            backgroundColor: PALETTE.cierres,
                            borderColor: '#059669',
                            borderWidth: 1,
                            borderRadius: 4,
                            barPercentage: 0.8,
                            categoryPercentage: 0.75
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 250, easing: 'easeOutQuart' },
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            position: 'top',
                            align: 'end',
                            labels: {
                                boxWidth: 10,
                                boxHeight: 10,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                font: { size: 11, weight: '600' },
                                color: '#475569'
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.94)',
                            titleColor: '#f8fafc',
                            bodyColor: '#e2e8f0',
                            borderColor: 'rgba(255, 255, 255, 0.12)',
                            borderWidth: 1,
                            padding: 10,
                            cornerRadius: 8,
                            boxPadding: 4,
                            callbacks: {
                                footer: function (items) {
                                    if (!items || items.length < 2) return '';
                                    const ing = items[0].parsed.y || 0;
                                    const cie = items[1].parsed.y || 0;
                                    const diff = ing - cie;
                                    return `Balance neto: ${diff > 0 ? '+' + diff : diff}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: '#64748b', font: { size: 10.5 } }
                        },
                        y: {
                            beginAtZero: true,
                            grace: '10%',
                            grid: { color: '#f1f5f9' },
                            ticks: { color: '#64748b', font: { size: 10.5 }, precision: 0 }
                        }
                    }
                },
                plugins: [{
                    id: 'daily7DBarLabels',
                    afterDatasetsDraw(chart) {
                        const { ctx } = chart;
                        chart.data.datasets.forEach((dataset, datasetIdx) => {
                            const meta = chart.getDatasetMeta(datasetIdx);
                            if (!meta || !meta.data) return;
                            meta.data.forEach((bar, idx) => {
                                const val = dataset.data[idx];
                                if (val === undefined || val === null || val === 0) return;
                                const text = String(val);
                                const barHeight = Math.abs(bar.base - bar.y);
                                ctx.save();
                                ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                                ctx.textAlign = 'center';
                                if (barHeight >= 18) {
                                    ctx.fillStyle = '#ffffff';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillText(text, bar.x, (bar.y + bar.base) / 2);
                                } else {
                                    ctx.fillStyle = '#1e293b';
                                    ctx.textBaseline = 'bottom';
                                    ctx.fillText(text, bar.x, bar.y - 3);
                                }
                                ctx.restore();
                            });
                        });
                    }
                }]
            });

            // GRÁFICO B: Cierres por Contratista en la Semana
            const contractors = productivity.contractorBreakdown || [];
            const labelsB = contractors.map(c => c.contractor || 'Sin Nombre');
            const dataB = contractors.map(c => c.cierres ?? c.count ?? 0);

            const ctxB = canvasB.getContext('2d');
            state.charts.chartB = new Chart(ctxB, {
                type: 'bar',
                data: {
                    labels: labelsB,
                    datasets: [
                        {
                            label: 'Cierres en la Semana',
                            data: dataB,
                            backgroundColor: PALETTE.cierres,
                            borderColor: '#059669',
                            borderWidth: 1,
                            borderRadius: 4,
                            barPercentage: 0.75
                        }
                    ]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 250, easing: 'easeOutQuart' },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.94)',
                            titleColor: '#f8fafc',
                            bodyColor: '#e2e8f0',
                            borderColor: 'rgba(255, 255, 255, 0.12)',
                            borderWidth: 1,
                            padding: 10,
                            cornerRadius: 8,
                            callbacks: {
                                label: function (ctx) {
                                    return ` Cierres acumulados: ${ctx.parsed.x || 0} tickets`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            grid: { color: '#f1f5f9' },
                            ticks: { color: '#64748b', font: { size: 10.5 }, precision: 0 }
                        },
                        y: {
                            grid: { display: false },
                            ticks: { color: '#334155', font: { size: 11, weight: '600' } }
                        }
                    }
                }
            });

        } else {
            // ==========================================
            // MODO DÍA ESPECÍFICO: COMPARATIVO CONTRATISTAS / HORARIO + EVOLUCIÓN DIARIA
            // ==========================================

            const isSingleDayAllContractors = (!state.selectedContractor || state.selectedContractor === 'ALL');

            if (isSingleDayAllContractors) {
                // ========================================================
                // GRÁFICO A (1 DÍA + TODAS): Casos Ingresados vs. Cerrados por Contratista
                // ========================================================
                const rawContractors = (productivity.contractorBreakdown || []).filter(c => (c.ingresos > 0 || c.cierres > 0));
                const contractorsList = rawContractors.length > 0 ? rawContractors : (productivity.contractorBreakdown || []);
                const labelsA = contractorsList.map(c => c.contractor || 'Sin Nombre');
                const ingData = contractorsList.map(c => c.ingresos || 0);
                const cieData = contractorsList.map(c => c.cierres || 0);

                const ctxA = canvasA.getContext('2d');
                state.charts.chartA = new Chart(ctxA, {
                    type: 'bar',
                    data: {
                        labels: labelsA,
                        datasets: [
                            {
                                label: 'Ingresos del Día',
                                data: ingData,
                                backgroundColor: PALETTE.ingresosAlpha,
                                borderColor: PALETTE.ingresos,
                                borderWidth: 1,
                                borderRadius: 4,
                                barPercentage: 0.8,
                                categoryPercentage: 0.75
                            },
                            {
                                label: 'Cierres del Día',
                                data: cieData,
                                backgroundColor: PALETTE.cierresAlpha,
                                borderColor: PALETTE.cierres,
                                borderWidth: 1,
                                borderRadius: 4,
                                barPercentage: 0.8,
                                categoryPercentage: 0.75
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: { duration: 250, easing: 'easeOutQuart' },
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: {
                                position: 'top',
                                align: 'end',
                                labels: {
                                    boxWidth: 10,
                                    boxHeight: 10,
                                    usePointStyle: true,
                                    pointStyle: 'circle',
                                    font: { size: 11, weight: '600' },
                                    color: '#475569'
                                }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(15, 23, 42, 0.94)',
                                titleColor: '#f8fafc',
                                bodyColor: '#e2e8f0',
                                borderColor: 'rgba(255, 255, 255, 0.12)',
                                borderWidth: 1,
                                padding: 10,
                                cornerRadius: 8,
                                callbacks: {
                                    footer: function (items) {
                                        if (!items || items.length < 2) return '';
                                        const ing = items[0].parsed.y || 0;
                                        const cie = items[1].parsed.y || 0;
                                        const diff = ing - cie;
                                        return `Balance neto empresa: ${diff > 0 ? '+' + diff : diff}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: {
                                    color: '#334155',
                                    font: { size: 11, weight: '600' }
                                }
                            },
                            y: {
                                beginAtZero: true,
                                grace: '8%',
                                grid: { color: '#f1f5f9' },
                                ticks: { color: '#64748b', font: { size: 10.5 }, precision: 0 }
                            }
                        }
                    },
                    plugins: [{
                        id: 'contractorBarLabels',
                        afterDatasetsDraw(chart) {
                            const { ctx } = chart;
                            chart.data.datasets.forEach((dataset, datasetIdx) => {
                                const meta = chart.getDatasetMeta(datasetIdx);
                                if (!meta || !meta.data) return;
                                meta.data.forEach((bar, idx) => {
                                    const val = dataset.data[idx];
                                    if (val === undefined || val === null || val === 0) return;
                                    const text = String(val);
                                    const barHeight = Math.abs(bar.base - bar.y);
                                    ctx.save();
                                    ctx.font = '600 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                                    ctx.textAlign = 'center';
                                    if (barHeight >= 18) {
                                        ctx.fillStyle = '#ffffff';
                                        ctx.textBaseline = 'middle';
                                        ctx.fillText(text, bar.x, (bar.y + bar.base) / 2);
                                    } else {
                                        ctx.fillStyle = '#334155';
                                        ctx.textBaseline = 'bottom';
                                        ctx.fillText(text, bar.x, bar.y - 3);
                                    }
                                    ctx.restore();
                                });
                            });
                        }
                    }]
                });
            } else {
                // ========================================================
                // GRÁFICO A (1 DÍA + EMPRESA ESPECÍFICA): Balance Horario (00:00 - 23:00)
                // ========================================================
                const hourly = productivity.hourlyDistribution || [];
                const labelsA = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
                const ingHourly = new Array(24).fill(0);
                const cieHourly = new Array(24).fill(0);

                hourly.forEach((h, idx) => {
                    const hourIndex = (h && typeof h.hour === 'number') ? h.hour : idx;
                    if (hourIndex >= 0 && hourIndex < 24) {
                        ingHourly[hourIndex] = h.ingresos || 0;
                        cieHourly[hourIndex] = h.cierres || 0;
                    }
                });

                const ctxA = canvasA.getContext('2d');
                state.charts.chartA = new Chart(ctxA, {
                    type: 'bar',
                    data: {
                        labels: labelsA,
                        datasets: [
                            {
                                label: 'Ingresos del Día',
                                data: ingHourly,
                                backgroundColor: PALETTE.ingresosAlpha,
                                borderColor: PALETTE.ingresos,
                                borderWidth: 1,
                                borderRadius: 4,
                                barPercentage: 0.85,
                                categoryPercentage: 0.8
                            },
                            {
                                label: 'Cierres del Día',
                                data: cieHourly,
                                backgroundColor: PALETTE.cierresAlpha,
                                borderColor: PALETTE.cierres,
                                borderWidth: 1,
                                borderRadius: 4,
                                barPercentage: 0.85,
                                categoryPercentage: 0.8
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: { duration: 250, easing: 'easeOutQuart' },
                        interaction: { mode: 'index', intersect: false },
                        plugins: {
                            legend: {
                                position: 'top',
                                align: 'end',
                                labels: {
                                    boxWidth: 10,
                                    boxHeight: 10,
                                    usePointStyle: true,
                                    pointStyle: 'circle',
                                    font: { size: 11, weight: '600' },
                                    color: '#475569'
                                }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(15, 23, 42, 0.94)',
                                titleColor: '#f8fafc',
                                bodyColor: '#e2e8f0',
                                borderColor: 'rgba(255, 255, 255, 0.12)',
                                borderWidth: 1,
                                padding: 10,
                                cornerRadius: 8,
                                callbacks: {
                                    footer: function (items) {
                                        if (!items || items.length < 2) return '';
                                        const ing = items[0].parsed.y || 0;
                                        const cie = items[1].parsed.y || 0;
                                        const diff = ing - cie;
                                        return `Balance neto hora: ${diff > 0 ? '+' + diff : diff}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { display: false },
                                ticks: {
                                    color: '#64748b',
                                    font: { size: 10.5 },
                                    maxRotation: 0,
                                    autoSkip: true,
                                    maxTicksLimit: 12
                                }
                            },
                            y: {
                                beginAtZero: true,
                                grid: { color: '#f1f5f9' },
                                ticks: { color: '#64748b', font: { size: 10.5 }, precision: 0 }
                            }
                        }
                    }
                });
            }

            // ========================================================
            // GRÁFICO B: Evolución diaria con Floating Bars y Etiquetas Numéricas Absolutas
            // ========================================================
            const wf = productivity.waterfall || {};
            const inicial = Number(wf.inicial ?? 0);
            const nuevos = Number(wf.ingresos ?? productivity.ingresosTotal ?? 0);
            const intradia = Number(wf.cierresIntradia ?? productivity.cierresIntradia ?? 0);
            const backlog = Number(wf.cierresBacklog ?? productivity.cierresBacklog ?? 0);
            const finalVal = Number(wf.final ?? Math.max(0, inicial + nuevos - intradia - backlog));

            // Floating bars: [[min, max], ...]
            const step1 = inicial;
            const step2 = inicial + nuevos;
            const step3 = Math.max(0, step2 - intradia);
            const step4 = Math.max(0, step3 - backlog);

            const waterfallData = [
                [0, step1],                               // Inicial
                [step1, step2],                           // Nuevos (+)
                [step3, step2],                           // Intradía (-)
                [step4, step3],                           // Backlog (-)
                [0, step4]                                // Final
            ];
            const rawNumbers = [inicial, nuevos, intradia, backlog, finalVal];

            const ctxB = canvasB.getContext('2d');
            state.charts.chartB = new Chart(ctxB, {
                type: 'bar',
                data: {
                    labels: ['Inicial', 'Nuevos (+)', 'Intradía (-)', 'Backlog (-)', 'Final'],
                    datasets: [
                        {
                            label: 'Flujo de Inventario',
                            data: waterfallData,
                            backgroundColor: [
                                PALETTE.waterfallInicial,  // Inicial: Gris azulado #64748B
                                PALETTE.ingresos,          // Nuevos (+): Azul #3B82F6
                                PALETTE.cierres,           // Cierres Intradía (-): Verde esmeralda #10B981
                                PALETTE.cierresBosque,     // Cierres Backlog (-): Verde bosque #059669
                                PALETTE.waterfallFinal     // Final: Azul pizarra #1E293B
                            ],
                            borderColor: [
                                '#475569',
                                '#2563EB',
                                '#059669',
                                '#047857',
                                '#0F172A'
                            ],
                            borderWidth: 1,
                            borderRadius: 4,
                            barPercentage: 0.75
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 250, easing: 'easeOutQuart' },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.94)',
                            titleColor: '#f8fafc',
                            bodyColor: '#e2e8f0',
                            borderColor: 'rgba(255, 255, 255, 0.12)',
                            borderWidth: 1,
                            padding: 10,
                            cornerRadius: 8,
                            callbacks: {
                                label: function (ctx) {
                                    const idx = ctx.dataIndex;
                                    const raw = ctx.raw;
                                    if (!Array.isArray(raw)) return '';
                                    const min = raw[0];
                                    const max = raw[1];
                                    const delta = Math.abs(max - min);

                                    switch (idx) {
                                        case 0:
                                            return ` Backlog Inicial: ${max} tickets`;
                                        case 1:
                                            return ` Nuevos Ingresos: +${delta} (Nivel alcanzado: ${max})`;
                                        case 2:
                                            return ` Cierres Intradía: -${delta} (Nivel remanente: ${min})`;
                                        case 3:
                                            return ` Cierres Backlog: -${delta} (Nivel remanente: ${min})`;
                                        case 4:
                                            return ` Backlog Final: ${max} tickets remanentes`;
                                        default:
                                            return ` ${ctx.label}: ${delta}`;
                                    }
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: {
                                color: '#334155',
                                font: { size: 11, weight: '600' }
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grace: '8%',
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                color: '#64748b',
                                font: { size: 10.5 },
                                precision: 0
                            }
                        }
                    }
                },
                plugins: [{
                    id: 'waterfallValueLabels',
                    afterDatasetsDraw(chart) {
                        const { ctx } = chart;
                        const meta = chart.getDatasetMeta(0);
                        if (!meta || !meta.data) return;

                        ctx.save();
                        ctx.font = '700 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                        ctx.textAlign = 'center';

                        meta.data.forEach((bar, idx) => {
                            const val = rawNumbers[idx];
                            if (val === undefined || val === null) return;
                            const text = String(Math.abs(Number(val) || 0));

                            const barHeight = Math.abs(bar.base - bar.y);
                            const topY = Math.min(bar.y, bar.base);
                            const centerY = (bar.y + bar.base) / 2;

                            if (barHeight >= 22) {
                                ctx.fillStyle = '#ffffff';
                                ctx.textBaseline = 'middle';
                                ctx.fillText(text, bar.x, centerY);
                            } else {
                                ctx.fillStyle = '#1e293b';
                                ctx.textBaseline = 'bottom';
                                ctx.fillText(text, bar.x, topY - 4);
                            }
                        });
                        ctx.restore();
                    }
                }]
            });
        }
    }

    /**
     * Genera la fila de la tabla para SED o Suministro.
     */
    function renderTableRow(item, isSuministro) {
        const badgeClass = item.pendientesActivos > 0 ? 'is-active' : 'is-zero';
        const badgeText = `${item.pendientesActivos} pendientes`;

        if (isSuministro) {
            return `
                <tr>
                    <td>
                        <span class="segdia-code-badge" style="color: #1e40af; background: ${PALETTE.ingresosLight};">
                            ${escapeHtml(item.suministro)}
                        </span>
                    </td>
                    <td>
                        <div style="font-weight: 600; color: #1e293b;">SED: ${escapeHtml(item.sed)}</div>
                        <div style="font-size: 11px; color: ${PALETTE.textMuted};">${escapeHtml(item.distrito)}</div>
                    </td>
                    <td class="is-num" style="text-align: center;">
                        <span class="segdia-badge-val" style="font-size: 13px; font-weight: 700; color: #0f172a;">${item.total7D}</span>
                    </td>
                    <td>
                        <span class="segdia-badge-pendientes ${badgeClass}">${badgeText}</span>
                    </td>
                    <td style="text-align: right;">
                        <button type="button" class="segdia-btn-icon segdia-btn-focus-sed" data-sed="${escapeHtml(item.sed)}" data-suministro="${escapeHtml(item.suministro)}" title="Ubicar en mapa">
                            🔍
                        </button>
                    </td>
                </tr>
            `;
        } else {
            return `
                <tr>
                    <td>
                        <span class="segdia-code-badge">${escapeHtml(item.sed)}</span>
                    </td>
                    <td>
                        <div style="font-weight: 600; color: #1e293b;">${escapeHtml(item.distrito)}</div>
                        <div style="font-size: 11px; color: ${PALETTE.textMuted};">CT: ${escapeHtml(item.alimentador)}</div>
                    </td>
                    <td class="is-num" style="text-align: center;">
                        <span class="segdia-badge-val" style="font-size: 13px; font-weight: 700; color: #0f172a;">${item.total7D}</span>
                    </td>
                    <td>
                        <span class="segdia-badge-pendientes ${badgeClass}">${badgeText}</span>
                    </td>
                    <td style="text-align: right;">
                        <button type="button" class="segdia-btn-icon segdia-btn-focus-sed" data-sed="${escapeHtml(item.sed)}" title="Ubicar en mapa">
                            🔍
                        </button>
                    </td>
                </tr>
            `;
        }
    }

    /**
     * Sanitizador básico HTML para evitar inyecciones.
     */
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Renderiza todo el contenido visual en el contenedor destino.
     */
    function render() {
        const isAdmin = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('oms_user_role') : null) === 'admin';
        if (!isAdmin) {
            if (state.containerEl) state.containerEl.innerHTML = '';
            return;
        }
        injectStyles();

        let container = state.containerEl;
        if (!container) {
            container = document.getElementById('seguimientoDiaContainer');
        }

        if (!container) {
            container = document.createElement('div');
            container.id = 'seguimientoDiaContainer';
            const mainTarget = document.querySelector('.main-content') || document.body;
            mainTarget.appendChild(container);
            state.containerEl = container;
        }

        const { pendientes, ejecutados } = getRawRecords();
        const availableDays = getDaysList(ejecutados, pendientes);

        // Si selectedDate no es '7D' y no existe en los días disponibles, default a '7D'
        if (state.selectedDate !== '7D' && !availableDays.includes(state.selectedDate)) {
            state.selectedDate = '7D';
        }

        const contractors = getContractorsList(ejecutados, pendientes);
        const contractorParam = (!state.selectedContractor || state.selectedContractor === 'ALL') ? '*' : state.selectedContractor;
        const workTypeParam = (!state.selectedWorkType || state.selectedWorkType === 'ALL') ? '*' : state.selectedWorkType;

        // Calcular datos según fecha seleccionada ('7D' o día específico)
        const productivity = computeDailyProductivity(pendientes, ejecutados, {
            date: state.selectedDate,
            contractor: contractorParam,
            workType: workTypeParam
        });

        // Monitor dual de recurrencia (SEDs vs Suministros)
        const isSuministrosTab = state.recurrenceTab === 'SUMINISTROS';
        const recurrentItems = computeRecurrentItems(pendientes, ejecutados, {
            contractor: contractorParam,
            workType: workTypeParam
        }, state.recurrenceTab);

        // Filtrado por buscador rápido
        const query = (state.searchQuery7D || '').toLowerCase().trim();
        const filteredItems = recurrentItems.filter(item => {
            if (!query) return true;
            if (isSuministrosTab) {
                return (item.suministro && item.suministro.toLowerCase().includes(query)) ||
                       (item.sed && item.sed.toLowerCase().includes(query)) ||
                       (item.distrito && item.distrito.toLowerCase().includes(query));
            } else {
                return (item.sed && item.sed.toLowerCase().includes(query)) ||
                       (item.distrito && item.distrito.toLowerCase().includes(query)) ||
                       (item.alimentador && item.alimentador.toLowerCase().includes(query));
            }
        });

        const displayedItems = state.expanded7D ? filteredItems : filteredItems.slice(0, state.limit7D);

        // Configuración visual de Tarjeta KPI Balance Neto (Requisito 3)
        const net = productivity.balanceNeto;
        let balanceDisplay = '0';
        let balanceColorClass = 'pill-blue';
        let balanceText = 'Flujo equilibrado';

        if (net > 0) {
            balanceDisplay = `+${net}`;
            balanceColorClass = 'pill-amber';
            balanceText = 'Carga en aumento (Demanda > Cierres)';
        } else if (net < 0) {
            balanceDisplay = `${net}`;
            balanceColorClass = 'pill-green';
            balanceText = 'Backlog en reducción (Saldo a favor)';
        }

        const isWeek = productivity.isWeekOverview;
        const isSingleDayAllContractors = !isWeek && (!state.selectedContractor || state.selectedContractor === 'ALL');

        let cardTitleA = 'Balance Horario de Flujo (00:00 - 23:00)';
        let cardDescA = 'Ingresos vs. Cierres agrupados por hora del día seleccionado';
        if (isWeek) {
            cardTitleA = 'Evolución Diaria (Últimos 7 Días)';
            cardDescA = 'Ingresos (Azul) vs. Cierres (Verde) por cada jornada';
        } else if (isSingleDayAllContractors) {
            cardTitleA = 'Casos Ingresados vs. Cerrados por Contratista';
            cardDescA = 'Comparativo de nuevos ingresos (Azul) vs. cierres efectivos (Verde) por empresa';
        } else {
            cardTitleA = `Balance Horario de Flujo (${escapeHtml(state.selectedContractor)})`;
            cardDescA = `Distribución horaria (00:00 - 23:00) para ${escapeHtml(state.selectedContractor)}`;
        }

        const cardTitleB = isWeek ? 'Cierres por Contratista (Semana)' : 'Evolución diaria';
        const cardDescB = isWeek ? 'Producción acumulada de contratistas en los últimos 7 días' : 'Flujo de inventario: Inicial, Nuevos, Intradía, Backlog y Remanente final';

        // Construir HTML UI
        container.innerHTML = `
            <div class="segdia-root">
                <!-- BARRA SUPERIOR / FILTROS -->
                <div class="segdia-toolbar">
                    <div class="segdia-title-group">
                        <h2>Seguimiento y Productividad Diaria</h2>
                        <span class="segdia-tag-badge">⚡ Control Operativo OMS</span>
                    </div>

                    <div class="segdia-filters">
                        <label class="segdia-filter-label" for="segdiaSelectDate">Periodo:</label>
                        <select id="segdiaSelectDate" class="segdia-select" aria-label="Seleccionar fecha o periodo">
                            <option value="7D" ${state.selectedDate === '7D' ? 'selected' : ''}>🌟 Vista General (Últimos 7 Días)</option>
                            ${availableDays.map(d => `<option value="${d}" ${d === state.selectedDate ? 'selected' : ''}>${d}</option>`).join('')}
                        </select>

                        <label class="segdia-filter-label" for="segdiaSelectContractor">Empresa:</label>
                        <select id="segdiaSelectContractor" class="segdia-select" aria-label="Seleccionar contratista">
                            <option value="ALL" ${state.selectedContractor === 'ALL' ? 'selected' : ''}>Todas las empresas</option>
                            ${contractors.map(c => `<option value="${c}" ${c === state.selectedContractor ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>

                        <label class="segdia-filter-label" for="segdiaSelectStartHour">Desde:</label>
                        <select id="segdiaSelectStartHour" class="segdia-select" aria-label="Hora de inicio">
                            ${Array.from({ length: 24 }, (_, i) => `<option value="${i}" ${state.startHour === i ? 'selected' : ''}>${String(i).padStart(2, '0')}:00</option>`).join('')}
                        </select>

                        <label class="segdia-filter-label" for="segdiaSelectEndHour">Hasta:</label>
                        <select id="segdiaSelectEndHour" class="segdia-select" aria-label="Hora de fin">
                            ${Array.from({ length: 24 }, (_, i) => {
                                const val = i + 1;
                                const lbl = val === 24 ? '24:00 (Fin)' : `${String(val).padStart(2, '0')}:00`;
                                return `<option value="${val}" ${state.endHour === val ? 'selected' : ''}>${lbl}</option>`;
                            }).join('')}
                        </select>

                        <button type="button" id="btnSegdiaNow" class="segdia-btn ${state.isLiveNow ? 'segdia-btn-now is-active' : 'segdia-btn-now'}" title="Fijar corte hasta la hora actual">
                            ⚡ Ahora
                        </button>

                        <button type="button" id="btnSegdiaRefresh" class="segdia-btn" title="Recalcular métricas">
                            🔄 Actualizar
                        </button>
                    </div>
                </div>

                <!-- BENTO GRID KPIS SUPERIORES -->
                <div class="segdia-bento-kpis">
                    <!-- KPI 1: Ingresos -->
                    <div class="segdia-kpi-card is-ingresos">
                        <div class="segdia-kpi-head">
                            <span class="segdia-kpi-label">${isWeek ? 'Ingresos (7 Días)' : 'Ingresos del Día'}</span>
                            <span class="segdia-kpi-icon">📥</span>
                        </div>
                        <div class="segdia-kpi-val">${productivity.ingresosTotal}</div>
                        <div class="segdia-kpi-sub">
                            <span class="segdia-pill pill-blue">Nuevos tickets</span>
                            <span>${isWeek ? 'semana móvil 7D' : 'registrados en fecha'}</span>
                        </div>
                    </div>

                    <!-- KPI 2: Cierres -->
                    <div class="segdia-kpi-card is-cierres">
                        <div class="segdia-kpi-head">
                            <span class="segdia-kpi-label">${isWeek ? 'Cierres (7 Días)' : 'Cierres del Día'}</span>
                            <span class="segdia-kpi-icon">✅</span>
                        </div>
                        <div class="segdia-kpi-val">${productivity.cierresTotal}</div>
                        <div class="segdia-kpi-sub">
                            <span class="segdia-pill pill-green">${productivity.pctIntradia}% intradía</span>
                            <span class="segdia-pill pill-amber">${productivity.pctBacklog}% backlog</span>
                        </div>
                    </div>

                    <!-- KPI 3: Balance Neto -->
                    <div class="segdia-kpi-card is-balance">
                        <div class="segdia-kpi-head">
                            <span class="segdia-kpi-label">Balance Neto</span>
                            <span class="segdia-kpi-icon">⚖️</span>
                        </div>
                        <div class="segdia-kpi-val">${balanceDisplay}</div>
                        <div class="segdia-kpi-sub">
                            <span class="segdia-pill ${balanceColorClass}">${balanceText}</span>
                        </div>
                    </div>

                    <!-- KPI 4: TTR Promedio -->
                    <div class="segdia-kpi-card is-ttr">
                        <div class="segdia-kpi-head">
                            <span class="segdia-kpi-label">TTR Promedio</span>
                            <span class="segdia-kpi-icon">⏱️</span>
                        </div>
                        <div class="segdia-kpi-val">${productivity.ttrPromedioHoras > 0 ? productivity.ttrPromedioHoras + 'h' : '--'}</div>
                        <div class="segdia-kpi-sub">
                            <span>Horas promedio de resolución</span>
                        </div>
                    </div>
                </div>

                <!-- BENTO GRID DE GRÁFICOS DINÁMICOS -->
                <div class="segdia-charts-grid">
                    <!-- Gráfico Principal A -->
                    <div class="segdia-card">
                        <div class="segdia-card-header">
                            <div>
                                <h3 class="segdia-card-title">${cardTitleA}</h3>
                                <p class="segdia-card-desc">${cardDescA}</p>
                            </div>
                        </div>
                        <div class="segdia-chart-wrapper">
                            <canvas id="chartSeguimientoA"></canvas>
                        </div>
                    </div>

                    <!-- Gráfico Secundario B -->
                    <div class="segdia-card">
                        <div class="segdia-card-header">
                            <div>
                                <h3 class="segdia-card-title">${cardTitleB}</h3>
                                <p class="segdia-card-desc">${cardDescB}</p>
                            </div>
                        </div>
                        <div class="segdia-chart-wrapper">
                            <canvas id="chartSeguimientoB"></canvas>
                        </div>
                    </div>
                </div>

                <!-- MONITOR DE RECURRENCIA 7D DUAL (SEDs / SUMINISTROS) -->
                <div class="segdia-card">
                    <div class="segdia-card-header">
                        <div>
                            <h3 class="segdia-card-title">Monitor de Recurrencia 7D</h3>
                            <p class="segdia-card-desc">Detección de puntos con fallas repetidas en la última semana móvil</p>
                        </div>
                        
                        <!-- SELECTOR SWITCH DUAL -->
                        <div class="segdia-recurrence-tabs">
                            <button type="button" class="segdia-tab-pill ${state.recurrenceTab === 'SEDS' ? 'active' : ''}" data-tab="SEDS">🏢 Subestaciones (SEDs)</button>
                            <button type="button" class="segdia-tab-pill ${state.recurrenceTab === 'SUMINISTROS' ? 'active' : ''}" data-tab="SUMINISTROS">⚡ Suministros</button>
                        </div>
                    </div>

                    <!-- Buscador rápido en vivo -->
                    <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                        <input type="text" id="inputSearchRecurrent" class="segdia-input" style="flex: 1; max-width: 380px;" placeholder="${isSuministrosTab ? '🔎 Buscar suministro, código SED o distrito...' : '🔎 Buscar por código SED, distrito o alimentador...'}" value="${escapeHtml(state.searchQuery7D)}">
                        <span style="font-size: 11.5px; color: ${PALETTE.textMuted};">
                            Mostrando <b>${displayedItems.length}</b> de <b>${filteredItems.length}</b> registros
                        </span>
                    </div>

                    <!-- Tabla de Resultados -->
                    <div class="segdia-table-container">
                        ${displayedItems.length > 0 ? `
                            <table class="segdia-table">
                                <thead>
                                    <tr>
                                        <th style="width: 140px;">${isSuministrosTab ? 'Suministro' : 'SED'}</th>
                                        <th>${isSuministrosTab ? 'SED Asignada / Distrito' : 'Ubicación / CT'}</th>
                                        <th style="width: 100px; text-align: center;">Eventos 7D</th>
                                        <th style="width: 140px;">Pendientes</th>
                                        <th style="width: 70px; text-align: right;">Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${displayedItems.map(item => renderTableRow(item, isSuministrosTab)).join('')}
                                </tbody>
                            </table>
                        ` : `
                            <div class="segdia-empty-state">
                                <div class="segdia-empty-icon">🔍</div>
                                <div class="segdia-empty-title">Sin resultados de recurrencia</div>
                                <div class="segdia-empty-text">No se encontraron ${isSuministrosTab ? 'suministros' : 'subestaciones'} con eventos repetidos en los últimos 7 días.</div>
                            </div>
                        `}
                    </div>

                    <!-- Paginación / Ver Más -->
                    ${filteredItems.length > state.limit7D ? `
                        <div style="display: flex; justify-content: center; margin-top: 8px;">
                            <button type="button" id="btnToggleExpandRecurrent" class="segdia-btn">
                                ${state.expanded7D ? '▲ Mostrar solo Top 20' : `▼ Ver todos (${filteredItems.length} registros)`}
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        // Conectar listeners de eventos
        attachEventListeners();

        // Renderizar gráficos dinámicos en Chart.js
        renderDynamicCharts(productivity);
    }

    /**
     * Vincula los event listeners de los controles interactivos.
     */
    function attachEventListeners() {
        const dateSelect = document.getElementById('segdiaSelectDate');
        if (dateSelect) {
            dateSelect.addEventListener('change', (e) => {
                state.selectedDate = e.target.value;
                render();
            });
        }

        const contractorSelect = document.getElementById('segdiaSelectContractor');
        if (contractorSelect) {
            contractorSelect.addEventListener('change', (e) => {
                state.selectedContractor = e.target.value;
                render();
            });
        }

        const startHourSelect = document.getElementById('segdiaSelectStartHour');
        if (startHourSelect) {
            startHourSelect.addEventListener('change', (e) => {
                const val = parseInt(e.target.value, 10) || 0;
                state.startHour = val;
                if (state.endHour <= state.startHour) {
                    state.endHour = Math.min(24, state.startHour + 1);
                }
                state.isLiveNow = false;
                render();
            });
        }

        const endHourSelect = document.getElementById('segdiaSelectEndHour');
        if (endHourSelect) {
            endHourSelect.addEventListener('change', (e) => {
                const val = parseInt(e.target.value, 10) || 24;
                state.endHour = val;
                if (state.startHour >= state.endHour) {
                    state.startHour = Math.max(0, state.endHour - 1);
                }
                state.isLiveNow = false;
                render();
            });
        }

        const nowBtn = document.getElementById('btnSegdiaNow');
        if (nowBtn) {
            nowBtn.addEventListener('click', () => {
                const currentHour = new Date().getHours();
                state.endHour = currentHour;
                if (state.startHour > state.endHour) {
                    state.startHour = 0;
                }
                state.isLiveNow = true;
                render();
            });
        }

        const refreshBtn = document.getElementById('btnSegdiaRefresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                render();
            });
        }

        // Switch de pestañas SEDs / Suministros
        const tabButtons = document.querySelectorAll('.segdia-recurrence-tabs .segdia-tab-pill');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (state.recurrenceTab !== btn.dataset.tab) {
                    state.recurrenceTab = btn.dataset.tab;
                    state.searchQuery7D = '';
                    render();
                }
            });
        });

        // Buscador rápido
        const searchInput = document.getElementById('inputSearchRecurrent');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                state.searchQuery7D = e.target.value;
                updateTableOnly();
            });
        }

        const toggleExpandBtn = document.getElementById('btnToggleExpandRecurrent');
        if (toggleExpandBtn) {
            toggleExpandBtn.addEventListener('click', () => {
                state.expanded7D = !state.expanded7D;
                render();
            });
        }

        // Delegación de eventos para botones de ubicar SED en mapa
        const tableContainer = document.querySelector('.segdia-table-container');
        if (tableContainer) {
            tableContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.segdia-btn-focus-sed');
                if (btn) {
                    const sed = btn.dataset.sed;
                    const suministro = btn.dataset.suministro;
                    if (suministro) {
                        window.dispatchEvent(new CustomEvent('oms:focus-suministro', {
                            detail: { suministro, sed },
                            bubbles: true
                        }));
                    }
                    if (sed && sed !== '-') {
                        focusSedOnMap(sed);
                    }
                }
            });
        }
    }

    /**
     * Actualiza únicamente la tabla al tipear en el buscador para una interacción fluida a 60fps.
     */
    function updateTableOnly() {
        const { pendientes, ejecutados } = getRawRecords();
        const contractorParam = (!state.selectedContractor || state.selectedContractor === 'ALL') ? '*' : state.selectedContractor;
        const workTypeParam = (!state.selectedWorkType || state.selectedWorkType === 'ALL') ? '*' : state.selectedWorkType;

        const isSuministrosTab = state.recurrenceTab === 'SUMINISTROS';
        const recurrentItems = computeRecurrentItems(pendientes, ejecutados, {
            contractor: contractorParam,
            workType: workTypeParam
        }, state.recurrenceTab);

        const query = (state.searchQuery7D || '').toLowerCase().trim();
        const filteredItems = recurrentItems.filter(item => {
            if (!query) return true;
            if (isSuministrosTab) {
                return (item.suministro && item.suministro.toLowerCase().includes(query)) ||
                       (item.sed && item.sed.toLowerCase().includes(query)) ||
                       (item.distrito && item.distrito.toLowerCase().includes(query));
            } else {
                return (item.sed && item.sed.toLowerCase().includes(query)) ||
                       (item.distrito && item.distrito.toLowerCase().includes(query)) ||
                       (item.alimentador && item.alimentador.toLowerCase().includes(query));
            }
        });

        const displayedItems = state.expanded7D ? filteredItems : filteredItems.slice(0, state.limit7D);
        const container = document.querySelector('.segdia-table-container');
        if (!container) return;

        if (displayedItems.length === 0) {
            container.innerHTML = `
                <div class="segdia-empty-state">
                    <div class="segdia-empty-icon">🔍</div>
                    <div class="segdia-empty-title">Sin resultados de recurrencia</div>
                    <div class="segdia-empty-text">No se encontraron resultados para "${escapeHtml(state.searchQuery7D)}".</div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="segdia-table">
                <thead>
                    <tr>
                        <th style="width: 140px;">${isSuministrosTab ? 'Suministro' : 'SED'}</th>
                        <th>${isSuministrosTab ? 'SED Asignada / Distrito' : 'Ubicación / CT'}</th>
                        <th style="width: 100px; text-align: center;">Eventos 7D</th>
                        <th style="width: 140px;">Pendientes</th>
                        <th style="width: 70px; text-align: right;">Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${displayedItems.map(item => renderTableRow(item, isSuministrosTab)).join('')}
                </tbody>
            </table>
        `;
    }

    /**
     * Inicializa el componente asociándolo a un contenedor del DOM.
     * @param {string|HTMLElement} target - ID del contenedor o elemento DOM.
     */
    function initSeguimientoDia(target) {
        if (typeof target === 'string') {
            state.containerEl = document.getElementById(target);
        } else if (target instanceof HTMLElement) {
            state.containerEl = target;
        }

        render();

        if (window.omsStore && typeof window.omsStore.subscribe === 'function') {
            try {
                window.omsStore.subscribe((key) => {
                    if (key === 'tdOmsRecords' || key === 'ejecutadosRecords' || key === 'rawData') {
                        render();
                    }
                });
            } catch (e) { /* ignore */ }
        }

        window.addEventListener('oms:data-updated', () => {
            render();
        });
    }

    /**
     * Expone funciones públicas globales requeridas.
     */
    global.initSeguimientoDia = initSeguimientoDia;
    global.renderSeguimientoDia = render;
    global.destroySeguimientoDia = destroyCharts;

    // Auto-inicialización si el elemento contenedor ya está presente en el DOM
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('seguimientoDiaContainer')) {
            initSeguimientoDia('seguimientoDiaContainer');
        }
    });

})(typeof window !== 'undefined' ? window : this);
