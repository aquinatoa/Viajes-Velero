/**
 * Las líneas de una actividad: tarifa × cantidad, con un primer esbozo por
 * edad del grupo. Anthony, 08/10/2026: «no todos son adultos, no todos son
 * discapacitados».
 *
 * Cómo correrla:  npm run test:lineas
 */
import assert from "node:assert/strict";

import { gratuidadDeProfesores } from "../src/domain/gratuidadDeActividad";
import {
  avisosDeLaTarifa,
  edadDeEtiqueta,
  esPorUnidad,
  textoDeLaUnidad,
  unidadDeTarifa,
  lineasPorDefecto,
  porAlumno,
  resumenDeLineas,
  totalDeLineas,
  tramoDelGrupo,
} from "../src/domain/lineasDeActividad";

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

// Las tarifas reales de «1 día Caribe Aquatic Park» (publicadas en local).
const t = (id: string, ageLabel: string, precio: number) => ({ id, ageLabel, salePvpAmount: precio });
const CARIBE = [
  t("disc-b", "Pax con Discapacidad · Entrada · Periodo B", 12),
  t("adu-b", "Adulto (18-59) · Entrada · Periodo B", 23),
  t("adu-c", "Adulto (18-59) · Entrada · Periodo C", 28),
  t("adu-plus-b", "Adulto · Entrada + Ticket Plus · Periodo B", 45),
  t("jov-b", "Joven/Secundaria/Uni (12-17) · Entrada · Periodo B", 17),
  t("jov-c", "Joven/Secundaria/Uni (12-17) · Entrada · Periodo C", 25),
  t("jov-plus-b", "Joven/Secundaria/Uni · Entrada + Ticket Plus · Periodo B", 32),
  t("jun-b", "Júnior/Primaria (4-11) · Entrada · Periodo B", 15),
  t("sen-b", "Sénior (desde 60) · Entrada · Periodo B", 17),
];

console.log("Edades");

prueba("la edad se lee de la etiqueta de la tarifa", () => {
  assert.deepEqual(edadDeEtiqueta("Joven/Secundaria/Uni (12-17) · Entrada · Periodo B"), { min: 12, max: 17 });
  assert.deepEqual(edadDeEtiqueta("Sénior (desde 60) · Entrada"), { min: 60, max: null });
  assert.deepEqual(edadDeEtiqueta("Adulto (18-59)"), { min: 18, max: 59 });
  assert.equal(edadDeEtiqueta("Pax con Discapacidad · Entrada"), null);
  assert.equal(edadDeEtiqueta(null), null);
});

prueba("la edad del grupo se lee de lo que dijo el colegio", () => {
  assert.deepEqual(tramoDelGrupo("14-15"), { min: 14, max: 15 });
  assert.deepEqual(tramoDelGrupo("de 15 a 17 años"), { min: 15, max: 17 });
  assert.deepEqual(tramoDelGrupo("", "15 años"), { min: 15, max: 15 });
  assert.equal(tramoDelGrupo("", ""), null);
});

console.log("El esbozo por defecto");

prueba("la edad también se lee en palabras: Júnior/Primaria, Joven/Secundaria, Adulto, «Desde 15 años»", () => {
  assert.deepEqual(edadDeEtiqueta("Júnior/Primaria · Entrada · Periodo A"), { min: 4, max: 11 });
  assert.deepEqual(edadDeEtiqueta("Joven/Secundaria/Uni · Entrada · Periodo A"), { min: 12, max: 17 });
  assert.deepEqual(edadDeEtiqueta("Adulto · Entrada + Ticket Plus · Periodo D"), { min: 18, max: 59 });
  assert.deepEqual(edadDeEtiqueta("Sénior · Entrada · Periodo A"), { min: 60, max: null });
  assert.deepEqual(edadDeEtiqueta("Desde 15 años"), { min: 15, max: null });
  assert.equal(edadDeEtiqueta("Pax con Discapacidad · Entrada · Periodo B"), null);
});

prueba("PortAventura Park sin paréntesis: 14-15 años va a Joven, no a Júnior ni a la PROMO", () => {
  const park = [
    t("jun-a", "Júnior/Primaria · Entrada · Periodo A", 19),
    t("jov-a", "Joven/Secundaria/Uni · Entrada · Periodo A", 27),
    t("adu-a", "Adulto · Entrada · Periodo A", 32),
    t("promo-prim-a", "PROMO Early Bird Primaria · Entrada · Periodo A", 14),
    t("disc-a", "Pax con Discapacidad · Entrada · Periodo A", 19),
  ];
  const lineas = lineasPorDefecto(park, 25, 2, { min: 14, max: 15 });
  assert.deepEqual(lineas.map((l) => [l.rateId, l.cantidad]), [["jov-a", 25], ["adu-a", 2]]);
});

