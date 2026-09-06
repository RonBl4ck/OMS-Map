        let GOOGLE_SHEET_CSV_URL = "";
        let GOOGLE_SHEET_EJECUTADOS_URL = "";
        let GOOGLE_SHEET_LLAMADAS_URL = "";
        let GOOGLE_SHEET_TECNICOS_URL = "";
        let GOOGLE_SHEET_SED_CRITICAS_URL = "";
        let sedCriticasSet = new Set();
        let sedCriticasMap = new Map();
        let mapLocations = [];
        let tdOmsRecords = [];
        let rawData = [];
        let llamadasRecords = [];
        let llamadasLoaded = false;
        let tecnicosRecords = [];
        let tecnicosLoaded = false;
        let techRefreshTimer = null;

        let leafletMap = null;
        let markersGroup = null;
        const markerMap = new Map();

        const escapeHtml = (val) => String(val || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

        function normalizeSedCode(val) {
            if (!val || val === 'N/A') return "";
            let s = String(val).trim().toUpperCase();
            s = s.replace(/^SED[\s\.\:\-_]*/i, "").trim();
            s = s.replace(/\s+/g, " ");
            return s;
        }

        function isSedCritica(sedVal) {
            if (!sedVal || sedVal === 'N/A') return false;
            const raw = String(sedVal).trim().toUpperCase();
            const norm = normalizeSedCode(sedVal);
            return (raw && sedCriticasSet.has(raw)) || (norm && sedCriticasSet.has(norm));
        }

        function getProp(obj, ...keys) {
            if (!obj) return 'N/A';
            for (const key of keys) {
                if (obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
                    return String(obj[key]).trim();
                }
            }
            const objKeys = Object.keys(obj);
            for (const target of keys) {
                const normTarget = target.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const foundKey = objKeys.find(k => k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normTarget);
                if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null && String(obj[foundKey]).trim() !== '') {
                    return String(obj[foundKey]).trim();
                }
            }
            return 'N/A';
        }

        function getEmoji(falla) {
            const f = String(falla || '').trim().toUpperCase();
            if (f.includes("RED SUBTERRANEA") || f.includes("RED SUBTERRÁNEA")) return "🚚";
            if (f.includes("RED AEREA") || f.includes("RED AÉREA") || f.includes("CNX AEREA") || f.includes("CNX AÉREA") || f.includes("LÍNEA AÉREA BT") || f.includes("LINEA AEREA BT")) return "🪜";
            if (f.includes("CNX SUBTERRANEA") || f.includes("CNX SUBTERRÁNEA")) return "🛻";
            if (f.includes("SUMINISTRO")) return "👤";
            if (f.includes("FUSIBLE")) return "📦";
            if (f.includes("POSTE")) return "🏗️";
            return "📍";
        }

        // Función para ordenar intervalos de tiempo numéricamente
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

        // === COMPONENTE MULTI-SELECT CHECKBOX ===
        function initMultiSelect(containerId, titlePrefix, valuesList, onChangeCallback) {
            const container = document.getElementById(containerId);
            if (!container) return null;
            container.innerHTML = "";
            container.className = "custom-multiselect";

            const sortFn = (titlePrefix === "Intervalo") ? sortIntervals : (a, b) => String(a).localeCompare(String(b), 'es');
            const options = [...new Set(valuesList)].filter(Boolean).sort(sortFn);
            let selectedVals = new Set(options);

            const btn = document.createElement("button");
            btn.className = "multiselect-btn";
            btn.type = "button";

            const menu = document.createElement("div");
            menu.className = "multiselect-dropdown-menu";

            // Evitar que el menú se cierre al hacer clic dentro
            menu.addEventListener("click", (e) => {
                e.stopPropagation();
            });

            function updateBtnLabel() {
                if (selectedVals.size === options.length) {
                    btn.innerText = `${titlePrefix}: Todos (${options.length})`;
                } else if (selectedVals.size === 0) {
                    btn.innerText = `${titlePrefix}: Ninguno (0)`;
                } else if (selectedVals.size === 1) {
                    btn.innerText = `${titlePrefix}: ${Array.from(selectedVals)[0]}`;
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

            const optionCbs = [];

            options.forEach(val => {
                const item = document.createElement("label");
                item.className = "multiselect-item";
                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.value = val;
                cb.checked = true;

                cb.addEventListener("change", () => {
                    if (cb.checked) {
                        selectedVals.add(val);
                    } else {
                        selectedVals.delete(val);
                        allCb.checked = false;
                    }
                    if (selectedVals.size === options.length) {
                        allCb.checked = true;
                    }
                    updateBtnLabel();
                    onChangeCallback(Array.from(selectedVals));
                });

                item.appendChild(cb);
                item.appendChild(document.createTextNode(val));
                menu.appendChild(item);
                optionCbs.push(cb);
            });

            allCb.addEventListener("change", () => {
                const checkAll = allCb.checked;
                selectedVals.clear();
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
            });

            container.appendChild(btn);
            container.appendChild(menu);
            updateBtnLabel();

            return {
                getSelected: () => Array.from(selectedVals),
                reset: () => {
                    selectedVals = new Set(options);
                    allCb.checked = true;
                    optionCbs.forEach(cb => cb.checked = true);
                    updateBtnLabel();
                }
            };
        }

        document.addEventListener("click", () => {
            document.querySelectorAll(".multiselect-dropdown-menu.show").forEach(m => m.classList.remove("show"));
        });
