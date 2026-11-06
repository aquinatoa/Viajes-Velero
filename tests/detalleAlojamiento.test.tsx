/**
 * La tabla de tarifas del detalle de un hotel, con la columna «Alumnos»
 * (reunión con Oravia, 05/11/2026; pedido de Anthony el 06/11): cuántos alumnos
 * van en cada tarifa, como las entradas de una actividad. Se renderiza con las
 * dos tarifas de la captura (media pensión 43,20 € y pensión completa 54 €).
 *
 * Cómo correrla:  npm run test:detalle-hotel
 */
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: unknown }).React = React;

import { DetalleAlojamiento } from "../src/components/request/RequestCanvas";
import type { AccommodationRate, AccommodationSearchMatch } from "../src/domain/types";
import { COMPOSICION_POR_DEFECTO, type ComposicionDeLaEstancia } from "../src/domain/estancia";
import { estanciaDeHotel, type AcompanantesDelHotel } from "../src/services/estanciaDeHotel";

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

const tarifa = (id: string, boardType: string, pvpAmount: number): AccommodationRate => ({
  id,
  accommodationId: "h1",
  rateSource: "",
  year: 2027,
  seasonName: "Única · Temporada 2027 (sin desglose de periodos facilitado por el proveedor)",
  dateFrom: "",
  dateTo: "",
  minNights: 0,
  boardType,
  tariffUnit: "PPPN",
  pvpAmount,
  netSaleAmount: 0,
  netAzulmarinoAmount: 0,
  unitName: "Apartamentos (grupos, PPPN)",
  rawText: null,
  clientSegment: "",
  includedService: "",
  occupancyLabel: "Múltiple",
  sourceFile: "",
  sourceSheet: "",
});
const MP = tarifa("mp", "MP", 43.2);
const PC = tarifa("pc", "PC", 54);

function hotel(asignacion: Record<string, number> = {}, alumnos = 50): AccommodationSearchMatch {
  const base = {
    accommodation: {
      id: "h1",
      accommodationName: "Hotel Apartamentos de prueba",
      categoryType: "Apartamentos",
      locality: "Salou",
      freePolicy: "",
      conditionsText: "",
      observations: "",
    },
    rate: PC,
    score: 1,
    matchReasons: [],
    alternativas: [MP],
  } as unknown as AccommodationSearchMatch;
  const composicion: ComposicionDeLaEstancia = COMPOSICION_POR_DEFECTO;
  return {
    ...base,
    estancia: estanciaDeHotel(base, composicion, { fechaEntrada: "2027-03-23", noches: 4, alumnos, profesores: 0 }, asignacion),
  };
}

const detalle = (item: AccommodationSearchMatch, asignacion: Record<string, number> = {}, alumnos = 50) =>
  renderToStaticMarkup(
    <DetalleAlojamiento
      item={item}
      noches={4}
      alumnos={alumnos}
      profesores={0}
      desde="2027-03-23"
      hasta="2027-03-27"
      asignacion={asignacion}
      onAsignar={() => undefined}
    />,
  );

console.log("\nLa columna «Alumnos» de la tabla de tarifas");

prueba("la tabla tiene la columna «Alumnos»; la tarifa elegida lleva todos los alumnos y la otra, una casilla", () => {
  const h = detalle(hotel());
  assert.match(h, /<th[^>]*>Alumnos<\/th>/);
  assert.match(h, /<td class="cv__num cv__detasig"[^>]*><b>50<\/b><\/td>/, "la elegida: los 50");
  assert.match(h, /<input type="number"[^>]*aria-label="Alumnos en [^"]*"[^>]*value="0"/);
});

prueba("el máximo de la casilla deja al menos un alumno en la tarifa elegida", () => {
  assert.match(detalle(hotel()), /<input[^>]*max="49"/);
});

