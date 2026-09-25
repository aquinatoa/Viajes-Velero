/**
 * El texto que se publica de un alojamiento.
 *
 * Es lo que acaba leyendo un colegio en su presupuesto, así que equivocarse
 * aquí no da ningún error: simplemente sale un documento que dice menos de lo
 * que el hotel había dicho, o que lo dice en el sitio equivocado.
 *
 * El caso que destapó el fallo es real. El Hotel Santa Mónica Playa se publicó
 * con las condiciones vacías, las gratuidades vacías, y todo amontonado en
 * Observaciones bajo la etiqueta «Suplementos» — incluida una gratuidad, una
 * tasa turística y los menús para alérgicos, que no son suplementos. Y de cada
 * uno solo el título: «Menús por alergias, dietas o intolerancias», sin el
 * «a confirmar con el hotel» que traía el documento.
 *
 * Cómo correrla:  npm run test:textos
 * No necesita base de datos: la composición es una función pura.
 */
import assert from "node:assert/strict";

import { componerTextos, lineaDe } from "../server/textoDelAlojamiento";

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

const vacio = { politicas: [], suplementos: [], fechasEspeciales: [] };

console.log("\nEl detalle, que era lo que se perdía");

prueba("una condición sale con su letra pequeña, no solo con el título", () => {
  const r = componerTextos({
    ...vacio,
    suplementos: [
      {
        concept: "Menús por alergias, dietas o intolerancias",
        conditionText: "a confirmar con el hotel y sujetos a posible suplemento",
      },
    ],
  });
  assert.match(String(r.conditionsText), /Menús por alergias/);
  assert.match(String(r.conditionsText), /a confirmar con el hotel/);
});

prueba("el importe se escribe legible, con su unidad", () => {
  assert.equal(
    lineaDe({ concept: "Habitación individual", amount: 80, amountType: "AMOUNT", appliesPer: "noche" }),
    "Habitación individual · 80 € por noche",
  );
  assert.equal(
    lineaDe({ concept: "Sábado o víspera", amount: 25, amountType: "PERCENT" }),
    "Sábado o víspera · 25 %",
  );
});

prueba("un detalle que repite el concepto no se escribe dos veces", () => {
  // Pasa cuando el modelo copia la celda entera en los dos campos.
  const linea = lineaDe({
    concept: "Depósito de entrada retornable",
    conditionText: "Depósito de entrada retornable",
  });
  assert.equal(linea, "Depósito de entrada retornable");
});

console.log("\nCada cosa en su sitio");

prueba("una gratuidad va a gratuidades aunque venga como suplemento", () => {
  // Es el caso normal: en el Excel la gratuidad viene en la misma columna que
  // los recargos, así que el modelo la clasifica igual.
  const r = componerTextos({
    ...vacio,
    suplementos: [{ concept: "Gratuidad", conditionText: "1 gratuidad cada 25 pax de pago" }],
  });
  assert.match(String(r.freePolicy), /1 gratuidad cada 25/);
  assert.ok(!/Gratuidad/.test(String(r.observations ?? "")), "no debe quedarse entre los suplementos");
});

prueba("y también si viene como política, como hasta ahora", () => {
  const r = componerTextos({
    ...vacio,
    politicas: [{ policyType: "GRATUIDAD", policyText: "1 gratuidad en base doble por cada 25 de pago." }],
  });
  assert.match(String(r.freePolicy), /1 gratuidad en base doble/);
});

prueba("una tasa turística es condición, no suplemento", () => {
  const r = componerTextos({
    ...vacio,
    suplementos: [{ concept: "Tasa turística", conditionText: "0,99 €/pax mayores de 16 años. NO incluida." }],
  });
  assert.match(String(r.conditionsText), /Tasa turística/);
  assert.match(String(r.conditionsText), /NO incluida/);
  assert.ok(!/Tasa turística/.test(String(r.observations ?? "")));
});

prueba("un recargo de verdad sí va a suplementos", () => {
  const r = componerTextos({
    ...vacio,
    suplementos: [{ concept: "Noches de sábado, festivo o víspera", amount: 15, amountType: "PERCENT" }],
  });
  assert.match(String(r.observations), /Suplementos:/);
  assert.match(String(r.observations), /Noches de sábado/);
});

prueba("la etiqueta del importador se conserva para el PDF", () => {
  // El documento la traduce a un nombre legible y la usa para ordenar.
  const r = componerTextos({
    ...vacio,
    politicas: [{ policyType: "CANCELACION", policyText: "25-7 días 20%." }],
  });
  assert.match(String(r.conditionsText), /\[CANCELACION\]/);
});

prueba("una etiqueta UNKNOWN no ensucia el texto", () => {
  const r = componerTextos({
    ...vacio,
    politicas: [{ policyType: "UNKNOWN", policyText: "Rooming list 30 días antes." }],
  });
  assert.equal(r.conditionsText, "Rooming list 30 días antes.");
});

console.log("\nEl caso real del Santa Mónica");

prueba("se publica repartido, no amontonado en observaciones", () => {
  const r = componerTextos({
    fechasEspeciales: [],
    politicas: [],
    providerName: "Sarhotel, S.L.",
    province: "Tarragona",
    suplementos: [
      { concept: "Estancia de 1 noche", amount: 3, amountType: "PERCENT" },
      { concept: "Noches de sábado, festivo o víspera", amount: 15, amountType: "PERCENT" },
      { concept: "Habitación Individual (precio final)", amount: 80, amountType: "AMOUNT" },
      { concept: "Depósito de entrada retornable", amount: 25, amountType: "AMOUNT" },
      { concept: "Gratuidad", conditionText: "1 gratuidad cada 25 pax" },
      { concept: "Tasa turística", conditionText: "No incluida" },
      {
        concept: "Menús por alergias, dietas o intolerancias",
        conditionText: "a confirmar con el hotel y sujetos a posible suplemento",
      },
    ],
  });

  // Lo que el colegio necesita para decidir.
  assert.match(String(r.conditionsText), /Menús por alergias/);
  assert.match(String(r.conditionsText), /Tasa turística/);
  assert.match(String(r.conditionsText), /Depósito de entrada/);

  // Lo que cambia el precio, aparte.
  assert.match(String(r.freePolicy), /1 gratuidad cada 25/);

  // Y los recargos donde siempre.
  assert.match(String(r.observations), /Proveedor: Sarhotel/);
  assert.match(String(r.observations), /Noches de sábado/);

  // Lo que NO puede volver a pasar: que las condiciones salgan vacías.
  assert.ok(r.conditionsText, "las condiciones no pueden quedar vacías");
  assert.ok(r.freePolicy, "las gratuidades no pueden quedar vacías");
});

console.log("\nSin datos no se inventa nada");

prueba("un alojamiento sin nada no genera texto", () => {
  const r = componerTextos(vacio);
  assert.equal(r.conditionsText, null);
  assert.equal(r.observations, null);
  assert.equal(r.freePolicy, null);
});

prueba("solo con proveedor, las condiciones siguen vacías", () => {
  const r = componerTextos({ ...vacio, providerName: "Sarhotel, S.L." });
  assert.equal(r.conditionsText, null);
  assert.match(String(r.observations), /Sarhotel/);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
