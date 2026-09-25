/**
 * Qué cumple y qué no cumple un alojamiento para ESTE centro.
 *
 * Sale de una queja concreta de Anthony sobre la pantalla de opciones: el
 * «Detalle» enseñaba la ficha del hotel pero «no me da la seguridad de que
 * estoy seleccionando un alojamiento con las características y necesidades de
 * la petición». Y tenía razón: los requisitos del mensaje —dos celíacos, una
 * alumna con movilidad reducida— se leían, se pintaban en pantalla, y no se
 * usaban para nada.
 *
 * La prueba que más importa de todo este fichero es la de «no consta». Decir
 * que un hotel NO tiene habitación adaptada cuando lo que pasa es que su
 * tarifa no habla del tema es mentir, y con eso se contesta mal a un colegio
 * que lleva una alumna en silla de ruedas.
 *
 * Cómo correrla:  npm run test:encaje
 * No necesita base de datos: es una función pura.
 */
import assert from "node:assert/strict";

import { comprobar, resumenDelEncaje, type Comprobacion } from "../server/encajeConLaPeticion";

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

/** La petición real de la pantalla: IES Jaume Balmes, Salou, mayo de 2027. */
const PETICION = {
  categoryRequested: "3*",
  boardType: "PC",
  destinationText: "Salou",
  requisitos: ["Alergias / dietas especiales", "Habitación adaptada / accesibilidad"],
  topePorAlumno: 300,
};

const busca = (lista: Comprobacion[], texto: string | RegExp) =>
  lista.find((c) => (typeof texto === "string" ? c.que.includes(texto) : texto.test(c.que)));

console.log("\nLo que el colegio dijo con todas las letras");

prueba("la categoría que coincide cumple", () => {
  const r = comprobar(PETICION, { categoryType: "3*", textos: [] }, { boardType: "PC" }, {});
  assert.equal(busca(r, "estrellas")?.estado, "cumple");
});

prueba("una categoría superior también, y se dice", () => {
  const r = comprobar(PETICION, { categoryType: "4*", textos: [] }, { boardType: "PC" }, {});
  const c = busca(r, "estrellas");
  assert.equal(c?.estado, "cumple");
  assert.match(String(c?.detalle), /Pedían 3/);
});

prueba("una inferior NO cumple, y dice qué pedían", () => {
  const r = comprobar(PETICION, { categoryType: "2*", textos: [] }, { boardType: "PC" }, {});
  const c = busca(r, "estrellas");
  assert.equal(c?.estado, "no_cumple");
  assert.match(String(c?.detalle), /Pedían 3/);
});

prueba("un camping no tiene estrellas: no consta, no es que no cumpla", () => {
  // Un camping o un albergue no se puntúa por estrellas, y decir que «no
  // cumple» lo dejaría fuera por algo que no es un defecto.
  const r = comprobar(PETICION, { categoryType: "Camping", textos: [] }, { boardType: "PC" }, {});
  assert.equal(busca(r, "estrellas")?.estado, "no_consta");
});

prueba("el régimen se reconoce por el código y por el nombre", () => {
  for (const board of ["PC", "Pensión completa", "PENSIÓ COMPLETA"]) {
    const r = comprobar(PETICION, { textos: [] }, { boardType: board }, {});
    assert.equal(busca(r, "Pensión completa")?.estado, "cumple", `con «${board}»`);
  }
});

prueba("media pensión cuando pedían completa NO cumple", () => {
  const r = comprobar(PETICION, { textos: [] }, { boardType: "MP" }, {});
  const c = busca(r, "Media pensión");
  assert.equal(c?.estado, "no_cumple");
  assert.match(String(c?.detalle), /pensión completa/i);
});

console.log("\nEl precio contra su tope");

prueba("por debajo del tope cumple, y recuerda cuál era", () => {
  const r = comprobar(PETICION, { textos: [] }, {}, { precioPorAlumno: 213 });
  const c = busca(r, "por alumno");
  assert.equal(c?.estado, "cumple");
  assert.match(String(c?.detalle), /300 €/);
});

prueba("por encima NO cumple, y dice cuánto se pasa", () => {
  const r = comprobar(PETICION, { textos: [] }, {}, { precioPorAlumno: 355 });
  const c = busca(r, "por alumno");
  assert.equal(c?.estado, "no_cumple");
  assert.match(String(c?.detalle), /55 €/);
});

