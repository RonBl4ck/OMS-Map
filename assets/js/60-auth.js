        function updateUserBadge() {
            const userId = sessionStorage.getItem("oms_user_id") || "Invitado";
            const contractor = sessionStorage.getItem("oms_assigned_contractor") || "*";
            const isAdmin = sessionStorage.getItem('oms_user_role') === 'admin';
            const tabLlamadas = document.getElementById('tabLlamadas');
            if (tabLlamadas) tabLlamadas.style.display = isAdmin ? '' : 'none';
            const navUserName = document.getElementById("navUserName");
            if (navUserName) {
                navUserName.innerText = contractor === "*" ? `👤 ${userId} (Admin)` : `👤 ${userId} (${contractor})`;
            }

            const btnOpenConfig = document.getElementById("btnOpenConfig");
            if (btnOpenConfig) {
                btnOpenConfig.style.display = isAdmin ? 'inline-flex' : 'none';
                btnOpenConfig.onclick = () => {
                    const pinModal = document.getElementById("configPinModalOverlay");
                    const pinInput = document.getElementById("configPinInput");
                    const pinErrMsg = document.getElementById("configPinErrMsg");
                    if (pinErrMsg) pinErrMsg.style.display = "none";
                    if (pinInput) pinInput.value = "";
                    if (pinModal) pinModal.style.display = "flex";
                    if (pinInput) pinInput.focus();
                };
            }

            const btnLogout = document.getElementById("btnLogout");
            if (btnLogout) {
                btnLogout.onclick = () => {
                    sessionStorage.clear();
                    location.reload();
                };
            }
        }

        // Carga de Datos
        async function loadData() {
            try {
                // Intentamos consultar la API segura /api/config-data, con fallback a config.json
                let cfg = null;
                try {
                    const cfgResp = await fetch('/api/config-data');
                    if (cfgResp.ok) {
                        cfg = await cfgResp.json();
                    }
                } catch(e) {}

                if (!cfg) {
                    const localResp = await fetch('config.json');
                    if (localResp.ok) cfg = await localResp.json();
                }

                if (cfg) {
                    if (cfg.sheets_url) GOOGLE_SHEET_CSV_URL = cfg.sheets_url;
                    if (cfg.sheets_url_ejecutados) GOOGLE_SHEET_EJECUTADOS_URL = cfg.sheets_url_ejecutados;
                    if (cfg.sheets_url_llamadas) GOOGLE_SHEET_LLAMADAS_URL = cfg.sheets_url_llamadas;
                    if (cfg.sheets_url_tecnicos) GOOGLE_SHEET_TECNICOS_URL = cfg.sheets_url_tecnicos;
                    if (cfg.sheets_url_sed_criticas) GOOGLE_SHEET_SED_CRITICAS_URL = cfg.sheets_url_sed_criticas;
                    if (cfg.carto_api_key) {
                        sessionStorage.setItem("oms_carto_key", cfg.carto_api_key);
                        applyBaseLayers(cfg.carto_api_key);
                    }
                }
            } catch (e) {
                console.warn("No se pudo cargar config remota:", e);
            }

            try {
                // Carga previa de la lista de SEDs Críticas
                if (GOOGLE_SHEET_SED_CRITICAS_URL) {
                    let critUrl = GOOGLE_SHEET_SED_CRITICAS_URL;
                    if (critUrl.includes('docs.google.com/spreadsheets') && !critUrl.includes('gviz/tq') && !critUrl.includes('/pub')) {
                        const match = critUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
                        if (match) {
                            critUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&sheet=SED_CRITICAS`;
                        }
                    }
                    if (critUrl.includes('docs.google.com')) {
                        critUrl += (critUrl.includes('?') ? '&' : '?') + '_nocache=' + Date.now();
                    }

                    await new Promise((resolve) => {
                        Papa.parse(critUrl, {
                            download: true,
                            header: true,
                            skipEmptyLines: true,
                            complete: function(results) {
                                sedCriticasSet.clear();
                                sedCriticasMap.clear();
                                (results.data || []).forEach(row => {
                                    const sedVal = getProp(row, 'SED', 'sed', 'Sed', 'CODIGO_SED', 'Codigo_SED', 'COD_SED');
                                    const norm = normalizeSedCode(sedVal);
                                    if (norm) {
                                        sedCriticasSet.add(norm);
                                        sedCriticasMap.set(norm, row);
                                    }
                                });
                                console.log(`🚨 [SEDs Críticas] ${sedCriticasSet.size} SEDs críticas cargadas.`);
                                resolve();
                            },
                            error: function(err) {
                                console.warn("⚠️ No se pudo cargar SED_CRITICAS:", err);
                                resolve();
                            }
                        });
                    });
                }

                let csvUrl = GOOGLE_SHEET_CSV_URL;
                if (csvUrl && csvUrl.includes('docs.google.com/spreadsheets') && !csvUrl.includes('gviz/tq') && !csvUrl.includes('/pub')) {
                    const match = csvUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
                    if (match) {
                        csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&sheet=BASE_PENDIENTES`;
                    }
                }

                let finalFetchUrl = csvUrl;
                if (finalFetchUrl && finalFetchUrl.includes('docs.google.com')) {
                    finalFetchUrl += (finalFetchUrl.includes('?') ? '&' : '?') + '_nocache=' + Date.now();
                }

                if (finalFetchUrl) {
                    Papa.parse(finalFetchUrl, {
                        download: true,
                        header: true,
                        skipEmptyLines: true,
                        complete: function(results) {
                            processRawData(results.data);
                        }
                    });
                }

            } catch (err) {
                console.error("Error cargando datos:", err);
            }
        }

        function checkAuthentication() {
            const authOverlay = document.getElementById("authModalOverlay");
            const userInput = document.getElementById("authUserInput");
            const passInput = document.getElementById("authPasswordInput");
            const btnLogin = document.getElementById("btnAuthLogin");
            const errMsg = document.getElementById("authErrMsg");

            if (sessionStorage.getItem("oms_auth_token") === "authenticated") {
                if (authOverlay) authOverlay.style.display = "none";
                updateUserBadge();
                initMap();
                loadData();
                return;
            }

            if (authOverlay) authOverlay.style.display = "flex";

            async function validateLogin() {
                const selectedUser = userInput ? userInput.value : "PLUZ";
                const passVal = passInput ? passInput.value.trim() : "";

                if (!passVal) {
                    if (errMsg) {
                        errMsg.innerText = "❌ Ingresa una contraseña";
                        errMsg.style.display = "block";
                    }
                    return;
                }

                if (btnLogin) {
                    btnLogin.innerText = "⏳ Validando...";
                    btnLogin.disabled = true;
                }

                try {
                    const response = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user: selectedUser, password: passVal })
                    });

                    const data = await response.json();

                    if (response.ok && data.success) {
                        sessionStorage.setItem("oms_auth_token", "authenticated");
                        sessionStorage.setItem("oms_user_id", data.user);
                        sessionStorage.setItem("oms_assigned_contractor", data.contractor);
                        sessionStorage.setItem("oms_user_role", data.role);
                        if (data.cartoApiKey) {
                            sessionStorage.setItem("oms_carto_key", data.cartoApiKey);
                            applyBaseLayers(data.cartoApiKey);
                        }

                        if (authOverlay) authOverlay.style.display = "none";
                        updateUserBadge();
                        initMap();
                        loadData();
                    } else {
                        if (errMsg) {
                            errMsg.innerText = "❌ " + (data.message || "Usuario o contraseña incorrectos");
                            errMsg.style.display = "block";
                        }
                        if (passInput) {
                            passInput.value = "";
                            passInput.focus();
                        }
                    }
                } catch (err) {
                    console.error("Error al autenticar:", err);
                    if (errMsg) {
                        errMsg.innerText = "❌ Error de conexión al servidor";
                        errMsg.style.display = "block";
                    }
                } finally {
                    if (btnLogin) {
                        btnLogin.innerText = "Ingresar";
                        btnLogin.disabled = false;
                    }
                }
            }

            if (btnLogin) btnLogin.onclick = validateLogin;
            if (passInput) {
                passInput.focus();
                passInput.onkeyup = (e) => {
                    if (e.key === "Enter") validateLogin();
                };
            }
        }
