        // Lógica para Desbloqueo y Gestión Dinámica de Accesos (PIN Maestro)
        let currentAdminPin = "";
        let currentAdminUsers = [];

        function initConfigSecurity() {
            const pinModal = document.getElementById("configPinModalOverlay");
            const pinInput = document.getElementById("configPinInput");
            const btnSubmit = document.getElementById("btnSubmitConfigPin");
            const btnCancel = document.getElementById("btnCancelConfigPin");
            const pinErrMsg = document.getElementById("configPinErrMsg");
            const adminModal = document.getElementById("configAdminModalOverlay");
            const btnCloseAdmin = document.getElementById("btnCloseConfigAdmin");
            const btnSaveUsers = document.getElementById("btnSaveUsersConfig");

            if (btnCancel && pinModal) {
                btnCancel.onclick = () => { pinModal.style.display = "none"; };
            }

            if (btnCloseAdmin && adminModal) {
                btnCloseAdmin.onclick = () => { adminModal.style.display = "none"; };
            }

            async function submitPin() {
                const pinVal = pinInput ? pinInput.value.trim() : "";
                if (!pinVal) return;

                if (btnSubmit) {
                    btnSubmit.innerText = "Verificando...";
                    btnSubmit.disabled = true;
                }

                try {
                    const resp = await fetch('/api/verify-config-pin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ pin: pinVal })
                    });
                    const data = await resp.json();

                    if (resp.ok && data.success) {
                        currentAdminPin = pinVal;
                        if (pinModal) pinModal.style.display = "none";
                        if (adminModal) adminModal.style.display = "block";
                        loadAdminUsers(currentAdminPin);
                    } else {
                        if (pinErrMsg) {
                            pinErrMsg.innerText = "❌ " + (data.message || "Clave incorrecta");
                            pinErrMsg.style.display = "block";
                        }
                        if (pinInput) {
                            pinInput.value = "";
                            pinInput.focus();
                        }
                    }
                } catch (e) {
                    if (pinErrMsg) {
                        pinErrMsg.innerText = "❌ Error de conexión";
                        pinErrMsg.style.display = "block";
                    }
                } finally {
                    if (btnSubmit) {
                        btnSubmit.innerText = "Desbloquear";
                        btnSubmit.disabled = false;
                    }
                }
            }

            if (btnSubmit) btnSubmit.onclick = submitPin;
            if (pinInput) {
                pinInput.onkeyup = (e) => {
                    if (e.key === "Enter") submitPin();
                };
            }

            if (btnSaveUsers) {
                btnSaveUsers.onclick = saveAdminUsers;
            }
        }

        async function loadAdminUsers(pin) {
            const tbody = document.getElementById("tbodyUsersConfig");
            if (!tbody) return;
            tbody.innerHTML = `<tr><td colspan="5" style="padding: 16px; text-align: center; color: #64748b;">⏳ Cargando usuarios desde Google Sheets...</td></tr>`;

            try {
                const resp = await fetch('/api/get-users-admin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: pin })
                });
                const data = await resp.json();

                if (resp.ok && data.success && Array.isArray(data.users)) {
                    currentAdminUsers = data.users;
                    renderAdminUsersTable(currentAdminUsers);
                } else {
                    tbody.innerHTML = `<tr><td colspan="5" style="padding: 16px; text-align: center; color: #ef4444;">❌ No se pudieron cargar los usuarios: ${data.message || 'Error'}</td></tr>`;
                }
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="5" style="padding: 16px; text-align: center; color: #ef4444;">❌ Error de conexión al consultar usuarios</td></tr>`;
            }
        }

        function renderAdminUsersTable(users) {
            const tbody = document.getElementById("tbodyUsersConfig");
            if (!tbody) return;
            tbody.innerHTML = "";

            if (!users || users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="padding: 16px; text-align: center; color: #64748b;">No hay usuarios disponibles.</td></tr>`;
                return;
            }

            users.forEach((u) => {
                addUserRow(u);
            });
        }

        function addUserRow(u) {
            const tbody = document.getElementById("tbodyUsersConfig");
            if (!tbody) return;

            const tr = document.createElement("tr");
            tr.className = "user-config-row";
            tr.style.borderBottom = "1px solid #f1f5f9";

            const isPluz = (u.user || '').toUpperCase() === 'PLUZ';
            if (isPluz) tr.style.background = "#fefce8";

            const contractorVal = u.contractor || (isPluz ? '*' : u.user || '');
            const roleVal = u.role || (isPluz ? 'admin' : 'contractor');
            const isAdminRole = roleVal === 'admin' || isPluz;

            tr.innerHTML = `
                <td style="padding: 10px 12px; font-weight: 700; color: ${isPluz ? '#854d0e' : '#0f172a'};">
                    ${escapeHtml(u.user || '')}
                    <input type="hidden" class="cfg-u-user" value="${escapeHtml(u.user || '')}">
                </td>
                <td style="padding: 10px 12px; color: #334155;">
                    ${escapeHtml(contractorVal)}
                    <input type="hidden" class="cfg-u-contractor" value="${escapeHtml(contractorVal)}">
                </td>
                <td style="padding: 10px 12px;">
                    <span style="background: ${isAdminRole ? '#fef08a' : '#e0f2fe'}; color: ${isAdminRole ? '#854d0e' : '#0369a1'}; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">
                        ${isAdminRole ? 'Administrador' : 'Contratista'}
                    </span>
                    <input type="hidden" class="cfg-u-role" value="${escapeHtml(roleVal)}">
                </td>
                <td style="padding: 10px 12px;">
                    <input type="text" class="cfg-u-pass" value="${escapeHtml(u.password || '')}" placeholder="Ingresa contraseña..." style="width: 100%; padding: 5px 8px; border: 1px solid #94a3b8; border-radius: 4px; font-size: 12px; font-family: monospace; box-sizing: border-box; background: #fff;">
                </td>
                <td style="padding: 10px 12px;">
                    <select class="cfg-u-estado" style="padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 11.5px; font-weight: 600; color: ${(u.estado || '').toLowerCase() === 'inactivo' ? '#ef4444' : '#16a34a'};" onchange="this.style.color = this.value === 'inactivo' ? '#ef4444' : '#16a34a';">
                        <option value="activo" ${(u.estado || 'activo').toLowerCase() !== 'inactivo' ? 'selected' : ''}>🟢 Activo</option>
                        <option value="inactivo" ${(u.estado || '').toLowerCase() === 'inactivo' ? 'selected' : ''}>🔴 Inactivo</option>
                    </select>
                </td>
            `;

            tbody.appendChild(tr);
        }

        async function saveAdminUsers() {
            const btnSave = document.getElementById("btnSaveUsersConfig");
            const rows = document.querySelectorAll("#tbodyUsersConfig tr.user-config-row");
            const users = [];

            rows.forEach(tr => {
                const u = tr.querySelector(".cfg-u-user")?.value.trim().toUpperCase() || "";
                const p = tr.querySelector(".cfg-u-pass")?.value.trim() || "";
                const c = tr.querySelector(".cfg-u-contractor")?.value.trim() || (u === 'PLUZ' ? '*' : u);
                const r = tr.querySelector(".cfg-u-role")?.value || (u === 'PLUZ' ? 'admin' : 'contractor');
                const e = tr.querySelector(".cfg-u-estado")?.value || 'activo';

                if (u && p) {
                    users.push({ user: u, password: p, contractor: c, role: r, estado: e });
                }
            });

            if (users.length === 0) {
                showConfigAlert("⚠️ Debes tener al menos un usuario con nombre y contraseña.", "error");
                return;
            }

            if (btnSave) {
                btnSave.innerText = "⏳ Guardando...";
                btnSave.disabled = true;
            }

            try {
                const resp = await fetch('/api/update-users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pin: currentAdminPin,
                        users: users
                    })
                });
                const data = await resp.json();

                if (resp.ok && data.success) {
                    showConfigAlert("✅ " + data.message, "success");
                    currentAdminUsers = users;
                } else {
                    showConfigAlert("❌ Error al guardar: " + (data.message || "Error desconocido"), "error");
                }
            } catch (err) {
                showConfigAlert("❌ Error de red al intentar guardar: " + err.message, "error");
            } finally {
                if (btnSave) {
                    btnSave.innerText = "💾 Guardar y Actualizar Sheets";
                    btnSave.disabled = false;
                }
            }
        }

        function showConfigAlert(msg, type) {
            const alertEl = document.getElementById("configSaveAlert");
            if (!alertEl) return;
            alertEl.innerText = msg;
            alertEl.style.display = "block";
            if (type === "success") {
                alertEl.style.background = "#dcfce7";
                alertEl.style.color = "#15803d";
                alertEl.style.border = "1px solid #86efac";
            } else {
                alertEl.style.background = "#fee2e2";
                alertEl.style.color = "#b91c1c";
                alertEl.style.border = "1px solid #fca5a5";
            }
            setTimeout(() => { alertEl.style.display = "none"; }, 7000);
        }