prueba("con 10 alumnos asignados a la media pensión: la elegida muestra 40, la otra 10 y su chip", () => {
  const asignacion = { mp: 10 };
  const h = detalle(hotel(asignacion), asignacion);
  assert.match(h, /<td class="cv__num cv__detasig"[^>]*><b>40<\/b><\/td>/);
  assert.match(h, /<input[^>]*value="10"/);
  assert.match(h, /<span class="cv__detchip">10 alumnos<\/span>/);
  assert.match(h, /<input[^>]*max="49"/, "40 + 10 - 1");
});

prueba("el total del alojamiento suma los dos grupos: 40 × 54 + 10 × 43,20, 4 noches", () => {
  const asignacion = { mp: 10 };
  const item = hotel(asignacion);
  assert.equal(item.estancia?.total, Math.round((54 * 40 + 43.2 * 10) * 4 * 100) / 100);
  const h = detalle(item, asignacion);
  // El espacio antes del «€» es el de no separación que escribe Intl.
  assert.match(h, /<td class="cv__num">10\.368\s€<\/td>/, "el total de 10.368 € sale en la tabla de precios");
});

prueba("el detalle tiene una fila «Alumnos» por cada grupo y dice cuál es el principal", () => {
  const asignacion = { mp: 10 };
  const h = detalle(hotel(asignacion), asignacion);
  assert.equal((h.match(/<th scope="row">Alumnos<\/th>/g) ?? []).length, 2);
  assert.match(h, /grupo principal/);
});

prueba("con un solo alumno no se puede repartir: la casilla está desactivada", () => {
  const h = detalle(hotel({}, 1), {}, 1);
  assert.match(h, /<input[^>]*disabled=""/);
});

// ── Profesores, chófer y gratuidad en la misma tabla (06/11/2026) ──

function hotelConEquipo(
  acompanantes: AcompanantesDelHotel = {},
  { freePolicy = "", profesores = 4, chofer = 1, alumnos = 50 } = {},
): AccommodationSearchMatch {
  const base = hotel({}, alumnos);
  const sinEstancia = {
    ...base,
    accommodation: { ...base.accommodation, freePolicy },
  } as AccommodationSearchMatch;
  const composicion: ComposicionDeLaEstancia = {
    ...COMPOSICION_POR_DEFECTO,
    profesores: { habitacion: "MULTIPLE", regimen: "" },
    chofer: { cantidad: chofer, habitacion: "MULTIPLE", regimen: "" },
  };
  return {
    ...sinEstancia,
    estancia: estanciaDeHotel(sinEstancia, composicion, { fechaEntrada: "2027-03-23", noches: 4, alumnos, profesores }, {}, acompanantes),
  };
}

const detalleConEquipo = (item: AccommodationSearchMatch, acompanantes: AcompanantesDelHotel = {}, profesores = 4) =>
  renderToStaticMarkup(
    <DetalleAlojamiento
      item={item}
      noches={4}
      alumnos={50}
      profesores={profesores}
      desde="2027-03-23"
      hasta="2027-03-27"
      asignacion={{}}
      onAsignar={() => undefined}
      acompanantes={acompanantes}
      onAcompanantes={() => undefined}
    />,
  );

console.log("\nProfesores, chófer y gratuidad en la tabla de tarifas");

prueba("con profesores y chófer, la tabla tiene sus columnas; sin ellos, no", () => {
  const con = detalleConEquipo(hotelConEquipo());
  assert.match(con, /<th[^>]*>Profesores<\/th>/);
  assert.match(con, /<th[^>]*>Chófer<\/th>/);
  const sin = detalle(hotel());
  assert.doesNotMatch(sin, /<th[^>]*>Profesores<\/th>/);
  assert.doesNotMatch(sin, /<th[^>]*>Chófer<\/th>/);
});

prueba("sin repartir, la tarifa elegida lleva a todos los profesores y al chófer", () => {
  const h = detalleConEquipo(hotelConEquipo());
  assert.match(h, /<td class="cv__num cv__detasig"[^>]*><b>4<\/b><\/td>/, "los 4 profesores");
  assert.match(h, /<td class="cv__num cv__detasig"[^>]*><b>1<\/b><\/td>/, "el chófer");
});

