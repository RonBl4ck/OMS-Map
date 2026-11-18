        // Lógica para Desbloqueo y Gestión Dinámica de Accesos (PIN Maestro)
        let currentAdminPin = "";
        let currentAdminUsers = [];
        let knownContractors = ['ALFACO', 'COBRA', 'DOMINION', 'INMEL', 'LARI', 'PA'];

        function syncKnownContractors(users = []) {
            const set = new Set(knownContractors.map(c => String(c || '').trim().toUpperCase()).filter(Boolean));
            const addFromRaw = (raw) => {
                if (!raw) return;
                String(raw).split(',').forEach(part => {
                    const clean = part.trim().toUpperCase();
                    if (clean && clean !== '*' && clean !== 'N/A' && clean !== 'SIN ASIGNAR') {
                        set.add(clean);
                    }
                });
            };

            if (Array.isArray(users)) {
                users.forEach(u => addFromRaw(u && u.contractor));
            }
            if (typeof window !== 'undefined') {
                const sources = [window.tdOmsRecords, window.mapLocations];
                sources.forEach(list => {
                    if (Array.isArray(list)) {
                        list.forEach(r => {
                            if (r && typeof r === 'object') {
                                addFromRaw(r.Contratista || r.contratista || r.empresa || r.EMPRESA);
                            }
                        });
                    }
                });
            }
            knownContractors = Array.from(set).sort();
        }

        function collectCurrentAdminTableRows() {
            const rows = document.querySelectorAll("#tbodyUsersConfig tr.user-config-row");
            const collected = [];
            rows.forEach(tr => {
                const user = tr.querySelector(".cfg-u-user")?.value.trim().toUpperCase() || "";
                const password = tr.querySelector(".cfg-u-pass")?.value.trim() || "";
                const contractor = tr.querySelector(".cfg-u-contractor")?.value.trim() || "";
                const role = tr.querySelector(".cfg-u-role")?.value || (user === 'PLUZ' ? 'admin' : 'contractor');
                const estado = tr.querySelector(".cfg-u-estado")?.value || 'activo';
                const isNew = tr.dataset.isNew === '1';
                collected.push({ user, password, contractor, role, estado, _isNew: isNew });
            });
            return collected;
        }

        function initConfigSecurity() {
            const pinModal = document.getElementById("configPinModalOverlay");
            const pinInput = document.getElementById("configPinInput");
            const btnSubmit = document.getElementById("btnSubmitConfigPin");
            const btnCancel = document.getElementById("btnCancelConfigPin");
            const pinErrMsg = document.getElementById("configPinErrMsg");
            const adminModal = document.getElementById("configAdminModalOverlay");
            const btnCloseAdmin = document.getElementById("btnCloseConfigAdmin");
            const btnSaveUsers = document.getElementById("btnSaveUsersConfig");
            const btnAddProfile = document.getElementById("btnAddNewUserProfile");
            const btnAddContractor = document.getElementById("btnAddNewContractorOption");
            const inputNewContractor = document.getElementById("inputNewContractorName");

            if (btnCancel && pinModal) {
                btnCancel.onclick = () => { pinModal.style.display = "none"; };
            }

            if (btnCloseAdmin && adminModal) {
                btnCloseAdmin.onclick = () => { adminModal.style.display = "none"; };
            }

            if (btnAddProfile) {
                btnAddProfile.onclick = () => {
                    const tbody = document.getElementById("tbodyUsersConfig");
                    if (tbody && !tbody.querySelector("tr.user-config-row")) {
                        tbody.innerHTML = "";
                    }
                    addUserRow({ user: '', password: '', contractor: 'COBRA', role: 'contractor', estado: 'activo' }, true);
                };
            }

            if (btnAddContractor) {
                btnAddContractor.onclick = () => {
                    const rawName = inputNewContractor ? inputNewContractor.value.trim().toUpperCase() : "";
                    if (!rawName || rawName === '*') {
                        showConfigAlert("⚠️ Ingresa un nombre válido para la nueva contrata.", "error");
                        return;
                    }
                    if (!knownContractors.includes(rawName)) {
                        knownContractors.push(rawName);
                        knownContractors.sort();
                    }
                    if (inputNewContractor) inputNewContractor.value = "";
                    const currentRows = collectCurrentAdminTableRows();
                    renderAdminUsersTable(currentRows);
                    showConfigAlert(`✅ Contrata "${rawName}" agregada al catálogo.`, "success");
                };
            }

            async function submitPin() {
                const pinVal = pinInput ? pinInput.value.trim() : "";
                if (!pinVal) return;

                if (btnSubmit) {
                    btnSubmit.innerText = "Verificando...";
                    btnSubmit.disabled = true;
                }

                try {
                    const resp = await fetch('/api/get-users-admin', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json',
                            'x-config-pin': pinVal
                        },
                        body: JSON.stringify({ pin: pinVal })
                    });
                    const data = await resp.json();

                    if (resp.ok && data.success && Array.isArray(data.users)) {
                        currentAdminPin = pinVal;
                        if (pinModal) pinModal.style.display = "none";
                        if (adminModal) adminModal.style.display = "block";
                        currentAdminUsers = data.users;
                        syncKnownContractors(currentAdminUsers);
                        renderAdminUsersTable(currentAdminUsers);
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

            const pinForm = document.getElementById("configPinForm");
            if (pinForm) {
                pinForm.onsubmit = (e) => {
                    e.preventDefault();
                    submitPin();
                };
            }
            if (btnSubmit) {
                btnSubmit.onclick = (e) => {
                    e.preventDefault();
                    submitPin();
                };
            }
            if (pinInput) {
                pinInput.onkeydown = (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        submitPin();
                    }
                };
            }

            if (btnSaveUsers) {
                btnSaveUsers.onclick = saveAdminUsers;
            }
        }

        async function loadAdminUsers(pin) {
            const tbody = document.getElementById("tbodyUsersConfig");
            if (!tbody) return;
            tbody.innerHTML = `<tr><td colspan="6" style="padding: 16px; text-align: center; color: #64748b;">⏳ Cargando usuarios desde Google Sheets...</td></tr>`;

            try {
                const resp = await fetch('/api/get-users-admin', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-config-pin': pin
                    },
                    body: JSON.stringify({ pin: pin })
                });
                const data = await resp.json();

                if (resp.ok && data.success && Array.isArray(data.users)) {
                    currentAdminUsers = data.users;
                    syncKnownContractors(currentAdminUsers);
                    renderAdminUsersTable(currentAdminUsers);
                } else {
                    tbody.innerHTML = `<tr><td colspan="6" style="padding: 16px; text-align: center; color: #ef4444;">❌ No se pudieron cargar los usuarios: ${data.message || 'Error'}</td></tr>`;
                }
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="6" style="padding: 16px; text-align: center; color: #ef4444;">❌ Error de conexión al consultar usuarios</td></tr>`;
            }
        }

        function renderAdminUsersTable(users) {
            const tbody = document.getElementById("tbodyUsersConfig");
            if (!tbody) return;
            tbody.innerHTML = "";

            if (!users || users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="padding: 16px; text-align: center; color: #64748b;">No hay usuarios disponibles.</td></tr>`;
                return;
            }

            syncKnownContractors(users);
            users.forEach((u) => {
                addUserRow(u, Boolean(u && u._isNew));
            });
        }

        function addUserRow(u, isNew = false) {
            const tbody = document.getElementById("tbodyUsersConfig");
            if (!tbody) return;

            const tr = document.createElement("tr");
            tr.className = "user-config-row";
            tr.style.borderBottom = "1px solid #f1f5f9";
            if (isNew) tr.dataset.isNew = "1";

            const userStr = String(u.user || '').trim().toUpperCase();
            const isPluz = !isNew && userStr === 'PLUZ';
            if (isPluz) tr.style.background = "#fefce8";

            const roleVal = isPluz ? 'admin' : ((u.role || 'contractor').toLowerCase() === 'admin' ? 'admin' : 'contractor');
            const contractorRaw = String(u.contractor !== undefined ? u.contractor : (isPluz ? '*' : userStr)).trim();
            const isAllSelected = contractorRaw === '*' && roleVal === 'admin';
            const selectedSet = new Set(
                isAllSelected
                    ? []
                    : contractorRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
            );
            const normalizedHiddenVal = isAllSelected ? '*' : Array.from(selectedSet).join(',');

            const userCellHtml = isPluz
                ? `<span style="font-weight: 700; color: #854d0e;">PLUZ</span><input type="hidden" class="cfg-u-user" value="PLUZ">`
                : `<input type="text" class="cfg-u-user" value="${escapeHtml(userStr)}" placeholder="EJ. SUPERVISOR_SUR" style="width: 100%; min-width: 120px; padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; font-weight: 700; text-transform: uppercase; box-sizing: border-box;">`;

            const contractorChipsHtml = knownContractors.map(c => {
                const checked = !isAllSelected && selectedSet.has(c) ? 'checked' : '';
                const disabled = isPluz ? 'disabled' : '';
                return `
                    <label style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 7px; border: 1px solid #cbd5e1; border-radius: 999px; background: #f8fafc; font-size: 11px; font-weight: 600; cursor: ${isPluz ? 'not-allowed' : 'pointer'};">
                        <input type="checkbox" class="cfg-u-contractor-chk" value="${escapeHtml(c)}" ${checked} ${disabled}>
                        <span>${escapeHtml(c)}</span>
                    </label>
                `;
            }).join('');

            tr.innerHTML = `
                <td style="padding: 10px 12px; color: ${isPluz ? '#854d0e' : '#0f172a'};">
                    ${userCellHtml}
                </td>
                <td style="padding: 10px 12px;">
                    <select class="cfg-u-role" ${isPluz ? 'disabled' : ''} style="padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 11.5px; font-weight: 700; background: #fff;">
                        <option value="contractor" ${roleVal !== 'admin' ? 'selected' : ''}>👷 Contratista</option>
                        <option value="admin" ${roleVal === 'admin' ? 'selected' : ''}>🛡️ Administrador</option>
                    </select>
                </td>
                <td style="padding: 10px 12px;">
                    <div class="cfg-u-contractors-box" style="display: flex; flex-wrap: wrap; gap: 5px; align-items: center;">
                        <label class="cfg-u-all-wrap" style="display: ${roleVal === 'admin' ? 'inline-flex' : 'none'}; align-items: center; gap: 4px; padding: 3px 8px; border: 1px solid #facc15; border-radius: 999px; background: #fef9c3; color: #854d0e; font-size: 11px; font-weight: 700; cursor: ${isPluz ? 'not-allowed' : 'pointer'};">
                            <input type="checkbox" class="cfg-u-all-contractors" ${isAllSelected ? 'checked' : ''} ${isPluz ? 'disabled' : ''}>
                            <span>🌐 Todas (*)</span>
                        </label>
                        ${contractorChipsHtml}
                    </div>
                    <input type="hidden" class="cfg-u-contractor" value="${escapeHtml(normalizedHiddenVal)}">
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
                <td style="padding: 10px 12px; text-align: center;">
                    <button type="button" class="cfg-u-delete" ${isPluz ? 'disabled' : ''} title="${isPluz ? 'PLUZ no se puede eliminar' : 'Eliminar perfil'}" style="background: ${isPluz ? '#e2e8f0' : '#fee2e2'}; color: ${isPluz ? '#94a3b8' : '#b91c1c'}; border: 0; padding: 5px 9px; border-radius: 6px; cursor: ${isPluz ? 'not-allowed' : 'pointer'}; font-size: 13px;">🗑️</button>
                </td>
            `;

            const roleSelect = tr.querySelector(".cfg-u-role");
            const allWrap = tr.querySelector(".cfg-u-all-wrap");
            const allChk = tr.querySelector(".cfg-u-all-contractors");
            const chks = Array.from(tr.querySelectorAll(".cfg-u-contractor-chk"));
            const hiddenInput = tr.querySelector(".cfg-u-contractor");
            const delBtn = tr.querySelector(".cfg-u-delete");

            function syncContractorHidden() {
                if (allChk && allChk.checked && roleSelect && roleSelect.value === 'admin') {
                    hiddenInput.value = '*';
                    return;
                }
                const picked = chks.filter(c => c.checked).map(c => c.value);
                hiddenInput.value = picked.join(',');
            }

            if (allChk) {
                allChk.addEventListener('change', () => {
                    if (allChk.checked) {
                        chks.forEach(c => { c.checked = false; });
                    }
                    syncContractorHidden();
                });
            }

            chks.forEach(chk => {
                chk.addEventListener('change', () => {
                    if (chk.checked && allChk) {
                        allChk.checked = false;
                    }
                    syncContractorHidden();
                });
            });

            if (roleSelect) {
                roleSelect.addEventListener('change', () => {
                    const isAdminRole = roleSelect.value === 'admin';
                    if (allWrap) {
                        allWrap.style.display = isAdminRole ? 'inline-flex' : 'none';
                    }
                    if (!isAdminRole && allChk) {
                        allChk.checked = false;
                    }
                    syncContractorHidden();
                });
            }

            if (delBtn && !isPluz) {
                delBtn.addEventListener('click', () => {
                    tr.remove();
                });
            }

            tbody.appendChild(tr);
        }

        async function saveAdminUsers() {
            const btnSave = document.getElementById("btnSaveUsersConfig");
            const rows = document.querySelectorAll("#tbodyUsersConfig tr.user-config-row");
            const users = [];
            const seenUsers = new Set();

            for (const tr of rows) {
                const u = tr.querySelector(".cfg-u-user")?.value.trim().toUpperCase() || "";
                const p = tr.querySelector(".cfg-u-pass")?.value.trim() || "";
                const r = tr.querySelector(".cfg-u-role")?.value || (u === 'PLUZ' ? 'admin' : 'contractor');
                const c = tr.querySelector(".cfg-u-contractor")?.value.trim() || "";
                const e = tr.querySelector(".cfg-u-estado")?.value || 'activo';

                if (!u) {
                    showConfigAlert("⚠️ Todas las filas deben tener un nombre de usuario.", "error");
                    return;
                }
                if (seenUsers.has(u)) {
                    showConfigAlert(`⚠️ El usuario "${u}" está duplicado.`, "error");
                    return;
                }
                seenUsers.add(u);

                if (!p) {
                    showConfigAlert(`⚠️ El usuario "${u}" debe tener una contraseña.`, "error");
                    return;
                }
                if (!c || (r !== 'admin' && c === '*')) {
                    showConfigAlert(`⚠️ El usuario "${u}" debe tener al menos una contrata asignada.`, "error");
                    return;
                }

                users.push({ user: u, password: p, contractor: c, role: r, estado: e });
            }

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
                    if (typeof window !== 'undefined' && typeof window.loadPublicLoginProfiles === 'function') {
                        window.loadPublicLoginProfiles();
                    }
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
