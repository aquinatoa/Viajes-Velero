/**
 * Las fases del trato en Zoho.
 *
 * El trato nacía con la fase «Nueva», que ni siquiera existe en el embudo de
 * Oravia, y no se movía nunca más: enviar la propuesta o que el colegio
 * eligiera una opción no se notaba en el CRM. Quien miraba Zoho veía todos los
 * tratos amontonados al principio.
 *
 * Aquí se comprueba la regla, que es donde estaría el fallo si un trato
 * retrocediera. La llamada a Zoho no se prueba: se prueba la decisión.
 *
 * Cómo correrla:  npm run test:crm
 */
import assert from "node:assert/strict";

import { decidirFase, FASES, FASE_DE_HITO } from "../server/crmPipeline";

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

// ── El embudo es el de Oravia ─────────────────────────────────────────────────

console.log("\nEl embudo que hay en su CRM");

prueba("las fases son las que tiene Oravia, en su orden", () => {
  assert.deepEqual(FASES, [
    "Preparando Presupuesto",
    "Presupuesto Enviado",
    "Seguimiento al Presupuesto",
    "Pendiente de deposito",
    "Oportunidad Ganada",
    "Pendiente de pago resto",
    "Cierre Administrativo",
    "Expediente cerrado",
  ]);
});

prueba("cada cosa que pasa en la app tiene su fase", () => {
  assert.equal(FASE_DE_HITO.presupuesto_preparado, "Preparando Presupuesto");
  assert.equal(FASE_DE_HITO.presupuesto_enviado, "Presupuesto Enviado");
  assert.equal(FASE_DE_HITO.presupuesto_visto, "Seguimiento al Presupuesto");
  assert.equal(FASE_DE_HITO.opcion_elegida, "Pendiente de deposito");
  assert.equal(FASE_DE_HITO.deposito_cobrado, "Oportunidad Ganada");
});

// ── Avanzar ───────────────────────────────────────────────────────────────────

console.log("\nAvanzar");

prueba("enviar la propuesta mueve el trato", () => {
  const d = decidirFase("Preparando Presupuesto", "Presupuesto Enviado");
  assert.equal(d.mover, true);
  assert.equal(d.motivo, "avanza");
});

prueba("se puede saltar una fase, si el colegio contesta rápido", () => {
  // Abre el enlace y elige en el mismo rato: de «Enviado» a «Pendiente de
  // deposito» sin pasar por seguimiento.
  const d = decidirFase("Presupuesto Enviado", "Pendiente de deposito");
  assert.equal(d.mover, true);
});

// ── No retroceder ─────────────────────────────────────────────────────────────

console.log("\nNo retroceder, que es lo que importa");

prueba("reenviar un viaje ya ganado no lo devuelve al principio", () => {
  const d = decidirFase("Oportunidad Ganada", "Presupuesto Enviado");
  assert.equal(d.mover, false);
  assert.equal(d.motivo, "mas_adelantada");
});

prueba("que vuelvan a abrir el enlace no deshace la elección", () => {
  const d = decidirFase("Pendiente de deposito", "Seguimiento al Presupuesto");
  assert.equal(d.mover, false);
});

prueba("estar ya en la fase que toca no es un movimiento", () => {
  const d = decidirFase("Presupuesto Enviado", "Presupuesto Enviado");
  assert.equal(d.mover, false);
  assert.equal(d.motivo, "ya_esta");
});

prueba("una fase que ya está por detrás en el embudo no se pisa hacia atrás", () => {
  const d = decidirFase("Cierre Administrativo", "Oportunidad Ganada");
  assert.equal(d.mover, false);
});

// ── Lo que decide una persona ─────────────────────────────────────────────────

console.log("\nLo que ha decidido una persona");

prueba("un trato dado por perdido no vuelve al embudo solo", () => {
  const d = decidirFase("Oportunidad Perdida", "Presupuesto Enviado");
  assert.equal(d.mover, false);
  assert.equal(d.motivo, "intocable");
});

prueba("uno aparcado en lista de espera, tampoco", () => {
  const d = decidirFase("Lista de Espera", "Pendiente de deposito");
  assert.equal(d.mover, false);
  assert.equal(d.motivo, "intocable");
});

// ── Los tratos que ya están mal ───────────────────────────────────────────────

console.log("\nLos tratos que ya se crearon con una fase inventada");

prueba("«Nueva» no es del embudo, así que se corrige", () => {
  // Es la fase con la que se han creado todos los tratos hasta ahora. No está
  // en su picklist: nadie la puso a propósito, así que la app sabe más.
  const d = decidirFase("Nueva", "Presupuesto Enviado");
  assert.equal(d.mover, true);
  assert.equal(d.motivo, "fuera_del_embudo");
});

prueba("un trato sin fase también se corrige", () => {
  const d = decidirFase("", "Preparando Presupuesto");
  assert.equal(d.mover, true);
  assert.equal(d.motivo, "fuera_del_embudo");
});

prueba("una fase de pruebas del CRM se corrige igual", () => {
  const d = decidirFase("test", "Presupuesto Enviado");
  assert.equal(d.mover, true);
});

// ── Detalles que rompen en la práctica ────────────────────────────────────────

console.log("\nDetalles que rompen en la práctica");

prueba("los espacios de más no cuentan", () => {
  const d = decidirFase("  Presupuesto Enviado  ", "Presupuesto Enviado");
  assert.equal(d.mover, false);
  assert.equal(d.motivo, "ya_esta");
});

prueba("las mayúsculas del picklist tampoco", () => {
  // En su CRM es «Pendiente de deposito», con minúscula y sin tilde. Si alguien
  // la escribe de otra forma, no puede leerse como una fase distinta.
  const d = decidirFase("PENDIENTE DE DEPOSITO", "Seguimiento al Presupuesto");
  assert.equal(d.mover, false);
  assert.equal(d.motivo, "mas_adelantada");
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
