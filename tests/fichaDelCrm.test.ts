/**
 * Lo que el CRM sabe de una oportunidad, ordenado para leerlo.
 *
 * Los datos son inventados con la forma de los reales (11/11/2026: «Servicios
 * Contratados» con N_Presupuesto por línea y N_Presupuesto_Subformulario con el
 * aceptado). Nada de aquí llama a Zoho.
 *
 * Cómo correrla:  npm run test:ficha-crm
 */
import assert from "node:assert/strict";

import {
  CAMPOS_PARA_LA_FICHA,
  estaAceptadoEnElCrm,
  fichaDelCrm,
  hitosDelTrato,
  presupuestosDelTrato,
  resumenDelAceptado,
  type TratoCrudo,
} from "../src/domain/fichaDelCrm";

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

const linea = (extra: Record<string, unknown> = {}) => ({
  N_Presupuesto: 1,
  Servicio: "Habitación Múltiple - PC",
  Proveedor: "HOTEL EJEMPLO",
  Tipo_de_Servicio: "Alojamiento",
  Regimen: "Pensión Completa",
  Fecha_Entrada: "2027-03-29",
  Fecha_Salida: "2027-03-30",
  Viajeros: 33,
  Cantidad: 1,
  Unidad_de_uso: "P.Pax",
  Precio: 38.4,
  Total_Servicio: 1267.2,
  T_Coste: 1173.48,
  Comentarios: "Alumnos en múltiple",
  Validado: true,
  ...extra,
});

// Un trato aceptado con DOS presupuestos enviados, el 2 aceptado.
const ACEPTADO: TratoCrudo = {
  Stage: "Pendiente de deposito",
  N_Presupuesto_Subformulario: 2,
  Servicios_Contratados: [
    linea({ N_Presupuesto: 1, Total_Servicio: 1000, T_Coste: 900 }),
    linea({ N_Presupuesto: 2, Total_Servicio: 1267.2, T_Coste: 1173.48 }),
    linea({ N_Presupuesto: 2, Servicio: "Pícnic", Tipo_de_Servicio: "Actividad", Total_Servicio: 100, T_Coste: 80 }),
  ],
  Total_Servicios_Contratados_Presupuesto: 1367.2,
  Importe_por_Viajero: 284.69,
  Importe_Dep_sito_New: 410.16,
  Forma_de_Cobro: "Deposito 30%",
  Tipo_de_Pago: "Prepago",
  Deposito_Cobrado: "No",
  Cobrado_al_100: false,
  Imp_Pendiente: 957.04,
  Fecha_de_Reserva: "2026-09-18",
  Presupuesto_Sugerido: "https://books.example/quotes/1",
  ID_Presupuesto_Sugerido: "001031",
  Costes_Totales_Presupuesto_Aceptado: 1253.48,
  Margen_Beneficio_Presupuesto_Aceptado: 8.33,
  Coste_por_viajero: 38,
  Created_Time: "2026-04-08T10:00:00+02:00",
  Created_By: { name: "Ruth Pujol", id: "1" },
  Stage_Modified_Time: "2026-10-16T09:30:00+02:00",
  Modified_Time: "2026-11-11T13:02:39+01:00",
  Modified_By: { name: "Javier Vinader", id: "2" },
  Last_Activity_Time: "2026-10-20T12:00:00+02:00",
  Fecha_Proximo_Contacto: "2026-12-01T09:00:00+01:00",
  Opciones_de_Presupuesto: "Opción 1 &amp; Opción 2",
  Motivo_de_p_rdida: null,
};

console.log("\nPresupuestos (las opciones que se enviaron)");

prueba("un presupuesto por número, con sus líneas, ordenados", () => {
  const p = presupuestosDelTrato(ACEPTADO, { verEconomia: true });
  assert.deepEqual(p.map((x) => x.numero), [1, 2]);
  assert.deepEqual(p.map((x) => x.lineas.length), [1, 2]);
});

