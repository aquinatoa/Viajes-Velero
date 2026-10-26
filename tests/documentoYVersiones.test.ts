/**
 * Lo que pidió Ruth el 26/10/2026 con ESCOLA ULL, salvo las actividades (que
 * tienen su propia prueba):
 *
 * - el documento en lista, no en texto continuo;
 * - las condiciones en castellano y sin repetir;
 * - «secundaria» da edad;
 * - rehacer es una versión del mismo viaje: una fila en la mesa y la
 *   referencia con su versión, que el correo sabe emparejar.
 *
 * Cómo correrla:  npm run test:documento
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// El almacén del PDF se elige al importar: se fija antes.
process.env.ORAVIA_STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), "oravia-doc-"));

const { desgloseEnLista } = await import("../src/domain/desgloseParaElCliente");
const { condicionesEnLista } = await import("../server/proposalPdf");
const { readTripMessage } = await import("../src/services/requestService");
const { ultimaDeCadaViaje } = await import("../src/domain/versionesDelViaje");
const { referenciaEn, emparejar } = await import("../server/correoEmparejado");
const { lineasEnLista } = await import("../src/domain/lineasDeActividad");

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

const ANCORA =
  "MP: 44,73 € x 80 alumnos + 44,73 € x 4 profesores (sin tarifa de doble: precio de múltiple) + 44,73 € x 1 chófer (sin tarifa de doble: precio de múltiple), por noche x 1 noche · PC: 57,51 € x 80 alumnos + 57,51 € x 4 profesores (en doble, suplemento +7 €), por noche x 2 noches · MP: 44,73 € x 80 alumnos, por noche x 1 noche";

prueba("el desglose en lista: un bloque por tramo, con sus noches, y una línea por grupo", () => {
  const l = desgloseEnLista(ANCORA, "2027-04-16");
  assert.equal(l.length, 3);
  assert.equal(l[0].titulo, "Media pensión · 1 noche (el 16 de abril)");
  assert.deepEqual(l[0].lineas, [
    "80 alumnos: 44,73 € por noche",
    "4 profesores (al mismo precio que los alumnos): 44,73 € por noche",
    "1 chófer (al mismo precio que los alumnos): 44,73 € por noche",
  ]);
  assert.equal(l[1].titulo, "Pensión completa · 2 noches (del 17 al 18 de abril)");
  assert.equal(l[1].lineas[1], "4 profesores (habitación doble, suplemento de 7 €): 57,51 € por noche");
  assert.equal(l[2].titulo, "Media pensión · 1 noche (el 19 de abril)");
});

prueba("sin fecha de entrada, los tramos salen igual pero sin días", () => {
  assert.equal(desgloseEnLista(ANCORA)[0].titulo, "Media pensión · 1 noche");
  assert.deepEqual(desgloseEnLista(""), []);
});

prueba("las condiciones en castellano: nada de «Gratuity:», «Payment:» ni «Special notes:»", () => {
  const c = condicionesEnLista(
    "[GRATUITY] Gratuidades: 1 gratuidad cada 25 pax de pago. | [PAYMENT] Depósito: Política general 30% al confirmar. | [PAYMENT] Pago: 30 % al confirmar · 70 % a 30 días | [SPECIAL_NOTES] Suplementos: Profesores y chófer tienen las sábanas incluidas | [CANCELLATION] de 45 a 30 días: 10 % | [GRATUITY] Gratuidades: 1 gratuidad cada 25 pax de pago.",
  );
  const etiquetas = c.map((x) => x.etiqueta);
  assert.deepEqual(etiquetas, ["Gratuidades", "Depósito", "Pago", "Suplementos", "Cancelación"]);
  assert.ok(!c.some((x) => /^(Gratuity|Payment|Special notes)/i.test(x.etiqueta)));
  assert.equal(c[0].texto, "1 gratuidad cada 25 pax de pago.", "sin «Gratuidades: Gratuidades:»");
  assert.equal(c.length, 5, "la gratuidad repetida sale una vez");
});

prueba("las entradas de una actividad, una por línea aunque la tarifa lleve «+»", () => {
  assert.deepEqual(
    lineasEnLista([
      { rateId: "a", etiqueta: "Joven/Secundaria/Uni (12-17) · Entrada + Ticket Plus · Periodo C", precio: 52, cantidad: 80 },
      { rateId: "b#gratis", etiqueta: "Adulto (18-59) · Entrada + Ticket Plus · Periodo C · gratuidad", precio: 0, cantidad: 5 },
      { rateId: "c", etiqueta: "x", precio: 10, cantidad: 0 },
    ]),
    [
      "80 × 52,00 € Joven/Secundaria/Uni (12-17) · Entrada + Ticket Plus · Periodo C",
      "5 × 0,00 € Adulto (18-59) · Entrada + Ticket Plus · Periodo C · gratuidad",
    ],
  );
});

prueba("«alumnos de secundaria» da edad 12-16; «por eso» no es la ESO", () => {
  assert.equal(readTripMessage("80 alumnos de secundaria a Salou").normalized.ageRangeText, "12-16");
  assert.equal(readTripMessage("50 alumnos de 2º de ESO").normalized.ageRangeText, "12-16");
  assert.equal(readTripMessage("primaria y secundaria").normalized.ageRangeText, "6-16");
  assert.equal(readTripMessage("por eso os escribimos").normalized.ageRangeText, "");
  assert.equal(readTripMessage("alumnos de 15 años de secundaria").normalized.ageRangeText, "15", "los años mandan");
});

prueba("la mesa: una fila por viaje, la versión más reciente", () => {
  const v = (id: string, viaje: string, creada: string, status = "SENT", elegida: number | null = null) => ({
    id,
    createdAt: creada,
    status,
    chosenOptionNumber: elegida,
    proposal: { tripRequest: { id: viaje } },
  });
  const r = ultimaDeCadaViaje([
    v("0009", "ull", "2026-10-26T10:57:00Z"),
    v("0009-v2", "ull", "2026-10-26T11:11:00Z", "DRAFT"),
    v("0007", "otro", "2026-10-19T12:30:00Z"),
  ]);
  assert.deepEqual(r.map((x) => x.id).sort(), ["0007", "0009-v2"]);
});

prueba("si el colegio aceptó la versión anterior y la nueva no ha salido, se ven las dos", () => {
  const r = ultimaDeCadaViaje([
    { id: "a", createdAt: "2026-10-01T00:00:00Z", status: "SENT", chosenOptionNumber: 2, proposal: { tripRequest: { id: "x" } } },
    { id: "b", createdAt: "2026-10-02T00:00:00Z", status: "DRAFT", chosenOptionNumber: null, proposal: { tripRequest: { id: "x" } } },
  ]);
  assert.deepEqual(r.map((x) => x.id).sort(), ["a", "b"]);
});

prueba("el correo reconoce la referencia con versión y la empareja con su envío", () => {
  assert.equal(referenciaEn("Re: Propuesta ORV-2026-0009-v2 · ESCOLA ULL 2027"), "ORV-2026-0009-V2");
  assert.equal(referenciaEn("Re: Propuesta ORV-2026-0009 · ESCOLA ULL 2027"), "ORV-2026-0009");
  const envios = [
    { id: "d9", reference: "ORV-2026-0009", messageId: null, recipientEmail: "a@b.es", cerrado: false },
    { id: "d9v2", reference: "ORV-2026-0009-v2", messageId: null, recipientEmail: "a@b.es", cerrado: false },
  ];
  const e = emparejar({ asunto: "Re: Propuesta ORV-2026-0009-v2", cuerpo: "", de: "a@b.es" } as never, envios as never);
  assert.equal(e?.deliveryId, "d9v2");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
