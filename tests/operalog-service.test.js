const test = require('node:test');
const assert = require('node:assert/strict');
const OperaLogService = require('../assets/js/services/operalogService');

const SAMPLE_ROWS = [
  { id: '1', contratista: 'ALFA', grupo: 'BT', frente: 'REPARACIONES', nombres: 'JUAN PEREZ', skill: 'BT-SUBT', celular: '987 654 321', horario: '07:00 - 23:00' },
  { id: '2', contratista: 'ALFA', grupo: 'BT', frente: 'COORDINADORES', nombres: 'MARIA LOPEZ', skill: '', celular: '999888777', horario: '07:00 - 16:00' },
  { id: '3', contratista: 'BETA', grupo: 'BT', frente: 'TEKO', nombres: 'CARLOS RAMOS', skill: 'CAMIONETA', celular: '+51 912-345-678', horario: '07:00 - 16:00' },
  { id: '4', contratista: 'LUMINA', grupo: 'AP', frente: 'RECLAMOS', nombres: 'PEDRO RUIZ', skill: 'AP', celular: '911111111', horario: '07:00 - 16:00' },
];

test('normalizeTurnRows filtra solo BT y omite horario', () => {
  const rows = OperaLogService.normalizeTurnRows(SAMPLE_ROWS);
  assert.equal(rows.length, 3);
  assert.equal(rows.some(r => r.contratista === 'LUMINA'), false);
  assert.equal('horario' in rows[0], false);
  assert.deepEqual(rows[0], {
    id: '1',
    contratista: 'ALFA',
    frente: 'REPARACIONES',
    nombres: 'JUAN PEREZ',
    skill: 'BT-SUBT',
    celular: '987 654 321',
    usuario_ssam: ''
  });
});

test('getFieldCandidates filtra frentes de campo y prioriza la contrata del ticket', () => {
  OperaLogService._setCachedRows(OperaLogService.normalizeTurnRows(SAMPLE_ROWS));
  const res = OperaLogService.getFieldCandidates({ contratista: 'ALFA', query: '' });
  assert.equal(res.sameCompany.length, 1);
  assert.equal(res.sameCompany[0].nombres, 'JUAN PEREZ');
  assert.equal(res.otherCompanies.length, 1);
  assert.equal(res.otherCompanies[0].nombres, 'CARLOS RAMOS');
});

test('getFieldCandidates busca por nombre, frente, skill o teléfono', () => {
  OperaLogService._setCachedRows(OperaLogService.normalizeTurnRows(SAMPLE_ROWS));
  assert.equal(OperaLogService.getFieldCandidates({ contratista: 'ALFA', query: 'subt' }).sameCompany.length, 1);
  assert.equal(OperaLogService.getFieldCandidates({ contratista: 'ALFA', query: 'teko' }).otherCompanies.length, 1);
  assert.equal(OperaLogService.getFieldCandidates({ contratista: 'ALFA', query: '345678' }).otherCompanies.length, 1);
});

test('findMatchByJcName empareja nombres normalizados priorizando la contrata del ticket', () => {
  OperaLogService._setCachedRows(OperaLogService.normalizeTurnRows(SAMPLE_ROWS));
  const found = OperaLogService.findMatchByJcName('  juán   pérez ', 'ALFA');
  assert.ok(found);
  assert.equal(found.nombres, 'JUAN PEREZ');
  assert.equal(found.frente, 'REPARACIONES');
  assert.equal(OperaLogService.findMatchByJcName('INEXISTENTE', 'ALFA'), null);
});

test('formatPhoneForCopy limpia caracteres y conserva dígitos del celular', () => {
  assert.deepEqual(OperaLogService.formatPhoneForCopy('+51 987-654 321'), {
    display: '987654321',
    digits: '987654321'
  });
  assert.deepEqual(OperaLogService.formatPhoneForCopy('912 345 678'), {
    display: '912345678',
    digits: '912345678'
  });
  assert.deepEqual(OperaLogService.formatPhoneForCopy(''), {
    display: '',
    digits: ''
  });
});

test('api/config-data entrega operalog_gas_url únicamente al rol admin', async () => {
  const configHandler = require('../api/config-data');
  const prev = process.env.OPERALOG_GAS_URL;
  process.env.OPERALOG_GAS_URL = 'https://script.google.com/macros/s/test-operalog/exec';
  try {
    const callWithRole = async (role) => {
      let body = '';
      const res = {
        setHeader() {},
        writeHead() {},
        status() { return this; },
        send(p) { body = p; return this; },
        end(p = '') { body = p; return this; }
      };
      await configHandler({ method: 'GET', url: `/api/config-data?role=${role}`, headers: {} }, res);
      return JSON.parse(body);
    };
    const adminCfg = await callWithRole('admin');
    const contractorCfg = await callWithRole('contractor');
    assert.equal(adminCfg.operalog_gas_url, 'https://script.google.com/macros/s/test-operalog/exec');
    assert.equal(contractorCfg.operalog_gas_url, '');
  } finally {
    if (prev === undefined) delete process.env.OPERALOG_GAS_URL;
    else process.env.OPERALOG_GAS_URL = prev;
  }
});
