/**
 * El desglose de una opción, leído del texto en que se guarda, y el precio
 * por persona para toda la estancia que sale de él (el que Javier quería ver
 * en grande en el PDF, 29/09/2026).
 *
 * Cómo correrla:  npm run test:desglose
 */
import assert from "node:assert/strict";

import { desgloseDeLaOpcion, importeDesdeTexto, precioPorEstancia } from "../src/domain/desgloseDeOpcion";
import { desgloseEnLista, desgloseParaElCliente, estanciaParaElCliente } from "../src/domain/desgloseParaElCliente";

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

// Las opciones reales de ORV-2026-0006, tal como están guardadas.
const PLANAS = "43,13 € x 48 alumnos + 43,13 € x 8 profesores (sin tarifa individual: mismo precio), por noche x 4 noches";
const SANTA_MONICA = "33,39 € x 48 alumnos + 60,11 € x 8 profesores (uso individual), por noche x 4 noches";

prueba("los importes se leen con punto de miles y coma decimal", () => {
  assert.equal(importeDesdeTexto("9.661,12 €"), 9661.12);
  assert.equal(importeDesdeTexto("43,13 €"), 43.13);
  assert.equal(importeDesdeTexto(""), null);
  assert.equal(importeDesdeTexto(null), null);
});

prueba("alumnos y profesores al mismo precio", () => {
  const { tramos, ...d } = desgloseDeLaOpcion(PLANAS, "9.661,12 €")!;
  assert.deepEqual(d, {
    alumnos: { pax: 48, precio: 43.13 },
    profesores: { pax: 8, precio: 43.13, individual: false },
    noches: 4,
    total: 9661.12,
  });
  assert.equal(tramos.length, 1);
  assert.equal(tramos[0].profesores?.habitacion, "MULTIPLE");
});

prueba("profesores en individual, a su precio", () => {
  const d = desgloseDeLaOpcion(SANTA_MONICA, "8.334,40 €");
  assert.equal(d?.profesores?.precio, 60.11);
  assert.equal(d?.profesores?.individual, true);
});

prueba("sin profesores, y un texto que no es nuestro no se adivina", () => {
  assert.equal(desgloseDeLaOpcion("43,13 € x 48 alumnos, por noche x 4 noches", "8.280,96 €")?.profesores, null);
  assert.equal(desgloseDeLaOpcion("precio total 9.000 €", "9.000 €"), null);
  assert.equal(desgloseDeLaOpcion(null, null), null);
});

prueba("el precio por estancia es por noche × noches, por alumno y por profesor", () => {
  assert.deepEqual(precioPorEstancia(desgloseDeLaOpcion(PLANAS, "9.661,12 €")!), { alumno: 172.52, profesor: 172.52 });
  assert.deepEqual(precioPorEstancia(desgloseDeLaOpcion(SANTA_MONICA, "8.334,40 €")!), { alumno: 133.56, profesor: 240.44 });
  assert.deepEqual(precioPorEstancia(desgloseDeLaOpcion("43,13 € x 48 alumnos, por noche x 4 noches", "1 €")!), { alumno: 172.52, profesor: null });
});

// ── Bloques de alumnos con otra habitación y otra pensión (Oravia, 05/11/2026) ──

const BLOQUES = "40,00 € x 40 alumnos + 52,00 € x 10 alumnos (en doble, suplemento +10 %, MP) + 60,11 € x 3 profesores (uso individual), por noche x 4 noches";

prueba("lo que lee el colegio: el bloque, con su habitación y su pensión dichas en palabras", () => {
  const t = desgloseParaElCliente(BLOQUES);
  assert.match(t, /× 40 alumnos \+ 52,00 € × 10 alumnos \(habitación doble, suplemento del 10 %, media pensión\)/);
  assert.doesNotMatch(t, /\bMP\b|en doble,/, "sin abreviaturas ni frases internas");
});

prueba("el desglose en lista pone cada bloque en su línea, empezando por quién es", () => {
  const [tramo] = desgloseEnLista(BLOQUES, "2027-03-23");
  assert.deepEqual(tramo.lineas, [
    "40 alumnos: 40,00 € por noche",
    "10 alumnos (habitación doble, suplemento del 10 %, media pensión): 52,00 € por noche",
    "3 profesores (habitación individual): 60,11 € por noche",
  ]);
});

prueba("los suplementos del grupo principal entre paréntesis NO se leen como bloque", () => {
  const t = desgloseParaElCliente("47,65 € x 50 alumnos (Sábado / víspera de festivo +25 %) + 63,51 € x 3 profesores (uso individual), por noche x 1 noche");
  assert.match(t, /× 50 alumnos \(Sábado \/ víspera de festivo \+25 %\)/);
});

prueba("la frase de la estancia dice que la cifra es del grupo principal y manda al desglose", () => {
  const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const con = estanciaParaElCliente(BLOQUES, "9.000,00 €", "2027-03-23", euros);
  assert.match(con ?? "", /a 40,00 € por alumno y noche\. El resto de los alumnos va en otra habitación o con otra pensión: está en el desglose\./);
  const sin = estanciaParaElCliente("43,13 € x 48 alumnos, por noche x 4 noches", "8.280,96 €", "2027-03-23", euros);
  assert.equal(sin, "Toda la estancia: 4 noches a 43,13 € por alumno y noche.");
});

prueba("al cliente, una plaza de gratuidad del hotel se dice «gratuidad del hotel, sin coste»", () => {
  const t = desgloseParaElCliente("54,00 € x 50 alumnos + 0,00 € x 2 profesores (gratuidad) + 54,00 € x 1 profesores (múltiple), por noche x 4 noches");
  assert.match(t, /2 profesores[^+]*gratuidad del hotel, sin coste/);
  assert.doesNotMatch(t, /\(gratuidad\)/, "no se deja la palabra a medias");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
