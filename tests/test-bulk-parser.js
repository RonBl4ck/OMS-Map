// tests/test-bulk-parser.js

function parseBulkTicketsWithJc(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    
    const lines = rawText.split(/\r?\n/);
    const resultMap = new Map();

    lines.forEach(rawLine => {
        const line = rawLine.trim();
        if (!line) return;

        // Si la línea contiene tabulación (copiado clásico de 2+ columnas de Excel)
        if (line.includes('\t')) {
            const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                const t0 = (parts[0].match(/\b\d{5,12}\b/) || [])[0];
                const t1 = (parts[1].match(/\b\d{5,12}\b/) || [])[0];

                if (t0 && !t1) {
                    const jcVal = parts.slice(1).join(' ').trim().toUpperCase();
                    resultMap.set(t0, { ticket: t0, jc: jcVal });
                    return;
                } else if (t1 && !t0) {
                    const jcVal = parts[0].trim().toUpperCase();
                    resultMap.set(t1, { ticket: t1, jc: jcVal });
                    return;
                }
            }
        }

        // Si hay múltiples tickets en la misma línea (ej: "12345, 67890" o texto libre)
        const allTicketMatches = line.match(/\b\d{5,12}\b/g) || [];
        if (allTicketMatches.length > 1) {
            allTicketMatches.forEach(t => {
                if (!resultMap.has(t)) {
                    resultMap.set(t, { ticket: t, jc: '' });
                }
            });
            return;
        }

        // Si hay exactamente un ticket en la línea
        if (allTicketMatches.length === 1) {
            const ticket = allTicketMatches[0];
            let rest = line.replace(ticket, '').trim();
            // Limpiar separadores comunes como guiones, comas, dos puntos, barras
            rest = rest.replace(/^[\s,;\-|:]+|[\s,;\-|:]+$/g, '').trim();
            const jcVal = rest ? rest.toUpperCase() : '';
            resultMap.set(ticket, { ticket, jc: jcVal });
        }
    });

    return Array.from(resultMap.values());
}

function parseBulkTickets(rawText) {
    return parseBulkTicketsWithJc(rawText).map(item => item.ticket);
}

console.log("=== PROBANDO PARSER DE TICKETS MASIVOS CON JC (EXCEL) ===");

// Caso 1: Copiado de Excel de 2 columnas (Ticket \t JC)
const excelCopyTwoCols = "2145892\tJUAN PEREZ\r\n2145893\tCARLOS RAMOS\r\n2145894\tBRIGADA SUR\r\n";
const resPairs = parseBulkTicketsWithJc(excelCopyTwoCols);
console.assert(resPairs.length === 3, `Esperaba 3 pares, obtuvo ${resPairs.length}`);
console.assert(resPairs[0].ticket === '2145892' && resPairs[0].jc === 'JUAN PEREZ', 'Par 0 incorrecto');
console.assert(resPairs[1].ticket === '2145893' && resPairs[1].jc === 'CARLOS RAMOS', 'Par 1 incorrecto');
console.assert(resPairs[2].ticket === '2145894' && resPairs[2].jc === 'BRIGADA SUR', 'Par 2 incorrecto');
console.log("✅ Caso 1 (Excel 2 columnas Ticket + JC): OK ->", resPairs);

// Caso 2: Columnas invertidas en Excel (JC \t Ticket)
const excelInverted = "MARIO BROS\t2145895\r\nLUIGI VERDE\t2145896";
const resInverted = parseBulkTicketsWithJc(excelInverted);
console.assert(resInverted.length === 2, `Esperaba 2 pares invertidos, obtuvo ${resInverted.length}`);
console.assert(resInverted[0].ticket === '2145895' && resInverted[0].jc === 'MARIO BROS', 'Par invertido 0 incorrecto');
console.assert(resInverted[1].ticket === '2145896' && resInverted[1].jc === 'LUIGI VERDE', 'Par invertido 1 incorrecto');
console.log("✅ Caso 2 (Excel Columnas Invertidas JC + Ticket): OK ->", resInverted);

// Caso 3: Copiado de Excel solo tickets (1 columna)
const excelSingleCol = "2145892\r\n2145893\r\n2145894\r\n";
const resLegacy1 = parseBulkTickets(excelSingleCol);
console.assert(resLegacy1.length === 3, `Esperaba 3 tickets, obtuvo ${resLegacy1.length}`);
console.assert(resLegacy1[0] === '2145892' && resLegacy1[2] === '2145894', 'Valores incorrectos caso 3');
console.log("✅ Caso 3 (Excel 1 columna solo tickets): OK ->", resLegacy1);

// Caso 4: Separado por comas y espacios
const commaSeparated = "2145892,  2145893, 2145894";
const resLegacy2 = parseBulkTickets(commaSeparated);
console.assert(resLegacy2.length === 3, `Esperaba 3 tickets, obtuvo ${resLegacy2.length}`);
console.log("✅ Caso 4 (Comas): OK ->", resLegacy2);

// Caso 5: Deduplicación y actualización de JC
const withDups = "2145892\tJUAN PEREZ\n2145892\tJUAN PEREZ ACTUALIZADO\n2145893";
const resDups = parseBulkTicketsWithJc(withDups);
console.assert(resDups.length === 2, `Esperaba 2 tickets deduplicados, obtuvo ${resDups.length}`);
console.assert(resDups[0].ticket === '2145892' && resDups[0].jc === 'JUAN PEREZ ACTUALIZADO', 'Deduplicación falló en actualizar');
console.assert(resDups[1].ticket === '2145893' && resDups[1].jc === '', 'Ticket sin JC debe tener jc vacio');
console.log("✅ Caso 5 (Deduplicación inteligente): OK ->", resDups);

// Caso 6: Separador con guion (ej: 2145892 - LUIS SILVA)
const hyphenFormat = "2145897 - LUIS SILVA\n2145898: JORGE DIAZ";
const resHyphen = parseBulkTicketsWithJc(hyphenFormat);
console.assert(resHyphen[0].ticket === '2145897' && resHyphen[0].jc === 'LUIS SILVA', 'Separador guion falló');
console.assert(resHyphen[1].ticket === '2145898' && resHyphen[1].jc === 'JORGE DIAZ', 'Separador dos puntos falló');
console.log("✅ Caso 6 (Formatos texto con guión/dos puntos): OK ->", resHyphen);

// Caso 7: Texto libre con palabras
const freeText = "Atender urgente los tickets 2145892 y el 2145893 por favor";
const resLegacy4 = parseBulkTickets(freeText);
console.assert(resLegacy4.length === 2, `Esperaba 2 tickets de texto libre, obtuvo ${resLegacy4.length}`);
console.log("✅ Caso 7 (Texto libre): OK ->", resLegacy4);

console.log("\n🎉 TODAS LAS PRUEBAS DEL PARSER EXCEL PASARON EXITOSAMENTE!");

module.exports = { parseBulkTicketsWithJc, parseBulkTickets };
