/**
 * Cómo se ven y se ordenan las oportunidades.
 *
 * Datos inventados, con la forma de los reales (el 11/11/2026 se probó con las
 * 430 de 2027: los seis estados sumaban 430; «cerradas» eran 29 ganadas + 93
 * perdidas; «importe en curso» llevaba 307.182 € ya ganados; 105 abiertas tenían
 * el cierre vencido; 246 de 308 valían 400 de urgencia).
 *
 * Cómo correrla:  npm run test:oportunidades-vista
 */
import assert from "node:assert/strict";

import {
  ESTADOS,
  abierta,
  atajos,
  avisoDelMovimiento,
  cierreVencidoHace,
  diasHasta,
  estadoDe,
  euros,
  eurosCorto,
  exigeMotivo,
  faltanDatos,
  fasesPresentes,
  filtrar,
  nombresRepetidos,
  noches,
  ordenar,
  porCuenta,
  porMes,
  puntosDePrisa,
  rangoLlegada,
  resumen,
  siguientePaso,
  tipoDeMovimiento,
} from "../src/domain/oportunidadesVista";
import type { OportunidadFila } from "../src/domain/oportunidadUnificada";

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

const HOY = new Date(2026, 10, 11); // 11/11/2026

let n = 0;
function fila(extra: Partial<OportunidadFila> = {}): OportunidadFila {
  n += 1;
  return {
    clave: `k${n}`,
    origen: "ZOHO",
    crmDealId: `d${n}`,
    dealUrl: `https://crm.example/${n}`,
    nombre: `COLEGIO ${n} 2027`,
    cuenta: "CUENTA A",
    contacto: "Contacto",
    departamento: "SPORTS",
    fase: "Seguimiento al Presupuesto",
    importe: 10_000,
    llegada: "2027-03-10",
    salida: "2027-03-14",
    cierre: "2027-01-20",
    carril: "esperando",
    carrilDeducido: true,
    urgencia: 400,
    entrega: null,
    elegida: null,
    opcionEnLaApp: null,
    opcionEnZoho: null,
    opcionContradictoria: false,
    deposito: { venceEl: null, cobradoEl: null },
    detalleRestringido: false,
    crm: null,
    ...extra,
  };
}
const entrega = (estado: string, extra = {}) => ({
  id: "e1", proposalId: "p1", tripRequestId: "t1", reference: "ORV-2026-0001", estado,
  motivoDelFallo: null, enviadaEl: null, vistas: 0, versiones: 1, versionNuevaSinEnviar: false, ...extra,
});

// Un conjunto con todos los casos: 12 filas.
const CONJUNTO: OportunidadFila[] = [
  fila({ fase: "Preparando Presupuesto", carril: "sin_enviar", importe: 5_000, cierre: "2026-10-01" }), // vencida
  fila({ fase: "Preparando Presupuesto", carril: "sin_enviar", importe: null, cierre: "2027-02-01" }), // sin importe
  fila({ fase: "Presupuesto Enviado", carril: "esperando", importe: 20_000, cierre: "2026-09-01" }), // vencida
  fila({ fase: "Seguimiento al Presupuesto", carril: "esperando", importe: 30_000, cierre: "2027-02-01" }),
  fila({ fase: "Lista de Espera", carril: "esperando", importe: 8_000, cierre: "2027-03-01" }),
  fila({ fase: "Pendiente de deposito", carril: "aceptada", importe: 60_000, cierre: "2026-08-01", deposito: { venceEl: "2026-11-16T01:45:34.987Z", cobradoEl: null } }),
  fila({ fase: "Pendiente de pago resto", carril: "aceptada", importe: 12_000, cierre: "2027-04-01" }),
  fila({ fase: "Oportunidad Ganada", carril: "cerrada", importe: 40_000, cierre: "2026-05-01" }), // ganada: NO cuenta como vencida
  fila({ fase: "Oportunidad Ganada", carril: "cerrada", importe: 10_000, cierre: "2026-06-01" }),
  fila({ fase: "Oportunidad Perdida", carril: "cerrada", importe: 15_000, cierre: "2026-03-01" }),
  fila({ origen: "APP", crmDealId: null, dealUrl: null, fase: null, carril: "sin_enviar", importe: null, cierre: null, llegada: "2027-03-12", salida: "2027-03-16", entrega: entrega("DRAFT"), nombre: "FC WEINFELDEN 2027" }),
  fila({ fase: "Seguimiento al Presupuesto", carril: "esperando", importe: 9_000, cuenta: "CUENTA B", departamento: "GROUPS", llegada: "2027-05-05", salida: "2027-05-09" }),
];

console.log("\nEstados");

