/**
 * El descuento de una actividad (reunión del 19/10/2026): abierto, en euros
 * por persona o en porcentaje, y elegido actividad a actividad.
 *
 * Cómo correrla:  npm run test:descuento
 */
import assert from "node:assert/strict";

import {
  descuentoValido,
  esLineaDeDescuento,
  lineasConDescuento,
  precioConDescuento,
  textoDelDescuento,
} from "../src/domain/descuentoDeActividad";
import { porAlumno, resumenDeLineas, totalDeLineas } from "../src/domain/lineasDeActividad";

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

prueba("el caso de Ruth (23/10): 4 € por alumno bajan el precio por alumno 4 €, no 4,23 €", () => {
  // Circuito de tirolinas: 35 alumnos + 2 profesores a 22,95 € = 849,15 €.
  const lineas = [{ rateId: "t", etiqueta: "Desde 3 años", precio: 22.95, cantidad: 37 }];
  assert.equal(porAlumno(lineas, 35), 24.26);
  const con = lineasConDescuento(lineas, { tipo: "EUR", valor: 4 }, 35);
  assert.equal(con.length, 2);
  assert.ok(esLineaDeDescuento(con[1]));
  assert.equal(totalDeLineas(con), 709.15); // 849,15 − 35 × 4
  assert.equal(porAlumno(con, 35), 20.26);
  assert.equal(
    resumenDeLineas(con),
    "37 × 22,95 € Desde 3 años − 35 × 4,00 € descuento por alumno = 709,15 €",
  );
  assert.equal(lineas.length, 1, "las líneas originales no se tocan");
});

prueba("en una tarifa por grupo, 4 € por alumno no son 4 € del grupo", () => {
  const lineas = [{ rateId: "g", etiqueta: "Grupo de 8", precio: 190, cantidad: 4 }];
  const con = lineasConDescuento(lineas, { tipo: "EUR", valor: 2 }, 30);
  assert.equal(totalDeLineas(con), 700); // 760 − 30 × 2
  assert.equal(porAlumno(con, 30), 23.33);
});

prueba("el descuento en euros no deja el total por debajo de cero", () => {
  const lineas = [{ rateId: "a", etiqueta: "x", precio: 3, cantidad: 10 }];
  const con = lineasConDescuento(lineas, { tipo: "EUR", valor: 5 }, 10);
  assert.equal(totalDeLineas(con), 0);
});

prueba("sin alumnos no hay descuento en euros; volver a aplicarlo no lo duplica", () => {
  const lineas = [{ rateId: "a", etiqueta: "x", precio: 10, cantidad: 5 }];
  assert.deepEqual(lineasConDescuento(lineas, { tipo: "EUR", valor: 2 }, 0), lineas);
  const una = lineasConDescuento(lineas, { tipo: "EUR", valor: 2 }, 5);
  const dos = lineasConDescuento(una, { tipo: "EUR", valor: 2 }, 5);
  assert.equal(totalDeLineas(dos), 40);
  assert.equal(totalDeLineas(lineasConDescuento(una, null, 5)), 50, "quitarlo devuelve el precio");
});

prueba("el porcentaje va a cada línea", () => {
  const lineas = [
    { rateId: "a", etiqueta: "Joven (12-17)", precio: 14, cantidad: 40 },
    { rateId: "b", etiqueta: "Adulto (18-59)", precio: 20, cantidad: 4 },
  ];
  const con = lineasConDescuento(lineas, { tipo: "PCT", valor: 10 }, 40);
  assert.deepEqual(con.map((l) => l.precio), [12.6, 18]);
  assert.equal(totalDeLineas(con), 576);
});

prueba("cómo se dice en el documento", () => {
  assert.equal(textoDelDescuento({ tipo: "EUR", valor: 2 }), "2,00 € menos por alumno");
  assert.equal(textoDelDescuento({ tipo: "PCT", valor: 7.5 }), "7,5 % menos");
  assert.equal(textoDelDescuento(null), "");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
