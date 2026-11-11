/**
 * Mover una oportunidad de fase, con constancia.
 *
 * Zoho, la base y la auditoría son dobles de prueba: aquí no se escribe nunca en
 * el CRM de un cliente. Lo que se prueba es la decisión (qué se valida, qué se
 * escribe y en qué orden).
 *
 * Cómo correrla:  npm run test:mover-fase
 */
import assert from "node:assert/strict";

import { moverDeFase, type DependenciasDeMoverFase, type TratoParaMover } from "../server/moverFase";
import type { NuevoCambioDeFase } from "../server/cambiosDeFase";

let pasadas = 0;
let fallidas = 0;
async function prueba(nombre: string, cuerpo: () => Promise<void>) {
  try {
    await cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.error(`  FALLA  ${nombre}`);
    console.error(`        ${(error as Error).message.split("\n")[0]}`);
  }
}

const FASES = [
  "Nueva", "Preparando Presupuesto", "Presupuesto Enviado", "Seguimiento al Presupuesto",
  "Pendiente de deposito", "Pendiente de pago resto", "Oportunidad Ganada", "Lista de Espera", "Oportunidad Perdida",
];
const ANTHONY = { id: "u1", nombre: "Anthony" };

function montar(trato: TratoParaMover | null, opciones: { puedeVer?: boolean; zohoFalla?: boolean; fases?: string[] } = {}) {
  const escrituras: Array<Record<string, unknown>> = [];
  const historial: NuevoCambioDeFase[] = [];
  const auditoria: string[] = [];
  const deps: DependenciasDeMoverFase = {
    leerTrato: async () => trato,
    fasesValidas: async () => opciones.fases ?? FASES,
    puedeVer: () => opciones.puedeVer !== false,
    actualizar: async (c) => {
      if (opciones.zohoFalla) throw new Error("Zoho no contesta");
      escrituras.push(c);
    },
    registrar: async (c) => { historial.push(c); },
    auditar: async (d) => { auditoria.push(d); },
  };
  return { deps, escrituras, historial, auditoria };
}
const TRATO: TratoParaMover = { fase: "Seguimiento al Presupuesto", departamento: "SPORTS" };

