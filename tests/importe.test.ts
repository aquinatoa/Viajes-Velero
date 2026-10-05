/**
 * Leer un importe escrito para personas.
 *
 * El fallo que obliga a esto está en el CRM real de Oravia: el trato
 * 734060000032099001 tiene **Importe 595194** cuando el presupuesto son
 * 5.951,94 €. Cien veces de más, y el depósito del 30% calculado sobre eso.
 *
 * La causa era `text.replace(/[^\d]/g, "")`: se quedaba con los dígitos y
 * tiraba la coma. Con importes redondos funcionaba -«6.528 €» → 6528- y en
 * cuanto los totales llevaron céntimos dejó de funcionar sin avisar, porque un
 * número cien veces mayor no da ningún error.
 *
 * Cómo correrla:  npm run test:importe
 */
import assert from "node:assert/strict";

import { importeDe } from "../src/domain/importe";

let pasadas = 0;
let fallidas = 0;

function prueba(nombre: string, cuerpo: () => void) {
  try {
    cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.error(`  FALLA  ${nombre}`);
    console.error(`        ${(error as Error).message.split("\n")[0]}`);
  }
}

console.log("\nEl caso que está mal en su CRM");

prueba("«5.951,94 €» son 5951.94, no 595194", () => {
  assert.equal(importeDe("5.951,94 €"), 5951.94);
});

prueba("y su depósito del 30% sale bien", () => {
  const total = importeDe("5.951,94 €") as number;
  assert.equal(Math.round(total * 0.3 * 100) / 100, 1785.58);
});

prueba("los otros dos totales de esa misma propuesta", () => {
  assert.equal(importeDe("7.936,38 €"), 7936.38);
  assert.equal(importeDe("4.700,28 €"), 4700.28);
});

console.log("\nLas formas en que se escribe dinero aquí");

prueba("con miles y sin decimales", () => {
  assert.equal(importeDe("6.528 €"), 6528);
});

prueba("con millones", () => {
  assert.equal(importeDe("1.234.567,89 €"), 1234567.89);
});

prueba("sin miles", () => {
  assert.equal(importeDe("34,06 €"), 34.06);
  assert.equal(importeDe("190,00 €"), 190);
});

prueba("un número pelado", () => {
  assert.equal(importeDe("300"), 300);
  assert.equal(importeDe("300.50"), 300.5);
});

prueba("un punto que NO separa miles", () => {
  // «1.23» es uno con veintitrés: detrás no van tres dígitos.
  assert.equal(importeDe("1.23"), 1.23);
});

prueba("con texto alrededor", () => {
  assert.equal(importeDe("Total: 5.951,94 € por el grupo"), 5951.94);
});

console.log("\nLo que no es un importe");

prueba("vacío y nulo dan null, no cero", () => {
  // Un cero es un importe real. Confundirlo con «no se sabe» manda un trato a
  // Zoho con importe cero.
  assert.equal(importeDe(""), null);
  assert.equal(importeDe(null), null);
  assert.equal(importeDe(undefined), null);
});

prueba("un texto sin cifras da null", () => {
  assert.equal(importeDe("a consultar"), null);
  assert.equal(importeDe("—"), null);
  assert.equal(importeDe("€"), null);
});

prueba("el cero sí es cero", () => {
  assert.equal(importeDe("0,00 €"), 0);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
