/**
 * Google Apps Script Unificado para OMS Map - Pluz Energía
 * Soporta:
 * 1. Gestión de Perfiles, Contratas y Admins Acotados en pestaña "ACCESOS"
 * 2. Gestión de Capas SED en pestaña "CAPAS_SED"
 * 3. Registro de Supervisión en pestaña "SEGUIMIENTO_SUPERVISOR"
 * 4. Consulta de solo lectura de Suministros Importantes en pestaña "SUMINISTROS_IMPORTANTES"
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
        var role = String(u.role || (user === "PLUZ" ? "admin" : "contractor")).trim().toLowerCase() === "admin" ? "admin" : "contractor";
        var contractor = user === "PLUZ"
          ? "*"
          : String(u.contractor || (role === "admin" ? "*" : user)).trim().toUpperCase();
        var estado = String(u.estado || "activo").trim().toLowerCase() === "inactivo" ? "inactivo" : "activo";
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

    // 4. CONSULTA SOLO LECTURA DE SUMINISTROS IMPORTANTES (Hoja: SUMINISTROS_IMPORTANTES)
    if (data.action === "get_suministros_importantes") {
      var impSheet = ss.getSheetByName("SUMINISTROS_IMPORTANTES");
      if (!impSheet || impSheet.getLastRow() < 2) {
        return ContentService.createTextOutput(JSON.stringify({ success: true, items: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var impVals = impSheet.getDataRange().getValues();
      var impItems = [];
      for (var k = 1; k < impVals.length; k++) {
        var sVal = String(impVals[k][0] || "").trim();
        if (sVal) {
          impItems.push({
            suministro: sVal,
            titular: String(impVals[k][1] || "").trim()
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, items: impItems }))
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
