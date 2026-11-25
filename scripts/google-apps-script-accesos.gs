/**
 * Google Apps Script Unificado para OMS Map - Pluz Energía (OMSNEITOR)
 * Soporta:
 * 1. Registro de Supervisión PLUZ en "SEGUIMIENTO_SUPERVISOR" (1 fila/ticket + Historial_JSON + dedup + batch upsert)
 * 2. Archivado automático diario (trigger) a "SEGUIMIENTO_SUPERVISOR_ARCHIVO" (retención 7 días, preserva activos y Críticos/Quánticos)
 * 3. Gestión de Capas SED en "CAPAS_SED" (doPost + doGet)
 * 4. Sincronización de Usuarios y Accesos en "ACCESOS"
 */

var SUPERVISOR_HEADERS = [
  "Fecha_Hora",
  "Ticket",
  "SED",
  "Hora_Inicio",
  "Alimentador",
  "Empresa",
  "Estado_Operativo",
  "JC",
  "Fin_Estimado",
  "Detalle_Operativo",
  "Estado_Critico",
  "Detalle_Critico",
  "Usuario",
  "Actualizaciones",
  "Historial_JSON"
];

var MAX_HISTORIAL_JSON_CHARS = 48000;
var DEFAULT_RETENTION_DAYS = 7;

function doPost(e) {
  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(15000);
  try {
    if (!locked) {
      return jsonResponse({ success: false, message: "Servidor ocupado, reintenta en unos segundos." });
    }
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, message: "Sin datos en la petición." });
    }

    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // --------------------------------------------------------------------------
    // 1. REGISTRO DE SUPERVISIÓN PLUZ (BATCH UPSERT + RETROCOMPATIBLE INDIVIDUAL)
    // --------------------------------------------------------------------------
    if (data.action === "upsert_supervisor_batch" && Array.isArray(data.entries)) {
      var batchResult = upsertSupervisorEntries(ss, data.entries);
      return jsonResponse(batchResult);
    }

    if (data.action === "append_supervisor_log") {
      var singleEntries = Array.isArray(data.entries) ? data.entries : [data];
      var singleResult = upsertSupervisorEntries(ss, singleEntries);
      return jsonResponse(singleResult);
    }

    // --------------------------------------------------------------------------
    // 2. GESTIÓN DE CAPAS DE SEDs (CREAR / ACTUALIZAR / ELIMINAR / LEER CAPAS_SED)
    // --------------------------------------------------------------------------
    if (data.action === "save_sed_layers") {
      var layerSheet = ss.getSheetByName("CAPAS_SED") || ss.getSheetByName("capas_sed");
      if (!layerSheet) {
        layerSheet = ss.insertSheet("CAPAS_SED");
      }

      layerSheet.clearContents();
      var layers = Array.isArray(data.layers) ? data.layers : [];
      var nowStr = Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");
      var userStr = String(data.usuario || "PLUZ").trim();

      var layerRows = [["Nombre_Capa", "SEDs", "Cantidad_SEDs", "Usuario", "Fecha_Actualizacion"]];
      layers.forEach(function(layer) {
        var name = String(layer.name || layer.Nombre_Capa || "").trim().toUpperCase();
        if (!name) return;
        var sedsArr = Array.isArray(layer.seds)
          ? layer.seds
          : String(layer.seds || layer.SEDs || "").split(/[\r\n,;\t\s]+/).filter(Boolean);
        var cleanSeds = sedsArr.map(function(s) { return String(s).trim().toUpperCase(); }).filter(Boolean);
        if (cleanSeds.length === 0) return;

        layerRows.push([
          name,
          cleanSeds.join(","),
          cleanSeds.length,
          String(layer.updatedBy || userStr),
          String(layer.updatedAt || nowStr)
        ]);
      });

      layerSheet.getRange(1, 1, layerRows.length, 5).setValues(layerRows);

      return jsonResponse({
        success: true,
        message: "Capas de SEDs sincronizadas en CAPAS_SED (" + (layerRows.length - 1) + " capas)."
      });
    }

    if (data.action === "get_sed_layers") {
      return jsonResponse({
        success: true,
        layers: readCapasSedFromSheet(ss)
      });
    }

    // --------------------------------------------------------------------------
    // 3. SINCRONIZACIÓN DE USUARIOS Y ACCESOS
    // --------------------------------------------------------------------------
    if (data.users && Array.isArray(data.users)) {
      var userSheet = ss.getSheetByName("ACCESOS") || ss.getSheetByName("accesos") || ss.getSheetByName("USUARIOS");
      if (!userSheet) {
        userSheet = ss.insertSheet("ACCESOS");
      }

      userSheet.clearContents();
      var userRows = [["Usuario", "Password", "Contratista", "Rol", "Estado"]];
      data.users.forEach(function(u) {
        userRows.push([
          u.user || "",
          u.password || "",
          u.contractor || u.user || "",
          u.role || "contractor",
          u.estado || "activo"
        ]);
      });
      userSheet.getRange(1, 1, userRows.length, 5).setValues(userRows);

      return jsonResponse({ success: true, message: "Usuarios sincronizados exitosamente." });
    }

    return jsonResponse({ success: false, message: "Acción no reconocida o datos incompletos." });

  } catch (err) {
    return jsonResponse({ success: false, error: err.toString(), message: err.toString() });
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : "get_sed_layers";
    if (action === "get_sed_layers") {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return jsonResponse({
        success: true,
        layers: readCapasSedFromSheet(ss)
      });
    }
    return jsonResponse({ success: true, status: "OK" });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// ============================================================================
// SUPERVISIÓN PLUZ: UPSERT EN LOTE (1 FILA POR TICKET + HISTORIAL_JSON)
// ============================================================================

function normalizeSupHeaderKey(h) {
  return String(h || "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function cleanSupField(val) {
  if (val === null || val === undefined) return "";
  var s = String(val).trim();
  if (/^n\/?a$/i.test(s) || s === "--" || s === "null" || s === "undefined") return "";
  return s;
}

function formatCellDateLima(val) {
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, "GMT-5", "yyyy-MM-dd HH:mm:ss");
  }
  return cleanSupField(val);
}