prueba("los cinco estados suman el total (antes, los cuadros de arriba no sumaban igual que los botones)", () => {
  const r = resumen(CONJUNTO, HOY);
  assert.equal(r.todas.n, 12);
  assert.equal(r.sin_enviar.n + r.esperando.n + r.aceptada.n + r.ganada.n + r.perdida.n, 12);
  assert.deepEqual(ESTADOS.map((e) => e.id), ["todas", "sin_enviar", "esperando", "aceptada", "ganada", "perdida"]);
});

prueba("«cerradas» se separa en ganadas y perdidas", () => {
  assert.equal(estadoDe({ carril: "cerrada", fase: "Oportunidad Ganada" }), "ganada");
  assert.equal(estadoDe({ carril: "cerrada", fase: "Oportunidad Perdida" }), "perdida");
  const r = resumen(CONJUNTO, HOY);
  assert.equal(r.ganada.n, 2);
  assert.equal(r.perdida.n, 1);
});

prueba("lo abierto NO incluye lo ganado (el «importe en curso» antiguo sí lo sumaba)", () => {
  const r = resumen(CONJUNTO, HOY);
  assert.equal(r.abierto.importe, 5_000 + 20_000 + 30_000 + 8_000 + 60_000 + 12_000 + 9_000);
  assert.equal(r.ganada.importe, 50_000);
  assert.equal(r.abierto.n, 9);
});

prueba("lo ganado y lo perdido no están abiertos", () => {
  assert.equal(abierta({ carril: "cerrada", fase: "Oportunidad Ganada" }), false);
  assert.equal(abierta({ carril: "esperando", fase: "Lista de Espera" }), true);
});

prueba("los avisos cuentan el cierre vencido (solo de lo abierto) y las que no tienen importe", () => {
  const r = resumen(CONJUNTO, HOY);
  assert.equal(r.aviso.vencidas, 3, "preparando, enviada y pendiente de depósito; las ganadas y perdidas no");
  assert.equal(r.aviso.importeVencidas, 5_000 + 20_000 + 60_000);
  assert.equal(r.aviso.sinImporte, 2);
});

console.log("\nCierre vencido, fechas y dinero");

prueba("el cierre vencido se cuenta en días y no existe en lo cerrado", () => {
  assert.equal(cierreVencidoHace(CONJUNTO[0], HOY), 41);
  assert.equal(cierreVencidoHace(CONJUNTO[7], HOY), null, "una ganada no está «vencida»");
  assert.equal(cierreVencidoHace(CONJUNTO[3], HOY), null, "cierre futuro");
  assert.equal(cierreVencidoHace(CONJUNTO[10], HOY), null, "sin fecha de cierre");
});

prueba("los días hasta una fecha: con hora y sin hora dan lo mismo", () => {
  assert.equal(diasHasta("2026-11-16", HOY), 5);
  assert.equal(diasHasta("2026-11-16T01:45:34.987Z", HOY), 5);
  assert.equal(diasHasta("2026-11-10", HOY), -1);
  assert.equal(diasHasta(null, HOY), null);
  assert.equal(diasHasta("no es fecha", HOY), null);
});

prueba("el rango de llegada se lee: mismo mes, entre meses, con una punta sola o sin nada", () => {
  assert.equal(rangoLlegada({ llegada: "2027-06-25", salida: "2027-06-29" }), "25–29 jun 2027");
  assert.equal(rangoLlegada({ llegada: "2027-06-28", salida: "2027-07-02" }), "28 jun – 2 jul 2027");
  assert.equal(rangoLlegada({ llegada: "2027-06-25", salida: null }), "desde el 25 jun 2027");
  assert.equal(rangoLlegada({ llegada: null, salida: null }), "");
  assert.equal(noches({ llegada: "2027-06-25", salida: "2027-06-29" }), 4);
});

prueba("el dinero lleva siempre separador de miles; los contadores se acortan", () => {
  assert.equal(euros(8500), "8.500 €");
  assert.equal(euros(null), "—");
  assert.equal(eurosCorto(4_451_688), "4,45 M€");
  assert.equal(eurosCorto(307_182), "307 k€");
  assert.equal(eurosCorto(8_500), "8.500 €");
});

console.log("\nLo siguiente que hay que hacer");

prueba("una propuesta de la app sin enviar dice «Falta enviarla»; fallida, «El envío falló»", () => {
  assert.deepEqual(siguientePaso(CONJUNTO[10], HOY), { texto: "Falta enviarla", tono: "aviso", accion: "ver-documento" });
  const fallida = fila({ origen: "APP", fase: null, entrega: entrega("FAILED") });
  assert.equal(siguientePaso(fallida, HOY).accion, "revisar-envio");
});

