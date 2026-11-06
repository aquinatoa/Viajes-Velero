/**
 * Avisos antes de enviar con selecciones incompletas (reunión con Oravia, 05/11/2026).
 *
 * Cómo correrla:  npm run test:avisos-envio
 */
import assert from "node:assert/strict";

import {
  avisosAntesDeEnviar,
  sePuedeEnviar,
  type ActividadParaRevisar,
  type EntradaDeAvisos,
} from "../src/domain/avisosAntesDeEnviar";

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

/** Una actividad bien elegida: una tarifa, entradas puestas, con precio. */
function actividad(sobre: Partial<ActividadParaRevisar> = {}): ActividadParaRevisar {
  return {
    id: "a1",
    nombre: "Kayak",
    enOpciones: [1],
    sinPrecio: false,
    tarifas: 1,
    tarifaQueSale: "Tarifa única · por persona",
    sinTocar: false,
    necesitaDia: false,
    tieneDia: false,
    fueraDeTemporada: false,
    sinEntradas: false,
    ...sobre,
  };
}

function entrada(sobre: Partial<EntradaDeAvisos> = {}): EntradaDeAvisos {
  return { alumnos: 48, opciones: 1, soloActividades: false, actividades: [actividad()], ...sobre };
}

const ids = (e: EntradaDeAvisos) => avisosAntesDeEnviar(e).map((a) => a.id);

console.log("\nUna propuesta completa no avisa de nada");

prueba("alojamiento, una actividad con su tarifa y su precio: sin avisos y se puede enviar", () => {
  const avisos = avisosAntesDeEnviar(entrada());
  assert.deepEqual(avisos, []);
  assert.deepEqual(sePuedeEnviar(avisos, false), { si: true, motivo: null });
});

console.log("\nLo que bloquea");

prueba("sin alumnos el documento sale a cero: bloquea, y marcar «revisado» no lo desbloquea", () => {
  const avisos = avisosAntesDeEnviar(entrada({ alumnos: 0 }));
  assert.equal(avisos[0].gravedad, "bloquea");
  const r = sePuedeEnviar(avisos, true);
  assert.equal(r.si, false);
  assert.match(r.motivo ?? "", /número de alumnos/);
});

console.log("\nEl caso de la reunión: la primera tarifa por defecto");

prueba("una actividad con varias tarifas que nadie eligió avisa y dice cuál saldrá", () => {
  const avisos = avisosAntesDeEnviar(entrada({ actividades: [actividad({ nombre: "PortAventura Park", tarifas: 81, sinTocar: true, tarifaQueSale: "Tarifa: Adulto · por persona" })] }));
  assert.deepEqual(avisos.map((a) => a.id), ["tarifa-por-defecto:a1"]);
  assert.match(avisos[0].texto, /tiene 81 tarifas y no has elegido ninguna/);
  assert.match(avisos[0].texto, /saldrá «Tarifa: Adulto · por persona»/);
});

prueba("si la eligió a mano, o solo tiene una, no avisa", () => {
  assert.deepEqual(ids(entrada({ actividades: [actividad({ tarifas: 4, sinTocar: false })] })), []);
  assert.deepEqual(ids(entrada({ actividades: [actividad({ tarifas: 1, sinTocar: true })] })), []);
});

console.log("\nSelecciones incompletas");

prueba("una actividad sin precio avisa de que saldrá «a consultar»", () => {
  const avisos = avisosAntesDeEnviar(entrada({ actividades: [actividad({ sinPrecio: true })] }));
  assert.deepEqual(avisos.map((a) => a.id), ["sin-precio:a1"]);
  assert.match(avisos[0].texto, /a consultar/);
});

prueba("sin precio y con varias tarifas por defecto: un solo aviso, el del precio (no se repite)", () => {
  assert.deepEqual(ids(entrada({ actividades: [actividad({ sinPrecio: true, tarifas: 3, sinTocar: true })] })), ["sin-precio:a1"]);
});

prueba("sin ninguna entrada con cantidad avisa de que saldrá sin importe", () => {
  assert.deepEqual(ids(entrada({ actividades: [actividad({ sinEntradas: true })] })), ["sin-entradas:a1"]);
});

prueba("el precio depende del día y falta el día: avisa; con el día puesto, no", () => {
  assert.deepEqual(ids(entrada({ actividades: [actividad({ nombre: "PortAventura", necesitaDia: true })] })), ["sin-dia:a1"]);
  assert.deepEqual(ids(entrada({ actividades: [actividad({ necesitaDia: true, tieneDia: true })] })), []);
});

prueba("una actividad fuera de temporada avisa", () => {
  assert.deepEqual(ids(entrada({ actividades: [actividad({ nombre: "Tuna Tour", fueraDeTemporada: true })] })), ["fuera-de-temporada:a1"]);
});

prueba("alojamiento sin ninguna actividad avisa; solo actividades, no", () => {
  assert.deepEqual(ids(entrada({ actividades: [] })), ["sin-actividades"]);
  assert.deepEqual(ids(entrada({ actividades: [], opciones: 0, soloActividades: true })), []);
});

prueba("si una opción lleva actividades y otra no, avisa de cuáles, porque el colegio las compara", () => {
  const avisos = avisosAntesDeEnviar(entrada({ opciones: 3, actividades: [actividad({ enOpciones: [1] })] }));
  assert.deepEqual(avisos.map((a) => a.id), ["opciones-sin-actividades"]);
  assert.match(avisos[0].texto, /Las opciones 2 y 3 no llevan actividades/);
  const una = avisosAntesDeEnviar(entrada({ opciones: 2, actividades: [actividad({ enOpciones: [1] })] }));
  assert.match(una[0].texto, /La opción 2 no lleva actividades/);
});

prueba("si ninguna opción lleva actividades es «sin actividades», no «unas sí y otras no»", () => {
  assert.deepEqual(ids(entrada({ opciones: 2, actividades: [] })), ["sin-actividades"]);
});

console.log("\nQué hay que hacer para poder enviar");

prueba("con avisos hay que marcar «he revisado» una sola vez, sea cual sea el número de avisos", () => {
  const avisos = avisosAntesDeEnviar(
    entrada({ actividades: [actividad({ sinPrecio: true }), actividad({ id: "a2", nombre: "Paintball", tarifas: 3, sinTocar: true }), actividad({ id: "a3", fueraDeTemporada: true })] }),
  );
  assert.equal(avisos.length, 3);
  const sin = sePuedeEnviar(avisos, false);
  assert.equal(sin.si, false);
  assert.match(sin.motivo ?? "", /los 3 avisos/);
  assert.equal(sePuedeEnviar(avisos, true).si, true);
});

prueba("lo que bloquea sale primero", () => {
  const avisos = avisosAntesDeEnviar(entrada({ alumnos: 0, actividades: [actividad({ sinPrecio: true })] }));
  assert.equal(avisos[0].id, "sin-alumnos");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
