/**
 * El suplemento B2C (Ruth, 24/11/2026: «subir € o % sobre el neto de B2B»), en
 * alojamientos y actividades, dentro del precio.
 *
 * Cómo correrla:  npm run test:b2c
 */
import assert from "node:assert/strict";

import { lineasConDescuento } from "../src/domain/descuentoDeActividad";
import { porAlumno, type LineaDeActividad } from "../src/domain/lineasDeActividad";
import { COMPOSICION_POR_DEFECTO } from "../src/domain/estancia";
import {
  lineasConSuplemento,
  precioConSuplemento,
  suplementoGuardado,
  suplementoValido,
  textoDelSuplemento,
} from "../src/domain/suplementoB2C";
import type { AccommodationSearchMatch } from "../src/domain/types";
import { estanciaDeHotel } from "../src/services/estanciaDeHotel";

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

prueba("solo vale mayor que cero, y el porcentaje hasta el 100", () => {
  assert.equal(suplementoValido({ tipo: "EUR", valor: 5 }), true);
  assert.equal(suplementoValido({ tipo: "PCT", valor: 10 }), true);
  assert.equal(suplementoValido({ tipo: "EUR", valor: 0 }), false);
  assert.equal(suplementoValido({ tipo: "PCT", valor: 120 }), false);
  assert.equal(suplementoValido(null), false);
});

prueba("en € se suma; en % sube ese tanto por ciento", () => {
  assert.equal(precioConSuplemento(40, { tipo: "EUR", valor: 5 }), 45);
  assert.equal(precioConSuplemento(40, { tipo: "PCT", valor: 10 }), 44);
  assert.equal(precioConSuplemento(22.95, { tipo: "PCT", valor: 15 }), 26.39);
  // Sin precio no hay a qué sumar.
  assert.equal(precioConSuplemento(0, { tipo: "EUR", valor: 5 }), 0);
  assert.equal(precioConSuplemento(40, null), 40);
});

prueba("en una actividad, a cada entrada de pago; la gratuidad no", () => {
  const lineas: LineaDeActividad[] = [
    { rateId: "joven", etiqueta: "Joven", precio: 40, cantidad: 30 },
    { rateId: "adulto", etiqueta: "Adulto", precio: 50, cantidad: 2 },
    { rateId: "adulto#gratis", etiqueta: "Adulto · gratuidad", precio: 0, cantidad: 1 },
  ];
  const con = lineasConSuplemento(lineas, { tipo: "EUR", valor: 5 });
  assert.deepEqual(con.map((l) => l.precio), [45, 55, 0]);
  // 30 × 45 + 2 × 55 = 1.460 € entre 30 alumnos (antes 1.300 €, 43,33).
  assert.equal(porAlumno(lineas, 30), 43.33);
  assert.equal(porAlumno(con, 30), 48.67);
});

prueba("el suplemento va antes que el descuento", () => {
  const lineas: LineaDeActividad[] = [{ rateId: "j", etiqueta: "Joven", precio: 40, cantidad: 10 }];
  const final = lineasConDescuento(lineasConSuplemento(lineas, { tipo: "EUR", valor: 5 }), { tipo: "EUR", valor: 2 }, 10);
  // 10 × 45 − 10 × 2 = 430: 43 € por alumno.
  assert.equal(porAlumno(final, 10), 43);
});

prueba("cómo lo ve quien cotiza", () => {
  assert.equal(textoDelSuplemento({ tipo: "EUR", valor: 5 }, true), "+5,00 € por persona y noche");
  assert.equal(textoDelSuplemento({ tipo: "EUR", valor: 5 }), "+5,00 € por persona");
  assert.equal(textoDelSuplemento({ tipo: "PCT", valor: 7.5 }), "+7,5 %");
});

prueba("se lee de la propuesta guardada", () => {
  const stay = JSON.stringify({ suplementosB2C: { h1: { tipo: "PCT", valor: 10 }, h2: { tipo: "EUR", valor: 0 } } });
  assert.deepEqual(suplementoGuardado(stay, "h1"), { tipo: "PCT", valor: 10 });
  assert.equal(suplementoGuardado(stay, "h2"), null);
  assert.equal(suplementoGuardado(stay, "otro"), null);
  assert.equal(suplementoGuardado("no es json", "h1"), null);
  assert.equal(suplementoGuardado(null, "h1"), null);
});

// Un hotel de una sola tarifa: 50 € por persona y noche, coste 40.
const hotel = {
  accommodation: { id: "h1", accommodationName: "Hotel de prueba" },
  rate: {
    id: "t1",
    boardType: "PC",
    occupancyLabel: "Múltiple",
    unitName: null,
    includedService: null,
    seasonName: null,
    dateFrom: null,
    dateTo: null,
    minNights: null,
    pvpAmount: 50,
    netSaleAmount: 40,
  },
  alternativas: [],
  suplementosHabitacion: {},
} as unknown as AccommodationSearchMatch;
const viaje = { fechaEntrada: "2027-03-10", noches: 3, alumnos: 20, profesores: 0 };

prueba("en un alojamiento, € por persona y noche dentro de cada noche", () => {
  const sin = estanciaDeHotel(hotel, COMPOSICION_POR_DEFECTO, viaje);
  const con = estanciaDeHotel(hotel, COMPOSICION_POR_DEFECTO, viaje, undefined, undefined, { tipo: "EUR", valor: 5 });
  assert.ok(sin && con);
  assert.equal(sin.porAlumno, 150);
  assert.equal(con.porAlumno, 165);
  assert.equal(con.total, sin.total + 20 * 3 * 5);
});

prueba("en un alojamiento, el % sube el precio y el coste se queda", () => {
  const con = estanciaDeHotel(hotel, COMPOSICION_POR_DEFECTO, viaje, undefined, undefined, { tipo: "PCT", valor: 10 });
  assert.ok(con);
  assert.equal(con.porAlumno, 165);
  assert.equal(con.tramos[0]?.alumno.coste, 40);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
