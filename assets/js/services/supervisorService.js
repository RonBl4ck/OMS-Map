/**
 * Supervisor Service - Supervisión PLUZ
 * Gestión de bitácora de supervisión, actualización de estados operativos y críticos,
 * parseo masivo de tickets con asignación de Jefe de Cuadrilla (JC) y sincronización con backend.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.SupervisorService = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.SupervisorService = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {

    /**
     * Devuelve la fecha actual en zona horaria America/Lima en formato YYYY-MM-DD
     */
    function getLimaTodayStr() {
        try {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Lima',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date());
        } catch (e) {
            const now = new Date();
            const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
            const limaTime = new Date(utcMs - (5 * 3600000));
            const pad = n => String(n).padStart(2, '0');
            return `${limaTime.getFullYear()}-${pad(limaTime.getMonth() + 1)}-${pad(limaTime.getDate())}`;
        }
    }

    /**
     * Parsea un texto o número con un candidato de fecha u hora y lo normaliza a 'YYYY-MM-DD HH:MM'
     */
    function parseDateTimeCandidate(val) {
        if (!val || (typeof val !== 'string' && typeof val !== 'number')) return '';
        const str = String(val).trim();
        if (!str) return '';

        const pad = n => String(n).padStart(2, '0');

        // 1. Detectar si el valor es solo hora (HH:MM, HH:MM:SS, h:mm a, 14:30 hrs, etc.)
        const timeOnlyMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]\.?\s*m\.?|\s*hrs?|\s*hs?))?$/i);
        if (timeOnlyMatch) {
            let hh = parseInt(timeOnlyMatch[1], 10);
            const mm = parseInt(timeOnlyMatch[2], 10);
            const mod = (timeOnlyMatch[4] || '').toLowerCase().replace(/\./g, '').trim();

            if (mod === 'pm' || mod === 'p m') {
                if (hh < 12) hh += 12;
            } else if (mod === 'am' || mod === 'a m') {
                if (hh === 12) hh = 0;
            }

            if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
                return `${getLimaTodayStr()} ${pad(hh)}:${pad(mm)}`;
            }
        }

        // 2. Fecha completa DD/MM/YYYY HH:MM o DD-MM-YYYY HH:MM
        const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]\.?\s*m\.?))?$/i);
        if (dmyMatch) {
            const dd = parseInt(dmyMatch[1], 10);
            const mon = parseInt(dmyMatch[2], 10);
            const yyyy = parseInt(dmyMatch[3], 10);
            let hh = parseInt(dmyMatch[4], 10);
            const mm = parseInt(dmyMatch[5], 10);
            const mod = (dmyMatch[7] || '').toLowerCase().replace(/\./g, '').trim();

            if (mod === 'pm' || mod === 'p m') {
                if (hh < 12) hh += 12;
            } else if (mod === 'am' || mod === 'a m') {
                if (hh === 12) hh = 0;
            }

            if (mon >= 1 && mon <= 12 && dd >= 1 && dd <= 31 && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
                return `${yyyy}-${pad(mon)}-${pad(dd)} ${pad(hh)}:${pad(mm)}`;
            }
        }

        // 3. Fecha completa YYYY-MM-DD HH:MM o YYYY/MM/DD HH:MM
        const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap]\.?\s*m\.?))?$/i);
        if (ymdMatch) {
            const yyyy = parseInt(ymdMatch[1], 10);
            const mon = parseInt(ymdMatch[2], 10);
            const dd = parseInt(ymdMatch[3], 10);
            let hh = parseInt(ymdMatch[4], 10);
            const mm = parseInt(ymdMatch[5], 10);
            const mod = (ymdMatch[7] || '').toLowerCase().replace(/\./g, '').trim();

            if (mod === 'pm' || mod === 'p m') {
                if (hh < 12) hh += 12;
            } else if (mod === 'am' || mod === 'a m') {
                if (hh === 12) hh = 0;
            }

            if (mon >= 1 && mon <= 12 && dd >= 1 && dd <= 31 && hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
                return `${yyyy}-${pad(mon)}-${pad(dd)} ${pad(hh)}:${pad(mm)}`;
            }
        }

        // 4. ISO con zona horaria o T (ej: 2026-11-02T16:30:00Z)
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
            const parsed = new Date(str);
            if (!isNaN(parsed.getTime())) {
                try {
                    const parts = new Intl.DateTimeFormat('en-CA', {
                        timeZone: 'America/Lima',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).formatToParts(parsed);
                    const p = {};
                    parts.forEach(part => p[part.type] = part.value);
                    const hourVal = p.hour === '24' ? '00' : p.hour;
                    return `${p.year}-${p.month}-${p.day} ${hourVal}:${p.minute}`;
                } catch (e) {
                    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
                }
            }
        }

        return '';
    }

    /**
     * Parsea texto crudo copiado desde Excel u otra fuente con tickets, JC y hora estimada
     */
    function parseBulkTicketsWithJc(rawText) {
        if (!rawText || typeof rawText !== 'string') return [];
        
        const lines = rawText.split(/\r?\n/);
        const resultMap = new Map();
        const isPlaceholder = s => (!s || /^n\/?a$/i.test(s) || s === '-' || s === '--' || s.toLowerCase() === 'null');

        lines.forEach(rawLine => {
            const line = rawLine.trim();
            if (!line) return;

            // Si la línea contiene tabulación (copiado clásico de 2+ columnas de Excel)
            if (line.includes('\t')) {
                const parts = line.split('\t').map(p => p.trim());
                const ticketIdx = parts.findIndex(p => /\b\d{5,12}\b/.test(p));
                if (ticketIdx !== -1) {
                    const ticketMatch = parts[ticketIdx].match(/\b\d{5,12}\b/);
                    const ticket = ticketMatch ? ticketMatch[0] : '';
                    if (ticket) {
                        let jc = '';
                        let finEstimado = '';
                        const otherParts = parts.filter((_, idx) => idx !== ticketIdx);

                        if (parts.length >= 3) {
                            for (const other of otherParts) {
                                if (!other || isPlaceholder(other)) continue;
                                const dt = parseDateTimeCandidate(other);
                                if (dt && !finEstimado) {
                                    finEstimado = dt;
                                } else if (!jc && !dt) {
                                    jc = other.toUpperCase();
                                }
                            }
                        } else if (parts.length === 2) {
                            const other = otherParts[0] || '';
                            if (other && !isPlaceholder(other)) {
                                const dt = parseDateTimeCandidate(other);
                                if (dt) {
                                    finEstimado = dt;
                                } else {
                                    jc = other.toUpperCase();
                                }
                            }
                        }

                        resultMap.set(ticket, { ticket, jc, finEstimado });
                        return;
                    }
                }
            }

            // Si hay múltiples tickets en la misma línea (ej: "12345, 67890" o texto libre)
            const allTicketMatches = line.match(/\b\d{5,12}\b/g) || [];
            if (allTicketMatches.length > 1) {
                allTicketMatches.forEach(t => {
                    if (!resultMap.has(t)) {
                        resultMap.set(t, { ticket: t, jc: '', finEstimado: '' });
                    }
                });
                return;
            }

            // Si hay exactamente un ticket en la línea
            if (allTicketMatches.length === 1) {
                const ticket = allTicketMatches[0];
                let rest = line.replace(ticket, '').trim();
                rest = rest.replace(/^[\s,;\-|:]+|[\s,;\-|:]+$/g, '').trim();
                let jcVal = '';
                let finEstVal = '';
                if (rest && !isPlaceholder(rest)) {
                    const dt = parseDateTimeCandidate(rest);
                    if (dt) {
                        finEstVal = dt;
                    } else {
                        jcVal = rest.toUpperCase();
                    }
                }
                resultMap.set(ticket, { ticket, jc: jcVal, finEstimado: finEstVal });
            }
        });

        return Array.from(resultMap.values());
    }

    /**
     * Devuelve solo la lista de tickets únicos detectados en texto crudo
     */
    function parseBulkTickets(rawText) {
        return parseBulkTicketsWithJc(rawText).map(item => item.ticket);
    }

    /**
     * Retorna la clase CSS adecuada según el estado de supervisión
     */
    function getSupervisorBadgeClass(status) {
        const s = String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (s.includes('camino')) return 'sup-status-en-camino';
        if (s.includes('sitio')) return 'sup-status-en-sitio';
        if (s.includes('ejecuc')) return 'sup-status-en-ejecucion';
        if (s.includes('pendient')) return 'sup-status-pendiente';
        if (s.includes('impedid')) return 'sup-status-impedido';
        if (s.includes('derivad')) return 'sup-status-derivado';
        if (s.includes('falla')) return 'sup-status-buscando-falla';
        if (s.includes('maniobra')) return 'sup-status-maniobras';
        if (s.includes('material')) return 'sup-status-materiales';
        if (s.includes('normaliz') || s.includes('resuelt') || s.includes('cerrad') || s.includes('c. campo') || s.includes('c.campo') || s.includes('campo')) return 'sup-status-normalizado';
        return 'sup-status-generic';
    }

    /**
     * Retorna la clase CSS para el badge de criticidad
     */
    function getCriticoBadgeClass(status) {
        const s = String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (s.includes('quant')) return 'sup-status-quantico';
        if (s.includes('vencid')) return 'sup-status-vencido';
        if (s.includes('crit')) return 'sup-status-critico';
        return 'sup-status-normal';
    }

    /**
     * Envía la actualización de un ticket individual a la API del servidor
     */
    async function postSupervisorStatus(payload) {
        const userRole = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('oms_user_role') : 'admin';
        return await fetch('/api/update-supervisor-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-role': userRole || 'admin'
            },
            body: JSON.stringify({
                ...payload,
                role: userRole || 'admin'
            })
        });
    }

    /**
     * Guarda la novedad de supervisión individual introducida en el modal
     */
    async function saveSupervisorLog(ticketOverride) {
        const activeTicket = ticketOverride || (typeof currentSupervisorTicket !== 'undefined' ? currentSupervisorTicket : null);
        if (!activeTicket) return;

        const inJc = typeof document !== 'undefined' ? document.getElementById("supInputJefeCuadrilla") : null;
        const inFinEst = typeof document !== 'undefined' ? document.getElementById("supInputFinEstimado") : null;
        const inEstOp = typeof document !== 'undefined' ? document.getElementById("supInputEstadoOperativo") : null;
        const inDetOp = typeof document !== 'undefined' ? document.getElementById("supInputDetalleOperativo") : null;
        const inEstCrit = typeof document !== 'undefined' ? document.getElementById("supInputEstadoCritico") : null;
        const inDetCrit = typeof document !== 'undefined' ? document.getElementById("supInputDetalleCritico") : null;
        const btnSave = typeof document !== 'undefined' ? document.getElementById("btnSaveSupervisorLog") : null;
        const feedback = typeof document !== 'undefined' ? document.getElementById("supSaveFeedback") : null;

        const clean = (typeof cleanSupVal === 'function') ? cleanSupVal : (v => (!v || /^n\/?a$/i.test(String(v).trim()) || String(v).trim() === '--' || String(v).trim() === 'null') ? '' : String(v).trim());

        const jefeCuadrilla = clean(inJc ? inJc.value : "").toUpperCase();
        const finEstimado = clean(inFinEst ? inFinEst.value : "");
        const estadoOperativo = clean(inEstOp ? inEstOp.value : "").toUpperCase();
        const detalleOperativo = clean(inDetOp ? inDetOp.value : "");
        const estadoCritico = clean(inEstCrit ? inEstCrit.value : "").toUpperCase();
        const detalleCritico = clean(inDetCrit ? inDetCrit.value : "");

        if (!estadoOperativo && !estadoCritico && !jefeCuadrilla && !finEstimado) {
            if (feedback) {
                feedback.style.color = "#dc2626";
                feedback.textContent = "⚠️ Debes ingresar al menos un estado operativo, JC o nivel de criticidad.";
                feedback.style.display = "block";
            }
            return;
        }

        if (btnSave) {
            btnSave.disabled = true;
            btnSave.textContent = "⏳ Guardando...";
        }
        if (feedback) {
            feedback.style.color = "#0284c7";
            feedback.textContent = "Guardando actualización...";
            feedback.style.display = "block";
        }

        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const localTimestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        // Extraer metadatos de contexto del ticket (SED, Hora de Inicio, Alimentador, Empresa)
        const targetRec = (typeof tdOmsRecords !== 'undefined' && Array.isArray(tdOmsRecords) ? tdOmsRecords.find(r => String(r.ticket || '').trim().toLowerCase() === activeTicket.toLowerCase()) : null) ||
                          (typeof mapLocations !== 'undefined' && Array.isArray(mapLocations) ? mapLocations.find(l => String(l.ticket || '').trim().toLowerCase() === activeTicket.toLowerCase()) : null) || {};

        const supDataCurrent = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(activeTicket) : null;
        const supLatestCurrent = supDataCurrent ? supDataCurrent.latest : null;

        const sedRaw = clean(targetRec.sed) || clean(supLatestCurrent ? supLatestCurrent.sed : '') || clean(typeof document !== 'undefined' && document.getElementById("supModalSed") ? document.getElementById("supModalSed").textContent : '');
        const cleanSedVal = sedRaw;

        const horaIniRaw = clean(targetRec.hora_inicio || targetRec.fecha_inicio) || clean(supLatestCurrent ? supLatestCurrent.horaInicio : '');
        const cleanHoraIniVal = horaIniRaw;

        const aliRaw = clean(targetRec.alimentador) || clean(supLatestCurrent ? supLatestCurrent.alimentador : '') || clean(typeof document !== 'undefined' && document.getElementById("supModalAlimentador") ? document.getElementById("supModalAlimentador").textContent : '');
        const cleanAliVal = aliRaw;

        const empRaw = clean(targetRec.empresa) || clean(supLatestCurrent ? supLatestCurrent.empresa : '') || clean(typeof document !== 'undefined' && document.getElementById("supModalBadgeEmpresa") ? document.getElementById("supModalBadgeEmpresa").textContent : '');
        const cleanEmpVal = empRaw;

        const optimisticEntry = {
            fecha: localTimestamp,
            ticket: activeTicket,
            sed: cleanSedVal,
            horaInicio: cleanHoraIniVal,
            alimentador: cleanAliVal,
            empresa: cleanEmpVal,
            estadoOperativo: estadoOperativo,
            detalleOperativo: detalleOperativo,
            jefeCuadrilla: jefeCuadrilla,
            finEstimado: finEstimado,
            estadoCritico: estadoCritico,
            detalleCritico: detalleCritico,
            estado: estadoOperativo || estadoCritico,
            detalle: detalleOperativo || detalleCritico,
            usuario: 'PLUZ'
        };

        // 1. Actualización optimista inmediata en memoria
        if (typeof addSupervisorLogOptimistic === 'function') {
            addSupervisorLogOptimistic(optimisticEntry);
        }
        if (typeof renderSupervisorTimeline === 'function') {
            renderSupervisorTimeline(activeTicket);
        }
        if (typeof renderTdOmsTable === 'function' && typeof getFilteredTdOms === 'function') {
            renderTdOmsTable(getFilteredTdOms());
        }
        if (typeof setupMapMarkers === 'function') setupMapMarkers();
        else if (typeof renderMapMarkers === 'function') renderMapMarkers();

        // Actualizar Hero Card superior si existe
        const heroEl = typeof document !== 'undefined' ? document.getElementById("supHeroLatestContainer") : null;
        if (heroEl) {
            const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(activeTicket) : null;
            const supLatest = supData ? supData.latest : null;
            if (supLatest) {
                const opEst = supLatest.estadoOperativo || supLatest.estado || 'PENDIENTE';
                const critEst = supLatest.estadoCritico || '';
                const opBadgeClass = getSupervisorBadgeClass(opEst);
                const critBadgeClass = critEst ? getCriticoBadgeClass(critEst) : '';
                const jcVal = supLatest.jefeCuadrilla || '';
                const opDet = supLatest.detalleOperativo || supLatest.detalle || '';
                const critDet = supLatest.detalleCritico || '';

                let borderClass = 'is-en-ejecucion';
                const critNorm = String(critEst).toLowerCase();
                const opNorm = String(opEst).toLowerCase();
                if (critNorm.includes('crit')) borderClass = 'has-critico';
                else if (critNorm.includes('quant')) borderClass = 'has-quantico';
                else if (critNorm.includes('vencid')) borderClass = 'has-vencido';
                else if (opNorm.includes('impedid')) borderClass = 'has-impedido';
                else if (opNorm.includes('normaliz') || opNorm.includes('cerrad') || opNorm.includes('campo')) borderClass = 'has-normalizado';

                const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => s);
                heroEl.innerHTML = `
                    <div class="sup-hero-card ${borderClass}">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.3px;">📌 Última Novedad:</span>
                                <span class="sup-status-badge ${opBadgeClass}">⚙️ ${esc(opEst)}</span>
                                ${critEst ? `<span class="sup-status-badge ${critBadgeClass}">${esc(critEst)}</span>` : ''}
                            </div>
                            <span style="font-size: 10px; color: #64748b; font-weight: 600;">🕒 ${esc(supLatest.fecha || '')} • por <b>${esc(supLatest.usuario || 'PLUZ')}</b></span>
                        </div>
                        ${jcVal ? `<div style="font-size: 11px; color: #0f172a; margin-bottom: 4px; font-weight: 700;">JC: <span style="font-weight: 600; color: #1e293b;">${esc(jcVal)}</span></div>` : ''}
                        ${opDet ? `<div style="font-size: 11px; color: #334155; line-height: 1.35; margin-bottom: 3px;"><b>Operativo:</b> ${esc(opDet)}</div>` : ''}
                        ${critDet && !/^n\/?a$/i.test(critDet) ? `<div style="font-size: 11px; color: #9d174d; line-height: 1.35;"><b>Criticidad:</b> ${esc(critDet)}</div>` : ''}
                    </div>
                `;
                heroEl.style.display = "block";
            }
        }

        // Limpiar inputs de notas tras guardar
        if (inDetOp) inDetOp.value = '';
        if (inDetCrit) inDetCrit.value = '';

        // 2. Persistencia en Backend / Google Sheets
        try {
            const resp = await postSupervisorStatus({
                ticket: activeTicket,
                sed: cleanSedVal,
                horaInicio: cleanHoraIniVal,
                alimentador: cleanAliVal,
                empresa: cleanEmpVal,
                estadoOperativo: estadoOperativo,
                detalleOperativo: detalleOperativo,
                jefeCuadrilla: jefeCuadrilla,
                finEstimado: finEstimado,
                estadoCritico: estadoCritico,
                detalleCritico: detalleCritico
            });

            const data = await resp.json();

            if (resp.ok && data.success) {
                if (feedback) {
                    feedback.style.color = "#16a34a";
                    feedback.textContent = "✅ " + (data.message || "Guardado exitosamente.");
                    feedback.style.display = "block";
                }
                if (typeof showAppNotification === 'function') {
                    showAppNotification(`Novedad registrada para ticket #${activeTicket}`, 'success');
                }
                setTimeout(() => {
                    if (typeof closeSupervisorModal === 'function') closeSupervisorModal();
                }, 1100);
            } else {
                if (feedback) {
                    feedback.style.color = "#dc2626";
                    feedback.textContent = "⚠️ " + (data.message || "Error al sincronizar con Sheets.");
                    feedback.style.display = "block";
                }
            }
        } catch (err) {
            console.error("Error guardando novedad de supervisión:", err);
            if (feedback) {
                feedback.style.color = "#f59e0b";
                feedback.textContent = "Guardado localmente (sin conexión a Sheets).";
                feedback.style.display = "block";
            }
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.textContent = "💾 Guardar Novedad";
            }
        }
    }

    /**
     * Ejecución masiva de asignación a EN EJECUCIÓN con JC opcional
     */
    async function executeBulkPluzEnEjecucion() {
        const inputTickets = typeof document !== 'undefined' ? document.getElementById('bulkPluzTicketsInput') : null;
        const alertEl = typeof document !== 'undefined' ? document.getElementById('bulkPluzAlert') : null;
        const btnSubmit = typeof document !== 'undefined' ? document.getElementById('btnSubmitBulkPluz') : null;
        const spinner = typeof document !== 'undefined' ? document.getElementById('bulkPluzSubmitSpinner') : null;
        const textEl = typeof document !== 'undefined' ? document.getElementById('bulkPluzSubmitText') : null;

        const rawText = inputTickets ? inputTickets.value : '';
        const items = parseBulkTicketsWithJc(rawText);

        if (items.length === 0) {
            if (alertEl) {
                alertEl.style.display = 'block';
                alertEl.style.background = '#fef2f2';
                alertEl.style.color = '#991b1b';
                alertEl.style.border = '1px solid #fecaca';
                alertEl.textContent = '⚠️ Ingresa o pega al menos un número de ticket válido con o sin JC.';
            }
            return;
        }

        const clean = (typeof cleanSupVal === 'function') ? cleanSupVal : (v => (!v || /^n\/?a$/i.test(String(v).trim()) || String(v).trim() === '--' || String(v).trim() === 'null') ? '' : String(v).trim());

        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const localTimestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        const entries = [];
        items.forEach(it => {
            const t = it.ticket;
            const jcVal = clean(it.jc).toUpperCase();

            const targetRec = (typeof tdOmsRecords !== 'undefined' && Array.isArray(tdOmsRecords) ? tdOmsRecords.find(r => String(r.ticket || '').trim().toLowerCase() === t.toLowerCase()) : null) ||
                              (typeof mapLocations !== 'undefined' && Array.isArray(mapLocations) ? mapLocations.find(l => String(l.ticket || '').trim().toLowerCase() === t.toLowerCase()) : null) || {};

            const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(t) : null;
            const supLatest = supData ? supData.latest : null;

            const sedVal = clean(targetRec.sed) || clean(supLatest ? supLatest.sed : '');
            const horaIniVal = clean(targetRec.hora_inicio || targetRec.fecha_inicio) || clean(supLatest ? supLatest.horaInicio : '');
            const aliVal = clean(targetRec.alimentador) || clean(supLatest ? supLatest.alimentador : '');
            const empVal = clean(targetRec.empresa) || clean(supLatest ? supLatest.empresa : '');

            const optEntry = {
                fecha: localTimestamp,
                ticket: t,
                sed: sedVal,
                horaInicio: horaIniVal,
                alimentador: aliVal,
                empresa: empVal,
                estadoOperativo: 'EN EJECUCION',
                detalleOperativo: '',
                jefeCuadrilla: jcVal || (supLatest ? clean(supLatest.jefeCuadrilla) : ''),
                jc: jcVal || (supLatest ? clean(supLatest.jefeCuadrilla) : ''),
                finEstimado: it.finEstimado || (supLatest ? clean(supLatest.finEstimado) : ''),
                estadoCritico: supLatest ? clean(supLatest.estadoCritico) : '',
                detalleCritico: supLatest ? clean(supLatest.detalleCritico) : '',
                estado: 'EN EJECUCION',
                detalle: '',
                usuario: 'PLUZ'
            };

            entries.push(optEntry);
            if (typeof addSupervisorLogOptimistic === 'function') {
                addSupervisorLogOptimistic(optEntry);
            }
        });

        if (typeof renderTdOmsTable === 'function' && typeof getFilteredTdOms === 'function') {
            renderTdOmsTable(getFilteredTdOms());
        }
        if (typeof setupMapMarkers === 'function') setupMapMarkers();
        else if (typeof renderMapMarkers === 'function') renderMapMarkers();

        if (btnSubmit) btnSubmit.disabled = true;
        if (spinner) spinner.style.display = 'inline-block';
        if (textEl) textEl.textContent = 'Sincronizando con Google Sheets...';
        if (alertEl) {
            alertEl.style.display = 'block';
            alertEl.style.background = '#eff6ff';
            alertEl.style.color = '#1e40af';
            alertEl.style.border = '1px solid #bfdbfe';
            alertEl.textContent = `⏳ Sincronizando ${entries.length} tickets con Google Sheets...`;
        }

        try {
            const userRole = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('oms_user_role') : 'admin';
            const resp = await fetch('/api/update-supervisor-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-role': userRole || 'admin'
                },
                body: JSON.stringify({
                    tickets: entries,
                    estadoOperativo: 'EN EJECUCION',
                    role: userRole || 'admin'
                })
            });

            const data = await resp.json();

            if (resp.ok && data.success) {
                if (alertEl) {
                    alertEl.style.background = '#ecfdf5';
                    alertEl.style.color = '#065f46';
                    alertEl.style.border = '1px solid #a7f3d0';
                    alertEl.textContent = `✅ ${data.message || `${entries.length} tickets guardados exitosamente.`}`;
                }
                if (typeof showAppNotification === 'function') {
                    showAppNotification(`Se registraron ${entries.length} tickets en EN EJECUCIÓN (PLUZ)`, 'success');
                }
                setTimeout(() => {
                    if (typeof closeBulkPluzModal === 'function') closeBulkPluzModal();
                }, 1200);
            } else {
                if (alertEl) {
                    alertEl.style.background = '#fef2f2';
                    alertEl.style.color = '#991b1b';
                    alertEl.style.border = '1px solid #fecaca';
                    alertEl.textContent = `⚠️ Guardado en memoria. Sincronización: ${data.message || 'Error desconocido'}`;
                }
            }
        } catch (err) {
            console.error('Error sincronizando lote:', err);
            if (alertEl) {
                alertEl.style.background = '#fef2f2';
                alertEl.style.color = '#991b1b';
                alertEl.style.border = '1px solid #fecaca';
                alertEl.textContent = `⚠️ Guardado en memoria. Error de red: ${err.message}`;
            }
        } finally {
            if (btnSubmit) btnSubmit.disabled = false;
            if (spinner) spinner.style.display = 'none';
            if (textEl) textEl.textContent = '🚀 Registrar en Supervisión PLUZ';
        }
    }

    return {
        getLimaTodayStr,
        parseDateTimeCandidate,
        parseBulkTicketsWithJc,
        parseBulkTickets,
        getSupervisorBadgeClass,
        getCriticoBadgeClass,
        postSupervisorStatus,
        saveSupervisorLog,
        executeBulkPluzEnEjecucion
    };
}));
