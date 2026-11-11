/**
 * OMS DOM & UI Utilities
 * Safe HTML escaping, debouncing, optimized property retrieval with normalization cache,
 * multi-select components, status styling, and UI notifications.
 * UMD / Vanilla friendly.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
        module.exports.default = api;
    }
    if (root) {
        root.DomUtils = api;
        Object.assign(root, api);
        if (typeof window !== 'undefined' && window !== root) {
            window.DomUtils = api;
            Object.assign(window, api);
        }
    }
}(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function (root) {
    const escapeHtml = (val) => String(val || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[c]));

    const normKeyCache = new Map();
    function normalizeKey(str) {
        if (!str) return '';
        let cached = normKeyCache.get(str);
        if (cached !== undefined) return cached;
        cached = String(str).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (normKeyCache.size > 3000) normKeyCache.clear();
        normKeyCache.set(str, cached);
        return cached;
    }

    function getProp(obj, ...keys) {
        if (!obj) return 'N/A';
        // 1. Direct fast lookup
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key !== undefined && key !== null) {
                const val = obj[key];
                if (val !== undefined && val !== null) {
                    const s = String(val).trim();
                    if (s !== '') return s;
                }
            }
        }
        // 2. Normalized fallback
        const objKeys = Object.keys(obj);
        for (let i = 0; i < keys.length; i++) {
            const target = keys[i];
            if (target === undefined || target === null) continue;
            const normTarget = normalizeKey(target);
            const foundKey = objKeys.find(k => normalizeKey(k) === normTarget);
            if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null) {
                const s = String(obj[foundKey]).trim();
                if (s !== '') return s;
            }
        }
        return 'N/A';
    }

    function debounce(callback, wait = 120) {
        let timer = null;
        return function debounced(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => callback.apply(this, args), wait);
        };
    }
    const debounceUi = debounce;

    const OMS_STATUS_COLORS = Object.freeze({
        pendiente: '#FBC13F',
        ejecucion: '#3B599F',
        ejecutado: '#6CAC5E',
        otros: '#C1CBD6'
    });

    function getOmsStatusClass(status) {
        const normalized = String(status || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        if (normalized.includes('pendient')) return 'pendiente';
        if (normalized.includes('ejecuc')) return 'ejecucion';
        if (normalized.includes('ejecutad') || normalized.includes('finaliz') || normalized.includes('cerrad') || normalized.includes('restaur')) return 'ejecutado';
        return 'otros';
    }

    function getOmsStatusColor(status) {
        return OMS_STATUS_COLORS[getOmsStatusClass(status)];
    }

    function getEmoji(falla) {
        const f = String(falla || '').trim().toUpperCase();
        if (f.includes("RED SUBTERRANEA") || f.includes("RED SUBTERRÁNEA") || f.includes("CNX SUBTERRANEA") || f.includes("CNX SUBTERRÁNEA") || f.includes("SUBTERRANEA") || f.includes("SUBTERRÁNEA") || f.includes("ORM") || f.includes("OBRA")) return "⛏️";
        if (f.includes("RED AEREA") || f.includes("RED AÉREA") || f.includes("CNX AEREA") || f.includes("CNX AÉREA") || f.includes("LÍNEA AÉREA BT") || f.includes("LINEA AEREA BT")) return "⚡";
        if (f.includes("CNX SUBTERRANEA") || f.includes("CNX SUBTERRÁNEA")) return "🕳️";
        if (f.includes("SUMINISTRO")) return "🏠";
        if (f.includes("FUSIBLE")) return "🔌";
        if (f.includes("POSTE")) return "🪵";
        return "📍";
    }

    function getFaultIconSvg(fallaStr) {
        const f = String(fallaStr || '').trim().toUpperCase();
        if (f.includes("RED SUBTERRANEA") || f.includes("RED SUBTERRÁNEA") || f.includes("CNX SUBTERRANEA") || f.includes("CNX SUBTERRÁNEA") || f.includes("SUBTERRANEA") || f.includes("SUBTERRÁNEA") || f.includes("ORM") || f.includes("OBRA")) {
            return "assets/icons/subterranea.svg?v=20260913-map-legend";
        }
        if (f.includes("RED AEREA") || f.includes("RED AÉREA") || f.includes("CNX AEREA") || f.includes("CNX AÉREA") || f.includes("LÍNEA AÉREA BT") || f.includes("LINEA AEREA BT")) {
            return "assets/icons/red_aerea.svg?v=20260913-map-legend";
        }
        if (f.includes("SUMINISTRO")) {
            return "assets/icons/suministro.svg?v=20260913-map-legend";
        }
        if (f.includes("FUSIBLE")) {
            return "assets/icons/fusible.svg?v=20260913-map-legend";
        }
        if (f.includes("POSTE")) {
            return "assets/icons/poste.svg?v=20260913-map-legend";
        }
        return null;
    }

    function getFaultIconHtml(falla) {
        const svgUrl = getFaultIconSvg(falla);
        if (svgUrl) {
            let alt = "Falla";
            if (svgUrl.includes("subterranea")) alt = "Subterránea / ORM";
            else if (svgUrl.includes("red_aerea")) alt = "Red Aérea";
            else if (svgUrl.includes("suministro")) alt = "Suministro";
            else if (svgUrl.includes("fusible")) alt = "Fusible";
            else if (svgUrl.includes("poste")) alt = "Poste";
            return `<img src="${svgUrl}" alt="${alt}" class="fault-icon-img">`;
        }
        return `<span class="fault-icon-emoji">${getEmoji(falla)}</span>`;
    }

    function matchesMultiSelection(value, selectedValues) {
        const selected = Array.isArray(selectedValues) ? selectedValues : [];
        return selected.length === 0 || selected.includes(String(value || ''));
    }

    function getFacetedFilterValues(records, field, filterFields, selections, excludedId) {
        const available = (records || []).filter(row => Object.entries(filterFields).every(([otherField, controlId]) => {
            return controlId === excludedId || matchesMultiSelection(row[otherField], selections[controlId] || []);
        })).map(row => String(row[field] || '')).filter(Boolean);
        return [...new Set(available)].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    }

    // === COMPONENTE MULTI-SELECT CHECKBOX ===
    function initMultiSelect(containerId, titlePrefix, valuesList, onChangeCallback, labelFormatter = value => value) {
        if (typeof document === 'undefined') return null;
        const container = document.getElementById(containerId);
        if (!container) return null;
        container.innerHTML = "";
        container.className = "custom-multiselect";

        const resolveSortDias = (typeof root !== 'undefined' && root.sortDias) || (typeof sortDias === 'function' ? sortDias : null);
        const resolveSortIntervals = (typeof root !== 'undefined' && root.sortIntervals) || (typeof sortIntervals === 'function' ? sortIntervals : null);

        const isDiaFilter = titlePrefix === "Día" || titlePrefix === "Dia";
        const sortFn = (titlePrefix === "Intervalo" && resolveSortIntervals) ? resolveSortIntervals 
                     : (isDiaFilter && resolveSortDias ? resolveSortDias 
                     : (a, b) => String(a).localeCompare(String(b), 'es'));
        let initialOptions = [...new Set(valuesList)].filter(Boolean).sort(sortFn);
        let options = [...initialOptions];
        let selectedVals = new Set(options);
        let isAllSelectedState = true;

        const btn = document.createElement("button");
        btn.className = "multiselect-btn";
        btn.type = "button";
        btn.setAttribute("aria-haspopup", "true");
        btn.setAttribute("aria-expanded", "false");

        const menu = document.createElement("div");
        menu.className = "multiselect-dropdown-menu";
        menu.id = `${containerId}Menu`;
        menu.setAttribute("role", "group");
        menu.setAttribute("aria-label", `Opciones de ${titlePrefix}`);
        btn.setAttribute("aria-controls", menu.id);

        menu.addEventListener("click", (e) => {
            e.stopPropagation();
        });

        function updateBtnLabel() {
            if (options.length === 0) {
                btn.innerText = `${titlePrefix}: (Sin datos)`;
            } else if (isAllSelectedState || selectedVals.size === options.length) {
                btn.innerText = `${titlePrefix}: Todos (${options.length})`;
            } else if (selectedVals.size === 0) {
                btn.innerText = `${titlePrefix}: 0 selec.`;
            } else if (selectedVals.size === 1) {
                btn.innerText = `${titlePrefix}: ${labelFormatter(Array.from(selectedVals)[0])}`;
            } else {
                btn.innerText = `${titlePrefix}: ${selectedVals.size} selec.`;
            }
        }

        const allItem = document.createElement("label");
        allItem.className = "multiselect-item";
        allItem.style.fontWeight = "bold";
        const allCb = document.createElement("input");
        allCb.type = "checkbox";
        allCb.checked = true;
        allItem.appendChild(allCb);
        allItem.appendChild(document.createTextNode("(Seleccionar todos)"));
        menu.appendChild(allItem);

        const divider = document.createElement("div");
        divider.className = "multiselect-divider";
        menu.appendChild(divider);

        const optionList = document.createElement("div");
        menu.appendChild(optionList);
        let optionCbs = [];

        function renderOptions() {
            optionList.innerHTML = "";
            optionCbs = options.map(val => {
                const item = document.createElement("label");
                item.className = "multiselect-item";
                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.value = val;
                cb.checked = selectedVals.has(val);
                cb.addEventListener("change", () => {
                    if (cb.checked) {
                        selectedVals.add(val);
                    } else {
                        selectedVals.delete(val);
                    }
                    isAllSelectedState = options.length > 0 && selectedVals.size === options.length;
                    allCb.checked = isAllSelectedState;
                    updateBtnLabel();
                    onChangeCallback(Array.from(selectedVals));
                });
                item.appendChild(cb);
                item.appendChild(document.createTextNode(labelFormatter(val)));
                optionList.appendChild(item);
                return cb;
            });
            allCb.checked = isAllSelectedState || (options.length > 0 && selectedVals.size === options.length);
            updateBtnLabel();
        }

        allCb.addEventListener("change", () => {
            const checkAll = allCb.checked;
            selectedVals.clear();
            isAllSelectedState = checkAll;
            optionCbs.forEach(cb => {
                cb.checked = checkAll;
                if (checkAll) selectedVals.add(cb.value);
            });
            updateBtnLabel();
            onChangeCallback(Array.from(selectedVals));
        });

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".multiselect-dropdown-menu.show").forEach(m => {
                if (m !== menu) m.classList.remove("show");
            });
            menu.classList.toggle("show");
            btn.setAttribute("aria-expanded", String(menu.classList.contains("show")));
        });

        menu.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;
            menu.classList.remove("show");
            btn.setAttribute("aria-expanded", "false");
            btn.focus();
        });

        container.appendChild(btn);
        container.appendChild(menu);
        renderOptions();

        return {
            getSelected: () => Array.from(selectedVals),
            isAllSelected: () => isAllSelectedState || (options.length > 0 && selectedVals.size === options.length),
            reset: () => {
                options = [...initialOptions];
                selectedVals = new Set(options);
                isAllSelectedState = true;
                allCb.checked = true;
                renderOptions();
            },
            setSelected: (newSelectedVals, triggerChange = true) => {
                const list = Array.isArray(newSelectedVals) ? newSelectedVals : [newSelectedVals];
                selectedVals = new Set(list.filter(v => options.includes(v)));
                isAllSelectedState = options.length > 0 && selectedVals.size === options.length;
                allCb.checked = isAllSelectedState;
                optionCbs.forEach(cb => {
                    cb.checked = selectedVals.has(cb.value);
                });
                updateBtnLabel();
                if (triggerChange && typeof onChangeCallback === 'function') {
                    onChangeCallback(Array.from(selectedVals));
                }
            },
            setOptions: nextValues => {
                const nextList = [...new Set(nextValues || [])].filter(Boolean).sort(sortFn);
                options = nextList;
                if (isAllSelectedState) {
                    selectedVals = new Set(options);
                } else {
                    selectedVals = new Set([...selectedVals].filter(value => options.includes(value)));
                }
                renderOptions();
            },
            setBaseOptions: baseValues => {
                initialOptions = [...new Set(baseValues || [])].filter(Boolean).sort(sortFn);
            }
        };
    }

    function showAppNotification(message, type = 'info', duration = 4000) {
        if (typeof document === 'undefined') return;
        let toast = document.getElementById('appNotificationToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'appNotificationToast';
            toast.className = 'app-notification-toast';
            document.body.appendChild(toast);
        }
        const icon = type === 'warning' ? '⚠️' : (type === 'success' ? '✅' : 'ℹ️');
        toast.innerHTML = `
            <span class="app-toast-icon">${icon}</span>
            <div class="app-toast-message">${escapeHtml(message)}</div>
            <button type="button" class="app-toast-close" onclick="this.parentElement.classList.remove('open')">✕</button>
        `;
        toast.classList.remove('open');
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                toast.classList.add('open');
            });
        } else {
            toast.classList.add('open');
        }
        const targetWin = typeof window !== 'undefined' ? window : root;
        if (targetWin._appNotificationTimer) clearTimeout(targetWin._appNotificationTimer);
        targetWin._appNotificationTimer = setTimeout(() => {
            toast.classList.remove('open');
        }, duration);
    }

    return {
        escapeHtml,
        normalizeKey,
        getProp,
        debounce,
        debounceUi,
        OMS_STATUS_COLORS,
        getOmsStatusClass,
        getOmsStatusColor,
        getEmoji,
        getFaultIconSvg,
        getFaultIconHtml,
        matchesMultiSelection,
        getFacetedFilterValues,
        initMultiSelect,
        showAppNotification
    };
}));
