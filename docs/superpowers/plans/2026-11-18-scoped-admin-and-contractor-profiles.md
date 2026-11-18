# Perfiles Dinámicos de Contrata y Admin Multi-Contrata (Scoped Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir crear, editar y autenticar nuevos perfiles de Contratista y perfiles de Administrador Acotado (Scoped Admin que solo visualiza las contratas que el Super Admin le asigne), sincronizados en tiempo real con Google Sheets (hoja `ACCESOS`) y Google Apps Script.

**Architecture:** Se desacopla el privilegio funcional (`role: 'admin' | 'contractor'`) del alcance de datos (`contractor: '*' | 'COBRA,INMEL,...'`). Se añade un modo público en `/api/get-users-admin` (`GET` sin contraseñas) para poblar dinámicamente el selector de Login con los perfiles activos de Google Sheets; se amplía el panel `⚙️ Configuración` (`assets/js/70-admin.js`) con creación/eliminación de perfiles, selector de Rol y selector multi-contrata interactivo; y se extiende el filtrado por `oms_assigned_contractor` a los módulos de Admin (`45-historial-pluz.js` y `30-llamadas.js`) para que un Admin acotado solo vea tickets, historial y llamadas de sus contratas asignadas.

**Tech Stack:** Vanilla JavaScript (ES6+), Node.js / Vercel Serverless Functions (`api/*.js`), tokens HMAC-SHA256 (`api/_lib/auth-token.js`), Google Sheets CSV + Google Apps Script Webhook (`doPost`), `node:test` runner.

**Spec:** `C:\Users\P723919021\.gemini\antigravity\brain\20100068-a4e5-4eb9-ad33-19b9780d0bd8\implementation_plan.md`

## Global Constraints

- **Compatibilidad de Tests Existentes:** Todos los tests en `tests/*.test.js` deben seguir pasando al 100% (`node --test tests/*.test.js`).
- **Terminología Estricta:** Mantener término `plazo` en la interfaz (nunca `SLA`).
- **Retrocompatibilidad en Login (`index.html`):** El `<select id="authUserInput">` debe conservar en el HTML estático las 7 opciones base (`ALFACO`, `COBRA`, `DOMINION`, `INMEL`, `LARI`, `PA`, `PLUZ`) como fallback instantáneo y fusionarlas dinámicamente con los perfiles activos traídos de Google Sheets / `config.json`.
- **Seguridad de Credenciales:** El listado público para el selector de login (`GET /api/get-users-admin?public=1`) **jamás** debe devolver el campo `password` ni usuarios con `estado === 'inactivo'`.
- **Protección del Super Admin:** El botón `⚙️` (`#btnOpenConfig`) solo debe mostrarse cuando el usuario sea Super Admin (`role === 'admin'` y `contractor === '*'`), ocultándose para Admins acotados y Contratistas. El perfil maestro `PLUZ` no puede ser eliminado en la tabla de configuración.
- **Bundle Build:** Cualquier cambio en submódulos (`assets/js/components/*`, `assets/js/services/*`, `assets/css/*`) requiere ejecutar `node scripts/build-bundle.js`.

---

## Arquitectura de Subagentes para la Ejecución

Para aplicar estos cambios con máxima velocidad, aislamiento de contexto y cero regresiones, desplegaremos **4 subagentes especializados** coordinados bajo `subagent-driven-development`:

1. 🤖 **Subagente 1 (`Backend & Auth API Engineer` - Tareas 1 y 2):**
   - Modifica `api/_lib/auth-token.js`, `api/login.js`, `api/get-users-admin.js` y `api/update-users.js`.
   - Implementa el endpoint público sanitizado (`GET /api/get-users-admin?public=1`) que devuelve perfiles activos sin contraseñas.
   - Asegura que el token HMAC incluya `{ user, role, contractor }` y que `api/update-users.js` normalice roles (`admin` / `contractor`) y listas de contratas (`*` o `EMPRESA1,EMPRESA2`).
   - Documenta y genera el script listo para copiar/pegar de **Google Apps Script (`scripts/google-apps-script-accesos.gs`)** para la hoja `ACCESOS`.