async function main() {
  console.log("\nQué se valida");

  await prueba("retroceder sin motivo se rechaza y NO se escribe nada en Zoho", async () => {
    const m = montar(TRATO);
    const r = await moverDeFase({ dealId: "d1", fase: "Preparando Presupuesto" }, m.deps, ANTHONY);
    assert.deepEqual(r, { ok: false, status: 400, error: "Hace falta un motivo para retroceder, perder o pasar a lista de espera." });
    assert.equal(m.escrituras.length, 0);
    assert.equal(m.historial.length, 0);
  });

  await prueba("perder y pasar a lista de espera también exigen motivo; un motivo de dos letras no vale", async () => {
    for (const fase of ["Oportunidad Perdida", "Lista de Espera"]) {
      const m = montar(TRATO);
      assert.equal((await moverDeFase({ dealId: "d1", fase }, m.deps, ANTHONY)).ok, false, fase);
      assert.equal((await moverDeFase({ dealId: "d1", fase, motivo: "ok" }, m.deps, ANTHONY)).ok, false, `${fase} con motivo corto`);
      assert.equal(m.escrituras.length, 0);
    }
  });

  await prueba("avanzar no exige motivo", async () => {
    const m = montar(TRATO);
    const r = await moverDeFase({ dealId: "d1", fase: "Pendiente de deposito" }, m.deps, ANTHONY);
    assert.equal(r.ok, true);
    assert.equal(m.escrituras.length, 1);
  });

  await prueba("reabrir una de lista de espera tampoco exige motivo", async () => {
    const m = montar({ fase: "Lista de Espera", departamento: "SPORTS" });
    assert.equal((await moverDeFase({ dealId: "d1", fase: "Preparando Presupuesto" }, m.deps, ANTHONY)).ok, true);
  });

  await prueba("una fase que no existe en el CRM se rechaza", async () => {
    const m = montar(TRATO);
    const r = await moverDeFase({ dealId: "d1", fase: "Inventada", motivo: "lo que sea" }, m.deps, ANTHONY);
    assert.deepEqual(r, { ok: false, status: 400, error: "Esa fase no existe en el CRM." });
    assert.equal(m.escrituras.length, 0);
  });

  await prueba("una oportunidad que no existe o no es de su departamento da la misma respuesta", async () => {
    const noExiste = await moverDeFase({ dealId: "d1", fase: "Presupuesto Enviado" }, montar(null).deps, ANTHONY);
    const ajena = await moverDeFase({ dealId: "d1", fase: "Presupuesto Enviado" }, montar(TRATO, { puedeVer: false }).deps, ANTHONY);
    assert.deepEqual(noExiste, ajena);
    assert.equal(ajena.ok, false);
    if (!ajena.ok) assert.equal(ajena.status, 404);
  });

  await prueba("sin fase nueva, sin nota y sin opción no hay nada que guardar", async () => {
    const m = montar(TRATO);
    const r = await moverDeFase({ dealId: "d1" }, m.deps, ANTHONY);
    assert.equal(r.ok, false);
    const mismaFase = await moverDeFase({ dealId: "d1", fase: TRATO.fase }, m.deps, ANTHONY);
    assert.equal(mismaFase.ok, false, "pedir la fase en la que ya está no es un cambio");
    assert.equal(m.escrituras.length, 0);
  });

  await prueba("falta la oportunidad", async () => {
    const r = await moverDeFase({ dealId: "  " }, montar(TRATO).deps, ANTHONY);
    assert.deepEqual(r, { ok: false, status: 400, error: "Falta la oportunidad." });
  });

  console.log("\nQué se escribe");

  await prueba("un cambio con motivo: Zoho recibe la fase y una nota con quién, de → a y el motivo; la base, una línea", async () => {
    const m = montar(TRATO);
    const r = await moverDeFase({ dealId: "d1", fase: "Preparando Presupuesto", motivo: "No contestan, lo rehacemos" }, m.deps, ANTHONY);
    assert.deepEqual(r, { ok: true, desde: "Seguimiento al Presupuesto", hasta: "Preparando Presupuesto", cambioDeFase: true });
    assert.deepEqual(m.escrituras, [{
      dealId: "d1",
      fase: "Preparando Presupuesto",
      nota: "Cambio de fase por Anthony: Seguimiento al Presupuesto → Preparando Presupuesto. Motivo: No contestan, lo rehacemos",
    }]);
    assert.deepEqual(m.historial, [{
      crmDealId: "d1", desde: "Seguimiento al Presupuesto", hasta: "Preparando Presupuesto",
      motivo: "No contestan, lo rehacemos", origen: "MANUAL", porUserId: "u1", porNombre: "Anthony",
    }]);
    assert.equal(m.auditoria.length, 1);
  });

  await prueba("avanzar sin motivo deja la nota sin «Motivo:» y el historial con motivo vacío", async () => {
    const m = montar(TRATO);
    await moverDeFase({ dealId: "d1", fase: "Pendiente de deposito" }, m.deps, ANTHONY);
    assert.equal(m.escrituras[0].nota, "Cambio de fase por Anthony: Seguimiento al Presupuesto → Pendiente de deposito.");
    assert.equal(m.historial[0].motivo, null);
  });

  await prueba("solo una nota: no cambia la fase, no deja línea de historial de fase", async () => {
    const m = montar(TRATO);
    const r = await moverDeFase({ dealId: "d1", motivo: "Llamó el colegio" }, m.deps, ANTHONY);
    assert.deepEqual(r, { ok: true, desde: TRATO.fase, hasta: TRATO.fase, cambioDeFase: false });
    assert.deepEqual(m.escrituras, [{ dealId: "d1", nota: "Llamó el colegio" }]);
    assert.equal(m.historial.length, 0);
  });

  await prueba("apuntar la opción elegida a la vez que se mueve la fase: una sola escritura", async () => {
    const m = montar({ fase: "Presupuesto Enviado", departamento: "GROUPS" });
    await moverDeFase({ dealId: "d1", fase: "Pendiente de deposito", opcion: 2 }, m.deps, ANTHONY);
    assert.equal(m.escrituras.length, 1);
    assert.equal(m.escrituras[0].opcion, 2);
    assert.equal(m.escrituras[0].fase, "Pendiente de deposito");
  });

  await prueba("solo la opción (sin fase ni nota) también vale", async () => {
    const m = montar(TRATO);
    const r = await moverDeFase({ dealId: "d1", opcion: 1 }, m.deps, ANTHONY);
    assert.equal(r.ok, true);
    assert.deepEqual(m.escrituras, [{ dealId: "d1", opcion: 1 }]);
  });

  await prueba("si Zoho falla, NO queda constancia de un cambio que no ocurrió", async () => {
    const m = montar(TRATO, { zohoFalla: true });
    await assert.rejects(() => moverDeFase({ dealId: "d1", fase: "Pendiente de deposito" }, m.deps, ANTHONY), /Zoho no contesta/);
    assert.equal(m.historial.length, 0);
    assert.equal(m.auditoria.length, 0);
  });

  await prueba("sin nombre de usuario, la nota no dice «por null»", async () => {
    const m = montar(TRATO);
    await moverDeFase({ dealId: "d1", fase: "Pendiente de deposito" }, m.deps, { id: null, nombre: null });
    assert.equal(m.escrituras[0].nota, "Cambio de fase: Seguimiento al Presupuesto → Pendiente de deposito.");
  });

  console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
  if (fallidas > 0) process.exit(1);
}
void main();
