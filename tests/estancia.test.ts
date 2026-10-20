/**
 * La estancia noche a noche y por tipo de persona (Ruth, 19/10/2026): el
 * suplemento de individual y doble de los profesores, MP y PC mezcladas, y el
 * chófer con su habitación y su pensión. Con los precios reales del 4R 3*.
 *
 * Cómo correrla:  npm run test:estancia
 */
import assert from "node:assert/strict";

import {
  COMPOSICION_POR_DEFECTO,
  precioDeLaEstancia,
  suplementosDeHabitacion,
  textoDelDesglose,
  type ComposicionDeLaEstancia,
  type TarifaDeHotel,
} from "../src/domain/estancia";
import { desgloseDeLaOpcion, precioPorEstancia } from "../src/domain/desgloseDeOpcion";

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

// El 4R 3*, T. Baja del 12/03 al 28/05, en múltiple: tramos por noches.
const periodo = { dateFrom: "2027-03-12", dateTo: "2027-05-28", occupancyLabel: "Múltiple" };
const R4: TarifaDeHotel[] = [
  { ...periodo, boardType: "MP", minNights: 1, precio: 36.29 },
  { ...periodo, boardType: "MP", minNights: 3, precio: 33.26 },
  { ...periodo, boardType: "MP", minNights: 4, precio: 30.24 },
  { ...periodo, boardType: "PC", minNights: 1, precio: 40.61 },
  { ...periodo, boardType: "PC", minNights: 3, precio: 37.58 },
  { ...periodo, boardType: "PC", minNights: 4, precio: 34.56 },
];
// Lo que leyó la IA de la columna «Suplementos» del Excel de Ruth.
const SUPLEMENTOS_4R = suplementosDeHabitacion([
  { concept: "Sábado / víspera de festivo", amountType: "porcentaje", amount: 25 },
  { concept: "Habitación individual", amountType: "porcentaje", amount: 75 },
  { concept: "Habitación doble profesores", amountType: "porcentaje", amount: 10 },
  { concept: "Servicio extra (desayuno/almuerzo/cena)", amountType: "importe", amount: 9 },
]);

const composicion = (cambios: Partial<ComposicionDeLaEstancia>): ComposicionDeLaEstancia => ({
  ...COMPOSICION_POR_DEFECTO,
  ...cambios,
});

const estancia = (noches: number, comp: ComposicionDeLaEstancia, elegida = R4[0]) =>
  precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches,
    alumnos: 50,
    profesores: 3,
    composicion: comp,
    elegida,
    otras: R4.filter((t) => t !== elegida),
    suplementos: SUPLEMENTOS_4R,
  });

prueba("los suplementos de habitación se leen del documento", () => {
  assert.deepEqual(SUPLEMENTOS_4R.individual, { tipo: "PCT", valor: 75 });
  assert.deepEqual(SUPLEMENTOS_4R.doble, { tipo: "PCT", valor: 10 });
  // El de sábado / víspera es una regla por noche (20/10/2026).
  assert.equal(SUPLEMENTOS_4R.porNoche?.length, 1);
  assert.deepEqual(
    suplementosDeHabitacion([{ concept: "Estudiantes en doble", amountType: "porcentaje", amount: 25 }]),
    {},
    "el de estudiantes en doble no es de los profesores",
  );
});

prueba("el caso de Ruth: 1 noche MP, profesores en individual = múltiple + 75 %", () => {
  const r = estancia(1, composicion({}));
  assert.equal(r.noches[0].alumno.precio, 36.29);
  assert.equal(r.noches[0].profesor.precio, 63.51, "36,29 × 1,75");
  assert.match(r.noches[0].profesor.como, /individual \(suplemento \+75 %\)/);
  assert.equal(r.total, 36.29 * 50 + 63.51 * 3);
});

prueba("profesores en doble: + 10 %", () => {
  const r = estancia(1, composicion({ profesores: { habitacion: "DOBLE", regimen: "" } }));
  assert.equal(r.noches[0].profesor.precio, 39.92);
});

