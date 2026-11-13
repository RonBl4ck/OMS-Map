const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function createAppContext() {
  const dummyEl = {
    addEventListener() {},
    style: {},
    textContent: '',
    value: '',
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {},
    getAttribute() { return null; }
  };

  const doc = {
    addEventListener() {},
    getElementById() { return dummyEl; },
    querySelectorAll() { return []; },
    createElement(tag) { return { ...dummyEl, tagName: tag, children: [], appendChild() {} }; }
  };

  const ctx = {
    console,
    Date,
    Array,
    Object,
    String,
    Number,
    Map,
    Set,
    Intl,
    setTimeout: () => {},
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    document: doc,
    window: {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  vm.runInContext(fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets', 'js', '20-dashboard.js'), 'utf8'), ctx);

  return ctx;
}

function getExpectedLimaToday() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch (e) {
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const limaTime = new Date(utcMs - (5 * 3600000));
    const pad = n => String(n).padStart(2, '0');
    return `${limaTime.getFullYear()}-${pad(limaTime.getMonth() + 1)}-${pad(limaTime.getDate())}`;
  }
}

test('Caso 1: 3 columnas completas desde Excel (Ticket, JC y Hora)', () => {
  const { parseBulkTicketsWithJc } = createAppContext();
  const rawInput = '2600225799\tJUAN PEREZ\t15:30';
  const result = parseBulkTicketsWithJc(rawInput);
  const today = getExpectedLimaToday();

  assert.equal(result.length, 1, 'Debe procesar exactamente 1 registro');
  assert.equal(result[0].ticket, '2600225799', 'Ticket debe ser 2600225799');
  assert.equal(result[0].jc, 'JUAN PEREZ', 'JC debe ser JUAN PEREZ en mayúsculas');
  assert.equal(result[0].finEstimado, `${today} 15:30`, 'Fin Estimado debe tener la fecha de hoy en Lima y hora 15:30');
});

test('Caso 2: 3 columnas con celda JC vacía (Ticket, [vacío], Hora)', () => {
  const { parseBulkTicketsWithJc } = createAppContext();
  const rawInput = '2600225810\t\t16:00';
  const result = parseBulkTicketsWithJc(rawInput);
  const today = getExpectedLimaToday();

  assert.equal(result.length, 1, 'Debe procesar 1 registro');
  assert.equal(result[0].ticket, '2600225810', 'Ticket debe ser 2600225810');
  assert.equal(result[0].jc, '', 'JC debe ser cadena vacía cuando la celda intermedia esté vacía');
  assert.equal(result[0].finEstimado, `${today} 16:00`, 'Fin Estimado debe conservar 16:00 con fecha de hoy');
});

test('Caso 3: 2 columnas con solo Hora (Ticket y Hora sin JC)', () => {
  const { parseBulkTicketsWithJc } = createAppContext();
  const rawInput = '2600225915\t17:15';
  const result = parseBulkTicketsWithJc(rawInput);
  const today = getExpectedLimaToday();

  assert.equal(result.length, 1, 'Debe procesar 1 registro');
  assert.equal(result[0].ticket, '2600225915', 'Ticket debe ser 2600225915');
  assert.equal(result[0].jc, '', 'NO debe confundir la hora 17:15 con un JC');
  assert.equal(result[0].finEstimado, `${today} 17:15`, 'Fin Estimado debe ser la fecha de hoy a las 17:15');
});

test('Caso 4: 2 columnas con solo JC (Ticket y Nombre JC)', () => {
  const { parseBulkTicketsWithJc } = createAppContext();
  const rawInput = '2600226020\tMARIO SILVA';
  const result = parseBulkTicketsWithJc(rawInput);

  assert.equal(result.length, 1, 'Debe procesar 1 registro');
  assert.equal(result[0].ticket, '2600226020', 'Ticket debe ser 2600226020');
  assert.equal(result[0].jc, 'MARIO SILVA', 'JC debe ser MARIO SILVA');
  assert.equal(result[0].finEstimado, '', 'Fin Estimado debe estar vacío si no se especificó hora');
});

test('Caso 5: Formato con fecha completa de Excel (DD/MM/YYYY HH:MM normalizada a ISO)', () => {
  const { parseBulkTicketsWithJc } = createAppContext();
  const rawInput = '2600226123\tJC CARLOS\t03/11/2026 02:30';
  const result = parseBulkTicketsWithJc(rawInput);

  assert.equal(result.length, 1, 'Debe procesar 1 registro');
  assert.equal(result[0].ticket, '2600226123', 'Ticket debe coincidir');
  assert.equal(result[0].jc, 'JC CARLOS', 'JC debe coincidir');
  assert.equal(result[0].finEstimado, '2026-11-03 02:30', 'Debe normalizar la fecha de DD/MM/YYYY a YYYY-MM-DD HH:MM');
});

test('Caso 6: Descarte de placeholders como guiones o N/A en JC', () => {
  const { parseBulkTicketsWithJc } = createAppContext();
  const rawInput = '2600226234\t-\t18:00';
  const result = parseBulkTicketsWithJc(rawInput);
  const today = getExpectedLimaToday();

  assert.equal(result.length, 1, 'Debe procesar 1 registro');
  assert.equal(result[0].ticket, '2600226234', 'Ticket debe coincidir');
  assert.equal(result[0].jc, '', 'Debe ignorar el guion "-" como JC y dejarlo vacío');
  assert.equal(result[0].finEstimado, `${today} 18:00`, 'Fin Estimado debe ser 18:00 con fecha de hoy');
});

test('Caso 7: Resiliencia de getProp ante encabezados con espacios iniciales o finales', () => {
  const { getProp } = createAppContext();

  // Encabezado con espacio al final
  const objTrailing = { 'Fin_Estimado ': '2026-11-02 15:30' };
  assert.equal(getProp(objTrailing, 'Fin_Estimado'), '2026-11-02 15:30', 'getProp debe resolver "Fin_Estimado " buscando "Fin_Estimado"');

  // Encabezado con espacios iniciales
  const objLeading = { '  SED': 'SED 1054' };
  assert.equal(getProp(objLeading, 'SED'), 'SED 1054', 'getProp debe resolver "  SED" buscando "SED"');

  // Parámetro de búsqueda con espacios accidentales
  const objNormal = { 'Alimentador': 'ALIM-01' };
  assert.equal(getProp(objNormal, ' Alimentador  '), 'ALIM-01', 'getProp debe tolerar alias con espacios accidentales');

  // Insensibilidad a mayúsculas y acentos
  const objAccents = { 'Dirección': 'Av. Central 123' };
  assert.equal(getProp(objAccents, 'direccion'), 'Av. Central 123', 'getProp debe tolerar diferencias de tildes y mayúsculas');

  // Fallback si no existe propiedad
  assert.equal(getProp({}, 'Propiedad_Inexistente'), 'N/A', 'Debe retornar N/A si la propiedad no existe');
});

test('Caso adicional: Pegado multilínea mixto desde Excel con deduplicación y parseBulkTickets', () => {
  const { parseBulkTicketsWithJc, parseBulkTickets } = createAppContext();
  const today = getExpectedLimaToday();

  const multiLineInput = [
    '2600225799\tJUAN PEREZ\t15:30',
    '2600225810\t\t16:00',
    '2600225915\t17:15',
    '2600226020\tMARIO SILVA',
    '2600226123\tJC CARLOS\t03/11/2026 02:30',
    '2600226234\t--\t18:00',
    '2600225799\tJUAN PEREZ ACTUALIZADO\t19:00' // Deduplicación sobre 2600225799
  ].join('\r\n');

  const parsedWithJc = parseBulkTicketsWithJc(multiLineInput);
  assert.equal(parsedWithJc.length, 6, 'Debe haber 6 tickets únicos deduplicados');

  const updatedTicket = parsedWithJc.find(x => x.ticket === '2600225799');
  assert.ok(updatedTicket, 'Ticket 2600225799 debe existir');
  assert.equal(updatedTicket.jc, 'JUAN PEREZ ACTUALIZADO', 'Deduplicación debe actualizar JC');
  assert.equal(updatedTicket.finEstimado, `${today} 19:00`, 'Deduplicación debe actualizar Fin Estimado');

  const legacyList = parseBulkTickets(multiLineInput);
  assert.equal(legacyList.length, 6, 'parseBulkTickets debe retornar los 6 IDs de tickets');
  assert.deepEqual([...legacyList], [
    '2600225799',
    '2600225810',
    '2600225915',
    '2600226020',
    '2600226123',
    '2600226234'
  ]);
});

test('Caso adicional: parseDateTimeCandidate con formatos de hora en 12 horas (AM/PM)', () => {
  const { parseDateTimeCandidate } = createAppContext();
  const today = getExpectedLimaToday();

  assert.equal(parseDateTimeCandidate('02:45 pm'), `${today} 14:45`);
  assert.equal(parseDateTimeCandidate('11:20 am'), `${today} 11:20`);
  assert.equal(parseDateTimeCandidate('12:15 pm'), `${today} 12:15`);
  assert.equal(parseDateTimeCandidate('12:30 am'), `${today} 00:30`);
  assert.equal(parseDateTimeCandidate('18:00 hrs'), `${today} 18:00`);
  assert.equal(parseDateTimeCandidate('NO_DATE'), '');
});

function createBulkExecutionContext({ rawInput = '', chipValues = ['EN EJECUCION', 'C. CAMPO'], activeChip = null } = {}) {
  const makeEl = (extra = {}) => ({
    addEventListener() {},
    style: {},
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    ...extra
  });

  const elementsById = {
    bulkPluzTicketsInput: makeEl({ value: rawInput }),
    bulkPluzAlert: makeEl(),
    btnSubmitBulkPluz: makeEl(),
    bulkPluzSubmitSpinner: makeEl(),
    bulkPluzSubmitText: makeEl()
  };

  const chipEls = chipValues.map(val => {
    const el = makeEl({
      getAttribute(attr) { return attr === 'data-val' ? val : null; }
    });
    if (activeChip && val === activeChip) {
      el.classList.add('active');
    }
    return el;
  });

  const fetchCalls = [];
  const notifications = [];

  const doc = {
    addEventListener() {},
    getElementById(id) { return elementsById[id] || makeEl(); },
    querySelectorAll(selector) {
      if (selector === '#bulkPluzEstadoChips .sup-chip-btn') return chipEls;
      return [];
    },
    createElement(tag) { return makeEl({ tagName: tag, children: [], appendChild() {} }); }
  };

  const ctx = {
    console,
    Date,
    Array,
    Object,
    String,
    Number,
    Map,
    Set,
    Intl,
    JSON,
    setTimeout: () => {},
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    document: doc,
    window: {},
    fetch: async (url, options) => {
      fetchCalls.push({ url, options, body: JSON.parse(options.body) });
      return {
        ok: true,
        json: async () => ({ success: true, message: 'OK' })
      };
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  vm.runInContext(fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets', 'js', '20-dashboard.js'), 'utf8'), ctx);

  ctx.renderTdOmsTable = () => {};
  ctx.getFilteredTdOms = () => [];
  ctx.showAppNotification = (msg, type) => notifications.push({ msg, type });

  return { ctx, fetchCalls, notifications, chipEls };
}

test('Bulk PLUZ: executeBulkPluzEnEjecucion usa EN EJECUCION por defecto y C. CAMPO cuando su chip está activo', async () => {
  const defaultRun = createBulkExecutionContext({
    rawInput: '2600300001\tJUAN PEREZ\t15:30',
    activeChip: null
  });
  await defaultRun.ctx.executeBulkPluzEnEjecucion();

  assert.equal(defaultRun.fetchCalls.length, 1);
  assert.equal(defaultRun.fetchCalls[0].url, '/api/update-supervisor-status');
  assert.equal(defaultRun.fetchCalls[0].body.estadoOperativo, 'EN EJECUCION');
  assert.equal(defaultRun.fetchCalls[0].body.tickets[0].estadoOperativo, 'EN EJECUCION');
  assert.equal(defaultRun.fetchCalls[0].body.tickets[0].estado, 'EN EJECUCION');
  assert.equal(
    defaultRun.ctx.supervisorRecordsMap.get('2600300001').latest.estadoOperativo,
    'EN EJECUCION'
  );

  const campoRun = createBulkExecutionContext({
    rawInput: '2600300002\tMARIA LOPEZ\t16:45',
    activeChip: 'C. CAMPO'
  });
  await campoRun.ctx.executeBulkPluzEnEjecucion();

  assert.equal(campoRun.fetchCalls.length, 1);
  assert.equal(campoRun.fetchCalls[0].url, '/api/update-supervisor-status');
  assert.equal(campoRun.fetchCalls[0].body.estadoOperativo, 'C. CAMPO');
  assert.equal(campoRun.fetchCalls[0].body.tickets[0].estadoOperativo, 'C. CAMPO');
  assert.equal(campoRun.fetchCalls[0].body.tickets[0].estado, 'C. CAMPO');
  assert.equal(
    campoRun.ctx.supervisorRecordsMap.get('2600300002').latest.estadoOperativo,
    'C. CAMPO'
  );
  assert.match(campoRun.notifications[0].msg, /C\. CAMPO/);
});

test('Bulk PLUZ: executeBulkPluzEnEjecucion conserva detalleOperativo, estadoCritico y detalleCritico previos de supervisorRecordsMap', async () => {
  const { ctx, fetchCalls } = createBulkExecutionContext({
    rawInput: '2600300099\tCARLOS RUIZ\t18:00',
    activeChip: 'C. CAMPO'
  });

  ctx.supervisorRecordsMap.set('2600300099', {
    latest: {
      ticket: '2600300099',
      sed: 'SED 4410',
      horaInicio: '2026-11-13 08:15',
      alimentador: 'ALIM-09',
      empresa: 'PLUZ',
      estadoOperativo: 'EN EJECUCION',
      detalleOperativo: 'Cuadrilla realizando empalme subterráneo',
      jefeCuadrilla: 'ANTERIOR JC',
      finEstimado: '2026-11-13 17:00',
      estadoCritico: 'CRITICO',
      detalleCritico: 'Afecta posta médica',
      estado: 'EN EJECUCION',
      detalle: 'Cuadrilla realizando empalme subterráneo'
    },
    history: []
  });

  await ctx.executeBulkPluzEnEjecucion();

  assert.equal(fetchCalls.length, 1);
  const payload = fetchCalls[0].body;
  assert.equal(payload.estadoOperativo, 'C. CAMPO');
  assert.equal(payload.tickets.length, 1);

  const sentTicket = payload.tickets[0];
  assert.equal(sentTicket.estadoOperativo, 'C. CAMPO');
  assert.equal(sentTicket.detalleOperativo, 'Cuadrilla realizando empalme subterráneo');
  assert.equal(sentTicket.estadoCritico, 'CRITICO');
  assert.equal(sentTicket.detalleCritico, 'Afecta posta médica');
  assert.equal(sentTicket.estado, 'C. CAMPO');
  assert.equal(sentTicket.detalle, 'Cuadrilla realizando empalme subterráneo');

  const storedLatest = ctx.supervisorRecordsMap.get('2600300099').latest;
  assert.equal(storedLatest.estadoOperativo, 'C. CAMPO');
  assert.equal(storedLatest.detalleOperativo, 'Cuadrilla realizando empalme subterráneo');
  assert.equal(storedLatest.estadoCritico, 'CRITICO');
  assert.equal(storedLatest.detalleCritico, 'Afecta posta médica');
});
