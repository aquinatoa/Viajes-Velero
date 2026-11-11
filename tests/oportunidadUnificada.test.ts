/**
 * La unión de Propuestas y Viajes en una sola lista de oportunidades.
 *
 * Es donde se esconden los fallos que no dan error: una fila duplicada, un viaje
 * que desaparece, una opción aceptada que la app y Zoho cuentan distinto. Por eso
 * se prueba cada cruce.
 *
 * Cómo correrla:  npm run test:oportunidades
 * No necesita base de datos ni Zoho: la unión es una función pura.
 */
import assert from "node:assert/strict";

import {
  carrilDeLaFase,
  contarCarriles,
  opcionAceptadaEnZoho,
  unirOportunidades,
  type EntregaEntrada,
  type RegistroEntrada,
  type TratoEntrada,
} from "../src/domain/oportunidadUnificada";

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

const AHORA = new Date("2026-11-05T10:00:00Z");

function entrega(parcial: Partial<EntregaEntrada> & { id: string }, viaje = "v1", dealId: string | null = "d1"): EntregaEntrada {
  return {
    reference: `ORV-2026-${parcial.id}`,
    status: "SENT",
    department: "GROUPS",
    recipientName: "Escola Ull",
    recipientEmail: "info@escola.test",
    failureReason: null,
    createdAt: "2026-10-20T10:00:00Z",
    sentAt: "2026-10-21T10:00:00Z",
    viewCount: 0,
    chosenOptionNumber: null,
    chosenAt: null,
    depositDueAt: null,
    depositPaidAt: null,
    proposal: {
      id: `p-${parcial.id}`,
      tripRequest: {
        id: viaje,
        crmDealId: dealId,
        crmDealUrl: null,
        opportunityName: "ESCOLA ULL 2027",
        destinationText: "Cambrils",
        dateFrom: "2027-03-10",
        dateTo: "2027-03-15",
      },
    },
    ...parcial,
  };
}

function trato(parcial: Partial<TratoEntrada> & { id: string }): TratoEntrada {
  return {
    dealName: "ESCOLA ULL 2027 · Cambrils",
    stage: "Presupuesto Enviado",
    arrivalDate: "2027-03-10",
    departureDate: "2027-03-15",
    amount: 12000,
    closingDate: "2026-12-01",
    accountName: "Escola Ull",
    contactName: "Marta",
    description: "",
    opcionesTexto: "",
    modifiedTime: "2026-11-01T10:00:00Z",
    dealUrl: `https://crm.zoho.test/${parcial.id}`,
    department: "GROUPS",
    ...parcial,
  };
}

const sinRegistros: RegistroEntrada[] = [];

prueba("una propuesta con su trato es una sola fila, con la fase y el importe del CRM", () => {
  const filas = unirOportunidades({ entregas: [entrega({ id: "e1" })], tratos: [trato({ id: "d1" })], registros: sinRegistros, ahora: AHORA });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].origen, "APP");
  assert.equal(filas[0].fase, "Presupuesto Enviado");
  assert.equal(filas[0].importe, 12000);
  assert.equal(filas[0].crmDealId, "d1");
  assert.equal(filas[0].clave, "d1");
});

prueba("rehacer es la versión siguiente del mismo viaje: una fila, no dos", () => {
  const vieja = entrega({ id: "e1", createdAt: "2026-10-20T10:00:00Z" });
  const nueva = entrega({ id: "e2", createdAt: "2026-10-25T10:00:00Z", status: "DRAFT", sentAt: null });
  const filas = unirOportunidades({ entregas: [vieja, nueva], tratos: [trato({ id: "d1" })], registros: sinRegistros, ahora: AHORA });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].entrega?.id, "e2");
  assert.equal(filas[0].entrega?.versiones, 2);
});

