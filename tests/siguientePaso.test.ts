/**
 * Qué toca hacer ahora con un presupuesto.
 *
 * Sale de una frase exacta mirando la ficha: «estoy aquí y no sé cuál es el
 * próximo paso que debo hacer». La ficha decía dónde está el expediente y qué
 * se ofreció, y ahí se acababa. Saber en qué fase estás no es saber qué hacer.
 *
 * `hoy` se pasa siempre: una prueba que mire el reloj caduca sola.
 *
 * Cómo correrla:  npm run test:siguiente
 * No necesita base de datos: es una función pura.
 */
import assert from "node:assert/strict";

import { diasHasta, siguientePasoDelExpediente } from "../src/domain/siguientePaso";

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

const HOY = new Date("2026-09-25T12:00:00Z");
const hace = (dias: number) => new Date(HOY.getTime() - dias * 86_400_000).toISOString();
const dentroDe = (dias: number) => new Date(HOY.getTime() + dias * 86_400_000).toISOString();

const paso = (e: Parameters<typeof siguientePasoDelExpediente>[0]) =>
  siguientePasoDelExpediente(e, HOY);

console.log("\nSi no ha salido, lo demás da igual");

prueba("simulada: el colegio no ha recibido nada", () => {
  // En local siempre pasa esto, y darlo por enviado hace que alguien espere
  // una respuesta que nunca iba a llegar.
  const p = paso({ estado: "SIMULATED", sentAt: hace(1) });
  assert.match(p.titulo, /no ha salido/i);
  assert.equal(p.urgencia, "urgente");
  // Y trae el boton de enviar: hasta el 06/10/2026 el cartel salia sin salida,
  // y en cuanto el buzon tuviera clave nadie podia mandarla desde la app.
  assert.equal(p.accion, "enviar");
});

prueba("fallida: se reintenta, y se dice que no duplica", () => {
  const p = paso({ estado: "FAILED" });
  assert.match(p.titulo, /reintentar/i);
  assert.match(p.porque, /no duplica/i);
  assert.equal(p.accion, "enviar");
});

prueba("sin enviar todavía", () => {
  assert.match(paso({ estado: "DRAFT" }).titulo, /falta enviarla/i);
});

console.log("\nSalió y esperamos");

prueba("recién enviada: se espera, sin alarma", () => {
  const p = paso({ estado: "SENT", sentAt: hace(1), viewCount: 0 });
  assert.match(p.titulo, /esperando/i);
  assert.equal(p.urgencia, "normal");
  assert.equal(p.accion, undefined);
});

prueba("a los tres días sin abrir, puede no haber llegado", () => {
  const p = paso({ estado: "SENT", sentAt: hace(4), viewCount: 0 });
  assert.match(p.titulo, /no la han abierto/i);
  assert.match(p.porque, /hace 4 días/);
  assert.match(p.porque, /Puede no haber llegado/);
  assert.equal(p.accion, "correo");
});

prueba("abierta hace poco: se espera", () => {
  const p = paso({ estado: "SENT", sentAt: hace(3), viewCount: 2, firstViewedAt: hace(1) });
  assert.match(p.titulo, /esperando su respuesta/i);
  assert.equal(p.urgencia, "normal");
});

prueba("abierta y cinco días en silencio: seguimiento", () => {
  const p = paso({ estado: "SENT", sentAt: hace(8), viewCount: 3, firstViewedAt: hace(6) });
  assert.match(p.titulo, /seguimiento/i);
  assert.match(p.porque, /hace 6 días/);
});

prueba("si han escrito, eso va antes que el seguimiento", () => {
  // Mandar un «¿cómo lo veis?» a quien te acaba de escribir es no haber
  // mirado el correo.
  const p = paso({
    estado: "SENT",
    sentAt: hace(8),
    viewCount: 3,
    firstViewedAt: hace(6),
    correosEntrantes: 2,
  });
  assert.match(p.titulo, /te han contestado/i);
  assert.equal(p.accion, "correo");
});

console.log("\nEligieron: el depósito");

prueba("con opción elegida, toca pedir el depósito", () => {
  const p = paso({
    estado: "SENT",
    sentAt: hace(10),
    viewCount: 4,
    firstViewedAt: hace(9),
    elegida: 2,
    depositDueAt: dentroDe(10),
  });
  assert.match(p.titulo, /depósito/i);
  assert.match(p.porque, /opción 2/);
  assert.match(p.porque, /quedan 10 días/);
  assert.equal(p.urgencia, "atencion");
});

prueba("a tres días o menos, urge", () => {
  const p = paso({ estado: "SENT", sentAt: hace(10), viewCount: 1, elegida: 1, depositDueAt: dentroDe(2) });
  assert.equal(p.urgencia, "urgente");
});

prueba("vencido: se reclama, y se dice cuánto hace", () => {
  const p = paso({ estado: "SENT", sentAt: hace(30), viewCount: 1, elegida: 1, depositDueAt: hace(4) });
  assert.match(p.titulo, /vencido/i);
  assert.match(p.porque, /hace 4 días/);
  assert.equal(p.urgencia, "urgente");
});

prueba("sin plazo fijado se dice, no se calla", () => {
  const p = paso({ estado: "SENT", sentAt: hace(10), viewCount: 1, elegida: 3, depositDueAt: null });
  assert.match(p.porque, /Falta fijar el plazo/);
});

prueba("pagado: toca cerrar", () => {
  const p = paso({
    estado: "SENT",
    sentAt: hace(40),
    viewCount: 5,
    elegida: 1,
    depositDueAt: hace(10),
    depositPaidAt: hace(8),
  });
  assert.match(p.titulo, /cerrar/i);
  assert.equal(p.urgencia, "hecho");
  // Aunque el plazo esté pasado: pagado manda sobre vencido.
  assert.ok(!/vencido/i.test(p.titulo));
});

console.log("\nLas cuentas de días");

prueba("los días se cuentan enteros y con signo", () => {
  assert.equal(diasHasta(dentroDe(5), HOY), 5);
  assert.equal(diasHasta(hace(3), HOY), -3);
  assert.equal(diasHasta(null, HOY), null);
  assert.equal(diasHasta("cuando podáis", HOY), null);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
