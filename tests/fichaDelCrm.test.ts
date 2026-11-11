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
  camposDelTratoConValor,
  estaAceptadoEnElCrm,
  fichaDelCrm,
  hitosDelTrato,
  inventarioDelTrato,
  presupuestosDelTrato,
  resumenDelAceptado,
  type EtiquetasDeCampos,
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

// ── Un trato REAL sin presupuesto cargado: «TORREMOLINOS BLOCK 2027» (11/11/2026) ──
// Aceptado y cobrado, pero con «Servicios Contratados» vacío, totales a 0 y sin enlace a ningún documento.
const SIN_PRESUPUESTO: TratoCrudo = {
  id: "734060000022757132",
  Deal_Name: "TORREMOLINOS BLOCK 2027",
  Stage: "Pendiente de pago resto",
  Owner: { name: "Pablo Jimenez", id: "1" },
  Account_Name: { name: "DREIFRANKEN TOURS", id: "2" },
  Amount: 10000,
  Importe_por_Viajero: 333.33,
  Importe_Dep_sito_New: 5332.2,
  Imp_Pendiente: 4667.8,
  Forma_de_Cobro: "Deposito 30%",
  Deposito_Cobrado: "Si",
  Cobrado_al_100: false,
  Masiva: false,
  Total_Servicios_Contratados_Presupuesto: 0,
  Costes_Totales_Presupuesto_Aceptado: 0,
  Margen_Beneficio_Presupuesto_Aceptado: 0,
  Coste_por_viajero: 0,
  N_Presupuesto_Subformulario: 1,
  Servicios_Contratados: [],
  Presupuesto_Sugerido: null,
  ID_Presupuesto_Sugerido: null,
  Description: null,
  Opciones_de_Presupuesto: null,
  Proveedores: [{ id: "9", Proveedores: { name: "Ayuntamiento de Torremolinos", id: "8" } }],
  Pa_s_de_Destino: ["España"],
  Fecha_llegada_actividad: "2027-03-19",
  Fecha_salida_actividad: "2026-03-31", // error de año real del CRM
  Modified_Time: "2026-10-16T09:57:40+02:00",
  ID_Zoho_Projects: "268817000002131003",
  $currency_symbol: "€",
  Locked__s: false,
};
const ETIQUETAS: EtiquetasDeCampos = {
  Deal_Name: { etiqueta: "Nombre de la oportunidad", tipo: "text" },
  Amount: { etiqueta: "Importe", tipo: "currency" },
  Importe_Dep_sito_New: { etiqueta: "Importe del depósito", tipo: "currency" },
  Cobrado_al_100: { etiqueta: "Cobrado al 100 %", tipo: "boolean" },
  Fecha_llegada_actividad: { etiqueta: "Fecha de llegada", tipo: "date" },
  Modified_Time: { etiqueta: "Hora de modificación", tipo: "datetime" },
  Servicios_Contratados: { etiqueta: "Servicios Contratados", tipo: "subform" },
  Costes_Totales_Presupuesto_Aceptado: { etiqueta: "Costes totales", tipo: "currency" },
};

console.log("\nUn trato aceptado SIN presupuesto cargado (lo que enseñaba mal: «nº 1 · 0,00 €»)");

prueba("no se inventa un presupuesto aceptado: sin líneas no hay número, total, coste ni margen", () => {
  const a = resumenDelAceptado(SIN_PRESUPUESTO, { verEconomia: true })!;
  assert.equal(a.hayDetalle, false);
  assert.equal(a.numero, null, "N_Presupuesto_Subformulario vale 1 por defecto");
  assert.equal(a.total, null, "el total del CRM es 0, no «0,00 €»");
  assert.equal(a.coste, null);
  assert.equal(a.margen, null);
  assert.equal(a.costePorViajero, null);
});

