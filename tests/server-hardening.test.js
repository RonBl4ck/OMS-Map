const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { resolvePublicFile, cacheControlFor, securityHeaders } = require('../server-utils');

test('impide salir del directorio público mediante rutas manipuladas', () => {
  const root = path.resolve(__dirname, '..');
  assert.equal(resolvePublicFile(root, '/assets/js/00-core.js'), path.join(root, 'assets', 'js', '00-core.js'));
  assert.equal(resolvePublicFile(root, '/../../Windows/win.ini'), null);
  assert.equal(resolvePublicFile(root, '/%2e%2e/%2e%2e/Windows/win.ini'), null);
});

test('permite revalidar código y cachear recursos gráficos versionables', () => {
  assert.equal(cacheControlFor('.js'), 'no-cache, max-age=0, must-revalidate');
  assert.equal(cacheControlFor('.css'), 'no-cache, max-age=0, must-revalidate');
  assert.equal(cacheControlFor('.svg'), 'public, max-age=31536000, immutable');
});

test('define cabeceras defensivas para la aplicación local', () => {
  const headers = securityHeaders();
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'SAMEORIGIN');
  assert.match(headers['Referrer-Policy'], /same-origin/);
});

