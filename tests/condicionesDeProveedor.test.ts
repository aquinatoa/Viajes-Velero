/**
 * Las condiciones del proveedor, en bloques con título, y los suplementos
 * separados de las tasas y los depósitos.
 *
 * Los textos son los reales de Apartamentos Áncora (Salou) y del Hotel
 * California (11/11/2026): una sola cadena con entradas `[ETIQUETA] Rótulo: …`
 * separadas por « | », a veces en catalán.
 *
 * Cómo correrla:  npm run test:condiciones
 */
import assert from "node:assert/strict";

import { condicionesDe, juntarIguales, separarSuplementos } from "../src/domain/condicionesDeProveedor";

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

const ANCORA =
  "[GRATUITY] Gratuidades: 1 gratuïtat per cada 25 de pagament. | " +
  "[PAYMENT] Depósito: Fiança 100€ per apartament/bungalow o targeta garantia. | " +
  "[SPECIAL_NOTES] Bebidas incluidas: Sí (agua) | " +
  "[GROUP_SIZE] Plazas: mínimo 25 plazas a pagar | " +
  "[CONTACT] Contacto: Noelia Gimeno · noelia@camping-lasiesta.com | " +
  "[SPECIAL_NOTES] Condiciones: Preus nets PPPN, IVA 10% inclòs. Mínim 2 nits. Mínim 25 pax. Disponibilitat OR (on request).";

const bloque = (bloques: ReturnType<typeof condicionesDe>, clave: string) => bloques.find((b) => b.clave === clave);

console.log("\nCondiciones del proveedor");

prueba("el texto etiquetado se reparte en bloques, en el orden que importa", () => {
  const b = condicionesDe([{ conditionsText: ANCORA }]);
  assert.deepEqual(
    b.map((x) => x.clave),
    ["gratuidades", "minimos", "pago", "incluye", "notas", "contacto"],
  );
});

prueba("la gratuidad y el mínimo de plazas salen tal cual, sin traducir", () => {
  const b = condicionesDe([{ conditionsText: ANCORA }]);
  assert.equal(bloque(b, "gratuidades")!.lineas[0].texto, "1 gratuïtat per cada 25 de pagament.");
  assert.equal(bloque(b, "minimos")!.lineas[0].texto, "mínimo 25 plazas a pagar");
});

prueba("el IVA y los mínimos que van en la nota general no se pierden", () => {
  const notas = bloque(condicionesDe([{ conditionsText: ANCORA }]), "notas")!;
  assert.ok(notas.lineas[0].texto.includes("IVA 10% inclòs"));
  assert.ok(notas.lineas[0].texto.includes("Mínim 2 nits"));
});

prueba("«Bebidas incluidas» va a «Qué incluye» aunque venga como nota", () => {
  const incluye = bloque(condicionesDe([{ conditionsText: ANCORA }]), "incluye")!;
  assert.deepEqual(incluye.lineas, [{ rotulo: "Bebidas incluidas", texto: "Sí (agua)" }]);
});

prueba("el rótulo que repite el título del bloque no se enseña; el que aporta, sí", () => {
  const b = condicionesDe([{ conditionsText: ANCORA }]);
  assert.equal(bloque(b, "gratuidades")!.lineas[0].rotulo, null, "«Gratuidades» ya es el título");
  assert.equal(bloque(b, "contacto")!.lineas[0].rotulo, null);
  assert.equal(bloque(b, "pago")!.lineas[0].rotulo, "Depósito", "«Depósito» distingue de «Pago»");
});

prueba("la política de gratuidades que repite el texto no sale dos veces", () => {
  const b = condicionesDe([
    { conditionsText: ANCORA, freePolicy: "Gratuidades: 1 gratuïtat per cada 25 de pagament." },
  ]);
  assert.equal(bloque(b, "gratuidades")!.lineas.length, 1);
});

prueba("una política de gratuidades distinta sí se añade", () => {
  const b = condicionesDe([{ conditionsText: ANCORA, freePolicy: "Gratuidades: 1 chófer gratis." }]);
  assert.equal(bloque(b, "gratuidades")!.lineas.length, 2);
});

prueba("dos documentos del mismo canal con la misma condición la dicen una vez", () => {
  const b = condicionesDe([{ conditionsText: ANCORA }, { conditionsText: ANCORA }]);
  assert.equal(bloque(b, "pago")!.lineas.length, 1);
  assert.equal(bloque(b, "contacto")!.lineas.length, 1);
});

prueba("los dos puntos de una hora («10:00») no se toman por un rótulo", () => {
  const b = condicionesDe([{ conditionsText: "[SPECIAL_NOTES] Salida antes de las 10:00 h sin cargo." }]);
  assert.deepEqual(bloque(b, "notas")!.lineas, [{ rotulo: null, texto: "Salida antes de las 10:00 h sin cargo." }]);
});

prueba("sin texto, sin bloques; el vacío no revienta", () => {
  assert.deepEqual(condicionesDe([]), []);
  assert.deepEqual(condicionesDe([{}]), []);
  assert.deepEqual(condicionesDe([{ conditionsText: "  ", freePolicy: null, policies: null }]), []);
  assert.deepEqual(condicionesDe([{ conditionsText: "texto suelto sin etiqueta" }]), []);
});

