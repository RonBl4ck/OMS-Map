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

    function cleanSupText(val) {
        const s = String(val ?? '').trim();
        if (!s || /^n\/?a$/i.test(s) || s === '-' || s === '--' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') {
            return '';
        }
        return s;
    }

    /**
     * Convierte una coordenada decimal a formato sexagesimal (DMS), ej: 11°53'43.5"S
     */
    function decimalToDms(value, posHemisphere, negHemisphere) {
        const num = Number(value);
        if (!Number.isFinite(num)) return '';
        const hemisphere = num >= 0 ? posHemisphere : negHemisphere;
        const abs = Math.abs(num);
        let deg = Math.floor(abs);
        const minFloat = (abs - deg) * 60;
        let min = Math.floor(minFloat);
        let sec = Math.round((minFloat - min) * 600) / 10;

        if (sec >= 60) {
            sec = 0;
            min += 1;
        }
        if (min >= 60) {
            min = 0;
            deg += 1;
        }

        const minStr = String(min).padStart(2, '0');
        const secWhole = Math.floor(sec);
        const secFrac = Math.round((sec - secWhole) * 10);
        const secStr = `${String(secWhole).padStart(2, '0')}.${secFrac}`;
        return `${deg}°${minStr}'${secStr}"${hemisphere}`;
    }

    /**
     * Formatea latitud y longitud a DMS estándar: 11°53'43.5"S 77°01'17.4"W
     */
    function formatCoordsDms(lat, lon) {
        const latNum = Number(lat);
        const lonNum = Number(lon);
        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return '';
        return `${decimalToDms(latNum, 'N', 'S')} ${decimalToDms(lonNum, 'E', 'W')}`;
    }

    /**
     * Resuelve estado, detalles y Jefe de Cuadrilla (JC) desde los registros de Supervisión PLUZ
     */
    function resolveSupervisorContext(ticket, supDataOverride) {
        const supData = supDataOverride !== undefined
            ? supDataOverride
            : (typeof getSupervisorDataForTicket === 'function' ? getSupervisorDataForTicket(ticket) : null);

        if (!supData || !supData.latest) {
            return {
                hasData: false,
                countHist: 0,
                fecha: '',
                opEst: '',
                critEst: '',
                opDet: '',
                critDet: '',
                jefeCuadrilla: '',
                finEstimado: ''
            };
        }

        const latest = supData.latest;
        const history = Array.isArray(supData.history) ? supData.history : [latest];
        const opEst = cleanSupText(latest.estadoOperativo || latest.estado);
        const critEst = cleanSupText(latest.estadoCritico);
        const opDet = cleanSupText(latest.detalleOperativo || latest.detalle);
        const critDet = cleanSupText(latest.detalleCritico);
        const finEstimado = cleanSupText(latest.finEstimado || latest.Fin_Estimado || latest.horaFinEstimada);

        let jefeCuadrilla = cleanSupText(latest.jefeCuadrilla || latest.jc);
        if (!jefeCuadrilla) {
            for (const entry of history) {
                const candidate = cleanSupText(entry && (entry.jefeCuadrilla || entry.jc));
                if (candidate) {
                    jefeCuadrilla = candidate;
                    break;
                }
            }
        }
        if (!jefeCuadrilla && opDet) {
            const jcMatch = opDet.match(/(?:^|\n|\|)\s*(?:jc|jefe\s+de\s+cuadrilla)\s*[:\-]\s*([^\n|]+)/i);
            if (jcMatch && jcMatch[1]) {
                jefeCuadrilla = cleanSupText(jcMatch[1]);
            }
        }

        return {
            hasData: true,
            countHist: history.length || 1,
            fecha: cleanSupText(latest.fecha),
            opEst: opEst || 'PENDIENTE',
            critEst,
            opDet,
            critDet,
            jefeCuadrilla,
            finEstimado
        };
    }

    /**
     * Construye el texto en formato ficha completa para WhatsApp (exclusivo perfil PLUZ)
     */
    function buildIncidentWhatsappSummary(loc, supDataOverride) {
        if (!loc) return '';
        const clean = (v, fallback = 'N/A') => {
            const s = cleanSupText(v);
            return s || fallback;
        };

        const ticket = clean(loc.ticket, 'S/N');
        const estado = clean(loc.estado, 'PENDIENTE').toUpperCase();
        const sla = loc.sla || null;
        const odm = clean(loc.odm);
        const empresa = clean(loc.empresa);
        const falla = clean(loc.falla);
        const sed = clean(loc.sed);
        const alimentador = clean(loc.alimentador);
        const suministro = clean(loc.suministro);
        const llamadas = (loc.llamadas !== undefined && loc.llamadas !== null && String(loc.llamadas).trim() !== '' && String(loc.llamadas).trim().toUpperCase() !== 'N/A')
            ? String(loc.llamadas).trim()
            : '0';
        const fechaInicio = clean(loc.fecha_inicio || loc.hora_inicio);
        const direccion = clean(loc.direccion, '');
        const distrito = clean(loc.distrito, '');
        const direccionCompleta = [direccion, distrito].filter(Boolean).join(' - ') || 'N/A';

        const sup = resolveSupervisorContext(loc.ticket, supDataOverride);
        const impInfo = loc.es_suministro_importante
            ? { titular: loc.suministro_importante_titular || 'CLIENTE IMPORTANTE' }
            : (typeof getSuministroImportante === 'function' ? getSuministroImportante(loc.suministro) : null);
        const isSedCrit = Boolean(loc.es_top_critica || loc.es_sed_critica || loc.sed_reincidente);
        const isSuministroReinc = Boolean(loc.suministro_reincidente || (loc.suministro_count >= 2));

        const lines = [];
        lines.push(`*OMS ${ticket}* | ${estado}`);

        if (sla && (sla.elapsed !== undefined || sla.label)) {
            const slaRange = (sla.elapsed !== undefined && sla.maxHours !== undefined)
                ? `${sla.elapsed}h / ${sla.maxHours}h`
                : '';
            const slaLabel = cleanSupText(sla.label);
            const slaParts = [slaRange, slaLabel].filter(Boolean).join(' — ');
            if (slaParts) lines.push(`⏱️ *SLA:* ${slaParts}`);
        }

        if (impInfo) {
            lines.push(`🔴 *Suministro Importante:* ${clean(impInfo.titular, 'CLIENTE IMPORTANTE')}`);
        }
        if (isSedCrit) {
            const sed7d = loc.sed_count > 0 ? ` (7D: ${loc.sed_count} fallas)` : '';
            lines.push(`🚨 *SED Crítica:* ${sed}${sed7d}`);
        }
        if (isSuministroReinc) {
            const sumDias = loc.suministro_ventana_dias || 7;
            const sumCount = loc.suministro_count || 2;
            lines.push(`⚠️ *Suministro Reincidente:* ${sumCount} fallas (${sumDias}D)`);
        }

        lines.push(`• *ODM:* ${odm}`);
        lines.push(`• *Empresa:* ${empresa}`);
        lines.push(`• *Falla:* ${falla}`);
        lines.push(`• *SED / Alim:* ${sed} / ${alimentador}`);
        lines.push(`• *Suministro:* ${suministro} | *Llamadas:* ${llamadas}`);
        lines.push(`• *Inicio:* ${fechaInicio}`);
        lines.push(`• *Dirección:* ${direccionCompleta}`);

        if (sup.hasData) {
            const estadosPluz = [sup.opEst, sup.critEst].filter(Boolean).join(' / ');
            if (estadosPluz) lines.push(`• *Supervisión PLUZ:* ${estadosPluz}`);
            if (sup.opDet) lines.push(`• *Detalle PLUZ:* ${sup.opDet}`);
            if (sup.critDet) lines.push(`• *Detalle Crítico:* ${sup.critDet}`);
            if (sup.finEstimado) lines.push(`• *Fin Estimado:* ${sup.finEstimado}`);
        }

        lines.push(`• *Jefe de cuadrilla:*${sup.jefeCuadrilla ? ` ${sup.jefeCuadrilla}` : ''}`);

        const latNum = Number(loc.lat);
        const lonNum = Number(loc.lon);
        if (Number.isFinite(latNum) && Number.isFinite(lonNum)) {
            const dms = formatCoordsDms(latNum, lonNum);
            lines.push('');
            if (dms) lines.push(`📍 *Coordenadas:* ${dms}`);
            lines.push(`🗺️ https://www.google.com/maps?q=${latNum.toFixed(6)},${lonNum.toFixed(6)}`);
        }

        return lines.join('\n');
    }

    function fallbackCopyText(text) {
        if (typeof document === 'undefined' || !document.body) return false;
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch (_) {
            ok = false;
        }
        document.body.removeChild(ta);
        return ok;
    }

    function findIncidentByTicket(ticket) {
        const key = String(ticket || '').trim().toLowerCase();
        if (!key) return null;

        const mm = (typeof markerMap !== 'undefined' && markerMap)
            ? markerMap
            : (typeof window !== 'undefined' ? window.markerMap : null);
        if (mm && typeof mm.get === 'function') {
            const entry = mm.get(key);
            if (entry && entry.loc) return entry.loc;
        }

        const locs = (typeof mapLocations !== 'undefined' && Array.isArray(mapLocations))
            ? mapLocations
            : (typeof window !== 'undefined' && Array.isArray(window.mapLocations) ? window.mapLocations : []);
        const foundLoc = locs.find(l => String(l && l.ticket || '').trim().toLowerCase() === key);
        if (foundLoc) return foundLoc;

        const tdRecs = (typeof tdOmsRecords !== 'undefined' && Array.isArray(tdOmsRecords))
            ? tdOmsRecords
            : (typeof window !== 'undefined' && Array.isArray(window.tdOmsRecords) ? window.tdOmsRecords : []);
        return tdRecs.find(r => String(r && r.ticket || '').trim().toLowerCase() === key) || null;
    }

    /**
     * Copia la ficha del ticket al portapapeles (solo perfil PLUZ) y da feedback visual en el botón
     */
    async function copyIncidentSummary(ticket, btnEl) {
        const isAdmin = typeof isCurrentUserAdmin === 'function'
            ? isCurrentUserAdmin()
            : (typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('oms_user_role') === 'admin' || sessionStorage.getItem('oms_user_role') === '*') : true);
        if (!isAdmin) return false;

        const loc = findIncidentByTicket(ticket);
        if (!loc) return false;

        const text = buildIncidentWhatsappSummary(loc);
        if (!text) return false;

        let copied = false;
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(text);
                copied = true;
            } catch (_) {
                copied = fallbackCopyText(text);
            }
        } else {
            copied = fallbackCopyText(text);
        }

        if (copied && btnEl) {
            const prevText = btnEl.dataset.prevText || btnEl.textContent || '📋';
            const prevBg = btnEl.dataset.prevBg || btnEl.style.backgroundColor || '#475569';
            btnEl.dataset.prevText = prevText;
            btnEl.dataset.prevBg = prevBg;
            btnEl.textContent = '✅';
            btnEl.style.backgroundColor = '#16a34a';
            btnEl.title = '¡Copiado al portapapeles!';
            if (btnEl._copyResetTimer) clearTimeout(btnEl._copyResetTimer);
            btnEl._copyResetTimer = setTimeout(() => {
                btnEl.textContent = prevText;
                btnEl.style.backgroundColor = prevBg;
                btnEl.title = 'Copiar ficha para WhatsApp';
            }, 1500);
        }

        return copied;
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
            : (typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('oms_user_role') === 'admin' || sessionStorage.getItem('oms_user_role') === '*') : true);

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
        } else if (isAdmin && loc.sed_count > 0) {
            sedBadgeHtml = `<span style="font-size:10px; font-weight:bold; color:#2b4791; background:#dbeafe; padding:1px 6px; border-radius:4px;">(7D: ${loc.sed_count} fallas)</span>`;
        }

        // Tarjeta de suministro importante (Exclusivo Perfil PLUZ)
        const impInfo = isAdmin
            ? (loc.es_suministro_importante
                ? { titular: loc.suministro_importante_titular || 'CLIENTE IMPORTANTE' }
                : (typeof getSuministroImportante === 'function' ? getSuministroImportante(loc.suministro) : null))
            : null;
        let impCardHtml = '';
        if (impInfo) {
            impCardHtml = `
                <div class="popup-importante-card" style="margin-top:8px; padding:7px 9px; border:1px solid #fca5a5; background:#fef2f2; border-radius:6px;">
                    <div style="font-weight:700; color:#b91c1c; font-size:11.5px;">🔴 SUMINISTRO IMPORTANTE</div>
                    <div style="font-size:11px; color:#7f1d1d; margin-top:2px; font-weight:600;">${escapeHtml(impInfo.titular)}</div>
                </div>
            `;
        }

        // Historial y tarjeta de suministro reincidente (Exclusivo Perfil PLUZ)
        const isSuministroReinc = Boolean(loc.suministro_reincidente || (loc.suministro_count >= 2));
        let reincCardHtml = '';
        if (isSuministroReinc) {
            let historial = Array.isArray(loc.suministro_historial) ? [...loc.suministro_historial] : [];
            if (historial.length === 0 && loc.suministro && loc.suministro !== 'N/A') {
                const exList = (typeof root !== 'undefined' && Array.isArray(root.ejecutadosRecords))
                    ? root.ejecutadosRecords
                    : (typeof window !== 'undefined' && Array.isArray(window.ejecutadosRecords) ? window.ejecutadosRecords : []);
                if (exList.length > 0) {
                    const sumNorm = String(loc.suministro).trim().toLowerCase();
                    const matched = exList.filter(e => String(e.suministro || e.Suministro || '').trim().toLowerCase() === sumNorm);
                    historial = matched.slice(-10).map(e => ({
                        t: e.ticket || e.Ticket || '',
                        f: e.fecha || e.Fecha || e.fecha_inicio || '',
                        falla: e.falla || e.Falla || '',
                        fr: e.falla_real || e.fallaReal || e['Falla Real'] || '',
                        nota: String(e.nota || e.Nota || e.nota_especifica || e['Nota específica'] || '').substring(0, 140),
                        tec: e.tecnico || e.Tecnico || e.empresa || e.Empresa || ''
                    }));
                }
            }
            const sumCount = parseInt(loc.suministro_count || (historial.length ? historial.length + 1 : 2), 10);
            const sumDias = loc.suministro_ventana_dias || 7;

            let itemsHtml = '';
            if (historial.length > 0) {
                itemsHtml = `
                    <div style="margin-top:6px; display:flex; flex-direction:column; gap:5px;">
                        ${historial.map(h => {
                            const tk = escapeHtml(h.t || h.ticket || 'S/N');
                            const fe = escapeHtml(h.f || h.fecha || '');
                            const falOms = escapeHtml(h.falla || 'N/A');
                            const falReal = escapeHtml(h.fr || h.falla_real || h.fallaReal || '');
                            const tec = escapeHtml(h.tec || h.tecnico || h.empresa || '');
                            const nota = escapeHtml(h.nota || h.comentario || '');
                            return `
                                <div style="background:#ffffff; border:1px solid #fde68a; border-radius:5px; padding:5px 7px; font-size:11px; line-height:1.35;">
                                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px; margin-bottom:2px;">
                                        <span style="font-weight:700; color:#b45309;">#${tk}${fe ? ` · 🕒 ${fe}` : ''}</span>
                                        ${tec ? `<span style="font-size:10px; color:#475569; background:#f1f5f9; padding:1px 5px; border-radius:3px;">👷 ${tec}</span>` : ''}
                                    </div>
                                    <div style="display:flex; gap:4px; flex-wrap:wrap; margin:2px 0 3px 0;">
                                        <span style="font-size:9.5px; font-weight:700; color:#1e40af; background:#dbeafe; padding:1px 5px; border-radius:3px;">OMS: ${falOms}</span>
                                        ${falReal ? `<span style="font-size:9.5px; font-weight:700; color:#9a3412; background:#ffedd5; padding:1px 5px; border-radius:3px;">Real: ${falReal}</span>` : ''}
                                    </div>
                                    ${nota ? `<div style="font-size:10.5px; background:#fffdf5; padding:4px 6px; border-radius:4px; border:1px solid #fef3c7; color:#334155; font-style:italic; margin-top:3px;">"${nota}"</div>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } else {
                itemsHtml = `<div style="font-size:10.5px; color:#78350f; font-style:italic; margin-top:4px;">No se registran notas de cierres previos en el rango.</div>`;
            }

            reincCardHtml = `
                <div class="popup-reincidente-card" style="margin-top:8px; padding:8px; border:1px solid #f59e0b; background:#fffbeb; border-radius:6px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <b style="color:#b45309; font-size:11.5px;">🚨 Suministro Reincidente: ${escapeHtml(sumCount)} fallas (${escapeHtml(sumDias)}D)</b>
                    </div>
                    ${itemsHtml}
                </div>
            `;
        }

        let supCardHtml = '';
        if (isAdmin) {
            const supCtx = resolveSupervisorContext(loc.ticket);
            if (supCtx.hasData) {
                const bClass = (typeof getSupervisorBadgeClass === 'function') ? getSupervisorBadgeClass(supCtx.opEst) : 'sup-status-generic';
                const cClass = (typeof getCriticoBadgeClass === 'function') ? getCriticoBadgeClass(supCtx.critEst) : 'sup-status-normal';

                supCardHtml = `
                    <div style="margin-top: 8px; padding: 7px 9px; background: #f0f7ff; border: 1px solid #bae6fd; border-radius: 6px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; flex-wrap:wrap; gap:4px;">
                            <span style="font-weight:700; color:#0369a1; font-size:11px;">🛡️ Supervisión PLUZ</span>
                            <div style="display:flex; align-items:center; gap:4px;">
                                <span class="sup-status-badge ${bClass}" style="font-size:10px; padding:1px 6px;">${escapeHtml(supCtx.opEst)}</span>
                                ${supCtx.critEst ? `<span class="sup-status-badge ${cClass}" style="font-size:10px; padding:1px 6px;">${escapeHtml(supCtx.critEst)}</span>` : ''}
                            </div>
                        </div>
                        ${supCtx.jefeCuadrilla ? `<div style="font-size:11px; color:#0f172a; margin-bottom:3px; line-height:1.3;"><b>👷 JC:</b> ${escapeHtml(supCtx.jefeCuadrilla)}</div>` : ''}
                        ${supCtx.opDet ? `<div style="font-size:11px; color:#334155; margin-bottom:3px; line-height:1.3; font-style:italic;"><b>Op:</b> "${escapeHtml(supCtx.opDet)}"</div>` : ''}
                        ${supCtx.critDet ? `<div style="font-size:11px; color:#9d174d; margin-bottom:4px; line-height:1.3; font-style:italic;"><b>Crit:</b> "${escapeHtml(supCtx.critDet)}"</div>` : ''}
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#64748b;">
                            <span>🕒 ${escapeHtml(supCtx.fecha)}</span>
                            <button type="button" onclick="openSupervisorModal('${escapeHtml(loc.ticket)}')" style="border:none; background:none; color:#0284c7; font-weight:700; cursor:pointer; text-decoration:underline; padding:0;">Historial (${supCtx.countHist}) / ✏️ Editar</button>
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
                <b>Suministro:</b> ${escapeHtml(loc.suministro)} ${isSuministroReinc ? `<span style="font-size:10px; font-weight:bold; color:#b45309; background:#fef3c7; border:1px solid #fcd34d; padding:1px 6px; border-radius:4px;">(${escapeHtml(loc.suministro_ventana_dias || 7)}D: ${escapeHtml(loc.suministro_count || 2)} fallas ⚠️)</span>` : (loc.suministro_count > 0 ? `<span style="font-size:10px; font-weight:bold; color:#0d9488; background:#ccfbf1; padding:1px 6px; border-radius:4px;">(7D: ${escapeHtml(loc.suministro_count)} fallas)</span>` : '')}<br>
                ${impCardHtml}
                ${reincCardHtml}
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
                    ${isAdmin ? `
                    <button type="button" class="popup-copy-btn" onclick="copyIncidentSummary('${escapeHtml(loc.ticket)}', this)" title="Copiar ficha para WhatsApp" aria-label="Copiar ficha del ticket para WhatsApp" style="
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        background-color: #475569;
                        color: white;
                        border: none;
                        padding: 6px 11px;
                        font-weight: bold;
                        border-radius: 6px;
                        font-size: 13px;
                        cursor: pointer;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                        transition: background-color 0.15s ease;
                    ">📋</button>` : ''}
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

        const isAdmin = typeof isCurrentUserAdmin === 'function' 
            ? isCurrentUserAdmin() 
            : (typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('oms_user_role') === 'admin' || sessionStorage.getItem('oms_user_role') === '*') : true);

        const isSuministroReinc = Boolean(loc.suministro_reincidente || (loc.suministro_count >= 2));
        const isSuministroImp = isAdmin && Boolean(loc.es_suministro_importante || (typeof isSuministroImportante === 'function' && isSuministroImportante(loc.suministro)));
        const sumCount = parseInt(loc.suministro_count || (isSuministroReinc ? ((loc.suministro_historial && loc.suministro_historial.length) ? loc.suministro_historial.length + 1 : 2) : 1), 10);
        const sumDias = loc.suministro_ventana_dias || 7;

        let titleText = `Ticket: ${escapeHtml(loc.ticket)} | ${escapeHtml(loc.falla)} | Plazo: ${escapeHtml(sla.label)}`;
        if (isSuministroImp) {
            const impTit = loc.suministro_importante_titular || ((typeof getSuministroImportante === 'function' && getSuministroImportante(loc.suministro)?.titular) || 'IMPORTANTE');
            titleText += ` | 🔴 S. IMPORTANTE: ${escapeHtml(impTit)}`;
        }
        if (isSuministroReinc) {
            titleText += ` | ⚠️ S. REINCIDENTE (${sumCount} fallas en ${sumDias} días)`;
        }

        return `
            <div class="marker-sla-badge ${sla.statusClass}${isExecution ? ' is-execution' : ''}${loc.es_top_critica ? ' is-sed-critica-pulse' : ''}${isSuministroReinc ? ' is-suministro-reincidente' : ''}${isSuministroImp ? ' is-suministro-importante' : ''}" title="${titleText}">
                ${isSuministroImp ? '<span class="marker-imp-badge" title="Suministro Importante">IMP</span>' : ''}
                ${isSuministroReinc ? `<span class="marker-reinc-badge" title="Falla recurrente: ${escapeHtml(sumCount)} veces">x${escapeHtml(sumCount)}</span>` : ''}
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
        formatCoordsDms,
        resolveSupervisorContext,
        buildIncidentWhatsappSummary,
        copyIncidentSummary,
        escapeHtml: getEscapeHtml()
    };
}));
