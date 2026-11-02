/**
 * OMS Map Popups & Tooltips Templates
 * Modular HTML templates for Incident and SED popups on Leaflet map.
 * UMD / Browser friendly.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.MapPopups = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.MapPopups = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
    'use strict';

    function getEscapeHtml() {
        if (typeof root !== 'undefined' && typeof root.escapeHtml === 'function') return root.escapeHtml;
        if (typeof root !== 'undefined' && root.DomUtils && typeof root.DomUtils.escapeHtml === 'function') return root.DomUtils.escapeHtml;
        if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') return window.escapeHtml;
        return (val) => String(val || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[c]));
    }

    /**
     * Construye el HTML del popup de incidencia (Ticket / ODM)
     * @param {Object} loc Objeto con datos de la incidencia
     * @returns {string} HTML sanitizado para Leaflet Popup
     */
    function renderIncidentPopup(loc) {
        if (!loc) return '';
        const escapeHtml = getEscapeHtml();

        const isAdmin = typeof isCurrentUserAdmin === 'function' 
            ? isCurrentUserAdmin() 
            : (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('oms_user_role') === 'admin');

        const stateClass = (typeof getOmsStatusClass === 'function') 
            ? getOmsStatusClass(loc.estado) 
            : String(loc.estado || '').toLowerCase();

        const numLlamadas = parseInt(loc.llamadas || 0, 10) || 0;
        const llamadasLabel = (loc.llamadas && loc.llamadas !== 'N/A') ? loc.llamadas : '0';

        const isSedCrit = isAdmin && (loc.es_top_critica || loc.es_sed_critica || loc.sed_reincidente);
        let sedBadgeHtml = '';
        if (isSedCrit) {
            const countTxt = loc.sed_count > 0 ? ` (7D: ${loc.sed_count}${loc.sed_reincidente ? ' 🚨' : ''})` : '';
            sedBadgeHtml = `<span style="font-size:10px; font-weight:bold; color:#b91c1c; background:#fee2e2; border:1px solid #fca5a5; padding:1px 6px; border-radius:4px;">🚨 CRÍTICA${countTxt}</span>`;
        } else if (loc.sed_count > 0) {
            sedBadgeHtml = `<span style="font-size:10px; font-weight:bold; color:#2b4791; background:#dbeafe; padding:1px 6px; border-radius:4px;">(7D: ${loc.sed_count} fallas)</span>`;
        }

        let supCardHtml = '';
        if (isAdmin) {
            const supData = (typeof getSupervisorDataForTicket === 'function') ? getSupervisorDataForTicket(loc.ticket) : null;
            if (supData && supData.latest) {
                const supLatest = supData.latest;
                const countHist = (supData.history && Array.isArray(supData.history)) ? supData.history.length : 1;
                const opEst = supLatest.estadoOperativo || supLatest.estado || 'PENDIENTE';
                const critEst = supLatest.estadoCritico || '';
                const opDet = supLatest.detalleOperativo || supLatest.detalle || '';
                const critDet = supLatest.detalleCritico || '';
                const bClass = (typeof getSupervisorBadgeClass === 'function') ? getSupervisorBadgeClass(opEst) : 'sup-status-generic';
                const cClass = (typeof getCriticoBadgeClass === 'function') ? getCriticoBadgeClass(critEst) : 'sup-status-normal';

                supCardHtml = `
                    <div style="margin-top: 8px; padding: 7px 9px; background: #f0f7ff; border: 1px solid #bae6fd; border-radius: 6px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; flex-wrap:wrap; gap:4px;">
                            <span style="font-weight:700; color:#0369a1; font-size:11px;">🛡️ Supervisión PLUZ</span>
                            <div style="display:flex; align-items:center; gap:4px;">
                                <span class="sup-status-badge ${bClass}" style="font-size:10px; padding:1px 6px;">${escapeHtml(opEst)}</span>
                                ${critEst ? `<span class="sup-status-badge ${cClass}" style="font-size:10px; padding:1px 6px;">${escapeHtml(critEst)}</span>` : ''}
                            </div>
                        </div>
                        ${opDet ? `<div style="font-size:11px; color:#334155; margin-bottom:3px; line-height:1.3; font-style:italic;"><b>Op:</b> "${escapeHtml(opDet)}"</div>` : ''}
                        ${critDet ? `<div style="font-size:11px; color:#9d174d; margin-bottom:4px; line-height:1.3; font-style:italic;"><b>Crit:</b> "${escapeHtml(critDet)}"</div>` : ''}
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#64748b;">
                            <span>🕒 ${escapeHtml(supLatest.fecha || '')}</span>
                            <button type="button" onclick="openSupervisorModal('${escapeHtml(loc.ticket)}')" style="border:none; background:none; color:#0284c7; font-weight:700; cursor:pointer; text-decoration:underline; padding:0;">Historial (${countHist}) / ✏️ Editar</button>
                        </div>
                    </div>
                `;
            } else {
                supCardHtml = `
                    <div style="margin-top: 8px; padding: 6px 8px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; color:#64748b;">🛡️ Sin notas PLUZ</span>
                        <button type="button" onclick="openSupervisorModal('${escapeHtml(loc.ticket)}')" style="background:#0284c7; color:white; border:none; border-radius:4px; padding:3px 8px; font-size:10px; font-weight:700; cursor:pointer;">➕ Reportar Novedad</button>
                    </div>
                `;
            }
        }

        const sla = loc.sla || { statusClass: '', elapsed: '0', maxHours: '0', label: 'Sin SLA' };

        return `
            <div style="font-family: Arial, sans-serif; font-size: 12px; min-width: 265px; line-height: 1.5;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #3c5a9f; padding-bottom:4px; margin-bottom:6px;">
                    <h4 style="margin:0; color:#3c5a9f; font-size:13px; font-weight:700;">${loc.emoji || '⚡'} Ticket: ${escapeHtml(loc.ticket)}</h4>
                    <span class="status-badge ${stateClass}">${escapeHtml(loc.estado)}</span>
                </div>
                <div class="popup-sla-banner ${sla.statusClass}">
                    <span>⏱️ <b>${sla.elapsed}h / ${sla.maxHours}h</b></span>
                    <span>${escapeHtml(sla.label)}</span>
                </div>
                <b>ODM:</b> ${escapeHtml(loc.odm)}<br>
                <b>Empresa:</b> ${escapeHtml(loc.empresa)}<br>
                <b>Falla:</b> ${escapeHtml(loc.falla)}<br>
                <b>SED Llave:</b> ${escapeHtml(loc.sed)} ${sedBadgeHtml}<br>
                <b>Alimentador:</b> ${escapeHtml(loc.alimentador || 'N/A')}<br>
                <b>Suministro:</b> ${escapeHtml(loc.suministro)} ${loc.suministro_count > 0 ? `<span style="font-size:10px; font-weight:bold; color:#0d9488; background:#ccfbf1; padding:1px 6px; border-radius:4px;">(7D: ${loc.suministro_count} fallas)</span>` : ''}<br>
                <b>Llamadas:</b> ${escapeHtml(llamadasLabel)} ${numLlamadas >= 7 ? `<span style="font-size:10px; font-weight:bold; color:#be123c; background:#ffe4e6; border:1px solid #fecdd3; padding:1px 6px; border-radius:4px;">📞 ≥7 LLAMADAS</span>` : ''}<br>
                <b>Fecha Inicio:</b> ${escapeHtml(loc.fecha_inicio)}<br>
                <b>Dirección:</b> ${escapeHtml(loc.direccion)}<br>
                <b>Distrito:</b> ${escapeHtml(loc.distrito)}
                ${supCardHtml}
                <div style="margin-top: 10px; display: flex; gap: 6px; justify-content: center; align-items: center; flex-wrap: wrap;">
                    ${(isAdmin && (loc.es_sed_critica || loc.es_top_critica)) ? `
                    <button type="button" onclick="openCriticalSedPanel('${escapeHtml(loc.sed)}')" style="
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        background-color: #dc2626;
                        color: white;
                        border: none;
                        padding: 6px 12px;
                        font-weight: 700;
                        border-radius: 6px;
                        font-size: 11px;
                        cursor: pointer;
                        box-shadow: 0 2px 5px rgba(220,38,38,0.4);
                    ">🔥 Ver Historial & Análisis</button>` : ''}
                    <a href="https://www.google.com/maps?q=${loc.lat},${loc.lon}" target="_blank" title="Ver Punto en Google Maps" style="
                        display: inline-block;
                        background-color: #6cab5e;
                        color: white;
                        text-decoration: none;
                        padding: 6px 12px;
                        font-weight: bold;
                        border-radius: 6px;
                        font-size: 11px;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    ">📍 Google Maps</a>
                    <a href="https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lon}" target="_blank" title="Trazar Ruta en Google Maps" style="
                        display: inline-block;
                        background-color: #3c5a9f;
                        color: white;
                        text-decoration: none;
                        padding: 6px 12px;
                        font-weight: bold;
                        border-radius: 6px;
                        font-size: 13px;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    ">🚗</a>
                </div>
            </div>
        `;
    }

    /**
     * Construye el HTML del icono para el marcador de incidencia
     * @param {Object} loc Datos de la incidencia
     * @returns {string} HTML del badge de marcador
     */
    function renderIncidentIcon(loc) {
        if (!loc) return '';
        const escapeHtml = getEscapeHtml();
        const stateClass = (typeof getOmsStatusClass === 'function') 
            ? getOmsStatusClass(loc.estado) 
            : String(loc.estado || '').toLowerCase();
        const isExecution = stateClass === 'ejecucion';
        const sla = loc.sla || { statusClass: '', label: '' };
        const faultIconHtml = (typeof getFaultIconHtml === 'function') 
            ? getFaultIconHtml(loc.falla) 
            : '⚡';

        return `
            <div class="marker-sla-badge ${sla.statusClass}${isExecution ? ' is-execution' : ''}${loc.es_top_critica ? ' is-sed-critica-pulse' : ''}" title="Ticket: ${escapeHtml(loc.ticket)} | ${escapeHtml(loc.falla)} | Plazo: ${escapeHtml(sla.label)}">
                ${isExecution ? '<span class="marker-vehicle-backdrop" aria-hidden="true">🚚</span>' : ''}
                <span class="marker-fault-icon">${faultIconHtml}</span>
            </div>
        `;
    }

    /**
     * Construye el HTML del popup de perímetro / nube SED
     * @param {Object} sedData Datos agregados de la SED
     * @returns {string} HTML sanitizado para Leaflet Popup de la SED
     */
    function renderSedPopup(sedData) {
        if (!sedData) return '';
        const escapeHtml = getEscapeHtml();
        const strokeColor = sedData.strokeColor || '#6d5bd0';
        const tickets = Array.isArray(sedData.tickets) ? sedData.tickets : [];
        const count = sedData.count || tickets.length;
        const isCritical = Boolean(sedData.es_critica || sedData.sed_reincidente || (sedData.sed_count > 2));

        return `
            <div style="font-family: Arial, sans-serif; font-size: 12px; min-width: 230px; line-height: 1.4;">
                <div style="border-bottom: 2px solid ${strokeColor}; padding-bottom: 4px; margin-bottom: 6px;">
                    <h4 style="margin:0; color: ${strokeColor}; font-size: 13px; font-weight: 700;">
                        📐 Zona aproximada SED: ${escapeHtml(sedData.sed)}
                    </h4>
                </div>
                <b>Tickets activos:</b> ${count}<br>
                <b>Alimentador:</b> ${escapeHtml(sedData.alimentador || 'N/A')}<br>
                <b>Empresa:</b> ${escapeHtml(sedData.empresa || 'N/A')}<br>
                ${isCritical ? `<div style="margin-top:4px; font-size:10.5px; font-weight:bold; color:#b91c1c; background:#fee2e2; padding:2px 6px; border-radius:4px; border:1px solid #fca5a5;">🚨 SED CRÍTICA / REINCIDENTE (${sedData.sed_count || 0} fallas en 7D)</div>` : ''}
                <div style="margin-top: 6px; border-top: 1px solid #e2e8f0; padding-top: 4px; max-height: 120px; overflow-y: auto;">
                    <b>Tickets:</b>
                    <ul style="margin: 2px 0; padding-left: 16px; font-size: 11px;">
                        ${tickets.map(t => `<li>Ticket <b>${escapeHtml(t.ticket)}</b> - ${escapeHtml(t.falla)} (${escapeHtml(t.sla ? t.sla.label : '')})</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
    }

    return {
        renderIncidentPopup,
        renderIncidentIcon,
        renderSedPopup,
        escapeHtml: getEscapeHtml()
    };
}));