2. 🤖 **Subagente 2 (`Admin Panel & Dynamic Login UI Engineer` - Tareas 3 y 4):**
   - Modifica `index.html`, `assets/js/60-auth.js` y `assets/js/70-admin.js`.
   - En `60-auth.js`: carga dinámicamente los perfiles activos en `#authUserInput` al abrir el login, guarda el token HMAC real y restringe el botón `⚙️` (`#btnOpenConfig`) exclusivamente al Super Admin (`isAdmin && contractor === '*'`).
   - En `index.html` y `70-admin.js`: construye la nueva interfaz del Panel de Gestión de Usuarios con botón **`➕ Nuevo Perfil`**, edición de nombre de usuario, selector de Rol (`Administrador` / `Contratista`), selector multi-check de Contratas (`Todas (*)` o selección personalizada + opción de escribir nueva contrata) y botón de eliminar fila (protegiendo a `PLUZ`).

3. 🤖 **Subagente 3 (`Scoped Admin Data Filtering Engineer` - Tarea 5):**
   - Modifica `assets/js/00-core.js`, `assets/js/45-historial-pluz.js` y `assets/js/30-llamadas.js`.
   - Crea el helper universal `isCurrentUserSuperAdmin()` y `recordMatchesAssignedContractor(recordOrCompany, assignedContractor)` en `00-core.js`.
   - Aplica el filtro de contratas asignadas en `45-historial-pluz.js` (`getSupervisorTicketsList`) y en `30-llamadas.js` (`loadLlamadas` / `renderLlamadasTable` cruzando contra `omsRecordsByTicketMap`) para que un Admin acotado solo vea el historial PLUZ y llamadas de las contratas que tiene permitidas.

4. 🤖 **Subagente 4 (`QA & Integration Verification Reviewer` - Tarea 6):**
   - Crea la suite completa de pruebas `tests/scoped-admin-and-profiles.test.js` y ejecuta toda la batería de tests del proyecto (`node --test tests/*.test.js`) y `node scripts/build-bundle.js`.

---

### Task 1: Backend API — Token HMAC con Contractor, Lista Pública de Perfiles y Normalización de Usuarios

**Files:**
- Modify: `api/_lib/auth-token.js`
- Modify: `api/login.js`
- Modify: `api/get-users-admin.js`
- Modify: `api/update-users.js`
- Test: `tests/scoped-admin-and-profiles.test.js`

**Interfaces:**
- Consumes: `process.env.SHEETS_URL_USERS`, `config.json`
- Produces:
  - `createAuthToken({ user, role, contractor, expHours })` -> firma `{ user, role, contractor, iat, exp }`.
  - `GET /api/get-users-admin?public=1` -> `{ success: true, profiles: [{ user, contractor, role }] }` (sin `password`, solo usuarios con `estado !== 'inactivo'`).
  - `POST /api/update-users` -> normaliza `contractor` (mayúsculas separadas por coma o `*`) y `role` (`admin` o `contractor`).

- [ ] **Step 1: Write the failing test in `tests/scoped-admin-and-profiles.test.js`**

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthToken, verifyAuthToken } = require('../api/_lib/auth-token');
const getUsersAdminHandler = require('../api/get-users-admin');

test('createAuthToken incluye el campo contractor firmado en el payload HMAC', () => {
    const token = createAuthToken({ user: 'ADMIN_NORTE', role: 'admin', contractor: 'COBRA,INMEL' });
    const verified = verifyAuthToken(token);
    assert.equal(verified.valid, true);
    assert.equal(verified.payload.user, 'ADMIN_NORTE');
    assert.equal(verified.payload.role, 'admin');
    assert.equal(verified.payload.contractor, 'COBRA,INMEL');
});