prueba("con el periodo del viaje, solo las tarifas de ese periodo", () => {
  const park = [
    t("jov-a", "Joven/Secundaria/Uni · Entrada · Periodo A", 27),
    t("jov-c", "Joven/Secundaria/Uni · Entrada · Periodo C", 37),
    t("adu-a", "Adulto · Entrada · Periodo A", 32),
    t("adu-c", "Adulto · Entrada · Periodo C", 46),
  ];
  const lineas = lineasPorDefecto(park, 25, 2, { min: 14, max: 15 }, { periodos: ["C", "B"] });
  assert.deepEqual(lineas.map((l) => [l.rateId, l.cantidad]), [["jov-c", 25], ["adu-c", 2]]);
});

prueba("una tarifa por grupo de 8 no se multiplica por persona: tantos grupos como hagan falta", () => {
  const bubble = [{ ...t("g", "Grupos de 8 pax", 171), rateUnit: "PER_GROUP", minPax: 8, maxPax: 8 }];
  const lineas = lineasPorDefecto(bubble, 25, 2, { min: 14, max: 15 });
  assert.deepEqual(lineas.map((l) => [l.rateId, l.cantidad, l.precio]), [["g", 4, 171]]);
  assert.equal(totalDeLineas(lineas), 684);
  const hora = [{ ...t("h", "1 hora (60 min)", 672), rateUnit: "PER_HOUR" }];
  assert.deepEqual(lineasPorDefecto(hora, 25, 2, null).map((l) => [l.rateId, l.cantidad]), [["h", 1]]);
});

prueba("la unidad escrita como venga en la revisión: «por persona» y «per_person» son por persona", () => {
  // Producción, 21/10/2026: PortAventura («per_person») y Caribe («por persona»)
  // salían como UNA entrada para todo el grupo.
  for (const u of ["por persona", "per_person", "PER_PAX", "per pax", "per pax / day", "pax/actividad", "Por Persona"]) {
    assert.equal(unidadDeTarifa(u), "PER_PAX", u);
    assert.equal(esPorUnidad(u), false, u);
  }
  const caribe = [{ ...t("c", "Joven/Secundaria/Uni (12-17)", 17), rateUnit: "por persona" }];
  assert.deepEqual(lineasPorDefecto(caribe, 25, 2, { min: 14, max: 15 }).map((l) => [l.rateId, l.cantidad]), [["c", 27]]);
  const pa = [{ ...t("p", "Joven/Secundaria (12-17) · Entrada", 36), rateUnit: "per_person" }];
  assert.equal(totalDeLineas(lineasPorDefecto(pa, 25, 2, { min: 14, max: 15 })), 27 * 36);
  // Lo que no se entiende, por persona: nunca de menos.
  assert.equal(unidadDeTarifa("xyz"), null);
  assert.equal(esPorUnidad("xyz"), false);
  assert.equal(esPorUnidad(null), false);
  assert.equal(esPorUnidad("UNKNOWN"), false);
});

prueba("Miniestadi y compañía: «por equipo» es del grupo (Ricard, 21/10: «precio para la hora por el grupo»)", () => {
  assert.equal(unidadDeTarifa("por equipo"), "PER_GROUP");
  const mini = [{ ...t("m", "1 hora (60 min)", 672), rateUnit: "por equipo" }];
  const lineas = lineasPorDefecto(mini, 25, 2, null);
  assert.deepEqual(lineas.map((l) => [l.rateId, l.cantidad, l.precio]), [["m", 1, 672]]);
  assert.equal(textoDeLaUnidad({ rateUnit: "por equipo" }), "por grupo");
  for (const [u, codigo, texto] of [
    ["por partido", "PER_SERVICE", "por partido"],
    ["per match", "PER_SERVICE", "por servicio"],
    ["servicio", "PER_SERVICE", "por servicio"],
    ["per rental", "PER_SERVICE", "por servicio"],
    ["per hour", "PER_HOUR", "por hora"],
    ["per team", "PER_GROUP", "por grupo"],
    ["por unidad", "PER_UNIT", "por unidad"],
    ["per ball", "PER_UNIT", "por unidad"],
    ["PER_GROUP", "PER_GROUP", "por grupo"],
  ] as const) {
    assert.equal(unidadDeTarifa(u), codigo, u);
    assert.equal(esPorUnidad(u), true, u);
    assert.equal(textoDeLaUnidad({ rateUnit: u }), texto, u);
  }
});