function buildStateSignature(op, jc, fe, detOp, crit, detCrit) {
  return [
    String(op || "").trim().toUpperCase(),
    String(jc || "").trim().toUpperCase(),
    String(fe || "").trim(),
    String(detOp || "").trim(),
    String(crit || "").trim().toUpperCase(),
    String(detCrit || "").trim()
  ].join("||");
}

function buildCompactHistoryEvent(fecha, op, jc, fe, detOp, crit, detCrit, usuario) {
  var ev = { f: fecha || "" };
  if (op) ev.op = op;
  if (jc) ev.jc = jc;
  if (fe) ev.fe = fe;
  if (detOp) ev.do = detOp;
  if (crit) ev.cr = crit;
  if (detCrit) ev.dc = detCrit;
  if (usuario && usuario !== "PLUZ") ev.u = usuario;
  return ev;
}

function serializeHistorySafe(histArr) {
  if (!Array.isArray(histArr) || histArr.length === 0) return "";
  var copy = histArr.slice();
  var serialized = JSON.stringify(copy);
  while (serialized.length > MAX_HISTORIAL_JSON_CHARS && copy.length > 1) {
    copy.shift(); // Descartar evento más antiguo para respetar límite 50k de Google Sheets
    serialized = JSON.stringify(copy);
  }
  return serialized;
}

function ensureSupervisorHeaders(supSheet) {
  if (supSheet.getLastRow() === 0) {
    supSheet.getRange(1, 1, 1, SUPERVISOR_HEADERS.length).setValues([SUPERVISOR_HEADERS]);
    return SUPERVISOR_HEADERS.slice();
  }

  var lastCol = Math.max(supSheet.getLastColumn(), 1);
  var headerRow = supSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || "").trim();
  });

  var existingKeys = {};
  for (var i = 0; i < headerRow.length; i++) {
    existingKeys[normalizeSupHeaderKey(headerRow[i])] = i;
  }

  var requiredCols = ["Fin_Estimado", "Actualizaciones", "Historial_JSON"];
  var added = false;
  for (var r = 0; r < requiredCols.length; r++) {
    var colName = requiredCols[r];
    var colKey = normalizeSupHeaderKey(colName);
    if (!existingKeys.hasOwnProperty(colKey)) {
      headerRow.push(colName);
      existingKeys[colKey] = headerRow.length - 1;
      added = true;
    }
  }

  if (added) {
    supSheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
  }
  return headerRow;
}