prueba("el aceptado es el que dice N_Presupuesto_Subformulario, y solo uno", () => {
  const p = presupuestosDelTrato(ACEPTADO, { verEconomia: false });
  assert.deepEqual(p.map((x) => x.aceptado), [false, true]);
});

prueba("si el trato NO está aceptado, ningún presupuesto lo está (aunque el campo valga 1 por defecto)", () => {
  const enviado = { ...ACEPTADO, Stage: "Presupuesto Enviado", N_Presupuesto_Subformulario: 1 };
  assert.ok(presupuestosDelTrato(enviado).every((x) => !x.aceptado));
  assert.equal(resumenDelAceptado(enviado), null);
});

prueba("el total de cada presupuesto es la suma de sus líneas", () => {
  const p = presupuestosDelTrato(ACEPTADO, { verEconomia: true });
  assert.equal(p[0].total, 1000);
  assert.ok(Math.abs(p[1].total - 1367.2) < 0.001);
});

prueba("con economía: coste y margen por presupuesto; sin ella, NADA de costes ni márgenes", () => {
  const con = presupuestosDelTrato(ACEPTADO, { verEconomia: true });
  assert.equal(con[0].coste, 900);
  assert.ok(Math.abs((con[0].margen ?? 0) - 10) < 0.001, "(1000-900)/1000 = 10 %");
  assert.equal(con[0].lineas[0].coste, 900);
  const sin = presupuestosDelTrato(ACEPTADO, { verEconomia: false });
  assert.equal(sin[0].coste, null);
  assert.equal(sin[0].margen, null);
  assert.equal(sin[0].lineas[0].coste, null);
  assert.equal(sin[0].lineas[0].precio, 38.4, "el precio de venta sí se ve");
});

prueba("las líneas sin número cuentan como el presupuesto 1", () => {
  const p = presupuestosDelTrato({ Stage: "Presupuesto Enviado", Servicios_Contratados: [linea({ N_Presupuesto: null })] });
  assert.deepEqual(p.map((x) => x.numero), [1]);
});

prueba("sin servicios contratados (o con basura) no hay presupuestos y no revienta", () => {
  assert.deepEqual(presupuestosDelTrato({}), []);
  assert.deepEqual(presupuestosDelTrato({ Servicios_Contratados: null }), []);
  assert.deepEqual(presupuestosDelTrato({ Servicios_Contratados: "no es lista" as unknown }), []);
  assert.deepEqual(presupuestosDelTrato({ Servicios_Contratados: [null, 3, "x"] as unknown }), []);
});

prueba("una línea a medias se lee con lo que tenga", () => {
  const p = presupuestosDelTrato({ Stage: "Nueva", Servicios_Contratados: [{ N_Presupuesto: 1, Servicio: "Solo nombre" }] });
  assert.equal(p[0].lineas[0].servicio, "Solo nombre");
  assert.equal(p[0].lineas[0].precio, null);
  assert.equal(p[0].lineas[0].viajeros, null);
  assert.equal(p[0].total, 0);
});

console.log("\nEl presupuesto aceptado");

prueba("lo aceptado enseña total, PVP por viajero, depósito, forma de cobro y reserva", () => {
  const a = resumenDelAceptado(ACEPTADO)!;
  assert.equal(a.numero, 2);
  assert.equal(a.total, 1367.2);
  assert.equal(a.pvpPorViajero, 284.69);
  assert.equal(a.deposito, 410.16);
  assert.equal(a.formaDeCobro, "Deposito 30%");
  assert.equal(a.tipoDePago, "Prepago");
  assert.equal(a.fechaDeReserva, "2026-09-18");
  assert.equal(a.enlace, "https://books.example/quotes/1");
  assert.equal(a.cobradoAl100, false);
});