prueba("una actividad llega como lista de políticas y se reparte igual", () => {
  const b = condicionesDe([
    {
      policies: [
        { policyType: "SPECIAL_NOTES", policyText: "Gratuidades: 1 profesor gratis por cada 15 pax." },
        { policyType: "CANCELLATION", policyText: "Cancelación total: Hasta 20 días antes: sin gastos." },
      ],
    },
  ]);
  assert.deepEqual(
    b.map((x) => x.clave),
    ["gratuidades", "cancelacion"],
    "«Gratuidades:» llega como nota, pero su rótulo la lleva a Gratuidades",
  );
  assert.equal(bloque(b, "gratuidades")!.lineas[0].texto, "1 profesor gratis por cada 15 pax.");
  assert.equal(bloque(b, "cancelacion")!.lineas[0].texto, "Hasta 20 días antes: sin gastos.");
});

prueba("una nota con un rótulo que no reconozco se queda en «Otras condiciones»", () => {
  const b = condicionesDe([{ conditionsText: "[SPECIAL_NOTES] Ratio de monitores: 1 por cada 12 alumnos." }]);
  assert.deepEqual(b.map((x) => x.clave), ["notas"]);
  assert.equal(bloque(b, "notas")!.lineas[0].rotulo, "Ratio de monitores");
});

prueba("«Suplementos: Tarifa ya incluye…» es una nota y no «Qué incluye»", () => {
  const b = condicionesDe([
    { conditionsText: "[SPECIAL_NOTES] Suplementos: Tarifa ya incluye supl. individual/DUI +50% s/precio Múltiple" },
  ]);
  assert.deepEqual(b.map((x) => x.clave), ["notas"]);
});

prueba("tipos que no conozco caen en «Otras condiciones» y no se pierden", () => {
  const b = condicionesDe([{ conditionsText: "[ALGO_NUEVO] Nota: algo que no preví." }]);
  assert.equal(bloque(b, "notas")!.lineas[0].texto, "algo que no preví.");
});

console.log("\nSuplementos, tasas y depósitos");

const SUPLEMENTOS = [
  { concepto: "Llits fets", importe: "+1,00 €", condicion: null },
  { concepto: "Tasa turística", importe: "+0,99 €", condicion: "0,99€/pax +16 anys i nit. NO inclosa." },
  { concepto: "Fianza/depósito", importe: "+100,00 €", condicion: "Fiança 100€ per apartament/bungalow o targeta garantia." },
  { concepto: "Individual", importe: "+50 %", condicion: null },
];

prueba("la tasa y la fianza van aparte de los extras", () => {
  const { extras, tasasYDepositos } = separarSuplementos(SUPLEMENTOS);
  assert.deepEqual(extras.map((s) => s.concepto), ["Llits fets", "Individual"]);
  assert.deepEqual(tasasYDepositos.map((s) => s.concepto), ["Tasa turística", "Fianza/depósito"]);
});

prueba("la fianza ya no sale como «+100,00 €», como si se sumara al precio", () => {
  const { tasasYDepositos } = separarSuplementos(SUPLEMENTOS);
  assert.equal(tasasYDepositos[1].importe, "100,00 €");
  assert.equal(tasasYDepositos[0].importe, "0,99 €");
});

prueba("los extras conservan su «+»; la condición no se toca", () => {
  const { extras, tasasYDepositos } = separarSuplementos(SUPLEMENTOS);
  assert.equal(extras[0].importe, "+1,00 €");
  assert.equal(tasasYDepositos[0].condicion, "0,99€/pax +16 anys i nit. NO inclosa.");
});

prueba("una tasa sin importe sigue siendo tasa y no revienta", () => {
  const { tasasYDepositos } = separarSuplementos([{ concepto: "Tasa turística", importe: null, condicion: null }]);
  assert.equal(tasasYDepositos.length, 1);
  assert.equal(tasasYDepositos[0].importe, null);
});

console.log("\nSuplementos repetidos en varios periodos");

prueba("el mismo suplemento al mismo precio en dos periodos es una línea con los dos periodos", () => {
  const r = juntarIguales([
    { concepto: "Sábanas (opcional)", importe: "+6,00 €", condicion: "JUNIO / SEPTIEMBRE" },
    { concepto: "Toallas (opcional)", importe: "+4,00 €", condicion: "ABRIL / MAYO / OCTUBRE" },
    { concepto: "Sábanas (opcional)", importe: "+6,00 €", condicion: "ABRIL / MAYO / OCTUBRE" },
  ]);
  assert.deepEqual(r.map((s) => s.concepto), ["Sábanas (opcional)", "Toallas (opcional)"]);
  assert.equal(r[0].condicion, "JUNIO / SEPTIEMBRE · ABRIL / MAYO / OCTUBRE");
});

prueba("el mismo concepto a otro precio NO se junta: son suplementos distintos", () => {
  const r = juntarIguales([
    { concepto: "Estancia 1-2 noches", importe: "+10 %", condicion: null },
    { concepto: "Estancia 1-2 noches", importe: "+15 %", condicion: "12/06–25/06" },
  ]);
  assert.equal(r.length, 2);
});

prueba("si una repetición vale siempre, la condición de las otras sobra", () => {
  const r = juntarIguales([
    { concepto: "Merienda", importe: "+6,50 €", condicion: "ABRIL / MAYO" },
    { concepto: "Merienda", importe: "+6,50 €", condicion: null },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].condicion, null);
});

prueba("la misma condición repetida no se escribe dos veces; mayúsculas y tildes no separan conceptos", () => {
  const r = juntarIguales([
    { concepto: "Toallas", importe: "+4,00 €", condicion: "JUNIO" },
    { concepto: "TOALLAS", importe: "+4,00 €", condicion: "JUNIO" },
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].condicion, "JUNIO");
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
