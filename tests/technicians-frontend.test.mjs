import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, '..', 'assets', 'js', '40-tecnicos.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const context = { console };
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.__techSecondsSinceLast = techSecondsSinceLast;`, context);

test('usa los segundos publicados por el backend como fuente de verdad', () => {
  const row = {
    'día': '2026-09-14',
    'Último trabajo': '2026-09-14T23:58:51',
    'Segundos desde último trabajo': '59469',
  };

  assert.equal(context.__techSecondsSinceLast(row), 59469);
});