prueba("2 profesores y el chófer en media pensión: la elegida lleva 2, la otra sus casillas y chips", () => {
  const a: AcompanantesDelHotel = { profesores: { mp: 2 }, chofer: { mp: 1 } };
  const h = detalleConEquipo(hotelConEquipo(a), a);
  assert.match(h, /<td class="cv__num cv__detasig"[^>]*><b>2<\/b><\/td>/);
  assert.match(h, /aria-label="Profesores en [^"]*"[^>]*value="2"|value="2"[^>]*aria-label="Profesores en [^"]*"/);
  assert.match(h, /<span class="cv__detchip">2 profesores<\/span>/);
  assert.match(h, /<span class="cv__detchip">1 chófer<\/span>/);
});

prueba("sin texto de gratuidad en el hotel no hay fila de gratuidad", () => {
  assert.doesNotMatch(detalleConEquipo(hotelConEquipo()), /Gratuidad del hotel/);
});

prueba("con «1 gratuidad cada 25 de pago» y 50 alumnos: la fila dice 2 plazas y ofrece usarlas", () => {
  const item = hotelConEquipo({}, { freePolicy: "1 gratuidad cada 25 de pago (hab. múltiple)." });
  const h = detalleConEquipo(item);
  assert.match(h, /Gratuidad del hotel/);
  assert.match(h, /1 cada 25 · con 50 alumnos: 2 plazas/);
  assert.match(h, /Usar 2 en profesores/);
  assert.match(h, /aria-label="Profesores en gratuidad del hotel"/);
  assert.match(h, /aria-label="Chófer en gratuidad del hotel"/);
});

prueba("por defecto la gratuidad no se aplica: el total es el mismo que sin gratuidad", () => {
  const sin = hotelConEquipo();
  const con = hotelConEquipo({}, { freePolicy: "1 gratuidad cada 25 de pago" });
  assert.equal(con.estancia?.total, sin.estancia?.total);
});

prueba("con 2 profesores en gratuidad: salen en la fila, valen 0 € y el total baja", () => {
  const a: AcompanantesDelHotel = { gratisProfesores: 2 };
  const libre = hotelConEquipo({}, { freePolicy: "1 gratuidad cada 25 de pago" });
  const item = hotelConEquipo(a, { freePolicy: "1 gratuidad cada 25 de pago" });
  assert.ok((item.estancia?.total ?? 0) < (libre.estancia?.total ?? 0), "pagan 2 profesores menos");
  assert.equal(Math.round(((libre.estancia?.total ?? 0) - (item.estancia?.total ?? 0)) * 100) / 100, 54 * 2 * 4);
  const h = detalleConEquipo(item, a);
  assert.match(h, /aria-label="Profesores en gratuidad del hotel"[^>]*value="2"|value="2"[^>]*aria-label="Profesores en gratuidad del hotel"/);
  assert.doesNotMatch(h, /Usar 2 en profesores/, "ya se usaron: el botón desaparece");
});

prueba("la fila se ofrece aunque el hotel solo tenga una tarifa (sin alternativas)", () => {
  const item = { ...hotelConEquipo({}, { freePolicy: "1 gratuidad cada 25 de pago" }), alternativas: [] } as AccommodationSearchMatch;
  const h = detalleConEquipo(item);
  assert.match(h, /Lo que tiene este hotel para estas fechas/);
  assert.match(h, /Gratuidad del hotel/);
});

prueba("una gratuidad sin cifra («consultar») se dice y deja decidir a mano", () => {
  const item = hotelConEquipo({}, { freePolicy: "Gratuidades: consultar" });
  const h = detalleConEquipo(item);
  assert.match(h, /sin cifra clara en el documento/);
  assert.doesNotMatch(h, /Usar \d+ en profesores/);
  assert.match(h, /aria-label="Profesores en gratuidad del hotel"/);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