prueba("el tramo por noches se respeta: 3 noches en MP a 33,26", () => {
  const r = estancia(3, composicion({}));
  assert.equal(r.tramos.length, 1);
  assert.equal(r.tramos[0].alumno.precio, 33.26);
  assert.equal(r.porAlumno, 99.78);
});

prueba("MP y PC mezcladas: 2 noches MP y 1 PC, cada una a su tarifa", () => {
  const r = estancia(3, composicion({ regimenPorNoche: ["MP", "MP", "PC"] }));
  assert.equal(r.regimenes, "MP + PC");
  assert.deepEqual(r.tramos.map((t) => [t.regimen, t.noches, t.alumno.precio]), [["MP", 2, 33.26], ["PC", 1, 37.58]]);
  assert.equal(r.porAlumno, 33.26 * 2 + 37.58);
});

prueba("el chófer con su habitación y su propia pensión", () => {
  const r = estancia(2, composicion({ chofer: { cantidad: 1, habitacion: "INDIVIDUAL", regimen: "PC" } }));
  assert.equal(r.noches[0].regimen, "MP");
  assert.equal(r.noches[0].chofer?.regimen, "PC");
  assert.equal(r.noches[0].chofer?.precio, 71.07, "PC 1-2 noches 40,61 × 1,75");
  assert.equal(r.total, (36.29 * 50 + 63.51 * 3 + 71.07) * 2);
});

prueba("sin tarifa de esa pensión: va en la del grupo, lo dice la noche y se avisa", () => {
  const soloMp = R4.filter((t) => t.boardType === "MP");
  const r = precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches: 1,
    alumnos: 10,
    profesores: 0,
    composicion: composicion({ regimenPorNoche: ["PC"] }),
    elegida: soloMp[0],
    otras: soloMp.slice(1),
    suplementos: {},
  });
  assert.equal(r.noches[0].alumno.precio, 36.29);
  // La noche dice la pensión que se cobra, no la pedida: el documento no puede decir «PC» a precio de MP.
  assert.equal(r.noches[0].regimen, "MP");
  assert.equal(r.regimenes, "MP");
  assert.deepEqual(r.avisos, ["El hotel no tiene pensión completa para la noche del 23/03: van en media pensión."]);
});

prueba("sin tarifa ni suplemento de individual: precio de múltiple, avisando", () => {
  const r = precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches: 1,
    alumnos: 10,
    profesores: 2,
    composicion: composicion({}),
    elegida: R4[0],
    otras: [],
    suplementos: {},
  });
  assert.equal(r.noches[0].profesor.precio, 36.29);
  assert.match(r.avisos.join(" "), /no tiene tarifa ni suplemento de habitación individual/);
});

prueba("una tarifa individual propia del hotel manda sobre el suplemento", () => {
  const r = precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches: 1,
    alumnos: 10,
    profesores: 1,
    composicion: composicion({}),
    elegida: R4[0],
    otras: [...R4.slice(1), { ...periodo, occupancyLabel: "Individual", boardType: "MP", minNights: 1, precio: 55 }],
    suplementos: SUPLEMENTOS_4R,
  });
  assert.equal(r.noches[0].profesor.precio, 55);
});

prueba("el desglose se escribe y se vuelve a leer igual (Servicios Contratados y PDF)", () => {
  const r = estancia(3, composicion({ regimenPorNoche: ["MP", "MP", "PC"], chofer: { cantidad: 1, habitacion: "INDIVIDUAL", regimen: "" } }));
  const texto = textoDelDesglose(r, 50, 3, 1);
  const d = desgloseDeLaOpcion(texto, null)!;
  assert.equal(d.noches, 3);
  assert.deepEqual(d.tramos.map((t) => [t.regimen, t.noches, t.alumnos.precio, t.profesores?.habitacion, t.chofer?.pax]), [
    ["MP", 2, 33.26, "INDIVIDUAL", 1],
    ["PC", 1, 37.58, "INDIVIDUAL", 1],
  ]);
  assert.equal(precioPorEstancia(d).alumno, r.porAlumno);
});

prueba("con un solo tramo y sin chófer, el texto de siempre", () => {
  const r = estancia(1, composicion({}));
  assert.equal(
    textoDelDesglose(r, 50, 3, 0),
    "36,29 € x 50 alumnos + 63,51 € x 3 profesores (uso individual, suplemento +75 %), por noche x 1 noche",
  );
});