prueba("cada fase de Zoho tiene su frase, y lo abierto siempre dice algo", () => {
  assert.equal(siguientePaso(CONJUNTO[0], HOY).texto, "Preparar y enviar la propuesta");
  assert.equal(siguientePaso(CONJUNTO[2], HOY).texto, "Esperando su respuesta");
  assert.equal(siguientePaso(CONJUNTO[3], HOY).texto, "Hacer seguimiento");
  assert.equal(siguientePaso(CONJUNTO[4], HOY).texto, "En lista de espera");
  assert.equal(siguientePaso(CONJUNTO[6], HOY).texto, "Cobrar el resto");
  assert.equal(siguientePaso(CONJUNTO[7], HOY).texto, "Ganada");
  for (const f of CONJUNTO.filter(abierta)) assert.ok(siguientePaso(f, HOY).texto.length > 0, f.nombre);
});

prueba("el depósito dice cuántos días quedan, y avisa cuando faltan siete o menos", () => {
  const p = siguientePaso(CONJUNTO[5], HOY);
  assert.equal(p.texto, "Quedan 5 días para el depósito");
  assert.equal(p.tono, "aviso");
  const lejos = fila({ fase: "Pendiente de deposito", carril: "aceptada", deposito: { venceEl: "2026-12-30", cobradoEl: null } });
  assert.equal(siguientePaso(lejos, HOY).tono, "info");
  const vencido = fila({ fase: "Pendiente de deposito", carril: "aceptada", deposito: { venceEl: "2026-11-01", cobradoEl: null } });
  assert.equal(siguientePaso(vencido, HOY).texto, "Depósito vencido hace 10 días");
});

prueba("lo que falta por rellenar se dice en una línea, y solo en lo abierto", () => {
  assert.deepEqual(faltanDatos(CONJUNTO[1]), ["importe"]);
  assert.deepEqual(faltanDatos(CONJUNTO[10]), ["importe", "fecha de cierre"]);
  assert.deepEqual(faltanDatos(CONJUNTO[7]), []);
});

console.log("\nOrden de prisa");

prueba("el orden de prisa ya no empata: lo de la app, luego cierre vencido (el más antiguo primero), luego depósitos", () => {
  const o = ordenar(CONJUNTO, "prisa", HOY);
  assert.equal(o[0].nombre, "FC WEINFELDEN 2027", "lo de la app que falta enviar, primero");
  const vencidas = o.slice(1, 4).map((f) => f.cierre);
  assert.deepEqual(vencidas, ["2026-08-01", "2026-09-01", "2026-10-01"], "las vencidas, de más antigua a más reciente… (la de depósito suma más)");
});

prueba("lo cerrado va al final y las abiertas tienen puntos distintos", () => {
  const o = ordenar(CONJUNTO, "prisa", HOY);
  assert.ok(o.slice(-3).every((f) => !abierta(f)));
  const valores = new Set(CONJUNTO.filter(abierta).map((f) => puntosDePrisa(f, HOY)));
  assert.ok(valores.size >= 5, `valores distintos: ${valores.size}`);
});

prueba("los otros órdenes: importe, llegada, nombre", () => {
  assert.equal(ordenar(CONJUNTO, "importe", HOY)[0].importe, 60_000);
  assert.equal(ordenar(CONJUNTO, "llegada", HOY)[0].llegada, "2027-03-10");
  assert.equal(ordenar([fila({ nombre: "B" }), fila({ nombre: "A" })], "nombre", HOY)[0].nombre, "A");
});

console.log("\nFiltros y vistas guardadas");

prueba("los filtros se combinan: estado, origen, departamento, fase y búsqueda", () => {
  assert.equal(filtrar(CONJUNTO, { estado: "esperando" }, HOY).length, 4);
  assert.equal(filtrar(CONJUNTO, { origen: "app" }, HOY).length, 1);
  assert.equal(filtrar(CONJUNTO, { origen: "zoho" }, HOY).length, 11);
  assert.equal(filtrar(CONJUNTO, { estado: "esperando", departamento: "GROUPS" }, HOY).length, 1);
  assert.equal(filtrar(CONJUNTO, { fase: "Lista de Espera" }, HOY).length, 1);
  assert.equal(filtrar(CONJUNTO, { q: "weinfelden" }, HOY).length, 1);
  assert.equal(filtrar(CONJUNTO, { q: "ORV-2026-0001" }, HOY).length, 1, "también por referencia");
});

prueba("la búsqueda ignora mayúsculas y tildes", () => {
  const f = [fila({ nombre: "COLEGIO SAGRADO CORAZÓN 2027" })];
  assert.equal(filtrar(f, { q: "corazon" }, HOY).length, 1);
});

prueba("el filtro de departamento deja pasar las que no tienen ninguno (como hacía la pantalla)", () => {
  const f = [fila({ departamento: "SPORTS" }), fila({ departamento: "GROUPS" }), fila({ departamento: null })];
  assert.equal(filtrar(f, { departamento: "SPORTS" }, HOY).length, 2);
  assert.equal(filtrar(f, { departamento: "TODOS" }, HOY).length, 3);
});

