/**
 * Modals Manager - Gestión de Modales de Supervisión y Carga Masiva
 * Controla apertura, cierre, sincronización de vista previa y eventos del
 * modal individual de supervisión y del modal de actualización masiva PLUZ.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.ModalsManager = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.ModalsManager = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {

    let currentSupervisorTicket = null;

    function getCurrentSupervisorTicket() {
        return currentSupervisorTicket;
    }

    function setCurrentSupervisorTicket(t) {
        currentSupervisorTicket = t;
    }

    /**
     * Resalta el chip de estado operativo seleccionado
     */
    function updateSupervisorOperativoChipSelection(selectedState) {
        if (typeof document === 'undefined') return;
        const chips = document.querySelectorAll("#supQuickOperativoChips .sup-chip-btn");
        const clean = String(selectedState || '').trim().toUpperCase();
        chips.forEach(btn => {
            const val = String(btn.getAttribute("data-val") || '').trim().toUpperCase();
            const isMatch = val && (
                clean === val ||
                (val === 'C. CAMPO' && (clean === 'C.CAMPO' || clean === 'C. CAMPO' || clean.includes('CERRADO') || clean.includes('CAMPO')))
            );
            if (isMatch) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    }

    /**
     * Resalta el chip de criticidad seleccionado
     */
    function updateSupervisorCriticoChipSelection(selectedState) {
        if (typeof document === 'undefined') return;
        const chips = document.querySelectorAll("#supQuickCriticoChips .sup-chip-btn");
        const clean = String(selectedState || '').trim().toUpperCase();
        chips.forEach(btn => {
            const val = String(btn.getAttribute("data-val") || '').trim().toUpperCase();
            if (clean === val) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
    }

    /**
     * Renderiza la línea de tiempo de novedades registradas para un ticket
     */
    function renderSupervisorTimeline(ticket) {
        if (typeof document === 'undefined') return;
        const container = document.getElementById("supTimelineContainer");
        const countEl = document.getElementById("supTimelineCount");
        if (!container) return;

        const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(ticket) : null;
        const history = (supData && Array.isArray(supData.history)) ? supData.history : [];

        if (countEl) countEl.textContent = history.length;

        const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]));
        const getBadgeClass = (typeof getSupervisorBadgeClass === 'function') ? getSupervisorBadgeClass : (typeof SupervisorService !== 'undefined' ? SupervisorService.getSupervisorBadgeClass : () => 'sup-status-generic');
        const getCritBadge = (typeof getCriticoBadgeClass === 'function') ? getCriticoBadgeClass : (typeof SupervisorService !== 'undefined' ? SupervisorService.getCriticoBadgeClass : () => 'sup-status-normal');
        const fmtShort = (typeof formatShortDate === 'function') ? formatShortDate : (v => v);

        if (history.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 25px 12px; color: #94a3b8; font-size: 11px; background: #fff; border-radius: 6px; border: 1px dashed #cbd5e1;">
                    🛡️ Aún no hay registros de supervisión para el ticket #${esc(ticket)}.<br>
                    Selecciona un estado y escribe una novedad arriba para comenzar la bitácora.
                </div>
            `;
            return;
        }

        const clean = (typeof cleanSupVal === 'function') ? cleanSupVal : (v => (!v || /^n\/?a$/i.test(String(v).trim()) || String(v).trim() === '--' || String(v).trim() === 'null') ? '' : String(v).trim());

        container.innerHTML = history.map(entry => {
            const opEst = clean(entry.estadoOperativo || entry.estado) || 'PENDIENTE';
            const critEst = clean(entry.estadoCritico);
            const opBadgeClass = getBadgeClass(opEst);
            const critBadgeClass = critEst ? getCritBadge(critEst) : '';
            const jcVal = clean(entry.jefeCuadrilla);
            const opDet = clean(entry.detalleOperativo || entry.detalle);
            const critDet = clean(entry.detalleCritico);

            let cardModifier = '';
            const opNorm = String(opEst).toLowerCase();
            const critNorm = String(critEst).toLowerCase();
            if (critNorm.includes('crit')) cardModifier = 'is-critico';
            else if (critNorm.includes('quant')) cardModifier = 'is-quantico';
            else if (critNorm.includes('vencid')) cardModifier = 'is-vencido';
            else if (opNorm.includes('impedid')) cardModifier = 'is-impedido';
            else if (opNorm.includes('derivad')) cardModifier = 'is-derivado';
            else if (opNorm.includes('ejecuc')) cardModifier = 'is-en-ejecucion';
            else if (opNorm.includes('camino')) cardModifier = 'is-en-camino';
            else if (opNorm.includes('normaliz') || opNorm.includes('cerrad') || opNorm.includes('campo')) cardModifier = 'is-normalizado';

            return `
                <div class="sup-timeline-card ${cardModifier}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 4px;">
                            <span class="sup-status-badge ${opBadgeClass}">⚙️ ${esc(opEst)}</span>
                            ${critEst ? `<span class="sup-status-badge ${critBadgeClass}">⚡ ${esc(critEst)}</span>` : ''}
                        </div>
                        <span style="font-size: 10px; color: #64748b; font-weight: 600;">🕒 ${esc(entry.fecha || '')}</span>
                    </div>
                    ${jcVal ? `
                        <div style="font-size: 11px; color: #0f172a; margin-bottom: 3px; font-weight: 700;">
                            JC: <span style="font-weight: 600; color: #1e293b;">${esc(jcVal)}</span>
                        </div>
                    ` : ''}
                    ${entry.finEstimado ? `
                        <div style="font-size: 10.5px; color: #b45309; margin-bottom: 3px; font-weight: 600;">
                            ⏱️ Fin Estimado: <span>${esc(fmtShort(entry.finEstimado) || entry.finEstimado)}</span>
                        </div>
                    ` : ''}
                    ${opDet ? `
                        <div style="font-size: 11px; color: #1e293b; line-height: 1.35; margin-bottom: 4px;">
                            <b>Operativo:</b> ${esc(opDet)}
                        </div>
                    ` : ''}
                    ${critDet ? `
                        <div style="font-size: 11px; color: #9d174d; line-height: 1.35; margin-bottom: 4px;">
                            <b>Criticidad:</b> ${esc(critDet)}
                        </div>
                    ` : ''}
                    <div style="font-size: 9.5px; color: #94a3b8; text-align: right;">
                        Registrado por: <b>${esc(entry.usuario || 'PLUZ')}</b>
                    </div>
                </div>
            `;
        }).join("");
    }

    /**
     * Abre el modal de supervisión individual para un ticket
     */
    function openSupervisorModal(ticket) {
        if (typeof isCurrentUserAdmin === 'function' && !isCurrentUserAdmin()) return;
        const cleanTicket = String(ticket || '').trim();
        if (!cleanTicket) return;

        currentSupervisorTicket = cleanTicket;
        if (typeof globalThis !== 'undefined') globalThis.currentSupervisorTicket = cleanTicket;
        if (typeof window !== 'undefined') window.currentSupervisorTicket = cleanTicket;

        const rec = (typeof tdOmsRecords !== 'undefined' && Array.isArray(tdOmsRecords) ? tdOmsRecords.find(r => String(r.ticket || '').trim().toLowerCase() === cleanTicket.toLowerCase()) : null) ||
                    (typeof mapLocations !== 'undefined' && Array.isArray(mapLocations) ? mapLocations.find(l => String(l.ticket || '').trim().toLowerCase() === cleanTicket.toLowerCase()) : null) || {};

        if (typeof document === 'undefined') return;

        const modal = document.getElementById("supervisorModalOverlay");
        const tNum = document.getElementById("supModalTicketNum");
        const bEmp = document.getElementById("supModalBadgeEmpresa");
        const bEst = document.getElementById("supModalBadgeEstadoOms");
        const sSed = document.getElementById("supModalSed");
        const sAli = document.getElementById("supModalAlimentador");
        const sFal = document.getElementById("supModalFalla");
        
        const inJc = document.getElementById("supInputJefeCuadrilla");
        const inFinEst = document.getElementById("supInputFinEstimado");
        const inEstOp = document.getElementById("supInputEstadoOperativo");
        const inDetOp = document.getElementById("supInputDetalleOperativo");
        const inEstCrit = document.getElementById("supInputEstadoCritico");
        const inDetCrit = document.getElementById("supInputDetalleCritico");
        const feedback = document.getElementById("supSaveFeedback");

        const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(cleanTicket) : null;
        const supLatest = supData ? supData.latest : null;
        const clean = (typeof cleanSupVal === 'function') ? cleanSupVal : (v => (!v || /^n\/?a$/i.test(String(v).trim()) || String(v).trim() === '--' || String(v).trim() === 'null') ? '' : String(v).trim());
        const esc = (typeof escapeHtml === 'function') ? escapeHtml : (s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]));
        const getBadgeClass = (typeof getSupervisorBadgeClass === 'function') ? getSupervisorBadgeClass : (typeof SupervisorService !== 'undefined' ? SupervisorService.getSupervisorBadgeClass : () => 'sup-status-generic');
        const getCritBadge = (typeof getCriticoBadgeClass === 'function') ? getCriticoBadgeClass : (typeof SupervisorService !== 'undefined' ? SupervisorService.getCriticoBadgeClass : () => 'sup-status-normal');

        if (tNum) tNum.textContent = cleanTicket;
        if (bEmp) bEmp.textContent = clean(rec.empresa) || clean(supLatest ? supLatest.empresa : '') || 'N/A';
        if (bEst) bEst.textContent = clean(rec.estado) || (supLatest ? clean(supLatest.estadoOperativo || supLatest.estado) : '') || 'PENDIENTE';
        if (sSed) sSed.textContent = clean(rec.sed) || clean(supLatest ? supLatest.sed : '') || 'N/A';
        if (sAli) sAli.textContent = clean(rec.alimentador) || clean(supLatest ? supLatest.alimentador : '') || 'N/A';
        if (sFal) sFal.textContent = clean(rec.falla) || 'Sin falla especificada';

        if (feedback) feedback.style.display = 'none';
        const fmtDateTimeLocal = (typeof formatForDateTimeLocal === 'function') ? formatForDateTimeLocal : (v => v);
        if (inFinEst) inFinEst.value = (supLatest && supLatest.finEstimado) ? fmtDateTimeLocal(supLatest.finEstimado) : '';

        // Hero Card
        const heroEl = document.getElementById("supHeroLatestContainer");
        if (heroEl) {
            if (supLatest) {
                const opEst = clean(supLatest.estadoOperativo || supLatest.estado) || 'PENDIENTE';
                const critEst = clean(supLatest.estadoCritico);
                const opBadgeClass = getBadgeClass(opEst);
                const critBadgeClass = critEst ? getCritBadge(critEst) : '';
                const jcVal = clean(supLatest.jefeCuadrilla);
                const opDet = clean(supLatest.detalleOperativo || supLatest.detalle);
                const critDet = clean(supLatest.detalleCritico);

                let borderClass = 'is-en-ejecucion';
                const critNorm = String(critEst).toLowerCase();
                const opNorm = String(opEst).toLowerCase();
                if (critNorm.includes('crit')) borderClass = 'has-critico';
                else if (critNorm.includes('quant')) borderClass = 'has-quantico';
                else if (critNorm.includes('vencid')) borderClass = 'has-vencido';
                else if (opNorm.includes('impedid')) borderClass = 'has-impedido';
                else if (opNorm.includes('normaliz') || opNorm.includes('cerrad') || opNorm.includes('campo')) borderClass = 'has-normalizado';

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
                        ${supLatest && supLatest.finEstimado ? (() => {
                            const fInfo = (typeof getSupervisorFinEstimadoInfo === 'function') ? getSupervisorFinEstimadoInfo(rec) : null;
                            if (!fInfo) return `<div style="font-size: 11px; color: #b45309; margin-bottom: 4px; font-weight: 600;">⏱️ Fin Estimado: ${esc(supLatest.finEstimado)}</div>`;
                            return fInfo.isOverdue ? `
                                <div style="font-size: 11px; color: #92400e; margin-bottom: 4px; font-weight: 700; background: #fef3c7; padding: 3px 8px; border-radius: 4px; border: 1px solid #fde68a; display: inline-flex; align-items: center; gap: 4px;">
                                    <span>⚠️</span>
                                    <span>Fin Estimado VENCIDO: <b>${esc(fInfo.fullLabel)}</b> (${esc(fInfo.timeLabel)})</span>
                                </div>
                            ` : `
                                <div style="font-size: 11px; color: #0369a1; margin-bottom: 4px; font-weight: 600;">
                                    ⏱️ Fin Estimado: <b>${esc(fInfo.fullLabel)}</b>
                                </div>
                            `;
                        })() : ''}
                        ${opDet ? `<div style="font-size: 11px; color: #334155; line-height: 1.35; margin-bottom: 3px;"><b>Operativo:</b> ${esc(opDet)}</div>` : ''}
                        ${critDet ? `<div style="font-size: 11px; color: #9d174d; line-height: 1.35;"><b>Criticidad:</b> ${esc(critDet)}</div>` : ''}
                    </div>
                `;
                heroEl.style.display = "block";
            } else {
                heroEl.style.display = "none";
            }
        }

        if (inJc) inJc.value = clean(supLatest ? supLatest.jefeCuadrilla : '');
        if (inEstOp) inEstOp.value = clean(supLatest ? (supLatest.estadoOperativo || supLatest.estado) : '') || 'PENDIENTE';
        if (inDetOp) inDetOp.value = '';
        if (inEstCrit) inEstCrit.value = clean(supLatest ? supLatest.estadoCritico : '');
        if (inDetCrit) inDetCrit.value = clean(supLatest ? supLatest.detalleCritico : '');

        updateSupervisorOperativoChipSelection(inEstOp ? inEstOp.value : '');
        updateSupervisorCriticoChipSelection(inEstCrit ? inEstCrit.value : '');
        renderSupervisorTimeline(cleanTicket);

        if (modal) {
            modal.style.display = "flex";
            setTimeout(() => {
                if (inDetOp) inDetOp.focus();
            }, 100);
        }
    }

    /**
     * Cierra el modal de supervisión individual
     */
    function closeSupervisorModal() {
        if (typeof document !== 'undefined') {
            const modal = document.getElementById("supervisorModalOverlay");
            if (modal) modal.style.display = "none";
        }
        currentSupervisorTicket = null;
        if (typeof globalThis !== 'undefined') globalThis.currentSupervisorTicket = null;
        if (typeof window !== 'undefined') window.currentSupervisorTicket = null;
    }

    /**
     * Marca el chip de estado operativo seleccionado en el modal masivo de PLUZ
     */
    function setBulkPluzSelectedEstado(estadoVal = 'EN EJECUCION') {
        if (typeof document === 'undefined') return;
        const container = document.getElementById('bulkPluzEstadoChips');
        if (!container) return;
        const target = String(estadoVal || 'EN EJECUCION').trim().toUpperCase();
        const btns = container.querySelectorAll('.sup-chip-btn');
        btns.forEach(btn => {
            const val = String(btn.getAttribute('data-val') || '').trim().toUpperCase();
            const isMatch = val === target;
            btn.classList.toggle('active', isMatch);
            btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
        });
    }

    /**
     * Abre el modal masivo de PLUZ
     */
    function openBulkPluzModal() {
        if (typeof isCurrentUserAdmin === 'function' && !isCurrentUserAdmin()) return;
        if (typeof document === 'undefined') return;
        const modal = document.getElementById('bulkPluzModalOverlay');
        if (!modal) return;

        const inputTickets = document.getElementById('bulkPluzTicketsInput');
        const alertEl = document.getElementById('bulkPluzAlert');
        const previewContainer = document.getElementById('bulkPluzPreviewContainer');
        const previewList = document.getElementById('bulkPluzPreviewList');

        if (inputTickets) inputTickets.value = '';
        if (previewList) previewList.innerHTML = '';
        if (previewContainer) previewContainer.style.display = 'none';
        if (alertEl) {
            alertEl.style.display = 'none';
            alertEl.textContent = '';
        }

        setBulkPluzSelectedEstado('EN EJECUCION');
        updateBulkPluzCounter();
        modal.style.display = 'flex';
        if (inputTickets) {
            setTimeout(() => inputTickets.focus(), 80);
        }
    }

    /**
     * Cierra el modal masivo de PLUZ
     */
    function closeBulkPluzModal() {
        if (typeof document === 'undefined') return;
        const modal = document.getElementById('bulkPluzModalOverlay');
        if (modal) modal.style.display = 'none';
    }

    /**
     * Actualiza el contador y vista previa de tickets pegados en el modal masivo
     */
    function updateBulkPluzCounter() {
        if (typeof document === 'undefined') return;
        const inputTickets = document.getElementById('bulkPluzTicketsInput');
        const countEl = document.getElementById('bulkPluzDetectionCount');
        const matchedEl = document.getElementById('bulkPluzMatchedCount');
        const previewContainer = document.getElementById('bulkPluzPreviewContainer');
        const previewList = document.getElementById('bulkPluzPreviewList');
        const previewSummary = document.getElementById('bulkPluzPreviewSummary');
        if (!countEl) return;

        const raw = inputTickets ? inputTickets.value : '';
        const parseBulkWithJc = (typeof parseBulkTicketsWithJc === 'function')
            ? parseBulkTicketsWithJc
            : (typeof SupervisorService !== 'undefined' ? SupervisorService.parseBulkTicketsWithJc : () => []);
        const getLimaToday = (typeof getLimaTodayStr === 'function')
            ? getLimaTodayStr
            : (typeof SupervisorService !== 'undefined' ? SupervisorService.getLimaTodayStr : () => '');

        const items = parseBulkWithJc(raw);
        const total = items.length;

        const activeSet = new Set();
        if (typeof tdOmsRecords !== 'undefined' && Array.isArray(tdOmsRecords)) {
            tdOmsRecords.forEach(r => {
                const tk = String(r.ticket || '').trim().toLowerCase();
                if (tk) activeSet.add(tk);
            });
        }

        let matched = 0;
        let assignedJcCount = 0;
        let assignedFinCount = 0;
        items.forEach(it => {
            if (activeSet.has(it.ticket.toLowerCase())) matched++;
            if (it.jc) assignedJcCount++;
            if (it.finEstimado) assignedFinCount++;
        });

        let details = [];
        if (assignedJcCount > 0) details.push(`${assignedJcCount} con JC`);
        if (assignedFinCount > 0) details.push(`${assignedFinCount} con Hora Límite`);
        const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';

        countEl.textContent = `🔍 ${total} ticket${total === 1 ? '' : 's'} detectado${total === 1 ? '' : 's'}${detailStr}`;
        if (matchedEl) {
            matchedEl.textContent = `(${matched} activo${matched === 1 ? '' : 's'} en OMS)`;
        }

        if (previewContainer && previewList) {
            if (total === 0) {
                previewContainer.style.display = 'none';
                previewList.innerHTML = '';
            } else {
                previewContainer.style.display = 'block';
                if (previewSummary) {
                    previewSummary.textContent = `${total} total | ${assignedJcCount} con JC | ${assignedFinCount} con Hora Límite | ${matched} en OMS`;
                }
                const limaToday = getLimaToday();
                previewList.innerHTML = items.map(it => {
                    const inOms = activeSet.has(it.ticket.toLowerCase());
                    const omsBadge = inOms
                        ? `<span style="display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 3px; padding: 0 4px; font-size: 9px; font-weight: 700;">OMS ✓</span>`
                        : `<span style="display: inline-block; background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; border-radius: 3px; padding: 0 4px; font-size: 9px;">no en vista</span>`;
                    const jcBadge = it.jc
                        ? `<span style="font-weight: 700; color: #0369a1; background: #e0f2fe; padding: 2px 6px; border-radius: 4px; border: 1px solid #bae6fd; font-size: 10px;">👷 ${it.jc}</span>`
                        : `<span style="font-style: italic; color: #94a3b8; font-size: 10px;">(Sin JC)</span>`;
                    
                    let finBadge = `<span style="font-style: italic; color: #94a3b8; font-size: 10px;">(Sin hora límite)</span>`;
                    if (it.finEstimado) {
                        let displayTime = '';
                        if (it.finEstimado.startsWith(limaToday)) {
                            displayTime = it.finEstimado.slice(11, 16);
                        } else {
                            const parts = it.finEstimado.split(' ');
                            const dateParts = (parts[0] || '').split('-');
                            const timePart = parts[1] || '';
                            if (dateParts.length === 3) {
                                displayTime = `${dateParts[2]}/${dateParts[1]} ${timePart.slice(0, 5)}`;
                            } else {
                                displayTime = it.finEstimado;
                            }
                        }
                        finBadge = `<span style="color: #b45309; background: #fef3c7; border: 1px solid #fde68a; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;">⏱️ Fin Est: ${displayTime}</span>`;
                    }

                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0; gap: 8px;">
                            <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                                <span style="font-weight: 700; color: #1e293b; font-family: monospace;">#${it.ticket}</span>
                                ${omsBadge}
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: flex-end;">
                                ${jcBadge}
                                ${finBadge}
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    /**
     * Vincula listeners de eventos de modales
     */
    function initSupervisorModalEvents() {
        if (typeof document === 'undefined') return;

        const btnClose = document.getElementById("btnCloseSupervisorModal");
        const modal = document.getElementById("supervisorModalOverlay");
        const btnSave = document.getElementById("btnSaveSupervisorLog");
        const inEstOp = document.getElementById("supInputEstadoOperativo");
        const inDetOp = document.getElementById("supInputDetalleOperativo");
        const inEstCrit = document.getElementById("supInputEstadoCritico");
        const inDetCrit = document.getElementById("supInputDetalleCritico");

        if (btnClose) {
            btnClose.onclick = closeSupervisorModal;
        }

        if (modal) {
            modal.onclick = (e) => {
                if (e.target === modal) closeSupervisorModal();
            };
        }

        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('keydown', (e) => {
                const mBulk = document.getElementById('bulkPluzModalOverlay');
                if (e.key === 'Escape' && mBulk && mBulk.style.display !== 'none') {
                    closeBulkPluzModal();
                }
                if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
                    closeSupervisorModal();
                }
            });
        }

        if (btnSave) {
            btnSave.onclick = () => {
                if (typeof saveSupervisorLog === 'function') saveSupervisorLog();
                else if (typeof SupervisorService !== 'undefined' && SupervisorService.saveSupervisorLog) SupervisorService.saveSupervisorLog();
            };
        }

        [inDetOp, inDetCrit].forEach(el => {
            if (el) {
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        if (typeof saveSupervisorLog === 'function') saveSupervisorLog();
                        else if (typeof SupervisorService !== 'undefined' && SupervisorService.saveSupervisorLog) SupervisorService.saveSupervisorLog();
                    }
                });
            }
        });

        // Chips de Estado Operativo
        const opChips = document.querySelectorAll("#supQuickOperativoChips .sup-chip-btn");
        opChips.forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.getAttribute("data-val") || "";
                if (inEstOp) inEstOp.value = val;
                updateSupervisorOperativoChipSelection(val);
            });
        });

        if (inEstOp) {
            inEstOp.addEventListener('input', () => {
                updateSupervisorOperativoChipSelection(inEstOp.value);
            });
        }

        // Chips de Criticidad
        const critChips = document.querySelectorAll("#supQuickCriticoChips .sup-chip-btn");
        critChips.forEach(btn => {
            btn.addEventListener('click', () => {
                const val = btn.getAttribute("data-val") || "";
                if (inEstCrit) inEstCrit.value = val;
                updateSupervisorCriticoChipSelection(val);
            });
        });

        if (inEstCrit) {
            inEstCrit.addEventListener('input', () => {
                updateSupervisorCriticoChipSelection(inEstCrit.value);
            });
        }

        // Checkbox Filtro Quántico / Crítico en la barra superior
        const chkQC = document.getElementById("checkFilterQuanticoCritico");
        if (chkQC) {
            chkQC.addEventListener('change', () => {
                if (typeof refreshDashboard === 'function') refreshDashboard();
            });
        }

        // Botón Exportar Tabla Filtrada
        const btnExpTable = document.getElementById("btnExportFilteredTable");
        if (btnExpTable) {
            btnExpTable.addEventListener('click', () => {
                if (typeof exportFilteredTdOmsTable === 'function') exportFilteredTdOmsTable();
            });
        }

        // Eventos para el Modal Masivo de PLUZ
        const btnOpenBulk = document.getElementById('btnOpenBulkPluzEnEjecucion');
        const btnCloseBulk = document.getElementById('btnCloseBulkPluzModal');
        const btnCancelBulk = document.getElementById('btnCancelBulkPluzModal');
        const modalBulk = document.getElementById('bulkPluzModalOverlay');
        const inputBulkTickets = document.getElementById('bulkPluzTicketsInput');
        const btnSubmitBulk = document.getElementById('btnSubmitBulkPluz');
        const bulkEstadoChips = document.getElementById('bulkPluzEstadoChips');

        if (btnOpenBulk) btnOpenBulk.addEventListener('click', openBulkPluzModal);
        if (btnCloseBulk) btnCloseBulk.addEventListener('click', closeBulkPluzModal);
        if (btnCancelBulk) btnCancelBulk.addEventListener('click', closeBulkPluzModal);
        if (modalBulk) {
            modalBulk.addEventListener('click', (e) => {
                if (e.target === modalBulk) closeBulkPluzModal();
            });
        }
        if (bulkEstadoChips) {
            bulkEstadoChips.addEventListener('click', (e) => {
                const btn = e.target.closest('.sup-chip-btn');
                if (!btn) return;
                setBulkPluzSelectedEstado(btn.getAttribute('data-val'));
            });
        }
        if (inputBulkTickets) {
            inputBulkTickets.addEventListener('input', updateBulkPluzCounter);
            inputBulkTickets.addEventListener('paste', () => setTimeout(updateBulkPluzCounter, 50));
        }
        if (btnSubmitBulk) {
            btnSubmitBulk.addEventListener('click', () => {
                if (typeof executeBulkPluzEnEjecucion === 'function') executeBulkPluzEnEjecucion();
                else if (typeof SupervisorService !== 'undefined' && SupervisorService.executeBulkPluzEnEjecucion) SupervisorService.executeBulkPluzEnEjecucion();
            });
        }
    }

    return {
        openSupervisorModal,
        closeSupervisorModal,
        openBulkPluzModal,
        closeBulkPluzModal,
        setBulkPluzSelectedEstado,
        updateSupervisorOperativoChipSelection,
        updateSupervisorCriticoChipSelection,
        renderSupervisorTimeline,
        updateBulkPluzCounter,
        initSupervisorModalEvents,
        getCurrentSupervisorTicket,
        setCurrentSupervisorTicket
    };
}));