prueba("sin tope, no se inventa la comprobación", () => {
  const r = comprobar({ ...PETICION, topePorAlumno: null }, { textos: [] }, {}, { precioPorAlumno: 213 });
  assert.equal(busca(r, "por alumno"), undefined);
});

console.log("\nLo que pidió en prosa, que es lo que no se miraba");

prueba("si la tarifa habla de dietas, cumple", () => {
  const r = comprobar(
    PETICION,
    { textos: ["Menús por alergias, dietas o intolerancias a confirmar con el hotel."] },
    {},
    {},
  );
  const c = busca(r, "Dietas especiales");
  assert.equal(c?.estado, "cumple");
  assert.match(String(c?.detalle), /su tarifa/i);
});

prueba("si no dice nada es NO CONSTA, nunca «no cumple»", () => {
  // La prueba más importante del fichero. Un hotel puede tener habitación
  // adaptada y no haberlo escrito en su tarifa; decir que no la tiene sería
  // contestarle mal a un colegio que lleva una alumna en silla de ruedas.
  const r = comprobar(PETICION, { textos: ["Precios netos. IVA incluido."] }, {}, {});
  assert.equal(busca(r, "Habitación adaptada")?.estado, "no_consta");
  assert.equal(busca(r, "Dietas especiales")?.estado, "no_consta");
});

prueba("la accesibilidad se reconoce escrita de varias formas", () => {
  for (const texto of ["con habitación adaptada (hab. 314)", "acceso para PMR", "movilidad reducida"]) {
    const r = comprobar(PETICION, { textos: [texto] }, {}, {});
    assert.equal(busca(r, "Habitación adaptada")?.estado, "cumple", `con «${texto}»`);
  }
});

prueba("un requisito que no sabemos buscar se dice, no se calla", () => {
  const r = comprobar(
    { ...PETICION, requisitos: ["Piscina climatizada"] },
    { textos: ["Piscina climatizada incluida"] },
    {},
    {},
  );
  const c = busca(r, "Piscina");
  assert.equal(c?.estado, "no_consta");
  assert.match(String(c?.detalle), /confirmarlo con el hotel/i);
});

console.log("\nLo que puede tumbar la opción");

prueba("el mínimo de plazas del hotel contra el tamaño del grupo", () => {
  const textos = ["Mínim 2 nits. Mínim 25 pax. Disponibilitat OR."];
  const ok = comprobar(PETICION, { textos }, {}, { participantes: 48 });
  assert.equal(busca(ok, "Mínimo 25")?.estado, "cumple");

  const corto = comprobar(PETICION, { textos }, {}, { participantes: 12 });
  const c = busca(corto, "Mínimo 25");
  assert.equal(c?.estado, "no_cumple");
  assert.match(String(c?.detalle), /12/);
});

prueba("la estancia mínima de la tarifa", () => {
  const corta = comprobar(PETICION, { textos: [] }, { minNights: 5 }, { noches: 4 });
  assert.equal(busca(corta, "Estancia mínima")?.estado, "no_cumple");

  const larga = comprobar(PETICION, { textos: [] }, { minNights: 2 }, { noches: 4 });
  assert.equal(busca(larga, "Estancia mínima")?.estado, "cumple");
});

prueba("«bajo petición» se avisa: no se puede prometer", () => {
  const r = comprobar(PETICION, { textos: ["Disponibilitat OR (on request)."] }, {}, {});
  const c = busca(r, "bajo petición");
  assert.equal(c?.estado, "no_consta");
  assert.match(String(c?.detalle), /antes de prometer/i);
});

console.log("\nEl resumen, para ordenar el podio");

prueba("cuenta cada estado", () => {
  const r = comprobar(
    PETICION,
    { categoryType: "3*", textos: ["Menús por alergias y dietas."] },
    { boardType: "PC" },
    { precioPorAlumno: 213 },
  );
  const n = resumenDelEncaje(r);
  assert.equal(n.cumple, 4); // estrellas, régimen, precio, dietas
  assert.equal(n.noCumple, 0);
  assert.equal(n.noConsta, 1); // accesibilidad
});

prueba("una petición sin nada no genera comprobaciones", () => {
  const r = comprobar({}, { textos: [] }, {}, {});
  assert.deepEqual(r, []);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