test('GET /api/get-users-admin?public=1 devuelve lista pública de perfiles activos SIN exponer contraseñas', async () => {
    let status = 200;
    let payload = null;
    const req = {
        method: 'GET',
        url: '/api/get-users-admin?public=1',
        query: { public: '1' },
        headers: {}
    };
    const res = {
        setHeader() {},
        writeHead(c) { status = c; },
        end(d) { payload = JSON.parse(d); },
        status(c) { status = c; return { send(d) { payload = JSON.parse(d); } }; }
    };

    await getUsersAdminHandler(req, res);
    assert.equal(status, 200);
    assert.equal(payload.success, true);
    assert.ok(Array.isArray(payload.profiles), 'Debe devolver array profiles');
    payload.profiles.forEach(p => {
        assert.equal(p.password, undefined, 'Jamás debe exponer password en modo público');
        assert.ok(p.user, 'Cada perfil debe tener user');
        assert.ok(p.role, 'Cada perfil debe tener role');
        assert.ok(p.contractor, 'Cada perfil debe tener contractor');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scoped-admin-and-profiles.test.js`
Expected: FAIL (`GET` returns 405 in `api/get-users-admin.js` and `contractor` is not included in `createAuthToken`).

- [ ] **Step 3: Implement backend changes in `api/_lib/auth-token.js`, `api/login.js`, `api/get-users-admin.js`, and `api/update-users.js`**

1. En `api/_lib/auth-token.js`, actualizar `createAuthToken`:
```javascript
function createAuthToken({ user, role, contractor = '*', expHours = 24 }) {
    const iat = Date.now();
    const exp = iat + Math.round(Number(expHours) * 3600 * 1000);
    const payloadObj = {
        user: String(user || '').trim(),
        role: String(role || 'contractor').trim().toLowerCase(),
        contractor: String(contractor || '*').trim().toUpperCase(),
        iat,
        exp
    };
```
2. En `api/login.js`, pasar `contractor: resolvedContractor` a `createAuthToken({ user: resolvedUser, role: resolvedRole, contractor: resolvedContractor })` y normalizar `resolvedContractor` (si viene vacío, usar `*` cuando `resolvedRole === 'admin'` o `resolvedUser` cuando es `contractor`).
3. En `api/get-users-admin.js`, permitir `req.method === 'GET'` (o `body.public === true`) para devolver únicamente perfiles activos sanitizados (`{ user, contractor, role }`) junto con los perfiles por defecto si la hoja aún no tiene datos, sin requerir el PIN maestro. Para `POST` sin `public`, mantener intacta la validación estricta del PIN maestro `x-config-pin`.
4. En `api/update-users.js`, sanitizar cada elemento de `users` antes de enviarlo al Webhook de Google Apps Script y guardarlo en `config.json`:
```javascript
const cleanUsers = users.map(u => {
    const user = String(u.user || '').trim().toUpperCase();
    const password = String(u.password || '').trim();
    const role = String(u.role || (user === 'PLUZ' ? 'admin' : 'contractor')).trim().toLowerCase() === 'admin' ? 'admin' : 'contractor';
    let contractor = String(u.contractor || (user === 'PLUZ' ? '*' : user)).trim().toUpperCase();
    if (user === 'PLUZ') contractor = '*';
    const estado = String(u.estado || 'activo').trim().toLowerCase() === 'inactivo' ? 'inactivo' : 'activo';
    return { user, password, contractor, role, estado };
}).filter(u => u.user && u.password);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/scoped-admin-and-profiles.test.js tests/api-security-hmac.test.js`
Expected: PASS

---

### Task 2: Google Sheets & Google Apps Script (`scripts/google-apps-script-accesos.gs` + `README_VERCEL.md`)

**Files:**
- Create: `scripts/google-apps-script-accesos.gs`
- Modify: `README_VERCEL.md`

**Interfaces:**
- Produces: Código completo de Google Apps Script (`doPost`) que soporta simultáneamente:
  1. Actualización completa de la pestaña `ACCESOS` (`Usuario | Password | Contratista | Rol | Estado`) cuando recibe `{ users: [...] }` desde `/api/update-users`.
  2. Registro de novedades en `SEGUIMIENTO_SUPERVISOR` (`action === 'append_supervisor_log'`).
  3. Lectura y guardado de `CAPAS_SED` (`action === 'get_sed_layers'` y `action === 'save_sed_layers'`).

- [ ] **Step 1: Crear `scripts/google-apps-script-accesos.gs` con el código unificado de Apps Script**

```javascript
/**
 * Google Apps Script Unificado para OMS Map - Pluz Energía
 * Soporta:
 * 1. Gestión de Perfiles, Contratas y Admins Acotados en pestaña "ACCESOS"
 * 2. Registro de Supervisión en pestaña "SEGUIMIENTO_SUPERVISOR"
 * 3. Gestión de Capas SED en pestaña "CAPAS_SED"
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var data = JSON.parse(raw);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. ACTUALIZACIÓN DE USUARIOS Y PERFILES (Hoja: ACCESOS)
    if (Array.isArray(data.users)) {
      var sheet = ss.getSheetByName("ACCESOS");
      if (!sheet) {
        sheet = ss.insertSheet("ACCESOS");
      }
      sheet.clearContents();
      var rows = [["Usuario", "Password", "Contratista", "Rol", "Estado"]];
      for (var i = 0; i < data.users.length; i++) {
        var u = data.users[i] || {};
        var user = String(u.user || "").trim().toUpperCase();
        var pass = String(u.password || "").trim();
        if (!user || !pass) continue;
        var role = String(u.role || (user === "PLUZ" ? "admin" : "contractor")).trim().toLowerCase();
        var contractor = String(u.contractor || (role === "admin" ? "*" : user)).trim().toUpperCase();
        var estado = String(u.estado || "activo").trim().toLowerCase();
        rows.push([user, pass, contractor, role, estado]);
      }
      sheet.getRange(1, 1, rows.length, 5).setValues(rows);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: "Hoja ACCESOS actualizada (" + (rows.length - 1) + " perfiles)."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. GESTIÓN DE CAPAS SED (Hoja: CAPAS_SED)
    if (data.action === "get_sed_layers") {
      var capSheet = ss.getSheetByName("CAPAS_SED");
      if (!capSheet || capSheet.getLastRow() < 2) {
        return ContentService.createTextOutput(JSON.stringify({ success: true, layers: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var capVals = capSheet.getDataRange().getValues();
      var layers = [];
      for (var r = 1; r < capVals.length; r++) {
        if (capVals[r][0]) {
          layers.push({
            name: String(capVals[r][0]).trim().toUpperCase(),
            seds: String(capVals[r][1] || "").split(",").map(function(s) { return s.trim(); }).filter(Boolean),
            updatedAt: String(capVals[r][2] || ""),
            updatedBy: String(capVals[r][3] || "PLUZ")
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, layers: layers }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "save_sed_layers" && Array.isArray(data.layers)) {
      var saveCapSheet = ss.getSheetByName("CAPAS_SED") || ss.insertSheet("CAPAS_SED");
      saveCapSheet.clearContents();
      var capRows = [["Nombre_Capa", "SEDs", "Fecha_Actualizacion", "Usuario"]];
      for (var j = 0; j < data.layers.length; j++) {
        var l = data.layers[j];
        var sedsStr = Array.isArray(l.seds) ? l.seds.join(",") : String(l.seds || "");
        capRows.push([l.name, sedsStr, l.updatedAt || new Date().toISOString(), l.updatedBy || data.usuario || "PLUZ"]);
      }
      saveCapSheet.getRange(1, 1, capRows.length, 4).setValues(capRows);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "CAPAS_SED actualizada." }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3. REGISTRO DE SUPERVISIÓN (Hoja: SEGUIMIENTO_SUPERVISOR)
    if (data.action === "append_supervisor_log" || data.ticket) {
      var supSheet = ss.getSheetByName("SEGUIMIENTO_SUPERVISOR") || ss.insertSheet("SEGUIMIENTO_SUPERVISOR");
      if (supSheet.getLastRow() === 0) {
        supSheet.appendRow([
          "Fecha_Hora", "Ticket", "SED", "Hora_Inicio", "Alimentador", "Empresa",
          "Estado_Operativo", "Detalle_Operativo", "Jefe_Cuadrilla", "Fin_Estimado",
          "Estado_Critico", "Detalle_Critico", "Usuario"
        ]);
      }
      supSheet.appendRow([
        data.fecha || new Date().toLocaleString("es-PE"),
        data.ticket || "",
        data.sed || "",
        data.horaInicio || "",
        data.alimentador || "",
        data.empresa || "",
        data.estadoOperativo || "",
        data.detalleOperativo || "",
        data.jefeCuadrilla || "",
        data.finEstimado || "",
        data.estadoCritico || "",
        data.detalleCritico || "",
        data.usuario || "PLUZ"
      ]);
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Acción no reconocida" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
```

- [ ] **Step 2: Actualizar `README_VERCEL.md` documentando cómo configurar nuevos contratistas y Admins acotados en `ACCESOS`**

Explicar la estructura de la tabla `ACCESOS` con ejemplos de:
- Super Admin (`PLUZ` | `clave` | `*` | `admin` | `activo`)
- Admin Acotado (`ADMIN_NORTE` | `clave` | `COBRA,INMEL` | `admin` | `activo`)
- Nuevo Contratista (`CONCYSSA` | `clave` | `CONCYSSA` | `contractor` | `activo`)

---

### Task 3: Login Dinámico y Protección del Botón de Configuración (`assets/js/60-auth.js` y `assets/js/00-core.js`)

**Files:**
- Modify: `assets/js/00-core.js:97-101`
- Modify: `assets/js/60-auth.js:237-298`
- Modify: `assets/js/60-auth.js:688-717`
- Modify: `assets/js/60-auth.js:804-836`
- Test: `tests/scoped-admin-and-profiles.test.js`

**Interfaces:**
- Produces in `00-core.js`:
  - `isCurrentUserAdmin()`: `sessionStorage.getItem('oms_user_role') === 'admin'`
  - `isCurrentUserSuperAdmin()`: `isCurrentUserAdmin() && (sessionStorage.getItem('oms_assigned_contractor') || '*') === '*'`
  - `recordMatchesAssignedContractor(recordOrCompanyStr, assignedContractor)`: devuelve `true` si `assignedContractor === '*'` o si el nombre de empresa coincide con alguna de las contratas separadas por coma en `assignedContractor`.
- Produces in `60-auth.js`:
  - `loadPublicLoginProfiles()`: consulta `GET /api/get-users-admin?public=1` y actualiza las opciones de `#authUserInput` conservando las opciones base y añadiendo cualquier perfil nuevo creado (formateando la etiqueta como `USUARIO (Administrador: COBRA + INMEL)` o `USUARIO (Contratista)`).
  - En `updateUserBadge()`: el botón `#btnOpenConfig` (`⚙️`) solo se muestra si `isSuperAdmin` (`isAdmin && contractor === '*'`), y el badge `#navUserName` muestra:
    - Si `isAdmin && contractor === '*'` -> `👤 PLUZ (Admin)`
    - Si `isAdmin && contractor !== '*'` -> `👤 ADMIN_NORTE (Admin: COBRA + INMEL)`
    - Si `!isAdmin` -> `👤 COBRA (COBRA)`

- [ ] **Step 1: Write failing tests for `isCurrentUserSuperAdmin`, `updateUserBadge` with scoped admin, and `loadPublicLoginProfiles`**

```javascript
test('updateUserBadge oculta btnOpenConfig para un Admin Acotado (contractor !== "*") pero mantiene herramientas operativas de Admin', () => {
    // Test verification in tests/scoped-admin-and-profiles.test.js
});
```

- [ ] **Step 2: Implement `isCurrentUserSuperAdmin` and `recordMatchesAssignedContractor` in `assets/js/00-core.js`**

```javascript
function isCurrentUserSuperAdmin() {
    if (typeof sessionStorage === 'undefined') return false;
    const isAdmin = sessionStorage.getItem('oms_user_role') === 'admin';
    const contractor = (sessionStorage.getItem('oms_assigned_contractor') || '*').trim();
    return isAdmin && contractor === '*';
}

function recordMatchesAssignedContractor(recordOrCompany, assignedContractor) {
    const cleanAssigned = String(assignedContractor || '*').trim().toUpperCase();
    if (cleanAssigned === '*') return true;
    if (!cleanAssigned) return false;
    const targets = cleanAssigned.split(',').map(s => s.trim()).filter(Boolean);
    const company = (typeof recordOrCompany === 'string')
        ? recordOrCompany.trim().toUpperCase()
        : getProp(recordOrCompany, 'Contratista', 'Empresa', 'CONTRATISTA', 'empresa', 'Pto.tbjo.responsable').toUpperCase();
    if (!company || company === 'N/A') return false;
    return targets.some(t => company.includes(t) || t.includes(company));
}
```

- [ ] **Step 3: Implement `loadPublicLoginProfiles` and update `updateUserBadge` in `assets/js/60-auth.js`**

En `updateUserBadge()`:
```javascript
const isSuperAdmin = isAdmin && contractor.trim() === '*';
if (navUserName) {
    let contractorLabel = "Admin";
    if (contractor !== "*") {
        const joined = contractor.split(',').map(s => s.trim()).filter(Boolean).join(' + ');
        contractorLabel = isAdmin ? `Admin: ${joined}` : joined;
    }
    navUserName.innerText = `👤 ${userId} (${contractorLabel})`;
}
if (btnOpenConfig) {
    btnOpenConfig.style.display = isSuperAdmin ? 'inline-flex' : 'none';
    ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/scoped-admin-and-profiles.test.js tests/role-auditing-security.test.js`
Expected: PASS

---

### Task 4: Nuevo Panel de Gestión de Perfiles, Roles y Selector Multi-Contrata (`index.html` y `assets/js/70-admin.js`)

**Files:**
- Modify: `index.html:1140-1193`
- Modify: `assets/js/70-admin.js:1-254`
- Test: `tests/scoped-admin-and-profiles.test.js`

**Interfaces:**
- Produces in `70-admin.js`:
  - `KNOWN_CONTRACTORS`: lista base `['ALFACO', 'COBRA', 'DOMINION', 'INMEL', 'LARI', 'PA']` + detección dinámica de cualquier contrata nueva ya asignada en usuarios o en `tdOmsRecords` / `mapLocations`.
  - Botón `#btnAddNewUserProfile` (`➕ Nuevo Perfil`) en el modal de configuración que añade una fila editable a `#tbodyUsersConfig`.
  - En cada fila (`addUserRow(u, isNew)`):
    - **Usuario / Perfil:** `<input type="text" class="cfg-u-user">` editable para nuevos perfiles (y de solo lectura para `PLUZ`).
    - **Rol:** `<select class="cfg-u-role">` con opciones `contractor` (`👷 Contratista`) y `admin` (`🛡️ Administrador`).
    - **Contratistas Asignadas (Alcance de Visibilidad):**
      - Checkbox o chip `🌐 Todas (*)` (habilitado cuando el rol es `admin`).
      - Checkboxes interactivos para cada contrata conocida (`ALFACO`, `COBRA`, `DOMINION`, `INMEL`, `LARI`, `PA`, más contratas personalizadas).
      - Mini-input `+ Otra contrata` en la fila o cabecera para agregar al instante una nueva empresa contratista al catálogo si entra una nueva contrata a operar con PLUZ.
      - Sincroniza automáticamente el `<input type="hidden" class="cfg-u-contractor">` con `*` o `COBRA,LARI`.
    - **Contraseña:** `<input type="text" class="cfg-u-pass">`.
    - **Estado:** `<select class="cfg-u-estado">` (`🟢 Activo` / `🔴 Inactivo`).
    - **Acción:** Botón `🗑️` para eliminar un perfil (deshabilitado para `PLUZ`).
  - Al guardar (`saveAdminUsers()`), valida que no haya usuarios duplicados ni sin contrata asignada, sincroniza con `/api/update-users` y refresca el selector de login `loadPublicLoginProfiles()`.

- [ ] **Step 1: Write failing test for `70-admin.js` profile creation, role switching, and multi-contractor selection**

```javascript
test('70-admin.js permite agregar nuevo perfil, elegir rol admin/contractor y seleccionar múltiples contratas', () => {
    const adminJs = fs.readFileSync(path.join(root, 'assets', 'js', '70-admin.js'), 'utf8');
    assert.match(adminJs, /function\s+createNewUserProfileRow|btnAddNewUserProfile/, 'Debe soportar creación de nuevos perfiles');
    assert.match(adminJs, /cfg-u-role/, 'Debe permitir seleccionar rol admin o contractor');
    assert.match(adminJs, /cfg-u-contractor/, 'Debe sincronizar el campo contractor (ej. * o lista separada por comas)');
});
```

- [ ] **Step 2: Update `index.html` (`#configAdminModalOverlay`) to include the `➕ Nuevo Perfil` and `➕ Nueva Empresa Contrata` controls**

En `index.html` (líneas 1150-1189), añadir junto al botón `💾 Guardar y Actualizar Sheets` el botón `➕ Nuevo Perfil` (`id="btnAddNewUserProfile"`) y una columna `Acciones` en la tabla `#tbodyUsersConfig`.

- [ ] **Step 3: Implement rich editable table and multi-contractor selector in `assets/js/70-admin.js`**

Implementar en `assets/js/70-admin.js`:
- `getAvailableContractorsList(users)`: une `['ALFACO', 'COBRA', 'DOMINION', 'INMEL', 'LARI', 'PA']` con cualquier empresa adicional presente en `users` o en los tickets cargados.
- `addUserRow(u, isNew = false)`: renderiza el selector de rol (`admin` / `contractor`), chips clickeables de contratas (donde hacer clic en `Todas (*)` marca `*`, o hacer clic en una o varias empresas como `COBRA` + `INMEL` construye `COBRA,INMEL`), input `+ Empresa` para añadir una nueva contrata en caliente, input de contraseña, selector de estado y botón eliminar.
- Al guardar con éxito en `saveAdminUsers()`, invocar `if (typeof window.loadPublicLoginProfiles === 'function') window.loadPublicLoginProfiles();`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/scoped-admin-and-profiles.test.js`
Expected: PASS

---

### Task 5: Aislamiento de Datos para Admin Acotado en Historial PLUZ y Llamadas (`assets/js/45-historial-pluz.js` y `assets/js/30-llamadas.js`)

**Files:**
- Modify: `assets/js/45-historial-pluz.js:117-136`
- Modify: `assets/js/30-llamadas.js:366-408`
- Test: `tests/scoped-admin-and-profiles.test.js`

**Interfaces:**
- Consumes: `sessionStorage.getItem('oms_assigned_contractor')`, `recordMatchesAssignedContractor`, `window.omsRecordsByTicketMap`
- Produces:
  - En `45-historial-pluz.js`: `getSupervisorTicketsList()` filtra las entradas de `supervisorRecordsMap` cuando `assignedContractor !== '*'`. Verifica `data.latest.empresa` (que ya fue enriquecido por `enrichSupervisorRecordsWithOmsData()`) usando `recordMatchesAssignedContractor(data.latest.empresa, assignedContractor)`.
  - En `30-llamadas.js`: `filterLlamadasForAssignedContractor(records, assignedContractor)` filtra `llamadasRecords` cuando `assignedContractor !== '*'`. Si la fila de llamada tiene columna `Empresa`/`Contratista` la evalúa directamente; si no, cruza `row.ticket` o `row.odm` contra `window.omsRecordsByTicketMap` / `tdOmsRecords` / `ejecutadosRecords` para verificar que el caso pertenece a una de las contratas permitidas del Admin acotado.

- [ ] **Step 1: Write failing test verifying Scoped Admin data isolation in Historial PLUZ and Llamadas**

```javascript
test('45-historial-pluz.js y 30-llamadas.js filtran registros según oms_assigned_contractor para Admins acotados', () => {
    const histJs = fs.readFileSync(path.join(root, 'assets', 'js', '45-historial-pluz.js'), 'utf8');
    const callsJs = fs.readFileSync(path.join(root, 'assets', 'js', '30-llamadas.js'), 'utf8');
    assert.match(histJs, /oms_assigned_contractor/, '45-historial-pluz.js debe respetar oms_assigned_contractor');
    assert.match(callsJs, /oms_assigned_contractor/, '30-llamadas.js debe respetar oms_assigned_contractor');
});
```

- [ ] **Step 2: Implement contractor scope filtering in `assets/js/45-historial-pluz.js` and `assets/js/30-llamadas.js`**

1. En `assets/js/45-historial-pluz.js` dentro de `getSupervisorTicketsList()`:
```javascript
const assignedContractor = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('oms_assigned_contractor') : null) || '*';
const isScoped = assignedContractor && assignedContractor.trim() !== '*';
const list = [];
for (const [key, data] of supervisorRecordsMap.entries()) {
    if (data && data.latest && isTicketQuanticoOrCritico(data)) {
        if (isScoped) {
            const emp = data.latest.empresa || (Array.isArray(data.history) ? (data.history.find(h => h && h.empresa)?.empresa || '') : '');
            const matches = typeof recordMatchesAssignedContractor === 'function'
                ? recordMatchesAssignedContractor(emp, assignedContractor)
                : false;
            if (!matches) continue;
        }
        list.push(data);
    }
}
```

2. En `assets/js/30-llamadas.js`, añadir `filterLlamadasByAssignedContractor(rows)` y aplicarlo al cargar `loadLlamadas()` y en `renderLlamadasTable()`:
```javascript
function filterLlamadasByAssignedContractor(rows) {
    const assignedContractor = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('oms_assigned_contractor') : null) || '*';
    if (!assignedContractor || assignedContractor.trim() === '*') return rows || [];
    const ticketMap = (typeof window !== 'undefined' && window.omsRecordsByTicketMap instanceof Map)
        ? window.omsRecordsByTicketMap
        : null;
    return (rows || []).filter(row => {
        if (!row) return false;
        let emp = row.empresa || row.contratista || '';
        if (!emp && ticketMap) {
            const tKey = String(row.ticket || '').trim();
            const oKey = String(row.odm || '').trim();
            const matchedRec = (tKey && (ticketMap.get(tKey) || ticketMap.get(tKey.toLowerCase()))) ||
                               (oKey && (ticketMap.get(oKey) || ticketMap.get(oKey.toLowerCase())));
            if (matchedRec) {
                emp = matchedRec.empresa || matchedRec.Contratista || matchedRec.Empresa || '';
            }
        }
        if (typeof recordMatchesAssignedContractor === 'function') {
            return recordMatchesAssignedContractor(emp, assignedContractor);
        }
        return false;
    });
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `node --test tests/scoped-admin-and-profiles.test.js tests/calls-stage4.test.js`
Expected: PASS

---

### Task 6: Regresión Completa y Empaquetado (`tests/*.test.js` y `scripts/build-bundle.js`)

**Files:**
- Modify: `assets/js/00-modules.bundle.js` (via `node scripts/build-bundle.js`)
- Test: `tests/scoped-admin-and-profiles.test.js`

- [ ] **Step 1: Run `node scripts/build-bundle.js`**

Run: `node scripts/build-bundle.js`
Expected: `[Build] All bundles generated successfully.`

- [ ] **Step 2: Run full test suite**

Run: `node --test tests/*.test.js`
Expected: 100% PASS across all test files.