prueba("lo que el CRM SÍ tiene del cobro se conserva: importe por viajero, depósito, pendiente y forma de cobro", () => {
  const a = resumenDelAceptado(SIN_PRESUPUESTO)!;
  assert.equal(a.pvpPorViajero, 333.33);
  assert.equal(a.deposito, 5332.2);
  assert.equal(a.pendiente, 4667.8);
  assert.equal(a.formaDeCobro, "Deposito 30%");
});

prueba("con presupuesto cargado, el aceptado sí tiene detalle", () => {
  assert.equal(resumenDelAceptado(ACEPTADO)!.hayDetalle, true);
});

prueba("el inventario dice con todas las letras lo que falta: servicios, qué presupuesto aceptó y documento", () => {
  const inv = inventarioDelTrato(SIN_PRESUPUESTO);
  const por = (t: string) => inv.find((i) => i.texto.startsWith(t))!;
  assert.equal(por("Importe del trato").estado, "si");
  assert.equal(por("Condiciones de cobro").estado, "si");
  assert.equal(por("Presupuesto línea a línea").estado, "no");
  assert.match(por("Presupuesto línea a línea").detalle, /VACÍO/);
  assert.equal(por("Cuál de los presupuestos").estado, "no");
  assert.equal(por("Proveedores").estado, "si");
  assert.equal(por("Proveedores").detalle, "Ayuntamiento de Torremolinos");
  assert.equal(por("Archivos adjuntos").estado, "aviso", "lo que no se puede leer se avisa, no se calla");
});

prueba("una salida anterior a la llegada se señala como error de año (en vez de dar «-353 noches» sin explicar)", () => {
  const f = inventarioDelTrato(SIN_PRESUPUESTO).find((i) => i.texto === "Fechas del viaje")!;
  assert.equal(f.estado, "no");
  assert.match(f.detalle, /31\/03\/2026.*anterior a la llegada.*19\/03\/2027/);
  const bien = inventarioDelTrato({ Stage: "Nueva", Fecha_llegada_actividad: "2027-03-19", Fecha_salida_actividad: "2027-03-31" }).find((i) => i.texto === "Fechas del viaje")!;
  assert.equal(bien.estado, "si");
  assert.equal(bien.detalle, "19/03/2027 → 31/03/2027");
  assert.equal(inventarioDelTrato({ Stage: "Nueva" }).find((i) => i.texto === "Fechas del viaje")!.estado, "no");
});

prueba("los importes decimales sueltos salen con formato (4667.8 → 4.667,80)", () => {
  const todos = camposDelTratoConValor({ Imp_Pendiente: 4667.8, N_mero_de_personas: 30 }).grupos.flatMap((g) => g.campos);
  assert.equal(todos.find((x) => x.etiqueta === "Imp Pendiente")!.valor, "4.667,80");
  assert.equal(todos.find((x) => x.etiqueta === "N mero de personas")!.valor, "30");
});

prueba("el inventario de un trato completo: todo en verde", () => {
  const inv = inventarioDelTrato(ACEPTADO);
  const por = (t: string) => inv.find((i) => i.texto.startsWith(t))!;
  assert.equal(por("Presupuesto línea a línea").estado, "si");
  assert.match(por("Presupuesto línea a línea").detalle, /3 líneas en 2 presupuestos/);
  assert.equal(por("Cuál de los presupuestos").detalle, "el nº 2");
  assert.ok(!inv.some((i) => /Books|Documento del presupuesto/.test(i.texto)), "lo de Books no se comprueba");
});

prueba("en un trato que aún no está aceptado, lo vacío no es un fallo («na») y no se pregunta qué presupuesto aceptó", () => {
  const inv = inventarioDelTrato({ Stage: "Preparando Presupuesto", Servicios_Contratados: [], Amount: 5000 });
  assert.equal(inv.find((i) => i.texto.startsWith("Presupuesto línea a línea"))!.estado, "na");
  assert.equal(inv.some((i) => i.texto.startsWith("Cuál de los presupuestos")), false);
});

console.log("\nTodos los campos con valor");

