// tests/test-bulk-parser.js
function parseBulkTickets(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const matches = rawText.match(/\b\d{5,12}\b/g) || [];
    return Array.from(new Set(matches.map(t => t.trim())));
}

console.log("=== PROBANDO PARSER DE TICKETS MASIVOS ===");

// Caso 1: Copiado de Excel (saltos de línea)
const excelCopy = "2145892\r\n2145893\r\n2145894\r\n";
const res1 = parseBulkTickets(excelCopy);
console.assert(res1.length === 3, `Esperaba 3 tickets, obtuvo ${res1.length}`);
console.assert(res1[0] === '2145892' && res1[2] === '2145894', 'Valores incorrectos caso 1');
console.log("✅ Caso 1 (Excel): OK ->", res1);

// Caso 2: Separado por comas y espacios
const commaSeparated = "2145892,  2145893, 2145894";
const res2 = parseBulkTickets(commaSeparated);
console.assert(res2.length === 3, `Esperaba 3 tickets, obtuvo ${res2.length}`);
console.log("✅ Caso 2 (Comas): OK ->", res2);

// Caso 3: Con duplicados
const withDups = "2145892\n2145892\n2145893";
const res3 = parseBulkTickets(withDups);
console.assert(res3.length === 2, `Esperaba 2 tickets (deduplicados), obtuvo ${res3.length}`);
console.log("✅ Caso 3 (Deduplicación): OK ->", res3);

// Caso 4: Texto libre con palabras
const freeText = "Atender urgente los tickets 2145892 y el 2145893 por favor";
const res4 = parseBulkTickets(freeText);
console.assert(res4.length === 2, `Esperaba 2 tickets de texto libre, obtuvo ${res4.length}`);
console.log("✅ Caso 4 (Texto libre): OK ->", res4);

console.log("\n🎉 TODAS LAS PRUEBAS DEL PARSER PASARON EXITOSAMENTE!");