prueba("las vistas guardadas dan lo que dicen", () => {
  assert.equal(filtrar(CONJUNTO, { vista: "vencidas" }, HOY).length, 3);
  assert.equal(filtrar(CONJUNTO, { vista: "sin_importe" }, HOY).length, 2);
  assert.equal(filtrar(CONJUNTO, { vista: "por_cobrar" }, HOY).length, 2);
  assert.equal(filtrar(CONJUNTO, { vista: "grandes" }, HOY).length, 1);
  // «Llegan en 3 meses»: del 11/11/2026 al 11/02/2027.
  const llegadas = [fila({ llegada: "2027-01-20" }), fila({ llegada: "2027-06-01" }), fila({ llegada: "2026-10-01" }), fila({ llegada: null })];
  assert.deepEqual(filtrar(llegadas, { vista: "llegan_pronto" }, HOY).map((f) => f.llegada), ["2027-01-20"]);
});

prueba("carga por mes: solo lo abierto y con llegada", () => {
  const m = porMes(CONJUNTO);
  const marzo = m.find((x) => x.mes === "2027-03");
  assert.ok(marzo && marzo.nombre === "marzo");
  assert.equal(m.find((x) => x.mes === "2027-05")?.n, 1);
  assert.equal(m.reduce((t, x) => t + x.n, 0), 9, "las 9 abiertas con llegada");
});

prueba("agrupar por cuenta: la que más tiene primero, y no se pierde ninguna", () => {
  const g = porCuenta(CONJUNTO);
  assert.equal(g[0].cuenta, "CUENTA A");
  assert.equal(g.reduce((t, x) => t + x.filas.length, 0), 12);
});

prueba("nombres repetidos (posibles duplicados), sin mayúsculas ni tildes", () => {
  const r = nombresRepetidos([{ nombre: "Ies Sant Josep 2027" }, { nombre: "IES SANT JOSEP 2027" }, { nombre: "Otro" }]);
  assert.equal(r.size, 1);
});

prueba("las fases presentes salen en el orden del embudo", () => {
  assert.deepEqual(fasesPresentes([{ fase: "Oportunidad Ganada" }, { fase: "Preparando Presupuesto" }, { fase: null }, { fase: "Lista de Espera" }]),
    ["Preparando Presupuesto", "Oportunidad Ganada", "Lista de Espera"]);
});

console.log("\nCambio de fase con constancia");

prueba("el motivo es obligatorio al retroceder, perder o ir a lista de espera; al avanzar o reabrir, no", () => {
  assert.equal(tipoDeMovimiento("Seguimiento al Presupuesto", "Preparando Presupuesto"), "atras");
  assert.equal(exigeMotivo("Seguimiento al Presupuesto", "Preparando Presupuesto"), true);
  assert.equal(exigeMotivo("Seguimiento al Presupuesto", "Oportunidad Perdida"), true);
  assert.equal(exigeMotivo("Presupuesto Enviado", "Lista de Espera"), true);
  assert.equal(exigeMotivo("Preparando Presupuesto", "Presupuesto Enviado"), false);
  assert.equal(tipoDeMovimiento("Lista de Espera", "Preparando Presupuesto"), "reabrir");
  assert.equal(exigeMotivo("Lista de Espera", "Preparando Presupuesto"), false);
  assert.equal(exigeMotivo("Preparando Presupuesto", "Preparando Presupuesto"), false);
});

prueba("el aviso dice lo que haces, y nada si no cambias nada", () => {
  assert.equal(avisoDelMovimiento("Presupuesto Enviado", "Preparando Presupuesto"), "Retrocedes de fase: hace falta un motivo.");
  assert.equal(avisoDelMovimiento("Presupuesto Enviado", "Presupuesto Enviado"), null);
  assert.equal(avisoDelMovimiento("Presupuesto Enviado", ""), null);
});

prueba("los atajos dependen de dónde está la oportunidad", () => {
  const dep = atajos({ fase: "Pendiente de deposito", carril: "aceptada" });
  assert.ok(dep.some((a) => a.fase === "Pendiente de pago resto"));
  assert.ok(dep.some((a) => a.fase === "Oportunidad Perdida"));
  assert.deepEqual(atajos({ fase: null, carril: "sin_enviar" }), []);
  assert.ok(atajos({ fase: "Lista de Espera", carril: "esperando" }).some((a) => a.fase === "Preparando Presupuesto"));
  assert.ok(!atajos({ fase: "Oportunidad Ganada", carril: "cerrada" }).some((a) => a.fase === "Oportunidad Perdida"), "una ganada no se pierde con un atajo");
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
