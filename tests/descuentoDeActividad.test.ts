/**
 * El descuento de una actividad (reunión del 19/10/2026): abierto, en euros
 * por persona o en porcentaje, y elegido actividad a actividad.
 *
 * Cómo correrla:  npm run test:descuento
 */
import assert from "node:assert/strict";

import {
  descuentoValido,
  lineasConDescuento,
  precioConDescuento,
  textoDelDescuento,
} from "../src/domain/descuentoDeActividad";
import { porAlumno, totalDeLineas } from "../src/domain/lineasDeActividad";

let pasadas = 0;
let fallidas = 0;

function prueba(nombre: string, cuerpo: () => void) {
  try {
    cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.log(`  FALLA  ${nombre}`);
    console.log(`         ${error instanceof Error ? error.message : String(error)}`);
  }
}

prueba("2 € menos por persona: la banana de 14 € sale a 12 €", () => {
  assert.equal(precioConDescuento(14, { tipo: "EUR", valor: 2 }), 12);
});

prueba("un 10 % menos, al céntimo", () => {
  assert.equal(precioConDescuento(26, { tipo: "PCT", valor: 10 }), 23.4);
  assert.equal(precioConDescuento(12.99, { tipo: "PCT", valor: 15 }), 11.04);
});

prueba("nunca por debajo de cero", () => {
  assert.equal(precioConDescuento(1.5, { tipo: "EUR", valor: 2 }), 0);
});

prueba("sin descuento, o con uno que no vale, el precio no cambia", () => {
  assert.equal(precioConDescuento(14, null), 14);
  assert.equal(precioConDescuento(14, { tipo: "EUR", valor: 0 }), 14);
  assert.equal(precioConDescuento(14, { tipo: "PCT", valor: 120 }), 14);
  assert.equal(descuentoValido({ tipo: "PCT", valor: 100 }), true);
  assert.equal(descuentoValido({ tipo: "EUR", valor: Number.NaN }), false);
});

prueba("con líneas, el descuento va a cada persona y cuadra el total del grupo", () => {
  const lineas = [
    { rateId: "a", etiqueta: "Joven (12-17)", precio: 14, cantidad: 40 },
    { rateId: "b", etiqueta: "Adulto (18-59)", precio: 20, cantidad: 4 },
  ];
  const con = lineasConDescuento(lineas, { tipo: "EUR", valor: 2 });
  assert.deepEqual(con.map((l) => l.precio), [12, 18]);
  // 40 × 12 + 4 × 18 = 552, antes 640: 2 € × 44 personas = 88 € menos.
  assert.equal(totalDeLineas(con), 552);
  assert.equal(totalDeLineas(lineas) - totalDeLineas(con), 88);
  assert.equal(porAlumno(con, 40), 13.8);
  assert.equal(lineas[0].precio, 14, "las líneas originales no se tocan");
});

prueba("cómo se dice en el documento", () => {
  assert.equal(textoDelDescuento({ tipo: "EUR", valor: 2 }), "2,00 € menos por persona");
  assert.equal(textoDelDescuento({ tipo: "PCT", valor: 7.5 }), "7,5 % menos");
  assert.equal(textoDelDescuento(null), "");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
