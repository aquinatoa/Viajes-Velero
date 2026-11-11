/**
 * El color de cada fase, el mismo que Oravia ve en su CRM.
 *
 * Cómo correrla:  npm run test:color-fase
 */
import assert from "node:assert/strict";

import {
  FASES_DEL_ESTADO,
  claveDeFase,
  estiloDeFase,
  faseDelColorDelEstado,
  indexarColores,
  rgbDeHex,
  tonosDeFase,
} from "../src/domain/colorDeFase";

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

const COLORES = indexarColores([
  { nombre: "Presupuesto Enviado", color: "#4ca6f7" },
  { nombre: "Pendiente de deposito", color: "#f79a4c" },
  { nombre: "Oportunidad Ganada", color: "#2e9e5b" },
  { nombre: "Nueva", color: null },
  { nombre: "Fase Amarilla", color: "#ffe94c" },
]);

prueba("la clave no distingue tildes, mayúsculas ni espacios de más", () => {
  assert.equal(claveDeFase("  Pendiente de DEPÓSITO  "), "pendiente de deposito");
  assert.equal(claveDeFase("Presupuesto   Enviado"), "presupuesto enviado");
  assert.equal(claveDeFase(null), "");
});

prueba("las fases sin color en el CRM no entran en el mapa (no se inventan)", () => {
  assert.equal(COLORES[claveDeFase("Nueva")], undefined);
  assert.equal(Object.keys(COLORES).length, 4);
  assert.deepEqual(indexarColores(null), {});
  assert.deepEqual(indexarColores([]), {});
});

prueba("el hexadecimal se lee con o sin almohadilla y se rechaza lo que no es un color", () => {
  assert.deepEqual(rgbDeHex("#4ca6f7"), [76, 166, 247]);
  assert.deepEqual(rgbDeHex("4CA6F7"), [76, 166, 247]);
  assert.equal(rgbDeHex("azul"), null);
  assert.equal(rgbDeHex("#fff"), null);
  assert.equal(rgbDeHex(null), null);
});

prueba("la fase se encuentra aunque la app y Zoho la escriban distinto", () => {
  assert.ok(tonosDeFase("PENDIENTE DE DEPÓSITO", COLORES));
  assert.ok(tonosDeFase("presupuesto enviado", COLORES));
});

prueba("los tonos son ternas «r, g, b» y el texto es más oscuro que el fondo", () => {
  const t = tonosDeFase("Presupuesto Enviado", COLORES)!;
  assert.equal(t.c, "76, 166, 247");
  assert.match(t.ci, /^\d+, \d+, \d+$/);
  const suma = (s: string) => s.split(", ").reduce((a, v) => a + Number(v), 0);
  assert.ok(suma(t.ci) < suma(t.c), "el texto va más oscuro");
});

prueba("un color muy claro (amarillo) se oscurece más para que el texto se lea", () => {
  const claro = tonosDeFase("Fase Amarilla", COLORES)!;
  const medio = tonosDeFase("Presupuesto Enviado", COLORES)!;
  const luz = (s: string) => Math.max(...s.split(", ").map(Number));
  assert.ok(luz(claro.ci) < 200, "el amarillo del texto no puede seguir siendo casi blanco");
  const relacion = (t: { c: string; ci: string }) => luz(t.ci) / luz(t.c);
  assert.ok(relacion(claro) < relacion(medio), "el claro se oscurece proporcionalmente más");
});

prueba("sin color en el CRM no hay estilo: manda el color propio de la app", () => {
  assert.equal(estiloDeFase("Nueva", COLORES), undefined);
  assert.equal(estiloDeFase("Fase que no existe", COLORES), undefined);
  assert.equal(estiloDeFase("Oportunidad Ganada", {}), undefined, "si el CRM no contestó, nada");
  assert.deepEqual(estiloDeFase("Oportunidad Ganada", COLORES), { "--c": "46, 158, 91", "--ci": tonosDeFase("Oportunidad Ganada", COLORES)!.ci });
});

prueba("cada estado de la pantalla toma el color de su fase principal", () => {
  assert.equal(faseDelColorDelEstado("sin_enviar"), "Preparando Presupuesto");
  assert.equal(faseDelColorDelEstado("esperando"), "Presupuesto Enviado");
  assert.equal(faseDelColorDelEstado("aceptada"), "Pendiente de deposito");
  assert.equal(faseDelColorDelEstado("ganada"), "Oportunidad Ganada");
  assert.equal(faseDelColorDelEstado("perdida"), "Oportunidad Perdida");
});

prueba("las fases de cada estado no se repiten entre estados", () => {
  const todas = Object.values(FASES_DEL_ESTADO).flat();
  assert.equal(new Set(todas).size, todas.length);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
