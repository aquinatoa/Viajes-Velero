/**
 * Las actividades de una opción: suman al total y pasan a «Servicios
 * Contratados» (Oravia, 16/11/2026: «las actividades no suben»).
 *
 * Cómo correrla:  npm run test:actividades-contratadas
 *
 * No necesita base de datos, servidor ni Zoho.
 */
import assert from "node:assert/strict";

import {
  filasDeLasActividades,
  totalDeLaActividad,
  totalDeLaOpcion,
  type ActividadDeLaPropuesta,
} from "../src/domain/actividadesContratadas";
import { ordenarActividades } from "../src/domain/ordenDeActividades";

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

// El caso de Sports de ORV-2026-0007: tres servicios que se cobran por grupo.
const entrenador: ActividadDeLaPropuesta = {
  activityId: "a-entrenador",
  activityNameSnapshot: "Entrenador asistente",
  providerSnapshot: "Cambrils Park",
  pvpSnapshot: "4,20 €",
  linesJson: JSON.stringify([{ rateId: "r-entrenador", etiqueta: "por sesión", precio: 84, cantidad: 2 }]),
  amountTotal: 168,
};
const futbolPlaya: ActividadDeLaPropuesta = {
  activityId: "a-playa",
  activityNameSnapshot: "Fútbol Playa",
  providerSnapshot: "Cambrils Park",
  pvpSnapshot: "4,75 €",
  linesJson: [{ rateId: "r-playa", etiqueta: "por grupo", precio: 190, cantidad: 1 }],
  amountTotal: "190",
};
const luz: ActividadDeLaPropuesta = {
  activityId: "a-luz",
  activityNameSnapshot: "Luz Artificial",
  providerSnapshot: "Cambrils Park",
  pvpSnapshot: "0,70 €",
  linesJson: [{ rateId: "r-luz", etiqueta: "por hora", precio: 28, cantidad: 1 }],
  amountTotal: 28,
};
// El caso de Grupos del correo de Ruth (02/11): entradas por persona, con gratuidad.
const portAventura: ActividadDeLaPropuesta = {
  activityId: "a-pa",
  activityNameSnapshot: "1 día, 2 parques PortAventura Park y Ferrari Land",
  providerSnapshot: "PortAventura World",
  pvpSnapshot: "41,28 €",
  linesJson: [
    { rateId: "r-pa-joven", etiqueta: "Joven/Secundaria/Uni (12-17)", precio: 41.28, cantidad: 100 },
    { rateId: "r-pa-adulto#gratis", etiqueta: "Adulto (18-59) · gratuidad", precio: 0, cantidad: 10 },
  ],
  amountTotal: 4128,
};
const kayak: ActividadDeLaPropuesta = {
  activityId: "a-kayak",
  activityNameSnapshot: "Kayak + paddle surf + agility y XXL",
  providerSnapshot: "Club Nàutic Salou",
  pvpSnapshot: "30,78 €",
  linesJson: [
    { rateId: "r-kayak", etiqueta: "De 25 a 50 pax", precio: 29.6, cantidad: 104 },
    { rateId: "r-kayak#gratis", etiqueta: "De 25 a 50 pax · gratuidad", precio: 0, cantidad: 6 },
  ],
  amountTotal: 3078.4,
};
const sinLineas: ActividadDeLaPropuesta = { activityId: "a-pb", activityNameSnapshot: "Paintball", providerSnapshot: null, pvpSnapshot: "18,00 €", unitCostAmount: 12 };
const aConsultar: ActividadDeLaPropuesta = { activityNameSnapshot: "Guía local", pvpSnapshot: "A consultar" };

const tarifas = {
  "r-entrenador": { rateUnit: "por servicio", costNetAmount: 70 },
  "r-playa": { rateUnit: "PER_GROUP", costNetAmount: 150 },
  "r-luz": { rateUnit: "por hora", costNetAmount: null },
  "r-pa-joven": { rateUnit: "por persona", costNetAmount: 35.5 },
  "r-kayak": { rateUnit: "per_person", costNetAmount: 22 },
};

console.log("\nEl total de la opción suma sus actividades");