function buildColIndexMap(headerRow) {
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    var k = normalizeSupHeaderKey(headerRow[i]);
    if (k && !map.hasOwnProperty(k)) {
      map[k] = i;
    }
  }
  return {
    fecha: map.fecha_hora !== undefined ? map.fecha_hora : (map.fecha !== undefined ? map.fecha : 0),
    ticket: map.ticket !== undefined ? map.ticket : 1,
    sed: map.sed !== undefined ? map.sed : 2,
    horaInicio: map.hora_inicio !== undefined ? map.hora_inicio : (map.horainicio !== undefined ? map.horainicio : 3),
    alimentador: map.alimentador !== undefined ? map.alimentador : 4,
    empresa: map.empresa !== undefined ? map.empresa : 5,
    estadoOp: map.estado_operativo !== undefined ? map.estado_operativo : 6,
    jc: map.jc !== undefined ? map.jc : (map.jefe_cuadrilla !== undefined ? map.jefe_cuadrilla : 7),
    finEstimado: map.fin_estimado !== undefined ? map.fin_estimado : (map.finestimado !== undefined ? map.finestimado : 8),
    detalleOp: map.detalle_operativo !== undefined ? map.detalle_operativo : 9,
    estadoCrit: map.estado_critico !== undefined ? map.estado_critico : 10,
    detalleCrit: map.detalle_critico !== undefined ? map.detalle_critico : 11,
    usuario: map.usuario !== undefined ? map.usuario : 12,
    actualizaciones: map.actualizaciones !== undefined ? map.actualizaciones : -1,
    historialJson: map.historial_json !== undefined ? map.historial_json : -1
  };
}

