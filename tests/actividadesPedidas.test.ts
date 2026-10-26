/**
 * Las actividades que pide el mensaje (Ruth, 26/10/2026, ESCOLA ULL).
 *
 * Cómo correrla:  npm run test:pedidas
 */
import assert from "node:assert/strict";

import { actividadesPedidas, candidatasDe } from "../src/domain/actividadesPedidas";
import { lineasPorDefecto } from "../src/domain/lineasDeActividad";
import { periodoDePortAventura } from "../src/domain/calendarioPortAventura";

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

const ESCOLA_ULL =
  "GRUP TEST RUBEN: Escola Ull de vent, solicita para 80 alumnos de secundaria y 5 profesores acompañantes  y un chofer , en hotel 4* en Costa Dorada. Añade actividad de multiaventura en Cambrils y entradas a Port Aventura con ticket plus para las fechas 12 abril al 16 abril 2027\n\nel 17 de abril 2027 van a port aventura";

prueba("ESCOLA ULL: PortAventura con Ticket Plus el 17/04 y multiaventura en Cambrils", () => {
  const p = actividadesPedidas(ESCOLA_ULL, 2027);
  const pa = p.find((x) => x.clave === "portaventura");
  const multi = p.find((x) => x.clave === "multiaventura");
  assert.ok(pa, "PortAventura");
  assert.equal(pa!.fecha, "2027-04-17");
  assert.equal(pa!.modalidad, "Ticket Plus");
  assert.ok(multi, "multiaventura");
  assert.equal(multi!.lugar, "Cambrils");
  assert.equal(multi!.fecha, null, "el rango del 12 al 16 no es el día de la actividad");
  assert.equal(p.length, 2);
});

prueba("el 17/04/2027 es periodo C, no el B que más se repite en el viaje", () => {
  assert.equal(periodoDePortAventura("2027-04-17"), "C");
});

prueba("fechas en número, sin año (se toma el del viaje) y en catalán", () => {
  assert.equal(actividadesPedidas("El 5/6 irán a PortAventura", 2027)[0].fecha, "2027-06-05");
  assert.equal(actividadesPedidas("Port Aventura el 7 de junio", 2027)[0].fecha, "2027-06-07");
  assert.equal(actividadesPedidas("el 17 d'abril anirem a Port Aventura", 2027)[0].fecha, "2027-04-17");
});

prueba("«Velero Azul» no es la actividad de vela; «por eso» no es nada", () => {
  assert.equal(actividadesPedidas("Somos de Velero Azul, por eso escribimos", 2027).length, 0);
});

const CATALOGO = [
  { id: "pa1", activityName: "1 día PortAventura Park", locationMain: "PortAventura World · 1 día" },
  { id: "pa2", activityName: "2 días, 2 parques PortAventura Park y Ferrari Land", locationMain: "PortAventura Park y Ferrari Land" },
  { id: "fl", activityName: "1 día Ferrari Land", locationMain: "Ferrari Land" },
  { id: "s1", activityName: "Big Salta indoor 2 h + calcetines", locationMain: "Cambrils · Parque multiaventura" },
  { id: "s2", activityName: "Paintball · Saltapark", locationMain: "Cambrils · Parque multiaventura" },
  { id: "b1", activityName: "Circuito de tirolinas", locationMain: "Salou · Parque de aventura" },
];

prueba("PortAventura: la de un día y un parque, sola", () => {
  const [pa] = actividadesPedidas(ESCOLA_ULL, 2027);
  const c = candidatasDe(actividadesPedidas(ESCOLA_ULL, 2027).find((x) => x.clave === "portaventura")!, CATALOGO);
  assert.deepEqual(c.map((x) => x.id), ["pa1"]);
  assert.ok(pa);
});

prueba("multiaventura en Cambrils: varias de Saltapark, se elige a mano", () => {
  const multi = actividadesPedidas(ESCOLA_ULL, 2027).find((x) => x.clave === "multiaventura")!;
  assert.deepEqual(candidatasDe(multi, CATALOGO).map((x) => x.id), ["s1", "s2"]);
});

prueba("el esbozo coge el periodo del día del parque y la modalidad pedida", () => {
  const tarifas = [
    { id: "jb", ageLabel: "Joven/Secundaria/Uni (12-17) · Entrada · Periodo B", salePvpAmount: 44 },
    { id: "jc", ageLabel: "Joven/Secundaria/Uni (12-17) · Entrada · Periodo C", salePvpAmount: 47 },
    { id: "jcp", ageLabel: "Joven/Secundaria/Uni (12-17) · Entrada + Ticket Plus · Periodo C", salePvpAmount: 52 },
    { id: "jbp", ageLabel: "Joven/Secundaria/Uni (12-17) · Entrada + Ticket Plus · Periodo B", salePvpAmount: 49 },
    { id: "ac", ageLabel: "Adulto (18-59) · Entrada · Periodo C", salePvpAmount: 55 },
    { id: "acp", ageLabel: "Adulto (18-59) · Entrada + Ticket Plus · Periodo C", salePvpAmount: 60 },
  ];
  const lineas = lineasPorDefecto(tarifas, 80, 5, { min: 12, max: 16 }, { periodos: ["C"], modalidad: "Ticket Plus" });
  assert.equal(lineas[0].rateId, "jcp");
  assert.equal(lineas[0].cantidad, 80);
  assert.equal(lineas[1].rateId, "acp", "los profesores, con la misma entrada y el mismo periodo");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
