/**
 * SeguimientoDiaService - Motor de datos y métricas para Seguimiento y Productividad Diaria
 * OMS Map / Supervisión PLUZ
 *
 * Módulo UMD compatible con Node.js y navegadores (globalThis.SeguimientoDiaService / window.SeguimientoDiaService)
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.SeguimientoDiaService = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.SeguimientoDiaService = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {

    /**
     * Helper para extraer propiedades de un objeto con múltiples claves candidatas (case-insensitive)
     */
    function getRecordProp(row, ...keys) {
        if (!row || typeof row !== 'object') return '';
        // 1. Intento directo por nombre exacto
        for (const k of keys) {
            if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                return String(row[k]).trim();
            }
        }
        // 2. Intento case-insensitive
        const rowKeys = Object.keys(row);
        for (const k of keys) {
            const lowerK = k.toLowerCase();
            const found = rowKeys.find(rk => rk.toLowerCase() === lowerK);
            if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') {
                return String(row[found]).trim();
            }
        }
        return '';
    }

    /**
     * Obtiene la cadena de fecha u hora de inicio de un ticket
     */
    function getStartDateRaw(row) {
        return getRecordProp(
            row,
            'Hora de inicio', 'Hora de Inicio', 'Fecha Iniciio', 'Fecha Inicio',
            'Fecha y hora de creación', 'Fecha y hora de creacion',
            'Fecha de Creación', 'Fecha de Creacion',
            'fecha_inicio', 'hora_inicio', 'horaInicio',
            'fecha_creacion', 'Fecha_Creacion',
            'Fecha', 'fecha', 'dia', 'd\u00eda'
        );
    }

    /**
     * Obtiene la cadena de fecha u hora de restauración/cierre de un ticket
     */
    function getRestorationDateRaw(row) {
        return getRecordProp(
            row,
            'Hora de restauración', 'Hora de restauracion', 'Hora de restauracin',
            'Fecha de restauración', 'Fecha de restauracion',
            'Fecha y hora de restauración', 'Fecha y hora de restauracion',
            'Fecha_Restauracion', 'fecha_restauracion',
            'hora_restauracion', 'horaRestauracion',
            'Fecha Cierre', 'Fecha de Cierre', 'Hora de Cierre', 'hora_cierre',
            'restauracion', 'fin', 'Fin'
        );
    }

    /**
     * Parsea fechas en distintos formatos comunes de OMS/Excel:
     * - '02/11/2026 13:54:47'
     * - '2/11/2026 10:38:50'
     * - '2026-11-02 13:54:47'
     * - '02/11/2026', '2026-11-02'
     * - Formatos de 12 horas con AM/PM
     *
     * @param {string|number|Date} dateVal - Valor de fecha a parsear
     * @returns {{ dateStr: string, hour: number, timestamp: number } | null}
     */
    function parseDateTime(dateVal) {
        if (dateVal === null || dateVal === undefined) return null;

        // Soporte si ya es una instancia de Date
        if (dateVal instanceof Date) {
            if (isNaN(dateVal.getTime())) return null;
            const d = dateVal.getDate();
            const m = dateVal.getMonth() + 1;
            const y = dateVal.getFullYear();
            return {
                dateStr: `${d}/${m}/${y}`,
                hour: dateVal.getHours(),
                timestamp: dateVal.getTime()
            };
        }

        // Soporte para timestamp numérico
        if (typeof dateVal === 'number' && !isNaN(dateVal)) {
            const dObj = new Date(dateVal);
            if (isNaN(dObj.getTime())) return null;
            const d = dObj.getDate();
            const m = dObj.getMonth() + 1;
            const y = dObj.getFullYear();
            return {
                dateStr: `${d}/${m}/${y}`,
                hour: dObj.getHours(),
                timestamp: dObj.getTime()
            };
        }

        const str = String(dateVal).trim();
        if (!str) return null;

        let day = 0, month = 0, year = 0, hour = 0, minute = 0, second = 0;
        let matched = false;

        // 1. Formato DD/MM/YYYY o D/M/YYYY (también con separador '-')
        const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]\.?\s*m\.?))?)?$/i);
        if (dmyMatch) {
            day = parseInt(dmyMatch[1], 10);
            month = parseInt(dmyMatch[2], 10);
            year = parseInt(dmyMatch[3], 10);
            hour = dmyMatch[4] !== undefined ? parseInt(dmyMatch[4], 10) : 0;
            minute = dmyMatch[5] !== undefined ? parseInt(dmyMatch[5], 10) : 0;
            second = dmyMatch[6] !== undefined ? parseInt(dmyMatch[6], 10) : 0;

            const mod = (dmyMatch[7] || '').toLowerCase().replace(/\./g, '').trim();
            if (mod === 'pm' || mod === 'p m') {
                if (hour < 12) hour += 12;
            } else if (mod === 'am' || mod === 'a m') {
                if (hour === 12) hour = 0;
            }
            matched = true;
        }

        // 2. Formato YYYY-MM-DD o YYYY/MM/DD
        if (!matched) {
            const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]\.?\s*m\.?))?)?$/i);
            if (ymdMatch) {
                year = parseInt(ymdMatch[1], 10);
                month = parseInt(ymdMatch[2], 10);
                day = parseInt(ymdMatch[3], 10);
                hour = ymdMatch[4] !== undefined ? parseInt(ymdMatch[4], 10) : 0;
                minute = ymdMatch[5] !== undefined ? parseInt(ymdMatch[5], 10) : 0;
                second = ymdMatch[6] !== undefined ? parseInt(ymdMatch[6], 10) : 0;

                const mod = (ymdMatch[7] || '').toLowerCase().replace(/\./g, '').trim();
                if (mod === 'pm' || mod === 'p m') {
                    if (hour < 12) hour += 12;
                } else if (mod === 'am' || mod === 'a m') {
                    if (hour === 12) hour = 0;
                }
                matched = true;
            }
        }

        if (!matched) return null;

        // Validaciones de rangos de calendario
        if (month < 1 || month > 12) return null;
        if (day < 1 || day > 31) return null;
        if (year < 1900 || year > 2100) return null;
        if (hour < 0 || hour > 23) return null;
        if (minute < 0 || minute > 59) return null;
        if (second < 0 || second > 59) return null;

        // Asegurar consistencia de calendario (ej: 31/02 no existe)
        const checkDate = new Date(year, month - 1, day, hour, minute, second);
        if (isNaN(checkDate.getTime())) return null;
        if (checkDate.getMonth() !== month - 1 || checkDate.getDate() !== day) return null;

        return {
            dateStr: `${day}/${month}/${year}`,
            hour: hour,
            timestamp: checkDate.getTime()
        };
    }

    /**
     * Normaliza una fecha al formato canónico 'D/M/YYYY'
     *
     * @param {string|Date|number} dateStr
     * @returns {string|null}
     */
    function normalizeDate(dateStr) {
        const parsed = parseDateTime(dateStr);
        return parsed ? parsed.dateStr : null;
    }

    /**
     * Filtra si una fila coincide con el contratista especificado
     */
    function matchesContractor(row, contractor) {
        if (!contractor || contractor === '*') return true;
        const rowContractor = getRecordProp(
            row,
            'Contratista', 'Empresa', 'CONTRATISTA', 'empresa',
            'Pto.tbjo.responsable', 'contratista', 'company'
        ).trim().toLowerCase();

        if (!rowContractor || rowContractor === 'n/a') return false;
        const target = String(contractor).trim().toLowerCase();
        return rowContractor === target || rowContractor.includes(target) || target.includes(rowContractor);
    }

    /**
     * Filtra si una fila coincide con el tipo de trabajo/equipo especificado
     */
    function matchesWorkType(row, workType) {
        if (!workType || workType === '*') return true;
        const target = String(workType).trim().toLowerCase();

        const tipoEquipo = getRecordProp(
            row,
            'Tipo de Equipo probable de falla', 'tipo_equipo_probable_falla', 'tipoEquipo'
        ).trim().toLowerCase();

        const skill = getRecordProp(
            row,
            'Skill', 'skill'
        ).trim().toLowerCase();

        const falla = getRecordProp(
            row,
            'Falla ODM2', 'Falla', 'Punto de Falla', 'falla'
        ).trim().toLowerCase();

        const checkMatch = val => val === target || val.includes(target) || target.includes(val);

        return (tipoEquipo && checkMatch(tipoEquipo)) ||
               (skill && checkMatch(skill)) ||
               (falla && checkMatch(falla));
    }

    /**
     * Retorna una lista de cadenas de fechas únicas ('D/M/YYYY') ordenadas descendentemente
     *
     * @param {Array} ejecutadosRecords
     * @param {Array} pendientesRecords
     * @param {number} [limit=8] - Número máximo de días a retornar (por defecto 8)
     * @returns {Array<string>}
     */
    function getAvailableDays(ejecutadosRecords, pendientesRecords, limit = 8) {
        const datesMap = new Map();

        function processRow(row, isEjecutado) {
            if (!row || typeof row !== 'object') return;
            const startStr = getStartDateRaw(row);
            if (startStr) {
                const p = parseDateTime(startStr);
                if (p && !datesMap.has(p.dateStr)) {
                    const sod = new Date(p.timestamp);
                    sod.setHours(0, 0, 0, 0);
                    datesMap.set(p.dateStr, sod.getTime());
                }
            }
            if (isEjecutado) {
                const endStr = getRestorationDateRaw(row);
                if (endStr) {
                    const p = parseDateTime(endStr);
                    if (p && !datesMap.has(p.dateStr)) {
                        const sod = new Date(p.timestamp);
                        sod.setHours(0, 0, 0, 0);
                        datesMap.set(p.dateStr, sod.getTime());
                    }
                }
            }
        }

        if (Array.isArray(ejecutadosRecords)) {
            for (const r of ejecutadosRecords) processRow(r, true);
        }
        if (Array.isArray(pendientesRecords)) {
            for (const r of pendientesRecords) processRow(r, false);
        }

        const sorted = Array.from(datesMap.entries())
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0]);

        if (typeof limit === 'number' && limit > 0) {
            return sorted.slice(0, limit);
        }
        return sorted;
    }

    /**
     * Calcula los indicadores de productividad diaria y distribución horaria
     *
     * @param {Array} pendientesRecords
     * @param {Array} ejecutadosRecords
     * @param {Object} [options]
     * @param {string} [options.date] - Fecha en formato 'D/M/YYYY' o 'DD/MM/YYYY'
     * @param {string} [options.contractor='*'] - Contratista a filtrar ('*' para todos)
     * @param {string} [options.workType='*'] - Tipo de equipo o skill a filtrar ('*' para todos)
     * @returns {Object}
     */
    function calculateDailyProductivity(pendientesRecords, ejecutadosRecords, options) {
        const opts = Object.assign({
            date: '',
            contractor: '*',
            workType: '*'
        }, options);

        let targetDate = normalizeDate(opts.date);
        if (!targetDate) {
            const avail = getAvailableDays(ejecutadosRecords, pendientesRecords, 1);
            targetDate = avail.length > 0 ? avail[0] : normalizeDate(new Date());
        }

        const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
            hour,
            ingresos: 0,
            cierres: 0
        }));

        const result = {
            date: targetDate,
            contractor: opts.contractor || '*',
            workType: opts.workType || '*',
            ingresosTotal: 0,
            cierresTotal: 0,
            cierresIntradia: 0,
            cierresBacklog: 0,
            pendientesDelDia: 0,
            balanceNeto: 0,
            hourlyDistribution,
            ttrPromedioHoras: 0
        };

        if (!targetDate) return result;

        const safePendientes = Array.isArray(pendientesRecords) ? pendientesRecords : [];
        const safeEjecutados = Array.isArray(ejecutadosRecords) ? ejecutadosRecords : [];

        // Filtrado por contratista y tipo de trabajo
        const filteredPendientes = safePendientes.filter(r =>
            matchesContractor(r, opts.contractor) && matchesWorkType(r, opts.workType)
        );
        const filteredEjecutados = safeEjecutados.filter(r =>
            matchesContractor(r, opts.contractor) && matchesWorkType(r, opts.workType)
        );

        let ttrSumHours = 0;
        let ttrCount = 0;

        // 1. Procesar PENDIENTES
        for (const row of filteredPendientes) {
            const rawStart = getStartDateRaw(row);
            const pStart = parseDateTime(rawStart);
            if (pStart && pStart.dateStr === targetDate) {
                result.pendientesDelDia++;
                result.ingresosTotal++;
                if (pStart.hour >= 0 && pStart.hour < 24) {
                    hourlyDistribution[pStart.hour].ingresos++;
                }
            }
        }

        // 2. Procesar EJECUTADOS
        for (const row of filteredEjecutados) {
            const rawStart = getStartDateRaw(row);
            const pStart = parseDateTime(rawStart);

            const rawEnd = getRestorationDateRaw(row);
            const pEnd = parseDateTime(rawEnd);

            // A. Casos iniciados en targetDate (contribuyen a ingresosTotal)
            if (pStart && pStart.dateStr === targetDate) {
                result.ingresosTotal++;
                if (pStart.hour >= 0 && pStart.hour < 24) {
                    hourlyDistribution[pStart.hour].ingresos++;
                }
            }

            // B. Casos cerrados/restaurados en targetDate
            if (pEnd && pEnd.dateStr === targetDate) {
                result.cierresTotal++;
                if (pEnd.hour >= 0 && pEnd.hour < 24) {
                    hourlyDistribution[pEnd.hour].cierres++;
                }

                // Intradía vs Backlog
                const isIntradia = Boolean(pStart && pStart.dateStr === targetDate);
                if (isIntradia) {
                    result.cierresIntradia++;
                } else {
                    result.cierresBacklog++;
                }

                // Cálculo de TTR (horas entre inicio y restauración)
                if (pStart && pEnd.timestamp >= pStart.timestamp) {
                    const diffHours = (pEnd.timestamp - pStart.timestamp) / (1000 * 60 * 60);
                    if (isFinite(diffHours) && diffHours >= 0) {
                        ttrSumHours += diffHours;
                        ttrCount++;
                    }
                }
            }
        }

        // Balance Neto: cierresTotal - ingresosTotal
        result.balanceNeto = result.cierresTotal - result.ingresosTotal;

        // TTR promedio redondeado a 1 decimal
        result.ttrPromedioHoras = ttrCount > 0
            ? Math.round((ttrSumHours / ttrCount) * 10) / 10
            : 0;

        return result;
    }

    /**
     * Agrupa y calcula incidencias recurrentes por SED en los últimos 7 días
     *
     * @param {Array} pendientesRecords
     * @param {Array} ejecutadosRecords
     * @param {Object} [options]
     * @param {string} [options.date] - Fecha de referencia (por defecto el día más reciente disponible)
     * @param {string} [options.contractor='*']
     * @param {string} [options.workType='*']
     * @param {number} [options.days=7] - Ventana de días (por defecto 7)
     * @returns {Array<Object>}
     */
    function getRecurrentSeds7D(pendientesRecords, ejecutadosRecords, options) {
        const opts = Object.assign({
            date: '',
            referenceDate: '',
            contractor: '*',
            workType: '*',
            days: 7
        }, options);

        let refDateStr = normalizeDate(opts.date || opts.referenceDate);
        if (!refDateStr) {
            const avail = getAvailableDays(ejecutadosRecords, pendientesRecords, 1);
            refDateStr = avail.length > 0 ? avail[0] : normalizeDate(new Date());
        }

        const refParsed = parseDateTime(refDateStr);
        if (!refParsed) return [];

        const numDays = Math.max(1, opts.days || 7);
        const refDateObj = new Date(refParsed.timestamp);
        const endOfRefDay = new Date(refDateObj.getFullYear(), refDateObj.getMonth(), refDateObj.getDate(), 23, 59, 59, 999).getTime();
        const startOfWindow = new Date(refDateObj.getFullYear(), refDateObj.getMonth(), refDateObj.getDate(), 0, 0, 0, 0).getTime() - ((numDays - 1) * 24 * 60 * 60 * 1000);

        const safePendientes = Array.isArray(pendientesRecords) ? pendientesRecords : [];
        const safeEjecutados = Array.isArray(ejecutadosRecords) ? ejecutadosRecords : [];

        const filteredPendientes = safePendientes.filter(r =>
            matchesContractor(r, opts.contractor) && matchesWorkType(r, opts.workType)
        );
        const filteredEjecutados = safeEjecutados.filter(r =>
            matchesContractor(r, opts.contractor) && matchesWorkType(r, opts.workType)
        );

        const sedMap = new Map();

        function getSedData(rawSed) {
            const sedCode = String(rawSed || '').trim().toUpperCase();
            if (!sedCode || sedCode === 'N/A' || sedCode === '0' || sedCode === 'SIN SED' || sedCode === 'NULL') {
                return null;
            }
            if (!sedMap.has(sedCode)) {
                sedMap.set(sedCode, {
                    sed: sedCode,
                    pendientesActivos: 0,
                    cerrados7D: 0,
                    total7D: 0,
                    distritos: new Map(),
                    alimentadores: new Map(),
                    ticketsSet: new Set()
                });
            }
            return sedMap.get(sedCode);
        }

        function extractSed(row) {
            return getRecordProp(row, 'SED', 'sed', 'SED_CANONICA', 'sed_canonica', 'Sed');
        }

        function extractTicket(row) {
            return getRecordProp(row, 'ticket', 'Ticket', 'INCIDENCIA', 'Incidencia', 'incidencia', 'Número de avería', 'Numero de averia', 'averia', 'id');
        }

        function extractDistrito(row) {
            return getRecordProp(row, 'Distrito', 'distrito', 'DISTRITO', 'Distrito / Comuna', 'comuna');
        }

        function extractAlimentador(row) {
            return getRecordProp(row, 'Alimentador', 'alimentador', 'ALIMENTADOR');
        }

        function recordAttribute(map, val) {
            if (!val || val === 'N/A') return;
            const cleanVal = val.trim();
            if (cleanVal) {
                map.set(cleanVal, (map.get(cleanVal) || 0) + 1);
            }
        }

        // 1. Acumular PENDIENTES ACTIVOS
        for (const row of filteredPendientes) {
            const data = getSedData(extractSed(row));
            if (!data) continue;

            data.pendientesActivos++;

            const t = extractTicket(row);
            if (t) data.ticketsSet.add(t);

            recordAttribute(data.distritos, extractDistrito(row));
            recordAttribute(data.alimentadores, extractAlimentador(row));
        }

        // 2. Acumular CERRADOS EN LA VENTANA DE 7 DÍAS
        for (const row of filteredEjecutados) {
            const data = getSedData(extractSed(row));
            if (!data) continue;

            // Verificar si la fecha de restauración está dentro del rango de 7 días
            const rawEnd = getRestorationDateRaw(row);
            const pEnd = parseDateTime(rawEnd);

            if (pEnd && pEnd.timestamp >= startOfWindow && pEnd.timestamp <= endOfRefDay) {
                data.cerrados7D++;

                const t = extractTicket(row);
                if (t) data.ticketsSet.add(t);

                recordAttribute(data.distritos, extractDistrito(row));
                recordAttribute(data.alimentadores, extractAlimentador(row));
            }
        }

        function getTopAttribute(map) {
            if (!map || map.size === 0) return '';
            let topVal = '';
            let maxCount = -1;
            for (const [val, count] of map.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    topVal = val;
                }
            }
            return topVal;
        }

        const resultList = [];
        for (const item of sedMap.values()) {
            const total = item.pendientesActivos + item.cerrados7D;
            if (total > 0) {
                resultList.push({
                    sed: item.sed,
                    pendientesActivos: item.pendientesActivos,
                    cerrados7D: item.cerrados7D,
                    total7D: total,
                    distrito: getTopAttribute(item.distritos),
                    alimentador: getTopAttribute(item.alimentadores),
                    tickets: Array.from(item.ticketsSet)
                });
            }
        }

        // Ordenamiento: primero las que tienen pendientesActivos > 0 y mayor total7D, luego por total7D descendente
        resultList.sort((a, b) => {
            const aHasPending = a.pendientesActivos > 0 ? 1 : 0;
            const bHasPending = b.pendientesActivos > 0 ? 1 : 0;
            if (aHasPending !== bHasPending) {
                return bHasPending - aHasPending; // Las con pendientes van primero
            }
            if (b.total7D !== a.total7D) {
                return b.total7D - a.total7D; // Mayor total7D primero
            }
            if (b.pendientesActivos !== a.pendientesActivos) {
                return b.pendientesActivos - a.pendientesActivos;
            }
            return a.sed.localeCompare(b.sed);
        });

        return resultList;
    }

    return {
        parseDateTime,
        normalizeDate,
        getAvailableDays,
        calculateDailyProductivity,
        getRecurrentSeds7D
    };
}));
