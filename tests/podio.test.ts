/**
 * El podio de los tres recomendados.
 *
 * La lista larga ordena por la puntuación de la búsqueda; el podio ordena por
 * cuántas de las cosas que pidió el colegio cumple cada hotel, que es otra
 * cosa. Lo que se comprueba aquí es sobre todo lo que NO debe subir: un hotel
 * que incumple algo no puede salir recomendado, por muy alto que puntúe.
 *
 * Cómo correrla:  npm run test:podio
 * No necesita base de datos: son funciones puras.
 */
import assert from "node:assert/strict";

import { cuentaDelEncaje, ordenarPorEncaje, podio, razonDelPodio } from "../src/domain/podio";
import type { AccommodationSearchMatch, ComprobacionDeEncaje } from "../src/domain/types";

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

const si = (que: string): ComprobacionDeEncaje => ({ que, estado: "cumple" });
const no = (que: string): ComprobacionDeEncaje => ({ que, estado: "no_cumple" });
const quizas = (que: string): ComprobacionDeEncaje => ({ que, estado: "no_consta" });

function hotel(
  nombre: string,
  encaje: ComprobacionDeEncaje[],
  extra: { score?: number; precio?: number } = {},
): AccommodationSearchMatch {
  return {
    accommodation: { id: nombre, accommodationName: nombre },
    rate: { id: `${nombre}-t`, pvpAmount: extra.precio ?? 50, netSaleAmount: 0 },
    score: extra.score ?? 10,
    matchReasons: [],
    encaje,
  } as unknown as AccommodationSearchMatch;
}

console.log("\nLa cuenta de cada estado");

prueba("cuenta cumple, no cumple y no consta", () => {
  const n = cuentaDelEncaje([si("3★"), si("PC"), no("tope"), quizas("dietas")]);
  assert.deepEqual(n, { cumple: 2, noCumple: 1, noConsta: 1, total: 4 });
});

prueba("sin comprobaciones, todo a cero", () => {
  assert.deepEqual(cuentaDelEncaje(undefined), { cumple: 0, noCumple: 0, noConsta: 0, total: 0 });
});

console.log("\nQué NO puede subir al podio");

prueba("un hotel que incumple algo no se recomienda, aunque puntúe lo más alto", () => {
  // El caso que motiva la regla: un 2★ cuando pidieron 3★ puede encajar
  // perfecto en destino y fechas y puntuar altísimo. Recomendarlo es hacer
  // perder el tiempo a quien cotiza.
  const lista = [
    hotel("2 estrellas pero perfecto en todo lo demás", [no("3 estrellas"), si("PC")], { score: 99 }),
    hotel("Correcto", [si("3 estrellas"), si("PC")], { score: 3 }),
  ];
  const tres = podio(lista);
  assert.equal(tres.length, 1);
  assert.equal(tres[0].accommodation.accommodationName, "Correcto");
});

prueba("si solo hay dos limpios, el podio tiene dos", () => {
  const lista = [
    hotel("A", [si("3★")]),
    hotel("B", [si("3★")]),
    hotel("C", [no("3★")]),
    hotel("D", [no("3★")]),
  ];
  assert.equal(podio(lista).length, 2);
});

prueba("si no hay ninguno limpio, no hay podio", () => {
  const lista = [hotel("A", [no("3★")]), hotel("B", [no("tope")])];
  assert.deepEqual(podio(lista), []);
});

prueba("sin nada que comprobar no se inventa un podio", () => {
  // Una petición sin requisitos ni tope no genera comprobaciones. Un podio
  // entonces seria un adorno: tres hoteles destacados sin ningún motivo.
  const lista = [hotel("A", []), hotel("B", [])];
  assert.deepEqual(podio(lista), []);
});

console.log("\nEl orden");

prueba("manda cumplir más cosas, no puntuar más", () => {
  const lista = [
    hotel("Puntúa alto, cumple poco", [si("3★"), quizas("dietas"), quizas("adaptada")], { score: 99 }),
    hotel("Puntúa bajo, cumple todo", [si("3★"), si("dietas"), si("adaptada")], { score: 1 }),
  ];
  assert.equal(ordenarPorEncaje(lista)[0].accommodation.accommodationName, "Puntúa bajo, cumple todo");
});

prueba("a igualdad de cumplidas, el que deja menos cosas sin confirmar", () => {
  const lista = [
    hotel("Con dudas", [si("3★"), quizas("dietas"), quizas("adaptada")]),
    hotel("Sin dudas", [si("3★")]),
  ];
  assert.equal(ordenarPorEncaje(lista)[0].accommodation.accommodationName, "Sin dudas");
});

prueba("y a igualdad de todo, el más barato", () => {
  const lista = [
    hotel("Caro", [si("3★")], { precio: 80 }),
    hotel("Barato", [si("3★")], { precio: 45 }),
  ];
  assert.equal(ordenarPorEncaje(lista)[0].accommodation.accommodationName, "Barato");
});

prueba("ordenar no toca la lista original", () => {
  const lista = [hotel("A", [quizas("x")]), hotel("B", [si("x")])];
  ordenarPorEncaje(lista);
  assert.equal(lista[0].accommodation.accommodationName, "A");
});

console.log("\nEl motivo, que es lo que permite discutirlo");

prueba("cumplirlo todo se dice con todas las letras", () => {
  assert.equal(razonDelPodio(hotel("A", [si("3★"), si("PC"), si("tope")])), "Cumple las 3 cosas que pidieron");
});

prueba("lo que falta por confirmar se dice, no se esconde", () => {
  const texto = razonDelPodio(hotel("A", [si("3★"), si("PC"), quizas("adaptada")]));
  assert.match(texto, /Cumple 2 de 3/);
  assert.match(texto, /1 por confirmar/);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