function upsertSupervisorEntries(ss, rawEntries) {
  var supSheet = ss.getSheetByName("SEGUIMIENTO_SUPERVISOR") || ss.getSheetByName("seguimiento_supervisor");
  if (!supSheet) {
    supSheet = ss.insertSheet("SEGUIMIENTO_SUPERVISOR");
  }

  var headerRow = ensureSupervisorHeaders(supSheet);
  var numCols = headerRow.length;
  var idx = buildColIndexMap(headerRow);

  var lastRow = supSheet.getLastRow();
  var allValues = lastRow > 1
    ? supSheet.getRange(2, 1, lastRow - 1, numCols).getValues()
    : [];

  // Mapa ticketUpper -> último índice en allValues (0-based respecto a fila 2)
  var ticketToIdx = {};
  for (var r = 0; r < allValues.length; r++) {
    var tExisting = cleanSupField(allValues[r][idx.ticket]).toUpperCase();
    if (tExisting) {
      ticketToIdx[tExisting] = r;
    }
  }

  var inserted = 0;
  var updated = 0;
  var skipped = 0;
  var dirtyRows = {}; // rowIndex0Based -> true
  var rowsToAppend = [];

  for (var i = 0; i < rawEntries.length; i++) {
    var entry = rawEntries[i] || {};
    var ticket = cleanSupField(entry.ticket);
    if (!ticket) continue;

    var tKey = ticket.toUpperCase();
    var sed = cleanSupField(entry.sed).toUpperCase();
    var horaInicio = cleanSupField(entry.horaInicio || entry.hora_inicio || entry.fechaInicio || entry.fecha_inicio);
    var alimentador = cleanSupField(entry.alimentador).toUpperCase();
    var empresa = cleanSupField(entry.empresa || entry.contratista).toUpperCase();

    var estadoOp = cleanSupField(entry.estadoOperativo !== undefined ? entry.estadoOperativo : entry.estado).toUpperCase();
    var jc = cleanSupField(entry.jefeCuadrilla !== undefined ? entry.jefeCuadrilla : entry.jc).toUpperCase();
    var finEstimado = cleanSupField(entry.finEstimado || entry.Fin_Estimado || entry.horaFinEstimada || entry.fechaFinEstimada);
    var detalleOp = cleanSupField(entry.detalleOperativo !== undefined ? entry.detalleOperativo : entry.detalle);
    var estadoCrit = cleanSupField(entry.estadoCritico).toUpperCase();
    var detalleCrit = cleanSupField(entry.detalleCritico);

    if (!estadoCrit && (estadoOp === "QUANTICO" || estadoOp === "CRITICO")) {
      estadoCrit = estadoOp;
      detalleCrit = detalleOp;
      estadoOp = "";
      detalleOp = "";
    }

    var fechaHora = cleanSupField(entry.fecha) || Utilities.formatDate(new Date(), "GMT-5", "yyyy-MM-dd HH:mm:ss");
    var usuario = cleanSupField(entry.usuario) || "PLUZ";

    if (ticketToIdx.hasOwnProperty(tKey)) {
      var rowIdx = ticketToIdx[tKey];
      var row = rowIdx < allValues.length ? allValues[rowIdx] : rowsToAppend[rowIdx - allValues.length];

      var curFecha = formatCellDateLima(row[idx.fecha]);
      var curOp = cleanSupField(row[idx.estadoOp]).toUpperCase();
      var curJc = cleanSupField(row[idx.jc]).toUpperCase();
      var curFe = formatCellDateLima(row[idx.finEstimado]);
      var curDetOp = cleanSupField(row[idx.detalleOp]);
      var curCrit = cleanSupField(row[idx.estadoCrit]).toUpperCase();
      var curDetCrit = cleanSupField(row[idx.detalleCrit]);
      var curUser = cleanSupField(row[idx.usuario]) || "PLUZ";

      var curSig = buildStateSignature(curOp, curJc, curFe, curDetOp, curCrit, curDetCrit);
      var newSig = buildStateSignature(estadoOp, jc, finEstimado, detalleOp, estadoCrit, detalleCrit);

      if (curSig === newSig) {
        skipped++;
        continue;
      }

      // Empujar snapshot anterior a Historial_JSON
      var histArr = [];
      if (idx.historialJson >= 0) {
        var rawHist = cleanSupField(row[idx.historialJson]);
        if (rawHist) {
          try {
            var parsed = JSON.parse(rawHist);
            if (Array.isArray(parsed)) histArr = parsed;
          } catch (e) {
            histArr = [];
          }
        }
      }

      histArr.push(buildCompactHistoryEvent(curFecha, curOp, curJc, curFe, curDetOp, curCrit, curDetCrit, curUser));

      var prevCount = idx.actualizaciones >= 0 ? parseInt(row[idx.actualizaciones], 10) : NaN;
      var newCount = (!isNaN(prevCount) && prevCount >= 1) ? (prevCount + 1) : (histArr.length + 1);

      row[idx.fecha] = fechaHora;
      row[idx.ticket] = ticket;
      if (sed) row[idx.sed] = sed;
      if (horaInicio) row[idx.horaInicio] = horaInicio;
      if (alimentador) row[idx.alimentador] = alimentador;
      if (empresa) row[idx.empresa] = empresa;
      row[idx.estadoOp] = estadoOp;
      row[idx.jc] = jc;
      row[idx.finEstimado] = finEstimado;
      row[idx.detalleOp] = detalleOp;
      row[idx.estadoCrit] = estadoCrit;
      row[idx.detalleCrit] = detalleCrit;
      row[idx.usuario] = usuario;
      if (idx.actualizaciones >= 0) row[idx.actualizaciones] = newCount;
      if (idx.historialJson >= 0) row[idx.historialJson] = serializeHistorySafe(histArr);

      if (rowIdx < allValues.length) {
        dirtyRows[rowIdx] = true;
      }
      updated++;
    } else {
      var newRow = [];
      for (var c = 0; c < numCols; c++) newRow.push("");
      newRow[idx.fecha] = fechaHora;
      newRow[idx.ticket] = ticket;
      newRow[idx.sed] = sed;
      newRow[idx.horaInicio] = horaInicio;
      newRow[idx.alimentador] = alimentador;
      newRow[idx.empresa] = empresa;
      newRow[idx.estadoOp] = estadoOp;
      newRow[idx.jc] = jc;
      newRow[idx.finEstimado] = finEstimado;
      newRow[idx.detalleOp] = detalleOp;
      newRow[idx.estadoCrit] = estadoCrit;
      newRow[idx.detalleCrit] = detalleCrit;
      newRow[idx.usuario] = usuario;
      if (idx.actualizaciones >= 0) newRow[idx.actualizaciones] = 1;
      if (idx.historialJson >= 0) newRow[idx.historialJson] = "";

      ticketToIdx[tKey] = allValues.length + rowsToAppend.length;
      rowsToAppend.push(newRow);
      inserted++;
    }
  }

  // Persistir filas existentes modificadas
  var dirtyKeys = Object.keys(dirtyRows);
  for (var d = 0; d < dirtyKeys.length; d++) {
    var rIdx = parseInt(dirtyKeys[d], 10);
    supSheet.getRange(rIdx + 2, 1, 1, numCols).setValues([allValues[rIdx]]);
  }

  // Persistir filas nuevas en bloque
  if (rowsToAppend.length > 0) {
    supSheet.getRange(lastRow + 1, 1, rowsToAppend.length, numCols).setValues(rowsToAppend);
  }

  var msgParts = [];
  if (inserted > 0) msgParts.push(inserted + " nuevos");
  if (updated > 0) msgParts.push(updated + " actualizados");
  if (skipped > 0) msgParts.push(skipped + " sin cambios");
  var summaryMsg = msgParts.length > 0
    ? "SEGUIMIENTO_SUPERVISOR: " + msgParts.join(", ") + "."
    : "Sin cambios para registrar.";

  return {
    success: true,
    inserted: inserted,
    updated: updated,
    skipped: skipped,
    total: inserted + updated + skipped,
    message: summaryMsg
  };
}