prueba("«Múltiple (doble/triple/cuádruple)» es la de los alumnos, no la doble (Hotel Planas)", () => {
  const multi = { occupancyLabel: "Múltiple (doble/triple/cuádruple)" };
  const planas: TarifaDeHotel[] = [
    { ...multi, boardType: "PC", minNights: 1, precio: 49.61 },
    { ...multi, boardType: "MP", minNights: 1, precio: 41.64 },
  ];
  const r = precioDeLaEstancia({
    fechaEntrada: "2027-06-05",
    noches: 2,
    alumnos: 25,
    profesores: 2,
    composicion: composicion({ regimenPorNoche: ["PC", "MP"], profesores: { habitacion: "DOBLE", regimen: "" } }),
    elegida: planas[0],
    otras: planas.slice(1),
    suplementos: suplementosDeHabitacion([{ concept: "Habitación individual", amountType: "importe", amount: 25 }]),
  });
  // La MP existe: se cobra la suya, sin avisar de que falta.
  assert.deepEqual(r.noches.map((n) => n.alumno.precio), [49.61, 41.64]);
  assert.ok(!r.avisos.some((a) => a.includes("media pensión")), r.avisos.join(" | "));
  // Sin doble ni suplemento de doble: múltiple, avisando, y el texto lo dice así.
  assert.deepEqual(r.noches.map((n) => n.profesor.precio), [49.61, 41.64]);
  assert.ok(r.avisos.some((a) => a.includes("habitación doble")), r.avisos.join(" | "));
  const texto = textoDelDesglose(r, 25, 2, 0);
  assert.ok(texto.includes("(sin tarifa de doble: precio de múltiple)"), texto);
  const d = desgloseDeLaOpcion(texto, null)!;
  assert.equal(d.tramos[0].profesores?.habitacion, "MULTIPLE");
  assert.equal(d.tramos[0].profesores?.individual, false);
});

prueba("los suplementos de sábado y de estancia corta del documento se aplican a su noche", () => {
  // 4R: «Sábado / víspera de festivo +25 %, aplicable a estancias de 1-2 noches». 05/06/2027 es sábado.
  const sup4R = suplementosDeHabitacion([
    { adjustmentType: "suplemento", concept: "Sábado / víspera de festivo", amountType: "porcentaje", amount: 25, conditionText: "Aplicable a estancias de 1-2 noches", appliesPer: "estancia" },
    { adjustmentType: "suplemento", concept: "Habitación individual", amountType: "porcentaje", amount: 75, conditionText: "Sobre precio de habitación múltiple" },
    { adjustmentType: "depósito", concept: "Fianza/depósito reembolsable", amountType: "importe", amount: 20, conditionText: "Devuelto en check-out" },
  ]);
  assert.equal(sup4R.porNoche?.length, 1);
  const junio = { dateFrom: "2027-05-29", dateTo: "2027-06-06", occupancyLabel: "Múltiple" };
  const tarifas: TarifaDeHotel[] = [{ ...junio, boardType: "PC", minNights: 1, precio: 41.47 }, { ...junio, boardType: "PC", minNights: 3, precio: 38.12 }];
  const dos = precioDeLaEstancia({ fechaEntrada: "2027-06-05", noches: 2, alumnos: 25, profesores: 2, composicion: composicion({}), elegida: tarifas[0], otras: tarifas.slice(1), suplementos: sup4R });
  // Sábado 05/06: 41,47 × 1,25 = 51,84. Domingo 06/06: 41,47.
  assert.deepEqual(dos.noches.map((n) => n.alumno.precio), [51.84, 41.47]);
  assert.deepEqual(dos.noches[0].suplementos, ["Sábado / víspera de festivo +25 %"]);
  // El profesor en individual: 41,47 × 1,75 = 72,57 y después +25 % = 90,71.
  assert.equal(dos.noches[0].profesor.precio, 90.71);
  assert.ok(dos.avisos.some((x) => x.includes("Suplemento del hotel aplicado a la noche del 05/06")));
  assert.match(textoDelDesglose(dos, 25, 2, 0), /51,84 € x 25 alumnos \(Sábado \/ víspera de festivo \+25 %\)/);
  // Con 5 noches no es «estancia de 1-2 noches»: no se aplica.
  const cinco = precioDeLaEstancia({ fechaEntrada: "2027-06-05", noches: 5, alumnos: 25, profesores: 2, composicion: composicion({}), elegida: tarifas[1], otras: tarifas, suplementos: sup4R });
  assert.equal(cinco.noches[0].alumno.precio, 38.12);
  assert.equal(cinco.noches[0].suplementos, undefined);
});

