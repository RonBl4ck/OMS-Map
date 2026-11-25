/**
 * OperaLog Service (Solo Lectura - Grupo BT)
 * Consulta directamente el Google Apps Script de OperaLog (action=getTurn&grupo=BT)
 * para alimentar el combobox de JC (Frente, Skill y Teléfono) en el modal Detalle PLUZ.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.OperaLogService = api;
        if (typeof window !== 'undefined' && window !== root) {
            window.OperaLogService = api;
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {

    const CACHE_TTL_MS = 5 * 60 * 1000;
    const FIELD_FRONTS = new Set(['REPARACIONES', 'TEKO', 'RECLAMOS', 'LOCALIZADORES']);

    let cachedRows = [];
    let cachedFecha = '';
    let cachedAt = 0;
    let inFlightPromise = null;

    function getLimaTodayStr() {
        try {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Lima',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date());
        } catch (_) {
            const now = new Date(Date.now() - 5 * 3600000);
            return now.toISOString().slice(0, 10);
        }
    }

    function normalizeText(val) {
        return String(val || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    function normalizeTurnRows(rawRows) {
        if (!Array.isArray(rawRows)) return [];
        return rawRows
            .filter(r => r && String(r.grupo || 'BT').trim().toUpperCase() === 'BT' && String(r.nombres || '').trim())
            .map(r => ({
                id: String(r.id || '').trim(),
                contratista: String(r.contratista || '').trim().toUpperCase(),
                frente: String(r.frente || '').trim().toUpperCase(),
                nombres: String(r.nombres || '').trim().toUpperCase(),
                skill: String(r.skill || '').trim().toUpperCase(),
                celular: String(r.celular || '').trim(),
                usuario_ssam: String(r.usuario_ssam || '').trim().toUpperCase()
            }));
    }

    function formatPhoneForCopy(rawPhone) {
        const digitsOnly = String(rawPhone || '').replace(/\D+/g, '');
        if (!digitsOnly) return { display: '', digits: '' };
        let cleanDigits = digitsOnly;
        if (cleanDigits.length === 11 && cleanDigits.startsWith('51')) {
            cleanDigits = cleanDigits.slice(2);
        }
        return { display: cleanDigits, digits: cleanDigits };
    }

    function getConfiguredGasUrl() {
        if (typeof window !== 'undefined' && window.OPERALOG_GAS_URL) {
            return String(window.OPERALOG_GAS_URL).trim();
        }
        if (root && root.omsStore && typeof root.omsStore.get === 'function') {
            const fromStore = root.omsStore.get('OPERALOG_GAS_URL');
            if (fromStore) return String(fromStore).trim();
        }
        return '';
    }

    function readSessionCache(fecha) {
        try {
            if (typeof sessionStorage === 'undefined') return null;
            const raw = sessionStorage.getItem('oms_operalog_bt_turns_' + fecha);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !Array.isArray(parsed.rows)) return null;
            if (Date.now() - (parsed.ts || 0) > CACHE_TTL_MS) return null;
            return parsed.rows;
        } catch (_) {
            return null;
        }
    }

    function writeSessionCache(fecha, rows) {
        try {
            if (typeof sessionStorage === 'undefined') return;
            sessionStorage.setItem('oms_operalog_bt_turns_' + fecha, JSON.stringify({
                ts: Date.now(),
                rows
            }));
        } catch (_) {}
    }

    async function loadTodayTurns(forceRefresh = false) {
        const fecha = getLimaTodayStr();
        const gasUrl = getConfiguredGasUrl();
        if (!gasUrl) {
            return { ok: false, configured: false, fecha, rows: cachedRows };
        }

        const isMemFresh = !forceRefresh && cachedFecha === fecha && cachedRows.length > 0 && (Date.now() - cachedAt) < CACHE_TTL_MS;
        if (isMemFresh) {
            return { ok: true, configured: true, fecha, rows: cachedRows };
        }

        if (!forceRefresh) {
            const fromSession = readSessionCache(fecha);
            if (fromSession) {
                cachedRows = fromSession;
                cachedFecha = fecha;
                cachedAt = Date.now();
                return { ok: true, configured: true, fecha, rows: cachedRows };
            }
        }

        if (inFlightPromise && !forceRefresh) {
            return inFlightPromise;
        }

        inFlightPromise = (async () => {
            try {
                const url = new URL(gasUrl);
                url.searchParams.set('action', 'getTurn');
                url.searchParams.set('fecha', fecha);
                url.searchParams.set('rol', 'ADMIN');
                url.searchParams.set('contratista', 'ALL');
                url.searchParams.set('grupo', 'BT');

                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), 9000) : null;
                const resp = await fetch(url.toString(), {
                    method: 'GET',
                    redirect: 'follow',
                    signal: controller ? controller.signal : undefined
                });
                if (timer) clearTimeout(timer);

                if (!resp || !resp.ok) {
                    return { ok: false, configured: true, fecha, rows: cachedRows };
                }
                const json = await resp.json();
                const rows = normalizeTurnRows(json && json.rows);
                cachedRows = rows;
                cachedFecha = fecha;
                cachedAt = Date.now();
                writeSessionCache(fecha, rows);
                return { ok: true, configured: true, fecha, rows };
            } catch (_) {
                return { ok: false, configured: true, fecha, rows: cachedRows };
            } finally {
                inFlightPromise = null;
            }
        })();

        return inFlightPromise;
    }

    function getFieldCandidates({ contratista = '', query = '' } = {}) {
        const targetCompany = normalizeText(contratista);
        const q = normalizeText(query);
        const qDigits = String(query || '').replace(/\D+/g, '');

        const fieldRows = cachedRows.filter(r => FIELD_FRONTS.has(normalizeText(r.frente)));
        const filtered = !q && !qDigits
            ? fieldRows
            : fieldRows.filter(r => {
                const hay = [
                    normalizeText(r.nombres),
                    normalizeText(r.frente),
                    normalizeText(r.skill),
                    normalizeText(r.contratista)
                ].join(' ');
                if (q && hay.includes(q)) return true;
                if (qDigits && String(r.celular || '').replace(/\D+/g, '').includes(qDigits)) return true;
                return false;
            });

        const sameCompany = [];
        const otherCompanies = [];
        filtered.forEach(r => {
            if (targetCompany && normalizeText(r.contratista) === targetCompany) {
                sameCompany.push(r);
            } else {
                otherCompanies.push(r);
            }
        });

        const sortByName = (a, b) => a.nombres.localeCompare(b.nombres);
        sameCompany.sort(sortByName);
        otherCompanies.sort((a, b) => a.contratista.localeCompare(b.contratista) || a.nombres.localeCompare(b.nombres));

        return { sameCompany, otherCompanies };
    }

    function findMatchByJcName(jcName, contratista = '') {
        const targetName = normalizeText(jcName);
        if (!targetName) return null;
        const targetCompany = normalizeText(contratista);

        const matches = cachedRows.filter(r => normalizeText(r.nombres) === targetName);
        if (matches.length === 0) return null;
        if (targetCompany) {
            const same = matches.find(r => normalizeText(r.contratista) === targetCompany);
            if (same) return same;
        }
        return matches[0];
    }

    function getPhoneForJc(jcName, contratista = '') {
        const match = findMatchByJcName(jcName, contratista);
        if (!match) return null;
        const phone = formatPhoneForCopy(match.celular);
        return phone.digits ? phone : null;
    }

    function copyPhoneNumber(digits, btnEl) {
        if (!digits) return;
        const onSuccess = () => {
            if (!btnEl) return;
            const prev = btnEl.textContent;
            btnEl.textContent = '✓';
            btnEl.classList.add('is-copied');
            setTimeout(() => {
                btnEl.textContent = prev || '📋';
                btnEl.classList.remove('is-copied');
            }, 1400);
        };
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(digits).then(onSuccess).catch(() => {});
            return;
        }
        try {
            const ta = document.createElement('textarea');
            ta.value = digits;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            onSuccess();
        } catch (_) {}
    }

    function _setCachedRows(rows, fecha) {
        cachedRows = Array.isArray(rows) ? rows : [];
        cachedFecha = fecha || getLimaTodayStr();
        cachedAt = Date.now();
    }

    function getCachedRows() {
        return cachedRows;
    }

    return {
        loadTodayTurns,
        normalizeTurnRows,
        getFieldCandidates,
        findMatchByJcName,
        formatPhoneForCopy,
        getPhoneForJc,
        copyPhoneNumber,
        getLimaTodayStr,
        getCachedRows,
        _setCachedRows
    };
}));