// ============================================================================
// ARCHIVADO AUTOMÁTICO DIARIO (TRIGGER 03:00 AM LIMA)
// ============================================================================

function parseDateLimaMs(val) {
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.getTime();
  }
  var s = cleanSupField(val);
  if (!s) return 0;
  // Formato YYYY-MM-DD HH:mm:ss
  var iso = s.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) && iso.indexOf("Z") === -1 && iso.indexOf("-05") === -1) {
    iso += "-05:00";
  }
  var d = new Date(iso);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function rowHasCriticoOrQuantico(row, idx) {
  var crit = cleanSupField(row[idx.estadoCrit]).toUpperCase();
  var op = cleanSupField(row[idx.estadoOp]).toUpperCase();
  if (crit.indexOf("CRIT") !== -1 || crit.indexOf("QUANT") !== -1) return true;
  if (op.indexOf("CRIT") !== -1 || op.indexOf("QUANT") !== -1) return true;
  if (idx.historialJson >= 0) {
    var histRaw = cleanSupField(row[idx.historialJson]).toUpperCase();
    if (histRaw.indexOf("CRIT") !== -1 || histRaw.indexOf("QUANT") !== -1) return true;
  }
  return false;
}

/**
 * Mueve a SEGUIMIENTO_SUPERVISOR_ARCHIVO los tickets cerrados (no en BASE_PENDIENTES),
 * cuya última actualización tenga más de `diasRetencion` días (por defecto 7),
 * y que nunca hayan sido CRITICO ni QUANTICO.
 * Configurar en Apps Script -> Activadores -> Diario 3:00-4:00 AM.
 */
