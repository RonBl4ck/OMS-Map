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

    function isWildcardFilter(val) {
        if (!val) return true;
        const str = String(val).trim().toUpperCase();
        return str === '*' || str === 'ALL' || str === 'TODAS' || str === 'TODOS' || str === 'TODAS LAS EMPRESAS' || str === 'TODOS LOS TRABAJOS';
    }

    /**
     * Filtra si una fila coincide con el contratista especificado
     */
    function matchesContractor(row, contractor) {
        if (isWildcardFilter(contractor)) return true;
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
        if (isWildcardFilter(workType)) return true;
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
     * Helper para extraer el nombre del contratista normalizado
     */
    function getContractorName(row) {
        let c = getRecordProp(
            row,
            'Contratista', 'Empresa', 'CONTRATISTA', 'empresa',
            'Pto.tbjo.responsable', 'contratista', 'company'
        ).trim();
        if (!c || c.toUpperCase() === 'N/A' || c === '-' || c === '0') {
            return 'SIN CONTRATISTA';
        }
        return c;
    }

    /**
     * Tracker de métricas agrupadas por contratista
     */
    function createContractorTracker() {
        const map = new Map();
        return {
            record(row, type) {
                const rawName = getContractorName(row);
                const key = rawName.toUpperCase();
                if (!map.has(key)) {
                    map.set(key, {
                        contractor: rawName,
                        ingresos: 0,
                        cierres: 0,
                        balance: 0
                    });
                }
                const item = map.get(key);
                if (type === 'ingreso') item.ingresos++;
                else if (type === 'cierre') item.cierres++;
            },
            toArray() {
                return Array.from(map.values())
                    .map(item => {
                        item.balance = item.ingresos - item.cierres;
                        return item;
                    })
                    .sort((a, b) => {
                        const volA = a.ingresos + a.cierres;
                        const volB = b.ingresos + b.cierres;
                        if (volB !== volA) return volB - volA;
                        if (b.ingresos !== a.ingresos) return b.ingresos - a.ingresos;
                        return a.contractor.localeCompare(b.contractor);
                    });
            }
        };
    }

    /**
     * Obtiene la fecha más reciente del snapshot de pendientes/datos para anclar el balance contable
     */
    function getSnapshotDate(filteredPendientes, filteredEjecutados, fallbackDate) {
        let maxTs = 0;
        let maxDateStr = null;

        if (Array.isArray(filteredPendientes) && filteredPendientes.length > 0) {
            for (const r of filteredPendientes) {
                const raw = getStartDateRaw(r);
                const p = parseDateTime(raw);
                if (p && p.timestamp > maxTs) {
                    maxTs = p.timestamp;
                    maxDateStr = p.dateStr;
                }
            }
        }

        if (maxDateStr) return maxDateStr;

        if (fallbackDate) {
            const pFallback = parseDateTime(fallbackDate);
            if (pFallback) return pFallback.dateStr;
        }

        const avail = getAvailableDays(filteredEjecutados, filteredPendientes, 1);
        return avail.length > 0 ? avail[0] : normalizeDate(new Date());
    }

    /**
     * Reconstruye la serie cronológica de inventarios (inicial y final) día por día
     * usando balance contable inverso a partir de los pendientes vivos actuales:
     * InvInicial(d) = InvFinal(d) - Ingresos(d) + Cierres(d)
     * InvFinal(d_prev) = InvInicial(d)
     */
    function reconstructInventorySeries(filteredPendientes, filteredEjecutados, snapshotDate) {
        const snap = snapshotDate || getSnapshotDate(filteredPendientes, filteredEjecutados);
        const pSnap = parseDateTime(snap);
        const snapMs = pSnap ? new Date(pSnap.timestamp).setHours(23, 59, 59, 999) : Infinity;

        const allDaysDesc = getAvailableDays(filteredEjecutados, filteredPendientes, 60);
        // Anclar estrictamente hasta la fecha de corte (snapshotDate) para descartar fechas futuras no ejecutadas
        const daysDesc = allDaysDesc.filter(d => {
            const p = parseDateTime(d);
            return p ? p.timestamp <= snapMs : true;
        });

        if (!daysDesc || daysDesc.length === 0) return new Map();

        const daysAsc = [...daysDesc].reverse();
        const dailyCounts = new Map();
        daysAsc.forEach(d => dailyCounts.set(d, { ingresos: 0, cierres: 0 }));

        for (const r of filteredPendientes) {
            const rawStart = getStartDateRaw(r);
            const pStart = parseDateTime(rawStart);
            if (pStart && dailyCounts.has(pStart.dateStr)) {
                dailyCounts.get(pStart.dateStr).ingresos++;
            }
        }

        for (const r of filteredEjecutados) {
            const rawStart = getStartDateRaw(r);
            const pStart = parseDateTime(rawStart);
            if (pStart && dailyCounts.has(pStart.dateStr)) {
                dailyCounts.get(pStart.dateStr).ingresos++;
            }

            const rawEnd = getRestorationDateRaw(r);
            const pEnd = parseDateTime(rawEnd);
            if (pEnd && dailyCounts.has(pEnd.dateStr)) {
                dailyCounts.get(pEnd.dateStr).cierres++;
            }
        }

        const currentLive = filteredPendientes.length;
        const inventoryMap = new Map();

        let runningFinal = currentLive;
        for (let i = daysAsc.length - 1; i >= 0; i--) {
            const d = daysAsc[i];
            const counts = dailyCounts.get(d) || { ingresos: 0, cierres: 0 };
            const invFinal = Math.max(0, runningFinal);
            const invInicial = Math.max(0, invFinal - counts.ingresos + counts.cierres);

            inventoryMap.set(d, {
                inicial: invInicial,
                final: invFinal,
                ingresos: counts.ingresos,
                cierres: counts.cierres
            });

            runningFinal = invInicial;
        }

        return inventoryMap;
    }

    /**
     * Calcula los indicadores de productividad diaria y distribución horaria
     *
     * @param {Array} pendientesRecords
     * @param {Array} ejecutadosRecords
     * @param {Object} [options]
     * @param {string} [options.date] - Fecha en formato 'D/M/YYYY', '7D' o '*'
     * @param {string} [options.referenceDate] - Fecha de referencia opcional para ventana 7D
     * @param {string} [options.contractor='*'] - Contratista a filtrar ('*' para todos)
     * @param {string} [options.workType='*'] - Tipo de equipo o skill a filtrar ('*' para todos)
     * @returns {Object}
     */
    function calculateDailyProductivity(pendientesRecords, ejecutadosRecords, options) {
        const opts = Object.assign({
            date: '',
            referenceDate: '',
            contractor: '*',
            workType: '*',
            startHour: 0,
            endHour: 24
        }, options);

        const safePendientes = Array.isArray(pendientesRecords) ? pendientesRecords : [];
        const safeEjecutados = Array.isArray(ejecutadosRecords) ? ejecutadosRecords : [];

        // Filtrado por contratista y tipo de trabajo
        const filteredPendientes = safePendientes.filter(r =>
            matchesContractor(r, opts.contractor) && matchesWorkType(r, opts.workType)
        );
        const filteredEjecutados = safeEjecutados.filter(r =>
            matchesContractor(r, opts.contractor) && matchesWorkType(r, opts.workType)
        );

        const rawDateStr = String(opts.date || '').trim().toUpperCase();
        const is7DMode = rawDateStr === '7D' || rawDateStr === '*' || rawDateStr === 'ALL';

        const startHour = (opts.startHour !== undefined && opts.startHour !== null) ? Number(opts.startHour) : 0;
        const endHour = (opts.endHour !== undefined && opts.endHour !== null) ? Number(opts.endHour) : 24;
        const isHourInRange = (h) => {
            if (h === null || h === undefined || isNaN(h)) return true;
            if (startHour <= 0 && endHour >= 24) return true;
            const maxH = endHour >= 24 ? 23 : endHour;
            return h >= startHour && h <= maxH;
        };

        const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => ({
            hour,
            ingresos: 0,
            cierres: 0
        }));

        const contractorTracker = createContractorTracker();
        let ingresosTotal = 0;
        let cierresTotal = 0;
        let cierresIntradia = 0;
        let cierresBacklog = 0;
        let pendientesDelDia = 0;
        let pendientesHistoricos = 0;
        let ttrSumHours = 0;
        let ttrCount = 0;

        // =========================================================================
        // MODO 1: Ventana de 7 Días (options.date === '7D' o options.date === '*')
        // =========================================================================
        if (is7DMode) {
            let refDateStr = normalizeDate(opts.referenceDate || (rawDateStr !== '7D' && rawDateStr !== '*' && rawDateStr !== 'ALL' ? opts.date : ''));
            if (!refDateStr) {
                const avail = getAvailableDays(filteredEjecutados, filteredPendientes, 1);
                if (avail.length > 0) {
                    refDateStr = avail[0];
                } else {
                    const availAll = getAvailableDays(safeEjecutados, safePendientes, 1);
                    refDateStr = availAll.length > 0 ? availAll[0] : normalizeDate(new Date());
                }
            }

            const refParsed = parseDateTime(refDateStr) || parseDateTime(new Date());
            const refDateObj = new Date(refParsed.timestamp);

            const dailyMap = new Map();
            const daysList = [];
            const numDays = 7;
            for (let i = numDays - 1; i >= 0; i--) {
                const d = new Date(refDateObj.getFullYear(), refDateObj.getMonth(), refDateObj.getDate() - i);
                const dStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                const startMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
                const endMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
                dailyMap.set(dStr, {
                    date: dStr,
                    ingresos: 0,
                    cierres: 0,
                    balance: 0,
                    startMs,
                    endMs
                });
                daysList.push({ date: dStr, startMs, endMs });
            }

            const windowStartMs = daysList[0].startMs;
            const windowEndMs = daysList[daysList.length - 1].endMs;

            // Procesar PENDIENTES en la ventana 7D
            for (const row of filteredPendientes) {
                const rawStart = getStartDateRaw(row);
                const pStart = parseDateTime(rawStart);
                if (pStart && pStart.timestamp >= windowStartMs && pStart.timestamp <= windowEndMs) {
                    if (isHourInRange(pStart.hour)) {
                        pendientesDelDia++;
                        ingresosTotal++;
                        const dEntry = dailyMap.get(pStart.dateStr);
                        if (dEntry) dEntry.ingresos++;
                        contractorTracker.record(row, 'ingreso');
                    }
                    if (pStart.hour >= 0 && pStart.hour < 24) {
                        hourlyDistribution[pStart.hour].ingresos++;
                    }
                } else if (pStart && pStart.timestamp < windowStartMs) {
                    pendientesHistoricos++;
                } else if (!pStart) {
                    pendientesHistoricos++;
                }
            }

            // Procesar EJECUTADOS en la ventana 7D
            for (const row of filteredEjecutados) {
                const rawStart = getStartDateRaw(row);
                const pStart = parseDateTime(rawStart);
                const rawEnd = getRestorationDateRaw(row);
                const pEnd = parseDateTime(rawEnd);

                // Ingresos en la ventana
                if (pStart && pStart.timestamp >= windowStartMs && pStart.timestamp <= windowEndMs) {
                    if (isHourInRange(pStart.hour)) {
                        ingresosTotal++;
                        const dEntry = dailyMap.get(pStart.dateStr);
                        if (dEntry) dEntry.ingresos++;
                        contractorTracker.record(row, 'ingreso');
                    }
                    if (pStart.hour >= 0 && pStart.hour < 24) {
                        hourlyDistribution[pStart.hour].ingresos++;
                    }
                }

                // Cierres en la ventana
                if (pEnd && pEnd.timestamp >= windowStartMs && pEnd.timestamp <= windowEndMs) {
                    if (isHourInRange(pEnd.hour)) {
                        cierresTotal++;
                        const dEntry = dailyMap.get(pEnd.dateStr);
                        if (dEntry) dEntry.cierres++;
                        contractorTracker.record(row, 'cierre');

                        // Intradía vs Backlog
                        const isIntradia = Boolean(pStart && pStart.dateStr === pEnd.dateStr);
                        if (isIntradia) {
                            cierresIntradia++;
                        } else {
                            cierresBacklog++;
                        }

                        // TTR
                        if (pStart && pEnd.timestamp >= pStart.timestamp) {
                            const diffHours = (pEnd.timestamp - pStart.timestamp) / (1000 * 60 * 60);
                            if (isFinite(diffHours) && diffHours >= 0) {
                                ttrSumHours += diffHours;
                                ttrCount++;
                            }
                        }
                    }
                    if (pEnd.hour >= 0 && pEnd.hour < 24) {
                        hourlyDistribution[pEnd.hour].cierres++;
                    }
                }
            }

            const dailyBreakdown = Array.from(dailyMap.values()).map(item => ({
                date: item.date,
                ingresos: item.ingresos,
                cierres: item.cierres,
                balance: item.ingresos - item.cierres
            }));

            const contractorBreakdown = contractorTracker.toArray();
            const balanceNeto = ingresosTotal - cierresTotal;
            const ttrPromedioHoras = ttrCount > 0 ? Math.round((ttrSumHours / ttrCount) * 10) / 10 : 0;

            const snapshotDate = getSnapshotDate(filteredPendientes, filteredEjecutados, refDateStr);
            const invSeries = reconstructInventorySeries(filteredPendientes, filteredEjecutados, snapshotDate);
            const firstDay = dailyBreakdown.length > 0 ? dailyBreakdown[0].date : null;
            const lastDay = dailyBreakdown.length > 0 ? dailyBreakdown[dailyBreakdown.length - 1].date : null;
            const firstInv = firstDay ? invSeries.get(firstDay) : null;
            const lastInv = lastDay ? invSeries.get(lastDay) : null;

            const inicial = firstInv ? firstInv.inicial : Math.max(0, filteredPendientes.length - ingresosTotal + cierresTotal);
            const final = lastInv ? lastInv.final : filteredPendientes.length;

            return {
                date: opts.date || '7D',
                is7D: true,
                referenceDate: refDateStr,
                contractor: opts.contractor || '*',
                workType: opts.workType || '*',
                startHour,
                endHour,
                ingresosTotal,
                cierresTotal,
                cierresIntradia,
                cierresBacklog,
                pendientesDelDia,
                pendientesHistoricos,
                balanceNeto,
                hourlyDistribution,
                ttrPromedioHoras,
                dailyBreakdown,
                contractorBreakdown,
                waterfall: {
                    inicial,
                    ingresos: ingresosTotal,
                    cierresIntradia,
                    cierresBacklog,
                    final
                }
            };
        }

        // =========================================================================
        // MODO 2: Día específico (ej. '2/11/2026')
        // =========================================================================
        let targetDate = normalizeDate(opts.date);
        if (!targetDate) {
            const avail = getAvailableDays(filteredEjecutados, filteredPendientes, 1);
            if (avail.length > 0) {
                targetDate = avail[0];
            } else {
                const availAll = getAvailableDays(safeEjecutados, safePendientes, 1);
                targetDate = availAll.length > 0 ? availAll[0] : normalizeDate(new Date());
            }
        }

        const pTarget = parseDateTime(targetDate);
        let startOfTargetDay = 0;
        if (pTarget) {
            const dTarget = new Date(pTarget.timestamp);
            startOfTargetDay = new Date(dTarget.getFullYear(), dTarget.getMonth(), dTarget.getDate(), 0, 0, 0, 0).getTime();
        }

        // 1. Procesar PENDIENTES
        for (const row of filteredPendientes) {
            const rawStart = getStartDateRaw(row);
            const pStart = parseDateTime(rawStart);
            if (pStart && pStart.dateStr === targetDate) {
                if (isHourInRange(pStart.hour)) {
                    pendientesDelDia++;
                    ingresosTotal++;
                    contractorTracker.record(row, 'ingreso');
                }
                if (pStart.hour >= 0 && pStart.hour < 24) {
                    hourlyDistribution[pStart.hour].ingresos++;
                }
            } else if (pStart && pStart.timestamp < startOfTargetDay) {
                pendientesHistoricos++;
            } else if (!pStart) {
                pendientesHistoricos++;
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
                if (isHourInRange(pStart.hour)) {
                    ingresosTotal++;
                    contractorTracker.record(row, 'ingreso');
                }
                if (pStart.hour >= 0 && pStart.hour < 24) {
                    hourlyDistribution[pStart.hour].ingresos++;
                }
            }

            // B. Casos cerrados/restaurados en targetDate
            if (pEnd && pEnd.dateStr === targetDate) {
                if (isHourInRange(pEnd.hour)) {
                    cierresTotal++;
                    contractorTracker.record(row, 'cierre');

                    // Intradía vs Backlog
                    const isIntradia = Boolean(pStart && pStart.dateStr === targetDate);
                    if (isIntradia) {
                        cierresIntradia++;
                    } else {
                        cierresBacklog++;
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
                if (pEnd.hour >= 0 && pEnd.hour < 24) {
                    hourlyDistribution[pEnd.hour].cierres++;
                }
            }
        }

        // Balance Neto: ingresosTotal - cierresTotal (si ingresos > cierres, es positivo; si cierres > ingresos, es negativo)
        const balanceNeto = ingresosTotal - cierresTotal;

        // TTR promedio redondeado a 1 decimal
        const ttrPromedioHoras = ttrCount > 0
            ? Math.round((ttrSumHours / ttrCount) * 10) / 10
            : 0;

        const contractorBreakdown = contractorTracker.toArray();

        // Cálculo de Waterfall mediante serie contable inversa
        const snapshotDate = getSnapshotDate(filteredPendientes, filteredEjecutados, targetDate);
        const invSeries = reconstructInventorySeries(filteredPendientes, filteredEjecutados, snapshotDate);
        const dayInv = invSeries.get(targetDate);

        let inicial = dayInv ? dayInv.inicial : Math.max(0, filteredPendientes.length - ingresosTotal + cierresTotal);
        let final = dayInv ? dayInv.final : Math.max(0, inicial + ingresosTotal - cierresTotal);

        if (final === 0 && (inicial + ingresosTotal - cierresTotal) > 0) {
            final = inicial + ingresosTotal - cierresTotal;
        }

        const waterfall = {
            inicial,
            ingresos: ingresosTotal,
            cierresIntradia,
            cierresBacklog,
            final
        };

        return {
            date: targetDate,
            contractor: opts.contractor || '*',
            workType: opts.workType || '*',
            ingresosTotal,
            cierresTotal,
            cierresIntradia,
            cierresBacklog,
            pendientesDelDia,
            pendientesHistoricos,
            balanceNeto,
            hourlyDistribution,
            ttrPromedioHoras,
            contractorBreakdown,
            waterfall
        };
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

    /**
     * Agrupa y calcula incidencias recurrentes por Suministro en los últimos 7 días
     *
     * @param {Array} pendientesRecords
     * @param {Array} ejecutadosRecords
     * @param {Object} [options]
     * @param {string} [options.date] - Fecha de referencia ('7D', '*', o 'D/M/YYYY')
     * @param {string} [options.referenceDate]
     * @param {string} [options.contractor='*'] - Filtro por contratista
     * @param {string} [options.workType='*']
     * @param {number} [options.days=7] - Ventana de días (por defecto 7)
     * @returns {Array<Object>}
     */
    function getRecurrentSuministros7D(pendientesRecords, ejecutadosRecords, options) {
        const opts = Object.assign({
            date: '',
            referenceDate: '',
            contractor: '*',
            workType: '*',
            days: 7
        }, options);

        let refDateStr = normalizeDate(opts.referenceDate || (opts.date !== '7D' && opts.date !== '*' ? opts.date : ''));
        if (!refDateStr) {
            const avail = getAvailableDays(ejecutadosRecords, pendientesRecords, 1);
            refDateStr = avail.length > 0 ? avail[0] : normalizeDate(new Date());
        }

        const refParsed = parseDateTime(refDateStr) || parseDateTime(new Date());
        const numDays = Math.max(1, opts.days || 7);
        const refDateObj = new Date(refParsed.timestamp);
        const endOfRefDay = new Date(refDateObj.getFullYear(), refDateObj.getMonth(), refDateObj.getDate(), 23, 59, 59, 999).getTime();
        const startOfWindow = new Date(refDateObj.getFullYear(), refDateObj.getMonth(), refDateObj.getDate(), 0, 0, 0, 0).getTime() - ((numDays - 1) * 24 * 60 * 60 * 1000);

        const safePendientes = Array.isArray(pendientesRecords) ? pendientesRecords : [];
        const safeEjecutados = Array.isArray(ejecutadosRecords) ? ejecutadosRecords : [];

        // Filtro por contratista si != '*' y != 'ALL'
        const filteredPendientes = safePendientes.filter(r =>
            matchesContractor(r, opts.contractor) && matchesWorkType(r, opts.workType)
        );
        const filteredEjecutados = safeEjecutados.filter(r =>
            matchesContractor(r, opts.contractor) && matchesWorkType(r, opts.workType)
        );

        const sumMap = new Map();

        function extractSuministroCode(row) {
            if (!row || typeof row !== 'object') return '';
            const s = getRecordProp(
                row,
                'Suministro', 'Objeto Técnico', 'Objeto Tecnico', 'suministro',
                'objeto_tecnico', 'SUMINISTRO', 'OBJETO_TECNICO',
                'Objeto_Tecnico', 'Id Suministro', 'id_suministro', 'Nro Suministro'
            ).trim();
            if (!s) return '';
            const upper = s.toUpperCase();
            if (upper === '-' || upper === '0' || upper === 'SIN SUMINISTRO' || upper === 'N/A' || upper === 'NULL' || upper === 'UNDEFINED') {
                return '';
            }
            return s;
        }

        function extractExplicitCount(row) {
            const raw = getRecordProp(
                row,
                'Conteo_Fallas_Suministro_7D', 'Fallas_Suministro_7D',
                'conteo_fallas_suministro_7d', 'fallas_suministro_7d',
                'Conteo_Fallas_Suministro', 'conteo_fallas_7d'
            );
            if (!raw) return 0;
            const n = parseInt(raw, 10);
            return isNaN(n) ? 0 : n;
        }

        function getSuministroData(rawCode) {
            const key = rawCode.trim().toUpperCase();
            if (!sumMap.has(key)) {
                sumMap.set(key, {
                    suministro: rawCode.trim(),
                    pendientesActivos: 0,
                    cerrados7D: 0,
                    maxExplicitCount: 0,
                    seds: new Map(),
                    distritos: new Map(),
                    ticketsSet: new Set()
                });
            }
            return sumMap.get(key);
        }

        function recordAttr(map, val) {
            if (!val) return;
            const clean = String(val).trim();
            const upper = clean.toUpperCase();
            if (!clean || upper === 'N/A' || upper === '-' || upper === '0' || upper === 'NULL') return;
            map.set(clean, (map.get(clean) || 0) + 1);
        }

        function extractSed(row) {
            return getRecordProp(row, 'SED', 'sed', 'SED_CANONICA', 'sed_canonica', 'Sed');
        }

        function extractDistrito(row) {
            return getRecordProp(row, 'Distrito', 'distrito', 'DISTRITO', 'Distrito / Comuna', 'comuna');
        }

        function extractTicket(row) {
            return getRecordProp(row, 'ticket', 'Ticket', 'INCIDENCIA', 'Incidencia', 'incidencia', 'Número de avería', 'Numero de averia', 'averia', 'id');
        }

        // 1. Acumular PENDIENTES ACTIVOS
        for (const row of filteredPendientes) {
            const code = extractSuministroCode(row);
            if (!code) continue;

            const data = getSuministroData(code);
            data.pendientesActivos++;

            const exp = extractExplicitCount(row);
            if (exp > data.maxExplicitCount) data.maxExplicitCount = exp;

            const t = extractTicket(row);
            if (t) data.ticketsSet.add(t);

            recordAttr(data.seds, extractSed(row));
            recordAttr(data.distritos, extractDistrito(row));
        }

        // 2. Acumular CERRADOS EN LA VENTANA DE 7 DÍAS
        for (const row of filteredEjecutados) {
            const code = extractSuministroCode(row);
            if (!code) continue;

            const pEnd = parseDateTime(getRestorationDateRaw(row));
            const pStart = parseDateTime(getStartDateRaw(row));

            const inWindow = (pEnd && pEnd.timestamp >= startOfWindow && pEnd.timestamp <= endOfRefDay) ||
                             (!pEnd && pStart && pStart.timestamp >= startOfWindow && pStart.timestamp <= endOfRefDay);

            if (inWindow) {
                const data = getSuministroData(code);
                data.cerrados7D++;

                const exp = extractExplicitCount(row);
                if (exp > data.maxExplicitCount) data.maxExplicitCount = exp;

                const t = extractTicket(row);
                if (t) data.ticketsSet.add(t);

                recordAttr(data.seds, extractSed(row));
                recordAttr(data.distritos, extractDistrito(row));
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
        for (const item of sumMap.values()) {
            const appearances = item.pendientesActivos + item.cerrados7D;
            const eventos7D = Math.max(item.maxExplicitCount, appearances);

            if (eventos7D > 0 || item.pendientesActivos > 0) {
                resultList.push({
                    suministro: item.suministro,
                    sed: getTopAttribute(item.seds) || '-',
                    distrito: getTopAttribute(item.distritos) || '-',
                    pendientesActivos: item.pendientesActivos,
                    eventos7D: eventos7D,
                    tickets: Array.from(item.ticketsSet)
                });
            }
        }

        // Ordenamiento: primero por pendientesActivos > 0 descendente, luego por eventos7D descendente
        resultList.sort((a, b) => {
            const aHasPending = a.pendientesActivos > 0 ? 1 : 0;
            const bHasPending = b.pendientesActivos > 0 ? 1 : 0;
            if (aHasPending !== bHasPending) {
                return bHasPending - aHasPending; // Pendientes activos primero
            }
            if (b.eventos7D !== a.eventos7D) {
                return b.eventos7D - a.eventos7D; // Mayor eventos7D primero
            }
            if (b.pendientesActivos !== a.pendientesActivos) {
                return b.pendientesActivos - a.pendientesActivos;
            }
            return String(a.suministro).localeCompare(String(b.suministro));
        });

        return resultList;
    }

    return {
        parseDateTime,
        normalizeDate,
        getAvailableDays,
        calculateDailyProductivity,
        getRecurrentSeds7D,
        getRecurrentSuministros7D
    };
}));