prueba("ORV-2026-0007: 7.936,38 € de alojamiento + 386 € de actividades", () => {
  const t = totalDeLaOpcion("7.936,38 €", [entrenador, futbolPlaya, luz], 40, 6);
  assert.equal(t.alojamiento, 7936.38);
  assert.equal(t.actividades, 386);
  assert.equal(t.total, 8322.38);
  assert.deepEqual(t.sinPrecio, []);
});

prueba("el caso de Ruth: 23.234,82 € + 7.206,40 € de actividades", () => {
  const t = totalDeLaOpcion("23.234,82 €", [portAventura, kayak], 100, 10);
  assert.equal(t.actividades, 7206.4);
  assert.equal(t.total, 30441.22);
});

prueba("sin líneas, el precio por alumno se multiplica por todo el grupo", () => {
  assert.equal(totalDeLaActividad(sinLineas, 90, 5), 1710);
});

prueba("una actividad «a consultar» no cuenta como cero: se avisa y no suma", () => {
  const t = totalDeLaOpcion("1.000,00 €", [sinLineas, aConsultar], 10, 0);
  assert.equal(t.actividades, 180);
  assert.equal(t.total, 1180);
  assert.deepEqual(t.sinPrecio, ["Guía local"]);
  assert.equal(totalDeLaActividad(aConsultar, 10, 0), null);
});

prueba("sin actividades el total es el del alojamiento; sin nada, no hay total", () => {
  assert.equal(totalDeLaOpcion("9.661,12 €", [], 50, 4).total, 9661.12);
  assert.equal(totalDeLaOpcion(null, [], 50, 4).total, null);
  assert.equal(totalDeLaOpcion(null, [kayak], 104, 6).total, 3078.4);
});

console.log("\nLas filas de «Servicios Contratados»");

prueba("lo que se cobra por grupo va en «P.Neto»: precio del servicio × cantidad", () => {
  const { filas, total } = filasDeLasActividades([entrenador, futbolPlaya, luz], { alumnos: 40, profesores: 6, tarifas, fechaPorDefecto: "2027-04-02" });
  assert.equal(filas.length, 3);
  assert.ok(filas.every((f) => f.unidad === "P.Neto"));
  assert.deepEqual(filas.map((f) => [f.producto, f.cantidad, f.precio, f.total]), [
    ["Entrenador asistente", 2, 84, 168],
    ["Fútbol Playa", 1, 190, 190],
    ["Luz Artificial", 1, 28, 28],
  ]);
  assert.equal(total, 386);
  assert.ok(filas.every((f) => f.pax === 46 && f.proveedor === "Cambrils Park" && f.fecha === "2027-04-02"));
});

prueba("las entradas van en «P.Pax», con los pasajeros de cada tarifa y cantidad 1", () => {
  const { filas, total } = filasDeLasActividades([portAventura, kayak], { alumnos: 100, profesores: 10, tarifas });
  assert.deepEqual(filas.map((f) => [f.unidad, f.pax, f.cantidad, f.precio]), [
    ["P.Pax", 100, 1, 41.28],
    ["P.Pax", 10, 1, 0],
    ["P.Pax", 104, 1, 29.6],
    ["P.Pax", 6, 1, 0],
  ]);
  assert.equal(total, 7206.4);
});

prueba("la gratuidad sale en su fila a 0 €, con coste 0 y dicha en el comentario", () => {
  const { filas } = filasDeLasActividades([portAventura], { alumnos: 100, profesores: 10, tarifas });
  assert.equal(filas[1].precio, 0);
  assert.equal(filas[1].coste, 0);
  assert.match(filas[1].comentario, /gratuidad/i);
});

prueba("la suma de las filas es el total de las actividades de la opción", () => {
  const todas = [entrenador, futbolPlaya, luz, portAventura, kayak, sinLineas];
  const { filas, total } = filasDeLasActividades(todas, { alumnos: 100, profesores: 10, tarifas });
  assert.equal(total, totalDeLaOpcion(null, todas, 100, 10).actividades);
  assert.equal(Math.round(filas.reduce((s, f) => s + f.total, 0) * 100) / 100, total);
});

