/**
 * Cambrils Park sale en la lista como UN complejo y, dentro, sus cuatro tipos:
 * MED 1, MED 2, MED 3 y Villa Bonita / Aloha (Javier, 16–17/11/2026).
 *
 * Cómo correrla:  npm run test:complejo
 *
 * No necesita base de datos ni servidor. Los nombres son los que deja la
 * migración 20261118100000_cambrils_park_cuatro_tipos.
 */
import assert from "node:assert/strict";

import { algunCampoCoincide } from "../src/domain/aliasDeProveedor";
import { agruparPorComplejo, partesDelNombre } from "../src/domain/complejoDeAlojamiento";

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

type Hotel = { accommodationName: string; locality: string | null };
const h = (accommodationName: string, locality: string | null = "Cambrils"): Hotel => ({ accommodationName, locality });

// En el orden en que llegan de la búsqueda (por puntuación): los tipos salen salteados.
const LISTA: Hotel[] = [
  h("Cambrils Park · Villa Bonita / Aloha"),
  h("Hotel Planas 3* (Salou)", "Salou"),
  h("Cambrils Park · MED 3"),
  h("Apartaments Pins Platja (Cambrils)"),
  h("Cambrils Park · MED 1"),
  h("Cambrils Park · MED 2"),
];
const agrupar = (lista: Hotel[]) => agruparPorComplejo(lista, (x) => x.accommodationName, (x) => x.locality);

console.log("\nEl nombre del complejo y el del tipo");

prueba("«Cambrils Park · MED 1» se lee como complejo y tipo", () => {
  assert.deepEqual(partesDelNombre("Cambrils Park · MED 1"), { complejo: "Cambrils Park", tipo: "MED 1" });
  assert.deepEqual(partesDelNombre("Cambrils Park · Villa Bonita / Aloha"), {
    complejo: "Cambrils Park",
    tipo: "Villa Bonita / Aloha",
  });
});

prueba("un nombre sin «·» no es un complejo", () => {
  assert.equal(partesDelNombre("Hotel Planas 3* (Salou)"), null);
  assert.equal(partesDelNombre("4R Hotels 3* – Salou & Calafell"), null);
});

console.log("\nLa lista");

prueba("los cuatro tipos van juntos bajo «Cambrils Park», en el sitio del mejor colocado", () => {
  const e = agrupar(LISTA);
  assert.equal(e.length, 3);
  assert.equal(e[0].clase, "complejo");
  if (e[0].clase !== "complejo") return;
  assert.equal(e[0].nombre, "Cambrils Park");
  assert.deepEqual(
    e[0].items.map((x) => x.tipo),
    ["MED 1", "MED 2", "MED 3", "Villa Bonita / Aloha"],
  );
  assert.deepEqual(
    e.slice(1).map((x) => (x.clase === "suelto" ? x.item.accommodationName : x.nombre)),
    ["Hotel Planas 3* (Salou)", "Apartaments Pins Platja (Cambrils)"],
  );
});

prueba("los demás hoteles no cambian de orden", () => {
  const sueltos = agrupar(LISTA).flatMap((x) => (x.clase === "suelto" ? [x.item.accommodationName] : []));
  assert.deepEqual(sueltos, ["Hotel Planas 3* (Salou)", "Apartaments Pins Platja (Cambrils)"]);
});

prueba("un solo tipo a la vista (p. ej. al buscar «med 3») sale suelto, con su nombre entero", () => {
  const e = agrupar([h("Cambrils Park · MED 3")]);
  assert.equal(e.length, 1);
  assert.equal(e[0].clase, "suelto");
});

prueba("la localidad se compara sin mayúsculas: «CAMBRILS» del suizo y «Cambrils» van juntos", () => {
  const e = agrupar([h("Cambrils Park · MED 1", "CAMBRILS"), h("Cambrils Park · MED 2", "Cambrils")]);
  assert.equal(e.length, 1);
  assert.equal(e[0].clase, "complejo");
});

prueba("no se pierde ningún hotel al agrupar", () => {
  const total = agrupar(LISTA).reduce((s, x) => s + (x.clase === "suelto" ? 1 : x.items.length), 0);
  assert.equal(total, LISTA.length);
});

console.log("\nEl buscador con los nombres nuevos");

const buscar = (texto: string) =>
  LISTA.filter((a) => algunCampoCoincide([a.accommodationName, a.locality], texto)).map((a) => a.accommodationName);

prueba("«cambrils park» y «cambrils par» encuentran los cuatro tipos", () => {
  assert.equal(buscar("cambrils park").length, 4);
  assert.equal(buscar("cambrils par").length, 4);
});

prueba("«med 1», «med 2», «med3» y «villa bonita» encuentran su tipo", () => {
  assert.deepEqual(buscar("med 1"), ["Cambrils Park · MED 1"]);
  assert.deepEqual(buscar("med 2"), ["Cambrils Park · MED 2"]);
  assert.deepEqual(buscar("med3"), ["Cambrils Park · MED 3"]);
  assert.deepEqual(buscar("villa bonita"), ["Cambrils Park · Villa Bonita / Aloha"]);
});

prueba("«MSH» sigue encontrando Cambrils Park", () => {
  assert.equal(buscar("msh").length, 4);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