prueba("si una versión anterior está aceptada, manda ella: lleva el reloj del depósito", () => {
  const aceptada = entrega({
    id: "e1",
    createdAt: "2026-10-20T10:00:00Z",
    chosenOptionNumber: 2,
    depositDueAt: "2026-12-01T00:00:00Z",
  });
  const nueva = entrega({ id: "e2", createdAt: "2026-10-25T10:00:00Z", status: "DRAFT", sentAt: null });
  const [fila] = unirOportunidades({ entregas: [aceptada, nueva], tratos: [], registros: sinRegistros, ahora: AHORA });
  assert.equal(fila.entrega?.id, "e1");
  assert.equal(fila.carril, "aceptada");
  assert.equal(fila.entrega?.versionNuevaSinEnviar, true);
  assert.equal(fila.deposito.venceEl, "2026-12-01T00:00:00.000Z");
});

prueba("un trato sin propuesta de la app entra como ZOHO, con el carril deducido de la fase", () => {
  const filas = unirOportunidades({
    entregas: [],
    tratos: [trato({ id: "z1", dealName: "GARANTIES", stage: "Presupuesto Enviado" })],
    registros: sinRegistros,
    ahora: AHORA,
  });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].origen, "ZOHO");
  assert.equal(filas[0].carril, "esperando");
  assert.equal(filas[0].carrilDeducido, true);
  assert.equal(filas[0].entrega, null);
  assert.equal(filas[0].nombre, "GARANTIES");
});

prueba("un trato con propuesta que esta persona no ve no sale como «solo Zoho» ni se duplica", () => {
  const filas = unirOportunidades({
    entregas: [],
    tratos: [trato({ id: "d9" })],
    registros: sinRegistros,
    dealIdsConPropuesta: ["d9"],
    ahora: AHORA,
  });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].origen, "APP");
  assert.equal(filas[0].detalleRestringido, true);
});

prueba("la propuesta y su trato no se cuentan dos veces", () => {
  const filas = unirOportunidades({
    entregas: [entrega({ id: "e1" })],
    tratos: [trato({ id: "d1" }), trato({ id: "z2", dealName: "Otro" })],
    registros: sinRegistros,
    dealIdsConPropuesta: ["d1"],
    ahora: AHORA,
  });
  assert.equal(filas.length, 2);
  assert.deepEqual(filas.map((f) => f.crmDealId).sort(), ["d1", "z2"]);
});

prueba("una propuesta aún sin trato (se crea al enviar) sale igual, sin fase", () => {
  const [fila] = unirOportunidades({
    entregas: [entrega({ id: "e5", status: "DRAFT", sentAt: null }, "v5", null)],
    tratos: [],
    registros: sinRegistros,
    ahora: AHORA,
  });
  assert.equal(fila.crmDealId, null);
  assert.equal(fila.fase, null);
  assert.equal(fila.clave, "entrega:e5");
  assert.equal(fila.carril, "sin_enviar");
});

prueba("la opción aceptada: si la app y Zoho coinciden, no hay aviso", () => {
  const [fila] = unirOportunidades({
    entregas: [entrega({ id: "e1", chosenOptionNumber: 2, depositDueAt: "2026-12-10T00:00:00Z" })],
    tratos: [trato({ id: "d1", description: "▸ Opción elegida por el cliente: Opción 2" })],
    registros: sinRegistros,
    ahora: AHORA,
  });
  assert.equal(fila.elegida, 2);
  assert.equal(fila.opcionContradictoria, false);
});

prueba("la opción aceptada: si Zoho dice una y la app otra, se avisa y no se calla", () => {
  const [fila] = unirOportunidades({
    entregas: [entrega({ id: "e1", chosenOptionNumber: 1 })],
    tratos: [trato({ id: "d1", opcionesTexto: "▸ Opción elegida por el cliente: Opción 3" })],
    registros: sinRegistros,
    ahora: AHORA,
  });
  assert.equal(fila.opcionContradictoria, true);
  assert.equal(fila.opcionEnLaApp, 1);
  assert.equal(fila.opcionEnZoho, 3);
  assert.equal(fila.elegida, 1);
});

prueba("Zoho dice «Opción 2» y la app no sabe nada: es el caso de la vía que no arrancaba el depósito", () => {
  const [fila] = unirOportunidades({
    entregas: [entrega({ id: "e1" })],
    tratos: [trato({ id: "d1", description: "▸ Opción elegida por el cliente: Opción 2" })],
    registros: sinRegistros,
    ahora: AHORA,
  });
  assert.equal(fila.opcionContradictoria, true);
  assert.equal(fila.carril, "esperando");
});