prueba("el coste sale de la tarifa; si no lo tiene, queda sin coste (y la fila sin validar)", () => {
  const { filas } = filasDeLasActividades([entrenador, luz, sinLineas], { alumnos: 20, profesores: 2, tarifas });
  assert.deepEqual(filas.map((f) => f.coste), [70, null, 12]);
});

prueba("el día de la visita manda sobre la fecha de entrada del viaje", () => {
  const { filas } = filasDeLasActividades([portAventura, kayak], {
    alumnos: 100,
    profesores: 10,
    tarifas,
    fechasDeVisita: { "a-pa": "2027-06-16" },
    fechaPorDefecto: "2027-06-14",
  });
  assert.equal(filas[0].fecha, "2027-06-16");
  assert.equal(filas[2].fecha, "2027-06-14");
});

prueba("un descuento en euros es una fila en negativo y sigue cuadrando", () => {
  const conDescuento: ActividadDeLaPropuesta = {
    activityNameSnapshot: "Aquopolis",
    pvpSnapshot: "14,15 €",
    linesJson: [
      { rateId: "r-aq", etiqueta: "Secundaria", precio: 16.15, cantidad: 120 },
      { rateId: "#descuento", etiqueta: "descuento por alumno", precio: -2, cantidad: 120 },
    ],
    amountTotal: 1698,
  };
  const { filas, total } = filasDeLasActividades([conDescuento], { alumnos: 120, profesores: 8 });
  assert.equal(filas[1].precio, -2);
  assert.equal(total, 1698);
});

prueba("sin precio no hay fila: se devuelve aparte para avisarlo", () => {
  const r = filasDeLasActividades([aConsultar, sinLineas], { alumnos: 10, profesores: 1 });
  assert.deepEqual(r.sinPrecio, ["Guía local"]);
  assert.equal(r.filas.length, 1);
  assert.equal(r.filas[0].pax, 11);
});

console.log("\nOrdenar las actividades del cotizador");

const lista = [
  { activity: { activityName: "Paintball", supplierName: "Bosc Aventura", locationMain: "Salou" }, rate: { salePvpAmount: 18 } },
  { activity: { activityName: "Aquopolis", supplierName: null, locationMain: "La Pineda" }, rate: { salePvpAmount: 16.15 } },
  { activity: { activityName: "kayak + banana", supplierName: "Club Nàutic Salou", locationMain: "Salou" }, rate: { salePvpAmount: 26.5 } },
  { activity: { activityName: "Árbitro", supplierName: "Cambrils Park", locationMain: null }, rate: { salePvpAmount: null } },
  { activity: { activityName: "Traslado propio", supplierName: "A mano", locationMain: "Salou" }, rate: { salePvpAmount: 5 }, adHoc: true },
];
const nombresDe = (l: typeof lista) => l.map((a) => a.activity.activityName);

prueba("«recomendadas» deja el orden de la búsqueda tal cual", () => {
  assert.deepEqual(nombresDe(ordenarActividades(lista, "recomendado")), nombresDe(lista));
});

prueba("por nombre: alfabético sin tildes ni mayúsculas, con lo metido a mano delante", () => {
  assert.deepEqual(nombresDe(ordenarActividades(lista, "nombre")), ["Traslado propio", "Aquopolis", "Árbitro", "kayak + banana", "Paintball"]);
});

prueba("por precio: de menor a mayor, y las que no tienen precio al final", () => {
  assert.deepEqual(nombresDe(ordenarActividades(lista, "precio")), ["Traslado propio", "Aquopolis", "Paintball", "kayak + banana", "Árbitro"]);
});

prueba("por lugar y por proveedor: lo que no lo tiene va al final", () => {
  assert.deepEqual(nombresDe(ordenarActividades(lista, "lugar")), ["Traslado propio", "Aquopolis", "kayak + banana", "Paintball", "Árbitro"]);
  assert.deepEqual(nombresDe(ordenarActividades(lista, "proveedor")), ["Traslado propio", "Paintball", "Árbitro", "kayak + banana", "Aquopolis"]);
});

prueba("ordenar no toca la lista original", () => {
  const antes = nombresDe(lista);
  ordenarActividades(lista, "nombre");
  assert.deepEqual(nombresDe(lista), antes);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
