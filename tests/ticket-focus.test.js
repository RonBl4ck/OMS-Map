const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mapJs = fs.readFileSync(path.join(root, 'assets', 'js', '10-map.js'), 'utf8');
const coreJs = fs.readFileSync(path.join(root, 'assets', 'js', '00-core.js'), 'utf8');

test('la búsqueda de ticket no filtra ni oculta los demás marcadores en el mapa', () => {
  // Asegura que en filterMapMarkers no se descarte el resto de tickets cuando searchType === 'ticket'
  assert.match(mapJs, /if\s*\(query\s*&&\s*searchType\s*===\s*"ticket"\)\s*\{[\s\S]*?matchQuery\s*=\s*true;/);
  // Asegura que fitBounds no aleje el mapa si hay búsqueda por ticket activa
  assert.match(mapJs, /if\s*\(bounds\.length\s*>\s*0\s*&&\s*\(!query\s*\|\|\s*searchType\s*!==\s*"ticket"\)\)/);
});

test('focusTicketInMap está definida, expuesta y maneja búsqueda por Ticket y ODM', () => {
  assert.match(mapJs, /function\s+focusTicketInMap\(rawQuery,\s*notifyIfNotFound\s*=\s*false\)/);
  assert.match(mapJs, /window\.focusTicketInMap\s*=\s*focusTicketInMap;/);
  assert.match(mapJs, /match\s*=\s*\(mapLocations\s*\|\|\s*\[\]\)\.find\(l\s*=>\s*String\(l\.ticket/);
  assert.match(mapJs, /match\s*=\s*\(mapLocations\s*\|\|\s*\[\]\)\.find\(l\s*=>\s*String\(l\.odm/);
});

test('focusTicketInMap utiliza zoomToShowLayer, flyTo, abre el popup y activa marker-highlight-pulse', () => {
  assert.match(mapJs, /markersGroup\.zoomToShowLayer\(target\.marker,\s*executeFocus\)/);
  assert.match(mapJs, /leafletMap\.flyTo\(\[match\.lat,\s*match\.lon\],\s*17/);
  assert.match(mapJs, /target\.marker\.openPopup\(\)/);
  assert.match(mapJs, /classList\.add\('marker-highlight-pulse'\)/);
  assert.match(mapJs, /target\.marker\._icon\?\.classList\.remove\('marker-highlight-pulse'\)/);
});

test('al presionar Enter en inputTicket con modo ticket se invoca focusTicketInMap', () => {
  assert.match(mapJs, /searchTypeMapEl\.value\s*===\s*"ticket"\)\s*\{\s*focusTicketInMap\(inputTicketEl\.value\.trim\(\),\s*true\);/);
});

test('navigateToTicketOnMap enfoca el ticket sin borrar el input ni ocultar los demás marcadores', () => {
  assert.match(coreJs, /inputTicket\.value\s*=\s*match\.ticket\s*\|\|\s*ticketOrOdm;/);
  assert.match(coreJs, /searchTypeMap\.value\s*=\s*"ticket";/);
  assert.match(coreJs, /focusTicketInMap\(match\.ticket\s*\|\|\s*ticketOrOdm,\s*false\);/);
});
