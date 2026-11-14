/**
 * pluz24hMatrix.js
 * Módulo puro de lógica, texto y Canvas 2D HiDPI para el panel +24h (Estado PLUZ).
 */
(function (global) {
    'use strict';

    const STATE_PRIORITY = ['DERIVADO', 'EN EJECUCION', 'PENDIENTE'];
    const HEADER_BG = '#0f2447';
    const PARENT_ROW_BG = '#f1f5f9';
    const BORDER_COLOR = '#e2e8f0';
    const TEXT_MAIN = '#0f172a';
    const TEXT_MUTED = '#475569';
    const PENDING_ACCENT = '#ea580c';

    /**
     * Extrae el primer número entero de intervaloStr y retorna true si es >= 24.
     * @param {string} intervaloStr
     * @returns {boolean}
     */
    function isOver24hInterval(intervaloStr) {
        if (intervaloStr === null || intervaloStr === undefined) return false;
        const match = String(intervaloStr).match(/\d+/);
        if (!match) return false;
        return parseInt(match[0], 10) >= 24;
    }

    /**
     * Ordena intervalos numéricamente por su primer entero ascendente.
     */
    function sortIntervalsNumeric(a, b) {
        const parseNum = (str) => {
            const match = String(str).match(/\d+/);
            return match ? parseInt(match[0], 10) : 999;
        };
        const numA = parseNum(a);
        const numB = parseNum(b);
        if (numA !== numB) return numA - numB;
        return String(a).localeCompare(String(b), 'es');
    }

    /**
     * Determina y normaliza el estado PLUZ de un registro.
     */
    function resolveRecordPluzState(record) {
        const direct = record && record.estado_pluz ? String(record.estado_pluz).trim() : '';
        const raw = direct || (typeof getTicketPluzStatus === 'function' ? getTicketPluzStatus(record && record.ticket) : 'SIN REGISTRO');
        const normalized = String(raw || 'SIN REGISTRO').trim().toUpperCase();
        return normalized || 'SIN REGISTRO';
    }

    /**
     * Ordena los estados presentes con prioridad fija y luego alfabéticamente.
     */
    function sortStates(statesIterable) {
        const list = Array.from(statesIterable);
        return list.sort((a, b) => {
            const idxA = STATE_PRIORITY.indexOf(a);
            const idxB = STATE_PRIORITY.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b, 'es');
        });
    }

    function createEmptyStateMap(states) {
        const map = {};
        for (let i = 0; i < states.length; i++) {
            map[states[i]] = 0;
        }
        return map;
    }

    /**
     * Construye el resumen estructurado de tickets >= 24h agrupados por intervalo, falla y estado PLUZ.
     * @param {Array<Object>} records
     */
    function buildPluz24hSummary(records) {
        const safeRecords = Array.isArray(records) ? records : [];
        const over24Records = safeRecords.filter((r) => r && isOver24hInterval(r.intervalo));

        const presentStates = new Set();
        const intervalMap = new Map();
        const pendingCompanyMap = new Map();
        let totalPending = 0;

        for (let i = 0; i < over24Records.length; i++) {
            const r = over24Records[i];
            const interval = String(r.intervalo).trim();
            const falla = (r.falla && String(r.falla).trim()) ? String(r.falla).trim() : 'SIN FALLA';
            const state = resolveRecordPluzState(r);

            presentStates.add(state);

            if (!intervalMap.has(interval)) {
                intervalMap.set(interval, {
                    total: 0,
                    byStateRaw: {},
                    fallasMap: new Map()
                });
            }
            const intEntry = intervalMap.get(interval);
            intEntry.total += 1;
            intEntry.byStateRaw[state] = (intEntry.byStateRaw[state] || 0) + 1;

            if (!intEntry.fallasMap.has(falla)) {
                intEntry.fallasMap.set(falla, {
                    total: 0,
                    byStateRaw: {}
                });
            }
            const fallaEntry = intEntry.fallasMap.get(falla);
            fallaEntry.total += 1;
            fallaEntry.byStateRaw[state] = (fallaEntry.byStateRaw[state] || 0) + 1;

            if (state === 'PENDIENTE') {
                totalPending += 1;
                const empresa = (r.empresa && String(r.empresa).trim()) ? String(r.empresa).trim() : 'SIN EMPRESA';
                pendingCompanyMap.set(empresa, (pendingCompanyMap.get(empresa) || 0) + 1);
            }
        }

        const states = sortStates(presentStates);
        const sortedIntervalKeys = Array.from(intervalMap.keys()).sort(sortIntervalsNumeric);

        const intervals = sortedIntervalKeys.map((intervalKey) => {
            const intEntry = intervalMap.get(intervalKey);
            const byState = createEmptyStateMap(states);
            for (const st of Object.keys(intEntry.byStateRaw)) {
                byState[st] = intEntry.byStateRaw[st];
            }

            const sortedFallaKeys = Array.from(intEntry.fallasMap.keys()).sort((a, b) => a.localeCompare(b, 'es'));
            const fallas = sortedFallaKeys.map((fallaKey) => {
                const fEntry = intEntry.fallasMap.get(fallaKey);
                const fByState = createEmptyStateMap(states);
                for (const st of Object.keys(fEntry.byStateRaw)) {
                    fByState[st] = fEntry.byStateRaw[st];
                }
                return {
                    falla: fallaKey,
                    total: fEntry.total,
                    byState: fByState
                };
            });

            return {
                interval: intervalKey,
                total: intEntry.total,
                byState,
                fallas
            };
        });

        const pendingByCompany = Array.from(pendingCompanyMap.entries())
            .map(([empresa, count]) => ({ empresa, count }))
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return a.empresa.localeCompare(b.empresa, 'es');
            });

        return {
            total: over24Records.length,
            totalPending,
            states,
            intervals,
            pendingByCompany
        };
    }

    /**
     * Formatea el texto plano del reporte +24h para portapapeles.
     */
    function formatPluz24hText(summary) {
        if (!summary || !summary.totalPending) {
            return 'ESTADO DE TICKETS +24 HRS\nSIN TICKETS PENDIENTES';
        }
        const lines = (summary.pendingByCompany || []).map(
            (item) => `- ${item.empresa}: ${item.count}`
        );
        return `ESTADO DE TICKETS +24 HRS\nTICKETS PENDIENTES:\n${lines.join('\n')}`;
    }

    function formatCutDateTime(date) {
        const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    }

    /**
     * Dibuja en Canvas 2D HiDPI (scale = 2) el reporte +24h.
     * @param {Object} summary
     * @param {HTMLImageElement|null} logoImg
     * @returns {HTMLCanvasElement|null}
     */
    function renderPluz24hCanvas(summary, logoImg) {
        if (typeof document === 'undefined') return null;

        const safeSummary = summary || { total: 0, totalPending: 0, states: [], intervals: [], pendingByCompany: [] };
        const states = Array.isArray(safeSummary.states) ? safeSummary.states : [];
        const intervals = Array.isArray(safeSummary.intervals) ? safeSummary.intervals : [];
        const pendingByCompany = Array.isArray(safeSummary.pendingByCompany) ? safeSummary.pendingByCompany : [];

        const scale = 2;
        const padX = 24;
        const labelColW = 240;
        const stateColW = Math.max(96, states.length > 0 ? Math.floor(380 / Math.max(states.length, 1)) : 100);
        const totalColW = 76;
        const tableW = labelColW + states.length * stateColW + totalColW;
        const width = Math.max(640, tableW + padX * 2);

        const headerH = 74;
        const tableHeaderH = 34;
        const rowH = 28;
        const footerTotalH = 32;

        let totalTableRows = 0;
        for (let i = 0; i < intervals.length; i++) {
            totalTableRows += 1 + intervals[i].fallas.length;
        }
        const emptyNoticeH = intervals.length === 0 ? 44 : 0;
        const tableSectionH = tableHeaderH + totalTableRows * rowH + emptyNoticeH + (intervals.length > 0 ? footerTotalH : 0);

        const pendingItemsCount = pendingByCompany.length > 0 ? pendingByCompany.length : 1;
        const pendingCols = pendingItemsCount > 4 ? 2 : 1;
        const pendingRows = Math.ceil(pendingItemsCount / pendingCols);
        const pendingBoxH = 44 + pendingRows * 24 + 14;

        const height = headerH + 20 + tableSectionH + 18 + pendingBoxH + 20;

        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        const fontBase = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        const fontMono = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

        // Fondo general
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Cabecera oscura PLUZ (#0f2447)
        ctx.fillStyle = HEADER_BG;
        ctx.fillRect(0, 0, width, headerH);

        let titleX = padX;
        if (logoImg && logoImg.width > 0 && logoImg.height > 0) {
            const maxLogoH = 38;
            const ratio = Math.min(maxLogoH / logoImg.height, 110 / logoImg.width);
            const lw = logoImg.width * ratio;
            const lh = logoImg.height * ratio;
            ctx.drawImage(logoImg, padX, (headerH - lh) / 2, lw, lh);
            titleX = padX + lw + 14;
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = `700 17px ${fontBase}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('ESTADO DE TICKETS +24 HRS', titleX, 27);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = `500 12px ${fontBase}`;
        ctx.fillText(`Corte: ${formatCutDateTime(new Date())}  |  Total +24h: ${safeSummary.total || 0}`, titleX, 50);

        // Tabla Intervalo / Falla x Estado (PLUZ) x Total
        let y = headerH + 20;
        const actualTableW = width - padX * 2;
        const actualLabelW = actualTableW - states.length * stateColW - totalColW;

        // Cabecera de tabla
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(padX, y, actualTableW, tableHeaderH);
        ctx.strokeStyle = BORDER_COLOR;
        ctx.lineWidth = 1;
        ctx.strokeRect(padX, y, actualTableW, tableHeaderH);

        ctx.fillStyle = TEXT_MAIN;
        ctx.font = `700 11px ${fontBase}`;
        ctx.textAlign = 'left';
        ctx.fillText('INTERVALO / FALLA', padX + 10, y + tableHeaderH / 2);

        ctx.textAlign = 'right';
        for (let s = 0; s < states.length; s++) {
            const colRight = padX + actualLabelW + (s + 1) * stateColW - 10;
            ctx.fillText(states[s], colRight, y + tableHeaderH / 2);
        }
        ctx.fillText('TOTAL', padX + actualTableW - 10, y + tableHeaderH / 2);
        y += tableHeaderH;

        if (intervals.length === 0) {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(padX, y, actualTableW, emptyNoticeH);
            ctx.strokeRect(padX, y, actualTableW, emptyNoticeH);
            ctx.fillStyle = TEXT_MUTED;
            ctx.font = `500 12px ${fontBase}`;
            ctx.textAlign = 'center';
            ctx.fillText('Sin tickets +24h registrados en el corte actual', padX + actualTableW / 2, y + emptyNoticeH / 2);
            y += emptyNoticeH;
        } else {
            const grandByState = createEmptyStateMap(states);

            for (let i = 0; i < intervals.length; i++) {
                const intItem = intervals[i];

                // Fila padre (Intervalo) resaltada en #f1f5f9
                ctx.fillStyle = PARENT_ROW_BG;
                ctx.fillRect(padX, y, actualTableW, rowH);
                ctx.strokeStyle = BORDER_COLOR;
                ctx.beginPath();
                ctx.moveTo(padX, y + rowH);
                ctx.lineTo(padX + actualTableW, y + rowH);
                ctx.stroke();

                ctx.fillStyle = TEXT_MAIN;
                ctx.font = `700 12px ${fontBase}`;
                ctx.textAlign = 'left';
                ctx.fillText(intItem.interval, padX + 10, y + rowH / 2);

                ctx.font = `700 12px ${fontMono}`;
                ctx.textAlign = 'right';
                for (let s = 0; s < states.length; s++) {
                    const st = states[s];
                    const val = intItem.byState[st] || 0;
                    grandByState[st] += val;
                    if (val > 0) {
                        const colRight = padX + actualLabelW + (s + 1) * stateColW - 10;
                        ctx.fillText(String(val), colRight, y + rowH / 2);
                    }
                }
                if (intItem.total > 0) {
                    ctx.fillText(String(intItem.total), padX + actualTableW - 10, y + rowH / 2);
                }
                y += rowH;

                // Filas hijas (Fallas)
                for (let f = 0; f < intItem.fallas.length; f++) {
                    const fItem = intItem.fallas[f];
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(padX, y, actualTableW, rowH);
                    ctx.strokeStyle = BORDER_COLOR;
                    ctx.beginPath();
                    ctx.moveTo(padX, y + rowH);
                    ctx.lineTo(padX + actualTableW, y + rowH);
                    ctx.stroke();

                    ctx.fillStyle = TEXT_MUTED;
                    ctx.font = `500 11.5px ${fontBase}`;
                    ctx.textAlign = 'left';
                    ctx.fillText(`  ${fItem.falla}`, padX + 14, y + rowH / 2);

                    ctx.fillStyle = TEXT_MAIN;
                    ctx.font = `500 11.5px ${fontMono}`;
                    ctx.textAlign = 'right';
                    for (let s = 0; s < states.length; s++) {
                        const st = states[s];
                        const val = fItem.byState[st] || 0;
                        if (val > 0) {
                            const colRight = padX + actualLabelW + (s + 1) * stateColW - 10;
                            ctx.fillText(String(val), colRight, y + rowH / 2);
                        }
                    }
                    if (fItem.total > 0) {
                        ctx.fillText(String(fItem.total), padX + actualTableW - 10, y + rowH / 2);
                    }
                    y += rowH;
                }
            }

            // Fila Total General
            ctx.fillStyle = HEADER_BG;
            ctx.fillRect(padX, y, actualTableW, footerTotalH);

            ctx.fillStyle = '#ffffff';
            ctx.font = `700 12px ${fontBase}`;
            ctx.textAlign = 'left';
            ctx.fillText('TOTAL GENERAL', padX + 10, y + footerTotalH / 2);

            ctx.font = `700 12px ${fontMono}`;
            ctx.textAlign = 'right';
            for (let s = 0; s < states.length; s++) {
                const st = states[s];
                const val = grandByState[st] || 0;
                if (val > 0) {
                    const colRight = padX + actualLabelW + (s + 1) * stateColW - 10;
                    ctx.fillText(String(val), colRight, y + footerTotalH / 2);
                }
            }
            if ((safeSummary.total || 0) > 0) {
                ctx.fillText(String(safeSummary.total), padX + actualTableW - 10, y + footerTotalH / 2);
            }
            y += footerTotalH;
        }

        // Bloque inferior: TICKETS PENDIENTES
        y += 18;
        ctx.fillStyle = '#fff7ed';
        ctx.fillRect(padX, y, actualTableW, pendingBoxH);
        ctx.strokeStyle = '#fed7aa';
        ctx.lineWidth = 1;
        ctx.strokeRect(padX, y, actualTableW, pendingBoxH);

        ctx.fillStyle = PENDING_ACCENT;
        ctx.font = `700 12px ${fontBase}`;
        ctx.textAlign = 'left';
        ctx.fillText(`TICKETS PENDIENTES (${safeSummary.totalPending || 0})`, padX + 14, y + 20);

        if (pendingByCompany.length === 0) {
            ctx.fillStyle = TEXT_MUTED;
            ctx.font = `600 12px ${fontBase}`;
            ctx.fillText('SIN TICKETS PENDIENTES', padX + 14, y + 48);
        } else {
            const colWidth = (actualTableW - 28) / pendingCols;
            for (let p = 0; p < pendingByCompany.length; p++) {
                const item = pendingByCompany[p];
                const colIdx = Math.floor(p / pendingRows);
                const rowIdx = p % pendingRows;
                const itemX = padX + 14 + colIdx * colWidth;
                const itemY = y + 46 + rowIdx * 24;

                ctx.fillStyle = TEXT_MAIN;
                ctx.font = `600 12px ${fontBase}`;
                ctx.textAlign = 'left';
                ctx.fillText(`• ${item.empresa}`, itemX, itemY);

                ctx.fillStyle = PENDING_ACCENT;
                ctx.font = `700 12px ${fontMono}`;
                ctx.textAlign = 'right';
                ctx.fillText(String(item.count), itemX + colWidth - 16, itemY);
            }
        }

        return canvas;
    }

    function canvasToBlobAsync(canvas) {
        return new Promise((resolve, reject) => {
            if (!canvas || typeof canvas.toBlob !== 'function') {
                reject(new Error('Canvas no soporta toBlob.'));
                return;
            }
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('No se pudo generar la imagen PNG.'));
            }, 'image/png');
        });
    }

    function loadLogoImageAsync(src = 'PLUZ.png') {
        return new Promise((resolve) => {
            if (typeof document !== 'undefined') {
                const existing = document.querySelector('img[src*="PLUZ.png"]');
                if (existing && existing.complete && existing.naturalWidth > 0) {
                    resolve(existing);
                    return;
                }
            }
            if (typeof Image === 'undefined') {
                resolve(null);
                return;
            }
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    /**
     * Copia la imagen PNG del reporte +24h al portapapeles (con descarga de respaldo).
     */
    async function copyPluz24hImage(summary) {
        const logoImg = await loadLogoImageAsync('PLUZ.png');
        const canvas = renderPluz24hCanvas(summary, logoImg);
        if (!canvas) {
            throw new Error('No fue posible renderizar el lienzo del reporte +24h.');
        }

        const imageBlob = await canvasToBlobAsync(canvas);

        if (typeof ClipboardItem !== 'undefined' && typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
            const item = new ClipboardItem({ 'image/png': imageBlob });
            await navigator.clipboard.write([item]);
            return { mode: 'image', blob: imageBlob };
        }

        if (typeof document !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
            const url = URL.createObjectURL(imageBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `estado_tickets_24h_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return { mode: 'fallback_download', blob: imageBlob };
        }

        throw new Error('El navegador no permite copiar ni descargar la imagen.');
    }

    /**
     * Copia el texto estructurado del reporte +24h al portapapeles.
     */
    async function copyPluz24hText(summary) {
        const text = formatPluz24hText(summary);
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return { mode: 'text', text };
        }
        throw new Error('API de portapapeles de texto no disponible en el navegador.');
    }

    const api = {
        isOver24hInterval,
        buildPluz24hSummary,
        formatPluz24hText,
        renderPluz24hCanvas,
        copyPluz24hImage,
        copyPluz24hText
    };

    if (typeof window !== 'undefined') {
        window.Pluz24hMatrix = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