prueba("la gratuidad del proveedor: los profesores gratis van en su línea a 0 €", () => {
  const unica = [t("u", "", 40)];
  const porCada = gratuidadDeProfesores([{ policyType: "SPECIAL_NOTES", policyText: "Gratuidades: 1 profesor gratis por cada 10 alumnos de pago." }]);
  const lineas = lineasPorDefecto(unica, 25, 3, null, { gratuidad: porCada });
  assert.deepEqual(lineas.map((l) => [l.rateId, l.cantidad, l.precio]), [["u", 26, 40], ["u#gratis", 2, 0]]);
  assert.equal(totalDeLineas(lineas), 26 * 40);
  const todos = gratuidadDeProfesores([{ policyType: "SPECIAL_NOTES", policyText: "Gratuidades: Profesores acompañantes gratis." }]);
  assert.deepEqual(lineasPorDefecto(unica, 25, 3, null, { gratuidad: todos }).map((l) => [l.rateId, l.cantidad]), [["u", 25], ["u#gratis", 3]]);
  assert.equal(gratuidadDeProfesores([{ policyType: "SPECIAL_NOTES", policyText: "Gratuidades: Consultar" }])?.tipo, "consultar");
  assert.equal(gratuidadDeProfesores([{ policyType: "CANCELLATION", policyText: "Cancelación: 100 %" }]), null);
});

prueba("lo que no encaja entre la tarifa y el grupo se avisa", () => {
  const diez = { ...t("k", "Hasta 10 pax", 30), minPax: null, maxPax: 10 };
  assert.deepEqual(avisosDeLaTarifa(diez, 25, 2, { min: 14, max: 15 }), ["Tarifa para grupos de hasta 10: el grupo son 27."]);
  const quince = { ...t("b", "Desde 15 años", 30) };
  assert.deepEqual(avisosDeLaTarifa(quince, 25, 2, { min: 14, max: 15 }), ["Desde 15 años: en el grupo hay alumnos de 14."]);
  assert.deepEqual(avisosDeLaTarifa(t("u", "", 40), 25, 2, { min: 14, max: 15 }), []);
});

prueba("3º de ESO (14-15): alumnos en Joven · Entrada · Periodo B, profesores en Adulto · Entrada · Periodo B", () => {
  const lineas = lineasPorDefecto(CARIBE, 25, 2, { min: 14, max: 15 });
  assert.deepEqual(
    lineas.map((l) => [l.rateId, l.cantidad, l.precio]),
    [
      ["jov-b", 25, 17],
      ["adu-b", 2, 23],
    ],
  );
  assert.equal(totalDeLineas(lineas), 25 * 17 + 2 * 23);
  assert.equal(porAlumno(lineas, 25), Math.round(((25 * 17 + 2 * 23) / 25) * 100) / 100);
});

prueba("primaria (8-10) va a Júnior; nunca a «Pax con Discapacidad» aunque sea la más barata", () => {
  const lineas = lineasPorDefecto(CARIBE, 30, 3, { min: 8, max: 10 });
  assert.equal(lineas[0].rateId, "jun-b");
  assert.ok(lineas.every((l) => l.rateId !== "disc-b"));
});

prueba("sin edad del grupo: la básica más barata que no sea especial ni de adulto", () => {
  const lineas = lineasPorDefecto(CARIBE, 20, 0, null);
  assert.equal(lineas.length, 1);
  assert.equal(lineas[0].rateId, "jun-b");
});

prueba("una actividad de tarifa única: una línea con todos", () => {
  const lineas = lineasPorDefecto([t("u", "", 40)], 20, 2, { min: 14, max: 15 });
  assert.deepEqual(lineas.map((l) => [l.rateId, l.cantidad]), [["u", 22]]);
  assert.equal(lineas[0].etiqueta, "Tarifa única");
});

prueba("sin tarifas con precio no hay líneas", () => {
  assert.deepEqual(lineasPorDefecto([t("x", "Adulto", 0)], 20, 2, null), []);
});

prueba("el resumen dice cada línea y el total", () => {
  const lineas = lineasPorDefecto(CARIBE, 25, 2, { min: 14, max: 15 });
  assert.equal(
    resumenDeLineas(lineas),
    "25 × 17,00 € Joven/Secundaria/Uni (12-17) · Entrada · Periodo B + 2 × 23,00 € Adulto (18-59) · Entrada · Periodo B = 471,00 €",
  );
  assert.equal(resumenDeLineas([]), "");
  assert.equal(resumenDeLineas([{ rateId: "a", etiqueta: "x", precio: 5, cantidad: 0 }]), "");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
