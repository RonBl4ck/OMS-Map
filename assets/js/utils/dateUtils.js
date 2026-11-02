/**
 * OMS Date Utilities
 * Pure date & time parsing, SLA calculation, duration formatting, and chronological sorting.
 * UMD / Vanilla friendly.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.DateUtils = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.DateUtils = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
    const SPANISH_MONTHS_MAP = Object.freeze({
        ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
        jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11
    });

    const SLA_CONFIG_HORAS = Object.freeze({
        "SUMINISTRO": 4,
        "RED AEREA": 8,
        "RED AÉREA": 8,
        "CNX AEREA": 8,
        "CNX AÉREA": 8,
        "LÍNEA AÉREA BT": 8,
        "LINEA AEREA BT": 8,
        "RED SUBTERRANEA": 12,
        "RED SUBTERRÁNEA": 12,
        "CNX SUBTERRANEA": 8,
        "CNX SUBTERRÁNEA": 8,
        "FUSIBLE": 4,
        "POSTE": 8,
        "RIESGO": 2,
        "RIESGO DE VIDA": 2,
        "PELIGRO": 2,
        "DEFAULT": 4
    });

    function parseDateFlexible(val) {
        if (!val || val === 'N/A') return null;
        const s = String(val).trim();
        const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (dmy) {
            const day = parseInt(dmy[1], 10);
            const month = parseInt(dmy[2], 10) - 1;
            const year = parseInt(dmy[3], 10);
            const hour = parseInt(dmy[4] || 0, 10);
            const min = parseInt(dmy[5] || 0, 10);
            const sec = parseInt(dmy[6] || 0, 10);
            const dt = new Date(year, month, day, hour, min, sec);
            return isNaN(dt.getTime()) ? null : dt;
        }
        const dtIso = new Date(s.replace(' ', 'T'));
        if (!isNaN(dtIso.getTime())) return dtIso;
        return null;
    }

    function parseDiaValue(diaStr) {
        if (!diaStr) return null;
        const str = String(diaStr).trim().toLowerCase();

        // Formato DD-mmm o DD/mmm (ej: 01-nov, 30-oct, 1-nov)
        const matchTxt = str.match(/^(\d{1,2})[-\/\s]([a-záéíóúñ]{3,})(?:[-\/\s](\d{2,4}))?$/i);
        if (matchTxt) {
            const day = parseInt(matchTxt[1], 10);
            const monthRaw = matchTxt[2].substring(0, 3).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const month = SPANISH_MONTHS_MAP[monthRaw];
            if (month !== undefined) {
                const year = matchTxt[3] ? parseInt(matchTxt[3].length === 2 ? ('20' + matchTxt[3]) : matchTxt[3], 10) : 2000;
                return year * 10000 + (month + 1) * 100 + day;
            }
        }

        // Formato DD/MM/AAAA o DD-MM-AAAA o DD/MM
        const matchNum = str.match(/^(\d{1,2})[-\/](\d{1,2})(?:[-\/](\d{2,4}))?$/);
        if (matchNum) {
            const day = parseInt(matchNum[1], 10);
            const month = parseInt(matchNum[2], 10);
            const year = matchNum[3] ? parseInt(matchNum[3].length === 2 ? ('20' + matchNum[3]) : matchNum[3], 10) : 2000;
            return year * 10000 + month * 100 + day;
        }

        // Formato ISO AAAA-MM-DD
        const matchIso = str.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
        if (matchIso) {
            return parseInt(matchIso[1], 10) * 10000 + parseInt(matchIso[2], 10) * 100 + parseInt(matchIso[3], 10);
        }

        return null;
    }

    function sortDias(a, b, recordsRef) {
        if (Array.isArray(recordsRef) && recordsRef.length > 0) {
            if (!recordsRef._diaTimestampMap) {
                const map = new Map();
                for (const r of recordsRef) {
                    if (r && r.dia && !map.has(r.dia)) {
                        const ts = (typeof parseTdOmsDate === 'function')
                            ? parseTdOmsDate(r.hora_inicio || r.fecha_inicio)
                            : (typeof parseDateFlexible === 'function' ? (parseDateFlexible(r.hora_inicio || r.fecha_inicio)?.getTime() || null) : null);
                        if (ts !== null && ts !== undefined) map.set(r.dia, ts);
                    }
                }
                recordsRef._diaTimestampMap = map;
            }
            const tsA = recordsRef._diaTimestampMap.get(a);
            const tsB = recordsRef._diaTimestampMap.get(b);
            if (tsA !== undefined && tsB !== undefined && tsA !== tsB) {
                return tsA - tsB;
            }
        }

        const scoreA = parseDiaValue(a);
        const scoreB = parseDiaValue(b);
        if (scoreA !== null && scoreB !== null && scoreA !== scoreB) {
            return scoreA - scoreB;
        }
        if (scoreA !== null) return -1;
        if (scoreB !== null) return 1;

        return String(a).localeCompare(String(b), 'es');
    }

    function sortIntervals(a, b) {
        const parseNum = (str) => {
            const match = String(str).match(/\d+/);
            return match ? parseInt(match[0], 10) : 999;
        };
        const numA = parseNum(a);
        const numB = parseNum(b);
        if (numA !== numB) return numA - numB;
        return String(a).localeCompare(String(b), 'es');
    }

    function formatDurationHhMm(value, options = {}) {
        if (value === null || value === undefined || isNaN(value)) return '0m';
        const totalMinutes = options.inMinutes ? Math.round(Number(value)) : Math.round(Number(value) * 60);
        const absMinutes = Math.abs(totalMinutes);
        const hours = Math.floor(absMinutes / 60);
        const mins = absMinutes % 60;
        const sign = totalMinutes < 0 ? '-' : '';
        if (hours === 0 && !options.alwaysShowHours) {
            return `${sign}${mins}m`;
        }
        return `${sign}${hours}h ${mins}m`;
    }

    function calculateTicketSla(record) {
        if (!record) return null;
        let maxHours = 0;
        if (record.sla_max_horas !== undefined && record.sla_max_horas !== null && !isNaN(Number(record.sla_max_horas))) {
            maxHours = Number(record.sla_max_horas);
        } else {
            const falla = String(record.falla || '').toUpperCase();
            const prioridad = String(record.prioridad || '').toUpperCase();

            if (prioridad.includes("RIESGO") || prioridad.includes("VIDA") || prioridad.includes("PELIGRO")) {
                maxHours = SLA_CONFIG_HORAS["RIESGO DE VIDA"];
            } else if (falla.includes("RED SUBTERRANEA") || falla.includes("RED SUBTERRÁNEA")) {
                maxHours = SLA_CONFIG_HORAS["RED SUBTERRANEA"];
            } else if (falla.includes("CNX SUBTERRANEA") || falla.includes("CNX SUBTERRÁNEA")) {
                maxHours = SLA_CONFIG_HORAS["CNX SUBTERRANEA"];
            } else if (falla.includes("RED AEREA") || falla.includes("RED AÉREA") || falla.includes("LÍNEA AÉREA BT") || falla.includes("LINEA AEREA BT")) {
                maxHours = SLA_CONFIG_HORAS["RED AEREA"];
            } else if (falla.includes("CNX AEREA") || falla.includes("CNX AÉREA")) {
                maxHours = SLA_CONFIG_HORAS["CNX AEREA"];
            } else if (falla.includes("SUMINISTRO")) {
                maxHours = SLA_CONFIG_HORAS["SUMINISTRO"];
            } else if (falla.includes("FUSIBLE")) {
                maxHours = SLA_CONFIG_HORAS["FUSIBLE"];
            } else if (falla.includes("POSTE")) {
                maxHours = SLA_CONFIG_HORAS["POSTE"];
            } else {
                maxHours = SLA_CONFIG_HORAS.DEFAULT;
            }
        }
        if (maxHours <= 0) maxHours = SLA_CONFIG_HORAS.DEFAULT;

        let elapsed = 0;
        let dateResolved = false;

        if (record.fecha_limite_sla && record.fecha_limite_sla !== 'N/A') {
            const limitDate = parseDateFlexible(record.fecha_limite_sla);
            if (limitDate) {
                const remainingHours = (limitDate.getTime() - Date.now()) / (1000 * 60 * 60);
                elapsed = Math.max(0, maxHours - remainingHours);
                dateResolved = true;
            }
        }

        if (!dateResolved && record.fecha_inicio && record.fecha_inicio !== 'N/A') {
            const start = parseDateFlexible(record.fecha_inicio);
            if (start) {
                elapsed = Math.max(0, (Date.now() - start.getTime()) / (1000 * 60 * 60));
                dateResolved = true;
            }
        }

        if (!dateResolved && record.duracion !== undefined && record.duracion !== null && record.duracion !== 'N/A' && record.duracion !== '') {
            const dStr = String(record.duracion).replace(',', '.').trim();
            const dNum = parseFloat(dStr);
            if (!isNaN(dNum)) {
                elapsed = Math.max(0, dNum);
            }
        }

        const pct = maxHours > 0 ? (elapsed / maxHours) : 0;
        const warnHours = maxHours * 0.75;
        const remainingHours = maxHours - elapsed;

        let status = 'ok';
        let statusClass = 'sla-ok';
        let label = 'Dentro de plazo';
        let badgeColor = '#16a34a';

        if (elapsed >= maxHours) {
            status = 'overdue';
            statusClass = 'sla-overdue';
            const overMins = Math.round((elapsed - maxHours) * 60);
            const overHoursText = overMins >= 60 ? `${Math.floor(overMins / 60)}h ${overMins % 60}m` : `${overMins}m`;
            label = `Fuera de plazo (+${overHoursText})`;
            badgeColor = '#dc2626';
        } else if (elapsed >= warnHours) {
            status = 'warning';
            statusClass = 'sla-warning';
            const remMins = Math.round(remainingHours * 60);
            const remHoursText = remMins >= 60 ? `${Math.floor(remMins / 60)}h ${remMins % 60}m` : `${remMins}m`;
            label = `A poco de vencer (restan ${remHoursText})`;
            badgeColor = '#f59e0b';
        } else {
            const remMins = Math.round(remainingHours * 60);
            const remHoursText = remMins >= 60 ? `${Math.floor(remMins / 60)}h ${remMins % 60}m` : `${remMins}m`;
            label = `Dentro de plazo (restan ${remHoursText})`;
        }

        return {
            status,
            statusClass,
            label,
            badgeColor,
            maxHours,
            warnHours,
            elapsed: Math.round(elapsed * 10) / 10,
            pct: Math.round(pct * 100),
            remainingHours
        };
    }

    return {
        SPANISH_MONTHS_MAP,
        SLA_CONFIG_HORAS,
        parseDateFlexible,
        parseDiaValue,
        sortDias,
        sortIntervals,
        formatDurationHhMm,
        calculateTicketSla
    };
}));