prueba("el coste y el margen solo salen con economía", () => {
  assert.equal(resumenDelAceptado(ACEPTADO, { verEconomia: false })!.coste, null);
  assert.equal(resumenDelAceptado(ACEPTADO, { verEconomia: false })!.margen, null);
  assert.equal(resumenDelAceptado(ACEPTADO, { verEconomia: false })!.costePorViajero, null);
  const con = resumenDelAceptado(ACEPTADO, { verEconomia: true })!;
  assert.equal(con.coste, 1253.48);
  assert.equal(con.margen, 8.33);
  assert.equal(con.costePorViajero, 38);
});

prueba("qué fases cuentan como aceptadas", () => {
  for (const f of ["Pendiente de deposito", "Pendiente de pago resto", "Oportunidad Ganada", "PENDIENTE DE DEPÓSITO"]) assert.equal(estaAceptadoEnElCrm(f), true, f);
  for (const f of ["Nueva", "Preparando Presupuesto", "Presupuesto Enviado", "Seguimiento al Presupuesto", "Lista de Espera", "Oportunidad Perdida", "", null]) assert.equal(estaAceptadoEnElCrm(f), false, String(f));
});

console.log("\nHitos y texto");

prueba("los hitos van del más reciente al más antiguo, con quién cuando lo dice Zoho", () => {
  const h = hitosDelTrato(ACEPTADO);
  assert.deepEqual(h.map((x) => x.cuando.slice(0, 10)), ["2026-12-01", "2026-11-11", "2026-10-20", "2026-10-16", "2026-09-18", "2026-04-08"]);
  assert.equal(h.find((x) => x.cuando.startsWith("2026-04-08"))!.texto, "Trato creado en Zoho por Ruth Pujol");
  assert.equal(h.find((x) => x.cuando.startsWith("2026-11-11"))!.texto, "Última modificación del trato por Javier Vinader");
  assert.ok(h.find((x) => x.cuando.startsWith("2026-10-16"))!.texto.includes("«Pendiente de deposito»"));
});

prueba("lo que no tiene fecha no es un hito", () => {
  assert.deepEqual(hitosDelTrato({}), []);
  assert.equal(hitosDelTrato({ Created_Time: "2026-04-08" }).length, 1);
});

prueba("la ficha entera: texto libre sin entidades HTML, motivo de pérdida y economía visible solo si se pide", () => {
  const f = fichaDelCrm(ACEPTADO, { verEconomia: false });
  assert.equal(f.textoLibre, "Opción 1 & Opción 2");
  assert.equal(f.economiaVisible, false);
  assert.equal(f.presupuestos.length, 2);
  const perdida = fichaDelCrm({ Stage: "Oportunidad Perdida", Motivo_de_p_rdida: "Precio" });
  assert.equal(perdida.motivoDePerdida, "Precio");
  assert.equal(perdida.aceptado, null);
  assert.equal(fichaDelCrm(ACEPTADO, { verEconomia: true }).economiaVisible, true);
});

prueba("sin «Opciones de Presupuesto» el texto libre es la Descripción", () => {
  assert.equal(fichaDelCrm({ Description: "Hola, queremos 30 pax" }).textoLibre, "Hola, queremos 30 pax");
  assert.equal(fichaDelCrm({}).textoLibre, "");
});

prueba("la ficha vacía no revienta", () => {
  const f = fichaDelCrm({});
  assert.deepEqual([f.presupuestos, f.hitos, f.aceptado, f.textoLibre, f.motivoDePerdida], [[], [], null, "", ""]);
});

prueba("la lista de campos que se piden a Zoho incluye lo que se lee y no repite ninguno", () => {
  for (const c of ["Servicios_Contratados", "N_Presupuesto_Subformulario", "Stage", "Total_Servicios_Contratados_Presupuesto", "Importe_Dep_sito_New", "Stage_Modified_Time"]) {
    assert.ok((CAMPOS_PARA_LA_FICHA as readonly string[]).includes(c), c);
  }
  assert.equal(new Set(CAMPOS_PARA_LA_FICHA).size, CAMPOS_PARA_LA_FICHA.length);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