prueba("sábados siempre (Santa Mónica +15 %), ≤2 noches +20 % (Eurosalou), fin de semana +4 € (Canada Palace), 1 noche +6 € (Calypso)", () => {
  const todo = { dateFrom: "2027-06-01", dateTo: "2027-06-30", occupancyLabel: "Múltiple", boardType: "PC", minNights: 1 };
  const una: TarifaDeHotel[] = [{ ...todo, precio: 100 }];
  const estancia = (sup: ReturnType<typeof suplementosDeHabitacion>, noches: number) =>
    precioDeLaEstancia({ fechaEntrada: "2027-06-04", noches, alumnos: 10, profesores: 0, composicion: composicion({}), elegida: una[0], otras: [], suplementos: sup });
  // Viernes 04/06, sábado 05/06, domingo 06/06.
  const sabados = estancia(suplementosDeHabitacion([{ adjustmentType: "supplement", concept: "Noches de sábado, festivo o víspera", amountType: "percentage", amount: 15, conditionText: "Noches de sábado, festivo o víspera", appliesPer: "noche" }]), 3);
  assert.deepEqual(sabados.noches.map((n) => n.alumno.precio), [100, 115, 100]);
  assert.ok(sabados.avisos.some((x) => x.includes("festivos y vísperas no se comprueban")));
  const corta = suplementosDeHabitacion([{ adjustmentType: "suplemento", concept: "Estancias de 2 noches o menos", amountType: "porcentaje", amount: 20, conditionText: "Estancias de 2 noches o menos: +20%", appliesPer: "estancia" }]);
  assert.deepEqual(estancia(corta, 2).noches.map((n) => n.alumno.precio), [120, 120]);
  assert.deepEqual(estancia(corta, 3).noches.map((n) => n.alumno.precio), [100, 100, 100]);
  const finde = suplementosDeHabitacion([{ adjustmentType: "supplement", concept: "Suplemento fin de semana (1-2 noches)", amountType: "fixed", amount: 4, conditionText: "Estancias de fin de semana de 1-2 noches", appliesPer: "pax/noche" }]);
  assert.deepEqual(estancia(finde, 2).noches.map((n) => n.alumno.precio), [104, 104]);
  const unaNoche = suplementosDeHabitacion([{ adjustmentType: "supplement", concept: "Corta estancia 1 noche", amountType: "fixed", amount: 6, conditionText: "Estancias de 1 noche", appliesPer: "pax" }]);
  assert.deepEqual(estancia(unaNoche, 1).noches.map((n) => n.alumno.precio), [106]);
  assert.deepEqual(estancia(unaNoche, 2).noches.map((n) => n.alumno.precio), [100, 100]);
  // California: +10 % 1-2 noches en todos los periodos excepto 12/06–25/06.
  const california = suplementosDeHabitacion([{ adjustmentType: "supplement", concept: "Estancia de 1-2 noches", amountType: "percentage", amount: 10, conditionText: "En todos los períodos, excepto 12/06–25/06", appliesPer: "estancia" }]);
  assert.deepEqual(estancia(california, 2).noches.map((n) => n.alumno.precio), [110, 110]);
  const dentroDeLaExcepcion = precioDeLaEstancia({ fechaEntrada: "2027-06-14", noches: 2, alumnos: 10, profesores: 0, composicion: composicion({}), elegida: una[0], otras: [], suplementos: california });
  assert.deepEqual(dentroDeLaExcepcion.noches.map((n) => n.alumno.precio), [100, 100]);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
