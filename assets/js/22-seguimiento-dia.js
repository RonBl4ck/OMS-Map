/**
 * assets/js/22-seguimiento-dia.js
 * Controlador de Interfaz y Gráficos para "Seguimiento y Productividad Diaria" en OMS Map.
 * 
 * Filosofía de Diseño Emil Kowalski:
 * - Micro-interacciones limpias y fluidas (180ms cubic-bezier(0.23, 1, 0.32, 1)).
 * - Estados de presión táctil sutil (:active { transform: scale(0.98); }).
 * - Tabular numbers (font-variant-numeric: tabular-nums) para evitar saltos de layout.
 * - Paleta intencional de alto contraste y legibilidad operativa.
 * - Limpieza estricta de instancias de Chart.js para evitar fugas de memoria.
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
        backlog: '#F59E0B',            // Ámbar
        backlogAlpha: 'rgba(245, 158, 11, 0.85)',
        backlogLight: 'rgba(245, 158, 11, 0.12)',
        critico: '#EF4444',            // Rojo coral
        criticoAlpha: 'rgba(239, 68, 68, 0.85)',
        criticoLight: 'rgba(239, 68, 68, 0.12)',
        cardBg: '#ffffff',
        border: 'rgba(226, 232, 240, 0.8)',
        textMain: '#0f172a',
        textMuted: '#64748b'
    };

    // Estado interno del componente
    const state = {
        selectedDate: null,
        selectedContractor: 'ALL',
        selectedWorkType: 'ALL',
        searchQuery7D: '',
        statusFilter7D: 'ALL', // 'ALL', 'CRITICO', 'ALERTA', 'NORMAL'
        limit7D: 20,
        expanded7D: false,
        containerEl: null,
        charts: {
            hourly: null,
            composition: null
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
                transform: scale(0.98);
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
                grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
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
                min-height: 240px;
                max-height: 270px;
            }

            .segdia-composition-stats {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-top: 4px;
            }

            .segdia-stat-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 12px;
                padding: 6px 10px;
                background: #f8fafc;
                border-radius: 8px;
                border: 1px solid #f1f5f9;
            }

            .segdia-stat-bullet {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
                margin-right: 6px;
            }

            /* Monitor de Recurrencia 7D */
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

            .segdia-chip-status {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 3px 8px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 700;
                white-space: nowrap;
            }

            .segdia-chip-status.is-critico {
                background: ${PALETTE.criticoLight};
                color: #b91c1c;
                border: 1px solid rgba(239, 68, 68, 0.25);
            }

            .segdia-chip-status.is-alerta {
                background: ${PALETTE.backlogLight};
                color: #b45309;
                border: 1px solid rgba(245, 158, 11, 0.25);
            }

            .segdia-chip-status.is-normal {
                background: ${PALETTE.cierresLight};
                color: #047857;
                border: 1px solid rgba(16, 185, 129, 0.25);
            }

            .segdia-status-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                display: inline-block;
            }

            .segdia-chip-status.is-critico .segdia-status-dot {
                background: ${PALETTE.critico};
                box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
            }

            .segdia-chip-status.is-alerta .segdia-status-dot {
                background: ${PALETTE.backlog};
            }

            .segdia-chip-status.is-normal .segdia-status-dot {
                background: ${PALETTE.cierres};
            }

            .segdia-table-filter-pills {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
            }

            .segdia-filter-pill {
                background: #f1f5f9;
                border: 1px solid transparent;
                border-radius: 999px;
                padding: 3px 10px;
                font-size: 11px;
                font-weight: 600;
                color: #475569;
                cursor: pointer;
                transition: transform var(--anim-fast), background-color var(--anim-fast), color var(--anim-fast);
            }

            .segdia-filter-pill:hover {
                background: #e2e8f0;
                color: #0f172a;
            }

            .segdia-filter-pill:active {
                transform: scale(0.98);
            }

            .segdia-filter-pill.is-active {
                background: #0f172a;
                color: #ffffff;
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
        if (window.omsStore && typeof window.omsStore.get === 'function') {
            pendientes = window.omsStore.get('tdOmsRecords') || window.omsStore.get('rawData') || [];
        }
        if ((!pendientes || !pendientes.length) && Array.isArray(window.tdOmsRecords)) {
            pendientes = window.tdOmsRecords;
        }
        if ((!pendientes || !pendientes.length) && Array.isArray(window.rawData)) {
            pendientes = window.rawData;
        }

        let ejecutados = [];
        if (window.omsStore && typeof window.omsStore.get === 'function') {
            ejecutados = window.omsStore.get('ejecutadosRecords') || [];
        }
        if ((!ejecutados || !ejecutados.length) && Array.isArray(window.ejecutadosRecords)) {
            ejecutados = window.ejecutadosRecords;
        }

        return {
            pendientes: Array.isArray(pendientes) ? pendientes : [],
            ejecutados: Array.isArray(ejecutados) ? ejecutados : []
        };
    }

    /**
     * Parsea fechas de OMS en formato YYYY-MM-DD.
     */
    function parseDateToYmd(val) {
        if (!val) return null;
        if (val instanceof Date) {
            if (Number.isNaN(val.getTime())) return null;
            const y = val.getFullYear();
            const m = String(val.getMonth() + 1).padStart(2, '0');
            const d = String(val.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        const str = String(val).trim();
        if (!str) return null;
        // YYYY-MM-DD o YYYY/MM/DD
        let match = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
        if (match) {
            return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
        }
        // DD/MM/YYYY o DD-MM-YYYY
        match = str.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
        if (match) {
            return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
        }
        const d = new Date(str);
        if (!Number.isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
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
     * Obtiene los días disponibles consultando SeguimientoDiaService o fallback.
     */
    function getDaysList(ejecutados, pendientes) {
        if (window.SeguimientoDiaService && typeof window.SeguimientoDiaService.getAvailableDays === 'function') {
            try {
                const res = window.SeguimientoDiaService.getAvailableDays(ejecutados, pendientes);
                if (Array.isArray(res) && res.length > 0) {
                    return res.map(item => (typeof item === 'object' && item.date) ? item.date : String(item));
                }
            } catch (err) {
                console.warn('[SeguimientoDia] Error al llamar getAvailableDays en service:', err);
            }
        }

        // Fallback robusto si el servicio aún no está cargado
        const daySet = new Set();
        const addRecordDate = (rec, fields) => {
            for (const f of fields) {
                if (rec[f]) {
                    const ymd = parseDateToYmd(rec[f]);
                    if (ymd) { daySet.add(ymd); break; }
                }
            }
        };

        const execFields = ['Fecha de ejecucion', 'Fecha de Ejecución', 'Fecha', 'FECHA_EJECUCION', 'Fecha cierre'];
        const pendFields = ['Fecha de creación', 'Fecha Creación', 'Fecha', 'FECHA_REGISTRO', 'Fecha inicio'];

        ejecutados.forEach(r => addRecordDate(r, execFields));
        pendientes.forEach(r => addRecordDate(r, pendFields));

        const list = Array.from(daySet).sort().reverse();
        if (list.length === 0) {
            const today = new Date();
            const ymdToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            list.push(ymdToday);
        }
        return list;
    }

    /**
     * Obtiene lista de contratistas disponibles.
     */
    function getContractorsList(ejecutados, pendientes) {
        const set = new Set();
        const check = r => {
            const c = r['Empresa'] || r['EMPRESA'] || r['Contratista'] || r['CONTRATISTA'];
            if (c) {
                const clean = String(c).trim();
                if (clean && clean !== '-' && clean !== 'null' && clean !== 'undefined') set.add(clean);
            }
        };
        ejecutados.forEach(check);
        pendientes.forEach(check);
        return Array.from(set).sort();
    }

    /**
     * Calcula productividad diaria a través del servicio o fallback integrado.
     */
    function computeDailyProductivity(pendientes, ejecutados, options) {
        if (window.SeguimientoDiaService && typeof window.SeguimientoDiaService.calculateDailyProductivity === 'function') {
            try {
                const res = window.SeguimientoDiaService.calculateDailyProductivity(pendientes, ejecutados, options);
                if (res) {
                    return normalizeProductivityResult(res);
                }
            } catch (err) {
                console.warn('[SeguimientoDia] Error en SeguimientoDiaService.calculateDailyProductivity:', err);
            }
        }

        // Fallback local
        const targetDate = options.date;
        const contractor = (options.contractor && options.contractor !== 'ALL') ? String(options.contractor).toUpperCase() : null;

        const matchContractor = r => {
            if (!contractor) return true;
            const c = String(r['Empresa'] || r['EMPRESA'] || r['Contratista'] || r['CONTRATISTA'] || '').toUpperCase();
            return c.includes(contractor);
        };

        let totalIngresos = 0;
        let totalCierres = 0;
        let cierresIntradia = 0;
        let cierresBacklog = 0;
        let sumDurationHours = 0;
        let countDuration = 0;

        const hourlyIngresos = new Array(24).fill(0);
        const hourlyCierres = new Array(24).fill(0);

        // Procesar ingresos (pendientes registrados ese día)
        pendientes.forEach(r => {
            if (!matchContractor(r)) return;
            const fRaw = r['Fecha de creación'] || r['Fecha Creación'] || r['Fecha'] || r['FECHA_REGISTRO'];
            const ymd = parseDateToYmd(fRaw);
            if (ymd === targetDate) {
                totalIngresos++;
                const h = parseHour(fRaw);
                if (h !== null && h >= 0 && h < 24) hourlyIngresos[h]++;
            }
        });

        // Procesar cierres (ejecutados en ese día)
        ejecutados.forEach(r => {
            if (!matchContractor(r)) return;
            const fCloseRaw = r['Fecha de ejecucion'] || r['Fecha de Ejecución'] || r['Fecha'] || r['Fecha cierre'];
            const ymdClose = parseDateToYmd(fCloseRaw);

            if (ymdClose === targetDate) {
                totalCierres++;
                const h = parseHour(fCloseRaw);
                if (h !== null && h >= 0 && h < 24) hourlyCierres[h]++;

                // Intradía vs Backlog
                const fOpenRaw = r['Fecha de creación'] || r['Fecha Creación'] || r['Fecha inicio'];
                const ymdOpen = parseDateToYmd(fOpenRaw);
                if (ymdOpen && ymdOpen === targetDate) {
                    cierresIntradia++;
                } else {
                    cierresBacklog++;
                }

                // TTR horas
                const durVal = r['Duración'] || r['DURACION'] || r['TTR'] || r['Horas de atención'];
                if (durVal) {
                    const parsedDur = parseFloat(durVal);
                    if (!Number.isNaN(parsedDur) && parsedDur > 0) {
                        sumDurationHours += parsedDur;
                        countDuration++;
                    }
                }
            }
        });

        const pctIntradia = totalCierres > 0 ? (cierresIntradia / totalCierres) * 100 : 0;
        const pctBacklog = totalCierres > 0 ? (cierresBacklog / totalCierres) * 100 : 0;
        const balanceNeto = totalIngresos - totalCierres;
        const ttrPromedio = countDuration > 0 ? (sumDurationHours / countDuration) : 0;

        return {
            totalIngresos,
            totalCierres,
            cierresIntradia,
            cierresBacklog,
            pctIntradia: Math.round(pctIntradia * 10) / 10,
            pctBacklog: Math.round(pctBacklog * 10) / 10,
            balanceNeto,
            ttrPromedio: Math.round(ttrPromedio * 10) / 10,
            hourly: {
                labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
                ingresos: hourlyIngresos,
                cierres: hourlyCierres
            }
        };
    }

    /**
     * Normaliza respuestas heterogéneas del servicio para evitar discrepancias.
     */
    function normalizeProductivityResult(raw) {
        const totalIngresos = raw.totalIngresos ?? raw.ingresos ?? 0;
        const totalCierres = raw.totalCierres ?? raw.cierres ?? 0;
        const cierresIntradia = raw.cierresIntradia ?? raw.intradia ?? 0;
        const cierresBacklog = raw.cierresBacklog ?? raw.backlog ?? (totalCierres - cierresIntradia);

        let pctIntradia = raw.pctIntradia ?? raw.porcentajeIntradia;
        if (pctIntradia == null) {
            pctIntradia = totalCierres > 0 ? (cierresIntradia / totalCierres) * 100 : 0;
        } else if (pctIntradia <= 1 && totalCierres > 0) {
            pctIntradia *= 100;
        }

        let pctBacklog = raw.pctBacklog ?? raw.porcentajeBacklog;
        if (pctBacklog == null) {
            pctBacklog = totalCierres > 0 ? (cierresBacklog / totalCierres) * 100 : 0;
        } else if (pctBacklog <= 1 && totalCierres > 0) {
            pctBacklog *= 100;
        }

        const balanceNeto = raw.balanceNeto ?? raw.balance ?? (totalIngresos - totalCierres);
        const ttrPromedio = raw.ttrPromedio ?? raw.ttrAvg ?? raw.ttr ?? 0;

        // Horas
        let hourly = raw.hourly || raw.hourlyBalance || raw.balanceHorario;
        if (!hourly || !Array.isArray(hourly.ingresos)) {
            const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
            const ing = new Array(24).fill(0);
            const cie = new Array(24).fill(0);
            if (Array.isArray(hourly)) {
                hourly.forEach((h, idx) => {
                    const hIndex = h.hour ?? idx;
                    if (hIndex >= 0 && hIndex < 24) {
                        ing[hIndex] = h.ingresos || 0;
                        cie[hIndex] = h.cierres || 0;
                    }
                });
            }
            hourly = { labels, ingresos: ing, cierres: cie };
        }

        return {
            totalIngresos,
            totalCierres,
            cierresIntradia,
            cierresBacklog,
            pctIntradia: Math.round(pctIntradia * 10) / 10,
            pctBacklog: Math.round(pctBacklog * 10) / 10,
            balanceNeto,
            ttrPromedio: Math.round(ttrPromedio * 10) / 10,
            hourly
        };
    }

    /**
     * Consulta el monitor de SEDs recurrentes 7D vía servicio o fallback.
     */
    function computeRecurrentSeds7D(pendientes, ejecutados, options) {
        if (window.SeguimientoDiaService && typeof window.SeguimientoDiaService.getRecurrentSeds7D === 'function') {
            try {
                const res = window.SeguimientoDiaService.getRecurrentSeds7D(pendientes, ejecutados, options);
                if (Array.isArray(res)) {
                    return res.map(normalizeSedItem);
                }
            } catch (err) {
                console.warn('[SeguimientoDia] Error en SeguimientoDiaService.getRecurrentSeds7D:', err);
            }
        }

        // Fallback local: ventana móvil de 7 días
        const contractor = (options.contractor && options.contractor !== 'ALL') ? String(options.contractor).toUpperCase() : null;
        const matchContractor = r => {
            if (!contractor) return true;
            const c = String(r['Empresa'] || r['EMPRESA'] || r['Contratista'] || r['CONTRATISTA'] || '').toUpperCase();
            return c.includes(contractor);
        };

        const targetDateObj = state.selectedDate ? new Date(state.selectedDate + 'T23:59:59') : new Date();
        const minDateObj = new Date(targetDateObj.getTime() - (7 * 24 * 60 * 60 * 1000));

        const sedMap = new Map();

        const processRecord = (r, isPending) => {
            if (!matchContractor(r)) return;
            const sedRaw = r['SED'] || r['Cod_Sed'] || r['COD_SED'] || r['Subestacion'] || r['SE'] || '';
            const sed = String(sedRaw).trim().toUpperCase();
            if (!sed || sed === 'SIN SED' || sed === 'DESCONOCIDO' || sed === '-') return;

            const fRaw = isPending 
                ? (r['Fecha de creación'] || r['Fecha Creación'] || r['Fecha'])
                : (r['Fecha de ejecucion'] || r['Fecha de Ejecución'] || r['Fecha']);
            const ymd = parseDateToYmd(fRaw);
            if (!ymd) return;

            const recDate = new Date(ymd + 'T12:00:00');
            if (recDate >= minDateObj && recDate <= targetDateObj) {
                if (!sedMap.has(sed)) {
                    sedMap.set(sed, {
                        sed,
                        distrito: r['Distrito'] || r['DISTRITO'] || r['Zona'] || 'Lima',
                        alimentador: r['Alimentador'] || r['ALIMENTADOR'] || r['CT'] || '-',
                        total7D: 0,
                        tienePendiente: false,
                        ultimoEvento: ymd
                    });
                }
                const item = sedMap.get(sed);
                item.total7D++;
                if (isPending) item.tienePendiente = true;
                if (ymd > item.ultimoEvento) item.ultimoEvento = ymd;
            }
        };

        pendientes.forEach(r => processRecord(r, true));
        ejecutados.forEach(r => processRecord(r, false));

        const result = Array.from(sedMap.values()).map(item => {
            let estado = 'NORMAL';
            if (item.tienePendiente && item.total7D >= 3) {
                estado = 'CRITICO';
            } else if (item.total7D >= 2) {
                estado = 'ALERTA';
            }
            return {
                ...item,
                estado
            };
        });

        // Ordenar: CRITICO primero, luego ALERTA, luego NORMAL; y por total7D desc
        const rank = { CRITICO: 3, ALERTA: 2, NORMAL: 1 };
        result.sort((a, b) => {
            const diffRank = (rank[b.estado] || 0) - (rank[a.estado] || 0);
            if (diffRank !== 0) return diffRank;
            return b.total7D - a.total7D;
        });

        return result;
    }

    /**
     * Normaliza un registro de SED recurrente del servicio.
     */
    function normalizeSedItem(item) {
        const sed = String(item.sed || item.sedCode || item.codigoSed || '').trim();
        const distrito = item.distrito || item.district || item.zona || '-';
        const alimentador = item.alimentador || item.feeder || item.ct || '-';
        const total7D = Number(item.total7D ?? item.eventos7D ?? item.count ?? item.total ?? 0);
        const tienePendiente = Boolean(item.tienePendiente ?? item.hasPending ?? item.pendiente ?? false);

        let estado = (item.estado || item.status || '').toUpperCase();
        if (!estado || (estado !== 'CRITICO' && estado !== 'ALERTA' && estado !== 'NORMAL')) {
            if (tienePendiente && total7D >= 3) estado = 'CRITICO';
            else if (total7D >= 2) estado = 'ALERTA';
            else estado = 'NORMAL';
        }

        return {
            sed,
            distrito,
            alimentador,
            total7D,
            tienePendiente,
            estado
        };
    }

    /**
     * Hace zoom y enfoque en la SED solicitada en el mapa.
     */
    function focusSedOnMap(sedCode) {
        if (!sedCode) return;
        const cleanSed = String(sedCode).trim();

        // 1. Invocar función global window.focusOnSed si existe
        if (typeof window.focusOnSed === 'function') {
            try {
                window.focusOnSed(cleanSed);
                return;
            } catch (err) {
                console.warn('[SeguimientoDia] Error en window.focusOnSed:', err);
            }
        }

        // 2. Disparar evento personalizado del sistema
        window.dispatchEvent(new CustomEvent('oms:focus-sed', {
            detail: { sed: cleanSed },
            bubbles: true
        }));

        // 3. Si existe openCriticalSedPanel, abrir panel lateral
        if (typeof window.openCriticalSedPanel === 'function') {
            try {
                window.openCriticalSedPanel(cleanSed);
                return;
            } catch (e) { /* ignore */ }
        }

        // 4. Intentar búsqueda en input de mapa
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
        if (state.charts.hourly) {
            try {
                state.charts.hourly.destroy();
            } catch (e) {
                console.warn('[SeguimientoDia] Error al destruir gráfico horario:', e);
            }
            state.charts.hourly = null;
        }

        if (state.charts.composition) {
            try {
                state.charts.composition.destroy();
            } catch (e) {
                console.warn('[SeguimientoDia] Error al destruir gráfico de composición:', e);
            }
            state.charts.composition = null;
        }
    }

    /**
     * Construye o refresca el gráfico principal de Balance Horario (Chart.js v4).
     */
    function renderHourlyChart(hourlyData) {
        const canvas = document.getElementById('chartSeguimientoHorario');
        if (!canvas) return;

        if (state.charts.hourly) {
            state.charts.hourly.destroy();
            state.charts.hourly = null;
        }

        if (typeof Chart === 'undefined') {
            console.warn('[SeguimientoDia] Chart.js no se encuentra disponible globalmente.');
            return;
        }

        const ctx = canvas.getContext('2d');

        state.charts.hourly = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: hourlyData.labels,
                datasets: [
                    {
                        label: 'Ingresos del Día',
                        data: hourlyData.ingresos,
                        backgroundColor: PALETTE.ingresosAlpha,
                        borderColor: PALETTE.ingresos,
                        borderWidth: 1,
                        borderRadius: 4,
                        barPercentage: 0.85,
                        categoryPercentage: 0.8
                    },
                    {
                        label: 'Cierres del Día',
                        data: hourlyData.cierres,
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
                animation: {
                    duration: 350,
                    easing: 'easeOutQuart'
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'end',
                        labels: {
                            boxWidth: 10,
                            boxHeight: 10,
                            usePointStyle: true,
                            pointStyle: 'circle',
                            font: {
                                size: 11,
                                weight: '600'
                            },
                            color: '#475569'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.92)',
                        titleColor: '#f8fafc',
                        bodyColor: '#e2e8f0',
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        boxPadding: 4,
                        titleFont: { size: 12, weight: '700' },
                        bodyFont: { size: 12, weight: '500' },
                        callbacks: {
                            label: function (context) {
                                const val = context.parsed.y || 0;
                                return ` ${context.dataset.label}: ${val} casos`;
                            },
                            footer: function (items) {
                                if (!items || items.length < 2) return '';
                                const ing = items[0].parsed.y || 0;
                                const cie = items[1].parsed.y || 0;
                                const diff = ing - cie;
                                const sign = diff > 0 ? `+${diff}` : `${diff}`;
                                return `Balance neto hora: ${sign}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
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
                        grid: {
                            color: '#f1f5f9'
                        },
                        ticks: {
                            color: '#64748b',
                            font: { size: 10.5 },
                            precision: 0
                        }
                    }
                }
            }
        });
    }

    /**
     * Construye o refresca el gráfico secundario de Composición de Cierres (Doughnut).
     */
    function renderCompositionChart(productivity) {
        const canvas = document.getElementById('chartSeguimientoComposicion');
        if (!canvas) return;

        if (state.charts.composition) {
            state.charts.composition.destroy();
            state.charts.composition = null;
        }

        if (typeof Chart === 'undefined') return;

        const ctx = canvas.getContext('2d');
        const { cierresIntradia, cierresBacklog, totalCierres, pctIntradia, pctBacklog } = productivity;

        // Si no hay cierres, mostrar gráfico con placeholder sutil
        const hasData = totalCierres > 0;
        const chartData = hasData ? [cierresIntradia, cierresBacklog] : [1];
        const chartColors = hasData ? [PALETTE.cierres, PALETTE.backlog] : ['#e2e8f0'];

        state.charts.composition = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: hasData ? ['Intradía (Mismo Día)', 'Liquidación Backlog'] : ['Sin datos'],
                datasets: [{
                    data: chartData,
                    backgroundColor: chartColors,
                    borderWidth: 2,
                    borderColor: '#ffffff',
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                animation: {
                    duration: 350,
                    easing: 'easeOutQuart'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: hasData,
                        backgroundColor: 'rgba(15, 23, 42, 0.92)',
                        borderColor: 'rgba(255, 255, 255, 0.12)',
                        borderWidth: 1,
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (ctxItem) {
                                const val = ctxItem.parsed || 0;
                                const pct = totalCierres > 0 ? Math.round((val / totalCierres) * 100) : 0;
                                return ` ${ctxItem.label}: ${val} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Genera la fila de la tabla de monitor 7D.
     */
    function renderSedRow(item) {
        let chipClass = 'is-normal';
        let chipText = '🟢 Normalizado';
        if (item.estado === 'CRITICO') {
            chipClass = 'is-critico';
            chipText = '🔴 Crítico';
        } else if (item.estado === 'ALERTA') {
            chipClass = 'is-alerta';
            chipText = '🟡 Alerta';
        }

        const pendingChip = item.tienePendiente
            ? `<span class="segdia-pill pill-red">Sí (Activo)</span>`
            : `<span class="segdia-pill pill-green">Resuelto</span>`;

        return `
            <tr>
                <td>
                    <span class="segdia-chip-status ${chipClass}">
                        <span class="segdia-status-dot"></span>
                        ${chipText}
                    </span>
                </td>
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
                <td>${pendingChip}</td>
                <td style="text-align: right;">
                    <button type="button" class="segdia-btn segdia-btn-sm segdia-btn-focus-sed" data-sed="${escapeHtml(item.sed)}" title="Ubicar y enfocar SED en el mapa">
                        🔍 Ubicar
                    </button>
                </td>
            </tr>
        `;
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
        injectStyles();

        let container = state.containerEl;
        if (!container) {
            container = document.getElementById('seguimientoDiaContainer');
        }

        // Si aún no existe el contenedor, intentar crearlo en el body o tab contenedor
        if (!container) {
            container = document.createElement('div');
            container.id = 'seguimientoDiaContainer';
            const mainTarget = document.querySelector('.main-content') || document.body;
            mainTarget.appendChild(container);
            state.containerEl = container;
        }

        const { pendientes, ejecutados } = getRawRecords();
        const availableDays = getDaysList(ejecutados, pendientes);

        if (!state.selectedDate || !availableDays.includes(state.selectedDate)) {
            state.selectedDate = availableDays[0] || parseDateToYmd(new Date());
        }

        const contractors = getContractorsList(ejecutados, pendientes);

        // Calcular datos
        const productivity = computeDailyProductivity(pendientes, ejecutados, {
            date: state.selectedDate,
            contractor: state.selectedContractor,
            workType: state.selectedWorkType
        });

        const recurrentSeds = computeRecurrentSeds7D(pendientes, ejecutados, {
            contractor: state.selectedContractor
        });

        // Filtrar SEDs recurrentes según buscador y filtro de estado
        const query = (state.searchQuery7D || '').toLowerCase().trim();
        const filteredSeds = recurrentSeds.filter(s => {
            if (state.statusFilter7D !== 'ALL' && s.estado !== state.statusFilter7D) {
                return false;
            }
            if (!query) return true;
            return s.sed.toLowerCase().includes(query) ||
                   s.distrito.toLowerCase().includes(query) ||
                   s.alimentador.toLowerCase().includes(query);
        });

        const displayedSeds = state.expanded7D ? filteredSeds : filteredSeds.slice(0, state.limit7D);

        // Estilos para Balance Neto
        const isNetPositive = productivity.balanceNeto > 0;
        const isNetNeutral = productivity.balanceNeto === 0;
        const balanceColor = isNetNeutral ? 'pill-blue' : (isNetPositive ? 'pill-amber' : 'pill-green');
        const balanceSign = productivity.balanceNeto > 0 ? `+${productivity.balanceNeto}` : `${productivity.balanceNeto}`;
        const balanceHint = isNetNeutral 
            ? 'Flujo equilibrado' 
            : (isNetPositive ? 'Backlog incrementó' : 'Backlog en reducción');

        // Construir HTML UI
        container.innerHTML = `
            <div class="segdia-root">
                <!-- BARRA SUPERIOR / FILTROS -->
                <div class="segdia-toolbar">
                    <div class="segdia-title-group">
                        <h2>Seguimiento y Productividad Diaria</h2>
                        <span class="segdia-tag-badge">⚡ Control Diario OMS</span>
                    </div>

                    <div class="segdia-filters">
                        <label class="segdia-filter-label" for="segdiaSelectDate">Día:</label>
                        <select id="segdiaSelectDate" class="segdia-select" aria-label="Seleccionar fecha">
                            ${availableDays.map(d => `<option value="${d}" ${d === state.selectedDate ? 'selected' : ''}>${d}</option>`).join('')}
                        </select>

                        <label class="segdia-filter-label" for="segdiaSelectContractor">Empresa:</label>
                        <select id="segdiaSelectContractor" class="segdia-select" aria-label="Seleccionar contratista">
                            <option value="ALL" ${state.selectedContractor === 'ALL' ? 'selected' : ''}>Todas las empresas</option>
                            ${contractors.map(c => `<option value="${c}" ${c === state.selectedContractor ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>

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
                            <span class="segdia-kpi-label">Ingresos del Día</span>
                            <span class="segdia-kpi-icon">📥</span>
                        </div>
                        <div class="segdia-kpi-val">${productivity.totalIngresos}</div>
                        <div class="segdia-kpi-sub">
                            <span class="segdia-pill pill-blue">Nuevos tickets</span>
                            <span>registrados en fecha</span>
                        </div>
                    </div>

                    <!-- KPI 2: Cierres -->
                    <div class="segdia-kpi-card is-cierres">
                        <div class="segdia-kpi-head">
                            <span class="segdia-kpi-label">Cierres del Día</span>
                            <span class="segdia-kpi-icon">✅</span>
                        </div>
                        <div class="segdia-kpi-val">${productivity.totalCierres}</div>
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
                        <div class="segdia-kpi-val">${balanceSign}</div>
                        <div class="segdia-kpi-sub">
                            <span class="segdia-pill ${balanceColor}">${balanceHint}</span>
                            <span>(Ingresos - Cierres)</span>
                        </div>
                    </div>

                    <!-- KPI 4: TTR Promedio -->
                    <div class="segdia-kpi-card is-ttr">
                        <div class="segdia-kpi-head">
                            <span class="segdia-kpi-label">TTR Promedio</span>
                            <span class="segdia-kpi-icon">⏱️</span>
                        </div>
                        <div class="segdia-kpi-val">${productivity.ttrPromedio > 0 ? productivity.ttrPromedio + 'h' : '--'}</div>
                        <div class="segdia-kpi-sub">
                            <span>Horas promedio de atención</span>
                        </div>
                    </div>
                </div>

                <!-- BENTO GRID DE GRÁFICOS -->
                <div class="segdia-charts-grid">
                    <!-- Gráfico Principal: Balance Horario -->
                    <div class="segdia-card">
                        <div class="segdia-card-header">
                            <div>
                                <h3 class="segdia-card-title">Balance Horario de Flujo (00:00 - 23:00)</h3>
                                <p class="segdia-card-desc">Ingresos vs. Cierres agrupados por hora de registro y ejecución</p>
                            </div>
                        </div>
                        <div class="segdia-chart-wrapper">
                            <canvas id="chartSeguimientoHorario"></canvas>
                        </div>
                    </div>

                    <!-- Gráfico Secundario: Composición de Cierres -->
                    <div class="segdia-card">
                        <div class="segdia-card-header">
                            <div>
                                <h3 class="segdia-card-title">Composición de Cierres</h3>
                                <p class="segdia-card-desc">Atención Intradía vs. Liquidación de Backlog</p>
                            </div>
                        </div>
                        <div class="segdia-chart-wrapper" style="max-height: 180px; min-height: 170px;">
                            <canvas id="chartSeguimientoComposicion"></canvas>
                        </div>
                        <div class="segdia-composition-stats">
                            <div class="segdia-stat-row">
                                <div>
                                    <span class="segdia-stat-bullet" style="background: ${PALETTE.cierres};"></span>
                                    <span style="font-weight: 600;">Cierres Intradía:</span>
                                </div>
                                <div class="segdia-tabular" style="font-weight: 700;">
                                    ${productivity.cierresIntradia} (${productivity.pctIntradia}%)
                                </div>
                            </div>
                            <div class="segdia-stat-row">
                                <div>
                                    <span class="segdia-stat-bullet" style="background: ${PALETTE.backlog};"></span>
                                    <span style="font-weight: 600;">Liquidación de Backlog:</span>
                                </div>
                                <div class="segdia-tabular" style="font-weight: 700;">
                                    ${productivity.cierresBacklog} (${productivity.pctBacklog}%)
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- MONITOR DE RECURRENCIA 7D -->
                <div class="segdia-card">
                    <div class="segdia-card-header">
                        <div>
                            <h3 class="segdia-card-title">Monitor de Recurrencia 7D por SED</h3>
                            <p class="segdia-card-desc">Detección de subestaciones críticas con incidencias repetidas en la última semana</p>
                        </div>
                        <div class="segdia-table-filter-pills">
                            <button type="button" class="segdia-filter-pill ${state.statusFilter7D === 'ALL' ? 'is-active' : ''}" data-status="ALL">Todos (${recurrentSeds.length})</button>
                            <button type="button" class="segdia-filter-pill ${state.statusFilter7D === 'CRITICO' ? 'is-active' : ''}" data-status="CRITICO">🔴 Críticos (${recurrentSeds.filter(s => s.estado === 'CRITICO').length})</button>
                            <button type="button" class="segdia-filter-pill ${state.statusFilter7D === 'ALERTA' ? 'is-active' : ''}" data-status="ALERTA">🟡 Alertas (${recurrentSeds.filter(s => s.estado === 'ALERTA').length})</button>
                            <button type="button" class="segdia-filter-pill ${state.statusFilter7D === 'NORMAL' ? 'is-active' : ''}" data-status="NORMAL">🟢 Normalizados (${recurrentSeds.filter(s => s.estado === 'NORMAL').length})</button>
                        </div>
                    </div>

                    <!-- Buscador rápido en vivo -->
                    <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                        <input type="text" id="inputSearchRecurrentSed" class="segdia-input" style="flex: 1; max-width: 380px;" placeholder="🔎 Buscar por código SED, distrito o alimentador..." value="${escapeHtml(state.searchQuery7D)}">
                        <span style="font-size: 11.5px; color: ${PALETTE.textMuted};">
                            Mostrando <b>${displayedSeds.length}</b> de <b>${filteredSeds.length}</b>
                        </span>
                    </div>

                    <!-- Tabla de Resultados -->
                    <div class="segdia-table-container">
                        ${displayedSeds.length > 0 ? `
                            <table class="segdia-table">
                                <thead>
                                    <tr>
                                        <th style="width: 140px;">Estado</th>
                                        <th style="width: 120px;">SED</th>
                                        <th>Ubicación / CT</th>
                                        <th style="width: 100px; text-align: center;">Eventos 7D</th>
                                        <th style="width: 130px;">Pendiente</th>
                                        <th style="width: 100px; text-align: right;">Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${displayedSeds.map(renderSedRow).join('')}
                                </tbody>
                            </table>
                        ` : `
                            <div class="segdia-empty-state">
                                <div class="segdia-empty-icon">🔍</div>
                                <div class="segdia-empty-title">Sin resultados de recurrencia</div>
                                <div class="segdia-empty-text">No se encontraron subestaciones con eventos repetidos para los filtros aplicados.</div>
                            </div>
                        `}
                    </div>

                    <!-- Paginación / Ver Más -->
                    ${filteredSeds.length > state.limit7D ? `
                        <div style="display: flex; justify-content: center; margin-top: 8px;">
                            <button type="button" id="btnToggleExpandSeds" class="segdia-btn">
                                ${state.expanded7D ? '▲ Mostrar solo Top 20' : `▼ Ver todos (${filteredSeds.length} SEDs)`}
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        // Conectar listeners de eventos
        attachEventListeners();

        // Renderizar gráficos Chart.js
        renderHourlyChart(productivity.hourly);
        renderCompositionChart(productivity);
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

        const refreshBtn = document.getElementById('btnSegdiaRefresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                render();
            });
        }

        const searchInput = document.getElementById('inputSearchRecurrentSed');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                state.searchQuery7D = e.target.value;
                // Re-render sin recrear todo para mantener foco
                updateTableOnly();
            });
        }

        const statusPills = document.querySelectorAll('.segdia-filter-pill');
        statusPills.forEach(pill => {
            pill.addEventListener('click', () => {
                state.statusFilter7D = pill.dataset.status;
                render();
            });
        });

        const toggleExpandBtn = document.getElementById('btnToggleExpandSeds');
        if (toggleExpandBtn) {
            toggleExpandBtn.addEventListener('click', () => {
                state.expanded7D = !state.expanded7D;
                render();
            });
        }

        // Delegación de eventos para botones de ubicar SED
        const tableContainer = document.querySelector('.segdia-table-container');
        if (tableContainer) {
            tableContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.segdia-btn-focus-sed');
                if (btn && btn.dataset.sed) {
                    focusSedOnMap(btn.dataset.sed);
                }
            });
        }
    }

    /**
     * Actualiza únicamente la tabla al tipear en el buscador para una interacción fluida a 60fps.
     */
    function updateTableOnly() {
        const { pendientes, ejecutados } = getRawRecords();
        const recurrentSeds = computeRecurrentSeds7D(pendientes, ejecutados, {
            contractor: state.selectedContractor
        });

        const query = (state.searchQuery7D || '').toLowerCase().trim();
        const filteredSeds = recurrentSeds.filter(s => {
            if (state.statusFilter7D !== 'ALL' && s.estado !== state.statusFilter7D) {
                return false;
            }
            if (!query) return true;
            return s.sed.toLowerCase().includes(query) ||
                   s.distrito.toLowerCase().includes(query) ||
                   s.alimentador.toLowerCase().includes(query);
        });

        const displayedSeds = state.expanded7D ? filteredSeds : filteredSeds.slice(0, state.limit7D);
        const container = document.querySelector('.segdia-table-container');
        if (!container) return;

        if (displayedSeds.length === 0) {
            container.innerHTML = `
                <div class="segdia-empty-state">
                    <div class="segdia-empty-icon">🔍</div>
                    <div class="segdia-empty-title">Sin resultados de recurrencia</div>
                    <div class="segdia-empty-text">No se encontraron subestaciones con eventos repetidos para "${escapeHtml(state.searchQuery7D)}".</div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="segdia-table">
                <thead>
                    <tr>
                        <th style="width: 140px;">Estado</th>
                        <th style="width: 120px;">SED</th>
                        <th>Ubicación / CT</th>
                        <th style="width: 100px; text-align: center;">Eventos 7D</th>
                        <th style="width: 130px;">Pendiente</th>
                        <th style="width: 100px; text-align: right;">Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${displayedSeds.map(renderSedRow).join('')}
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

        // Si ya hay datos en window o store, renderizar de inmediato
        render();

        // Escuchar actualizaciones del almacén si emite eventos
        if (window.omsStore && typeof window.omsStore.subscribe === 'function') {
            try {
                window.omsStore.subscribe((key) => {
                    if (key === 'tdOmsRecords' || key === 'ejecutadosRecords' || key === 'rawData') {
                        render();
                    }
                });
            } catch (e) { /* ignore */ }
        }

        // Escuchar evento custom de datos cargados en OMS Map
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