prueba("salen TODOS los que tienen valor, con el nombre que ven en Zoho, y ninguno de sistema", () => {
  const c = camposDelTratoConValor(SIN_PRESUPUESTO, ETIQUETAS);
  const todos = c.grupos.flatMap((g) => g.campos);
  const etiquetas = todos.map((x) => x.etiqueta);
  assert.ok(etiquetas.includes("Nombre de la oportunidad"));
  assert.ok(etiquetas.includes("Proveedores"), "un multi-lookup se lee por el nombre anidado");
  assert.ok(etiquetas.includes("Pa s de Destino") || etiquetas.some((e) => /Pa.s de Destino/.test(e)));
  assert.ok(etiquetas.includes("ID Zoho Projects"), "sin etiqueta conocida, el nombre técnico legible");
  for (const mal of ["id", "Locked  s", "Locked__s", "$currency_symbol", "Servicios Contratados"]) assert.ok(!etiquetas.includes(mal), mal);
  assert.equal(c.rellenos, todos.length);
});

prueba("los valores salen legibles: euros, fechas dd/mm/aaaa, sí/no y nombres de personas", () => {
  const todos = camposDelTratoConValor(SIN_PRESUPUESTO, ETIQUETAS).grupos.flatMap((g) => g.campos);
  const v = (e: string) => todos.find((x) => x.etiqueta === e)?.valor;
  assert.equal(v("Importe"), "10.000,00 €");
  assert.equal(v("Importe del depósito"), "5.332,20 €");
  assert.equal(v("Fecha de llegada"), "19/03/2027");
  assert.equal(v("Hora de modificación"), "16/10/2026 09:57");
  assert.equal(v("Cobrado al 100 %"), "No", "un «no» es un dato: no se esconde");
  assert.equal(v("Propietario") ?? v("Owner"), "Pablo Jimenez");
  assert.equal(v("Pa s de Destino") ?? todos.find((x) => /Pa.s de Destino/.test(x.etiqueta))?.valor, "España");
});

prueba("los campos se agrupan (viaje, cobro, fase y fechas, quién) y lo vacío se lista aparte", () => {
  const c = camposDelTratoConValor(SIN_PRESUPUESTO, ETIQUETAS);
  const titulos = c.grupos.map((g) => g.titulo);
  assert.deepEqual(titulos.slice(0, 3), ["El viaje", "Cobro y presupuesto", "Fase y fechas"]);
  assert.ok(c.vacios.includes("Servicios Contratados"), "el subformulario vacío se dice el primero");
  assert.equal(c.vacios[0], "Servicios Contratados");
  assert.ok(!c.vacios.some((e) => /Presupuesto.Sugerido/.test(e)), "el enlace de Books no se echa en falta");
});

prueba("costes y márgenes solo con economía", () => {
  const sin = camposDelTratoConValor(SIN_PRESUPUESTO, ETIQUETAS, { verEconomia: false });
  assert.ok(!sin.grupos.flatMap((g) => g.campos).some((x) => x.etiqueta === "Costes totales"));
  assert.ok(!sin.vacios.includes("Costes totales"));
  const con = camposDelTratoConValor(SIN_PRESUPUESTO, ETIQUETAS, { verEconomia: true });
  assert.ok(con.grupos.flatMap((g) => g.campos).some((x) => x.etiqueta === "Costes totales" && x.valor === "0,00 €"));
});

prueba("sin etiquetas (Zoho no contestó) sigue funcionando con los nombres técnicos", () => {
  const c = camposDelTratoConValor({ Deal_Name: "X", Amount: 5 });
  assert.deepEqual(c.grupos.flatMap((g) => g.campos).map((x) => x.etiqueta), ["Deal Name", "Amount"]);
});

prueba("la ficha entera trae inventario y campos", () => {
  const f = fichaDelCrm(SIN_PRESUPUESTO, { verEconomia: false }, ETIQUETAS);
  assert.ok(f.inventario.length >= 7);
  assert.ok(f.campos.rellenos > 10);
  assert.equal(f.aceptado!.hayDetalle, false);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