prueba("en una oportunidad solo-Zoho la opción y el depósito salen del registro de la app", () => {
  const [fila] = unirOportunidades({
    entregas: [],
    tratos: [trato({ id: "z1", stage: "Pendiente de depósito" })],
    registros: [
      { crmDealId: "z1", origen: "ZOHO", chosenOptionNumber: 2, chosenAt: "2026-11-01T00:00:00Z", depositDueAt: "2026-12-11T00:00:00Z", depositPaidAt: null },
    ],
    ahora: AHORA,
  });
  assert.equal(fila.elegida, 2);
  assert.equal(fila.carril, "aceptada");
  assert.equal(fila.deposito.venceEl, "2026-12-11T00:00:00.000Z");
});

prueba("el periodo no esconde lo que no tiene fecha ni lo que Zoho ya devolvió", () => {
  const rango = { desde: "2027-01-01", hasta: "2027-12-31" };
  const fueraDeRango = entrega({ id: "e1" }, "v1", null);
  fueraDeRango.proposal!.tripRequest!.dateFrom = "2026-06-01";
  const sinFecha = entrega({ id: "e2" }, "v2", null);
  sinFecha.proposal!.tripRequest!.dateFrom = null;
  const conTrato = entrega({ id: "e3" }, "v3", "d3");
  conTrato.proposal!.tripRequest!.dateFrom = "2026-06-01";
  const filas = unirOportunidades({
    entregas: [fueraDeRango, sinFecha, conTrato],
    tratos: [trato({ id: "d3" })],
    registros: sinRegistros,
    rango,
    ahora: AHORA,
  });
  assert.deepEqual(filas.map((f) => f.entrega?.id).sort(), ["e2", "e3"]);
});

prueba("orden: lo que falló primero, lo cerrado al final, el depósito que vence antes que el que no", () => {
  const fallida = entrega({ id: "f", status: "FAILED" }, "vf", null);
  const cobrada = entrega({ id: "c", chosenOptionNumber: 1, depositPaidAt: "2026-11-01T00:00:00Z" }, "vc", null);
  const pronto = entrega({ id: "p", chosenOptionNumber: 1, depositDueAt: "2026-11-08T00:00:00Z" }, "vp", null);
  const tarde = entrega({ id: "t", chosenOptionNumber: 1, depositDueAt: "2026-12-20T00:00:00Z" }, "vt", null);
  const ids = unirOportunidades({ entregas: [cobrada, tarde, pronto, fallida], tratos: [], registros: sinRegistros, ahora: AHORA }).map(
    (f) => f.entrega?.id,
  );
  assert.deepEqual(ids, ["f", "p", "t", "c"]);
});

prueba("carril según la fase del CRM", () => {
  assert.equal(carrilDeLaFase("Preparando Presupuesto", false), "sin_enviar");
  assert.equal(carrilDeLaFase("Presupuesto Enviado", false), "esperando");
  assert.equal(carrilDeLaFase("Seguimiento al Presupuesto", false), "esperando");
  assert.equal(carrilDeLaFase("Pendiente de depósito", false), "aceptada");
  assert.equal(carrilDeLaFase("Presupuesto Enviado", true), "aceptada");
  assert.equal(carrilDeLaFase("Oportunidad Ganada", false), "cerrada");
  assert.equal(carrilDeLaFase("Oportunidad Perdida", false), "cerrada");
});

prueba("la opción aceptada se lee del texto del trato, con o sin tilde", () => {
  assert.equal(opcionAceptadaEnZoho({ description: "x\n▸ Opción elegida por el cliente: Opción 3", opcionesTexto: "" }), 3);
  assert.equal(opcionAceptadaEnZoho({ description: "", opcionesTexto: "Opcion elegida por el cliente: Opcion 1" }), 1);
  assert.equal(opcionAceptadaEnZoho({ description: "nada", opcionesTexto: "" }), null);
});

prueba("los contadores de carril suman todas las filas", () => {
  const cuenta = contarCarriles([{ carril: "esperando" }, { carril: "esperando" }, { carril: "cerrada" }]);
  assert.deepEqual(cuenta, { sin_enviar: 0, esperando: 2, aceptada: 0, cerrada: 1 });
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