function archivarSeguimientoAntiguo(diasRetencion) {
  var retentionDays = (typeof diasRetencion === "number" && diasRetencion > 0) ? diasRetencion : DEFAULT_RETENTION_DAYS;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log("archivarSeguimientoAntiguo: no se pudo adquirir LockService.");
    return;
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var supSheet = ss.getSheetByName("SEGUIMIENTO_SUPERVISOR") || ss.getSheetByName("seguimiento_supervisor");
    if (!supSheet || supSheet.getLastRow() <= 1) return;

    var headerRow = ensureSupervisorHeaders(supSheet);
    var numCols = headerRow.length;
    var idx = buildColIndexMap(headerRow);

    // 1. Leer tickets activos en BASE_PENDIENTES
    var activeTickets = {};
    var pendSheet = ss.getSheetByName("BASE_PENDIENTES");
    if (pendSheet && pendSheet.getLastRow() > 1) {
      var pendVals = pendSheet.getDataRange().getValues();
      var pendHeaders = pendVals[0];
      var pendTicketCol = 0;
      for (var c = 0; c < pendHeaders.length; c++) {
        var ph = normalizeSupHeaderKey(pendHeaders[c]);
        if (ph.indexOf("ticket") !== -1 || ph.indexOf("aviso") !== -1) {
          pendTicketCol = c;
          break;
        }
      }
      for (var p = 1; p < pendVals.length; p++) {
        var pt = cleanSupField(pendVals[p][pendTicketCol]).toUpperCase();
        if (pt) activeTickets[pt] = true;
      }
    }

    // 2. Separar filas a conservar vs archivar
    var cutoffMs = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    var lastRow = supSheet.getLastRow();
    var dataRows = supSheet.getRange(2, 1, lastRow - 1, numCols).getValues();

    var keepRows = [];
    var archiveRows = [];

    for (var r = 0; r < dataRows.length; r++) {
      var row = dataRows[r];
      var tKey = cleanSupField(row[idx.ticket]).toUpperCase();
      if (!tKey) continue;

      var isActive = activeTickets.hasOwnProperty(tKey);
      var isCritical = rowHasCriticoOrQuantico(row, idx);
      var rowMs = parseDateLimaMs(row[idx.fecha]);
      var isOld = rowMs > 0 && rowMs < cutoffMs;

      if (!isActive && !isCritical && isOld) {
        archiveRows.push(row);
      } else {
        keepRows.push(row);
      }
    }

    if (archiveRows.length === 0) {
      Logger.log("archivarSeguimientoAntiguo: 0 filas para archivar.");
      return;
    }

    // 3. Escribir filas archivadas en SEGUIMIENTO_SUPERVISOR_ARCHIVO
    var archSheet = ss.getSheetByName("SEGUIMIENTO_SUPERVISOR_ARCHIVO");
    if (!archSheet) {
      archSheet = ss.insertSheet("SEGUIMIENTO_SUPERVISOR_ARCHIVO");
      archSheet.getRange(1, 1, 1, numCols).setValues([headerRow]);
    } else if (archSheet.getLastRow() === 0) {
      archSheet.getRange(1, 1, 1, numCols).setValues([headerRow]);
    }
    var archLastRow = archSheet.getLastRow();
    archSheet.getRange(archLastRow + 1, 1, archiveRows.length, numCols).setValues(archiveRows);

    // 4. Reescribir SEGUIMIENTO_SUPERVISOR en bloque con keepRows (preserva gid)
    if (keepRows.length > 0) {
      supSheet.getRange(2, 1, keepRows.length, numCols).setValues(keepRows);
    }
    var remainingRows = (lastRow - 1) - keepRows.length;
    if (remainingRows > 0) {
      supSheet.getRange(2 + keepRows.length, 1, remainingRows, numCols).clearContent();
    }

    Logger.log("archivarSeguimientoAntiguo: archivadas " + archiveRows.length + " filas, conservadas " + keepRows.length + " filas.");
  } finally {
    lock.releaseLock();
  }
}

function readCapasSedFromSheet(ss) {
  var layerSheet = ss.getSheetByName("CAPAS_SED") || ss.getSheetByName("capas_sed");
  if (!layerSheet || layerSheet.getLastRow() <= 1) {
    return [];
  }
  var values = layerSheet.getDataRange().getValues();
  var layers = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var name = String(row[0] || "").trim().toUpperCase();
    var sedsRaw = String(row[1] || "").trim();
    if (!name || !sedsRaw) continue;
    var seds = sedsRaw.split(/[\r\n,;\t\s]+/).map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean);
    if (seds.length === 0) continue;
    layers.push({
      name: name,
      seds: seds,
      updatedBy: String(row[3] || "PLUZ").trim(),
      updatedAt: String(row[4] || "").trim()
    });
  }
  return layers;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
