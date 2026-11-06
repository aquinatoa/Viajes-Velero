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
  costesDelTramo,
  gruposDeAlumnosPorTarifa,
  gruposDeChoferPorTarifa,
  gruposDeProfesoresPorTarifa,
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

prueba("profesores y chófer repartidos en varias habitaciones, cada una con su pensión (Ruth, 21/10)", () => {
  // 4R, 23/03, 2 noches en MP (1-2 noches: 36,29 €). 3 profesores: 1 en individual
  // (la principal) y 2 en doble con PC. 2 chóferes: 1 en individual y 1 en múltiple.
  const comp = composicion({
    profesores: { habitacion: "INDIVIDUAL", regimen: "" },
    profesoresOtros: [{ cantidad: 2, habitacion: "DOBLE", regimen: "PC" }],
    chofer: { cantidad: 2, habitacion: "INDIVIDUAL", regimen: "" },
    choferOtros: [{ cantidad: 1, habitacion: "MULTIPLE", regimen: "" }],
  });
  const r = estancia(2, comp);
  const n = r.noches[0];
  assert.equal(n.profesor.precio, 63.51); // 36,29 × 1,75
  assert.equal(n.profesoresOtros?.length, 1);
  assert.equal(n.profesoresOtros?.[0].cantidad, 2);
  assert.equal(n.profesoresOtros?.[0].regimen, "PC");
  assert.equal(n.profesoresOtros?.[0].precio, 44.67); // PC 40,61 × 1,10
  assert.equal(n.chofer?.precio, 63.51);
  assert.equal(n.choferOtros?.[0].precio, 36.29);
  // Total: 50 × 36,29 + 1 × 63,51 + 2 × 44,67 + 1 × 63,51 + 1 × 36,29, por 2 noches.
  const esperado = Math.round((50 * 36.29 + 63.51 + 2 * 44.67 + 63.51 + 36.29) * 2 * 100) / 100;
  assert.equal(r.total, esperado);
  // El desglose: una entrada por habitación, y se lee igual.
  const texto = textoDelDesglose(r, 50, 3, 2);
  assert.match(texto, /63,51 € x 1 profesores \(uso individual, suplemento \+75 %\)/);
  assert.match(texto, /44,67 € x 2 profesores \(en doble, suplemento \+10 %, PC\)/);
  assert.match(texto, /63,51 € x 1 chófer/);
  assert.match(texto, /36,29 € x 1 chófer \(en múltiple\)/);
  const d = desgloseDeLaOpcion(texto, null)!;
  assert.equal(d.tramos[0].profesoresGrupos?.length, 2);
  assert.deepEqual(d.tramos[0].profesoresGrupos?.map((g) => [g.pax, g.precio, g.habitacion, g.regimen]), [
    [1, 63.51, "INDIVIDUAL", null],
    [2, 44.67, "DOBLE", "PC"],
  ]);
  assert.deepEqual(d.tramos[0].choferGrupos?.map((g) => [g.pax, g.habitacion]), [[1, "INDIVIDUAL"], [1, "MULTIPLE"]]);
  // El coste de cada grupo, en el mismo orden.
  const c = costesDelTramo(r.tramos[0], 50, 3, 2);
  assert.equal(c.profesores?.length, 2);
  assert.equal(c.choferes?.length, 2);
});

prueba("si todos los profesores van a otra habitación, la principal no sale; y no se pasa del total", () => {
  const r = estancia(1, composicion({ profesoresOtros: [{ cantidad: 3, habitacion: "DOBLE", regimen: "" }, { cantidad: 2, habitacion: "MULTIPLE", regimen: "" }] }));
  // Solo 3 profesores: los 3 en doble, el segundo grupo no cabe.
  assert.deepEqual(r.noches[0].profesoresOtros?.map((g) => g.cantidad), [3]);
  const texto = textoDelDesglose(r, 50, 3, 0);
  assert.doesNotMatch(texto, /uso individual/);
  assert.match(texto, /x 3 profesores \(en doble/);
  // Sin reparto, el desglose de siempre.
  const sin = estancia(1, composicion({}));
  assert.equal(sin.noches[0].profesoresOtros, undefined);
  assert.match(textoDelDesglose(sin, 50, 3, 0), /x 3 profesores \(uso individual/);
});


// ── Alumnos en bloques con otra habitación y otra pensión (Oravia, 05/11/2026) ──
//
// «Asignación por colectivo (alumnos/profesores), tipo de habitación y régimen».
// Los profesores y el chófer ya podían ir en otra habitación y con otra pensión;
// los alumnos, no. Aquí se parte el grupo: el principal, como siempre, y bloques
// aparte con su habitación y su pensión.

const conBloques = (noches: number, bloques: ComposicionDeLaEstancia["alumnosOtros"], sobre: Partial<ComposicionDeLaEstancia> = {}) =>
  estancia(noches, composicion({ alumnosOtros: bloques, ...sobre }));

prueba("un bloque de alumnos en doble y con PC se cobra aparte y el resto, como siempre", () => {
  const r = conBloques(1, [{ cantidad: 10, habitacion: "DOBLE", regimen: "PC" }]);
  const n = r.noches[0];
  assert.equal(n.alumno.precio, 36.29, "el grupo principal, en MP, como siempre");
  assert.equal(n.alumnosOtros?.length, 1);
  assert.equal(n.alumnosOtros?.[0].cantidad, 10);
  assert.equal(n.alumnosOtros?.[0].regimen, "PC");
  assert.equal(n.alumnosOtros?.[0].precio, 44.67, "PC 40,61 con el suplemento de doble +10 %");
  // 40 alumnos a 36,29 + 10 a 44,67 + 3 profesores en individual (MP +75 %).
  const profesores = n.profesor.precio * 3;
  assert.equal(r.total, Math.round((36.29 * 40 + 44.67 * 10 + profesores) * 100) / 100);
});

prueba("el precio «por alumno» sigue siendo el del grupo principal: es lo que compara el podio", () => {
  const sin = estancia(2, composicion({}));
  const con = conBloques(2, [{ cantidad: 10, habitacion: "DOBLE", regimen: "PC" }]);
  assert.equal(con.porAlumno, sin.porAlumno);
  assert.ok(con.total > sin.total, "el bloque de PC en doble cuesta más: el total sube");
});

prueba("sin bloques, el cálculo y el texto son EXACTAMENTE los de siempre", () => {
  const sin = estancia(3, composicion({}));
  const vacios = estancia(3, composicion({ alumnosOtros: [] }));
  assert.deepEqual(vacios, sin);
  assert.doesNotMatch(textoDelDesglose(sin, 50, 3, 0), /x \d+ alumnos \(/);
});

prueba("el bloque de alumnos nunca deja al grupo principal vacío", () => {
  const r = conBloques(1, [{ cantidad: 50, habitacion: "DOBLE", regimen: "PC" }]);
  assert.equal(r.noches[0].alumnosOtros?.[0].cantidad, 49, "se recorta a 49 de 50");
  assert.match(textoDelDesglose(r, 50, 3, 0), /x 1 alumnos/);
});

prueba("varios bloques suman, y los que sobran se recortan", () => {
  const r = conBloques(1, [
    { cantidad: 20, habitacion: "DOBLE", regimen: "PC" },
    { cantidad: 40, habitacion: "INDIVIDUAL", regimen: "" },
  ]);
  const cantidades = r.noches[0].alumnosOtros?.map((g) => g.cantidad);
  assert.deepEqual(cantidades, [20, 29], "el segundo se recorta para que quede 1 en el principal");
});

prueba("sin tarifa ni suplemento de esa habitación, va al precio del grupo y lo dice", () => {
  const r = precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches: 1,
    alumnos: 50,
    profesores: 0,
    composicion: composicion({ alumnosOtros: [{ cantidad: 5, habitacion: "INDIVIDUAL", regimen: "" }] }),
    elegida: R4[0],
    otras: R4.slice(1),
    suplementos: {},
  });
  assert.equal(r.noches[0].alumnosOtros?.[0].precio, 36.29);
  assert.ok(r.avisos.some((a) => /alumnos de ese bloque van a precio de/.test(a)), r.avisos.join(" | "));
});

prueba("el desglose escrito lleva el bloque justo después del grupo principal, y se lee de vuelta", () => {
  const r = conBloques(2, [{ cantidad: 10, habitacion: "DOBLE", regimen: "PC" }]);
  const texto = textoDelDesglose(r, 50, 3, 0);
  assert.match(texto, /^[\d.,]+ € x 40 alumnos \+ [\d.,]+ € x 10 alumnos \(en doble, suplemento \+10 %, PC\) \+ /);
  const d = desgloseDeLaOpcion(texto, "5.000,00 €");
  assert.equal(d?.alumnos.pax, 40, "el primero que se lee es el principal");
  const tramo = d?.tramos[0];
  assert.equal(tramo?.alumnosGrupos?.length, 1);
  assert.equal(tramo?.alumnosGrupos?.[0].pax, 10);
  assert.equal(tramo?.alumnosGrupos?.[0].habitacion, "DOBLE");
  assert.equal(tramo?.alumnosGrupos?.[0].regimen, "PC");
  // Y el precio por alumno de la estancia sigue siendo el del principal.
  assert.equal(precioPorEstancia(d!).alumno, r.porAlumno);
});

prueba("un texto de siempre, sin bloques, se lee sin `alumnosGrupos`", () => {
  const d = desgloseDeLaOpcion("43,13 € x 48 alumnos + 60,11 € x 8 profesores (uso individual), por noche x 4 noches", "9.661,12 €");
  assert.equal(d?.tramos[0].alumnosGrupos, undefined);
  assert.equal(d?.alumnos.pax, 48);
});

prueba("los suplementos del grupo principal entre paréntesis NO se toman por un bloque", () => {
  const d = desgloseDeLaOpcion("47,65 € x 50 alumnos (Sábado / víspera de festivo +25 %) + 63,51 € x 3 profesores (uso individual), por noche x 1 noche", "3.000,00 €");
  assert.equal(d?.tramos[0].alumnosGrupos, undefined);
  assert.equal(d?.alumnos.pax, 50);
});

prueba("el coste de cada bloque se guarda en el mismo orden que el desglose", () => {
  const conCoste: TarifaDeHotel[] = R4.map((t) => ({ ...t, coste: Math.round(t.precio * 0.8 * 100) / 100 }));
  const r = precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches: 1,
    alumnos: 50,
    profesores: 3,
    composicion: composicion({ alumnosOtros: [{ cantidad: 10, habitacion: "DOBLE", regimen: "PC" }] }),
    elegida: conCoste[0],
    otras: conCoste.slice(1),
    suplementos: SUPLEMENTOS_4R,
  });
  const costes = costesDelTramo(r.tramos[0], 50, 3, 0);
  assert.equal(costes.alumno, conCoste[0].coste);
  assert.equal(costes.alumnos?.length, 2);
  assert.equal(costes.alumnos?.[0], conCoste[0].coste);
  assert.ok((costes.alumnos?.[1] ?? 0) > (costes.alumnos?.[0] ?? 0), "el bloque de PC en doble cuesta más");
});

prueba("sin bloques, `costesDelTramo` no añade la lista de alumnos", () => {
  const r = estancia(1, composicion({}));
  assert.equal(costesDelTramo(r.tramos[0], 50, 3, 0).alumnos, undefined);
});

prueba("el precio medio por alumno cuenta los bloques; sin bloques es el de siempre", () => {
  const sin = estancia(1, composicion({}));
  assert.equal(sin.porAlumnoMedio, sin.porAlumno, "sin bloques son iguales");
  const con = conBloques(1, [{ cantidad: 10, habitacion: "DOBLE", regimen: "PC" }]);
  // 40 a 36,29 y 10 a 44,67, repartido entre los 50.
  assert.equal(con.porAlumnoMedio, Math.round(((36.29 * 40 + 44.67 * 10) / 50) * 100) / 100);
  assert.ok(con.porAlumnoMedio > con.porAlumno, "la media sube: es lo que se compara con el tope del centro");
  assert.equal(con.porAlumno, 36.29, "el del grupo principal no cambia");
});

// ── «Tantos alumnos en ESTA tarifa»: la tabla de tarifas del hotel (06/11/2026) ──
//
// Como en actividades (tarifa × cantidad): en la tabla de «Lo que tiene este
// hotel para estas fechas» se dice cuántos alumnos van en cada tarifa, y el
// precio sale de esa tarifa, no de adivinarla por habitación y pensión.

const APARTAMENTOS: TarifaDeHotel[] = [
  { id: "mp", boardType: "Media pensión", occupancyLabel: "Múltiple", unitName: "Apartamentos (grupos, PPPN)", seasonName: "Única", precio: 43.2 },
  { id: "pc", boardType: "Pensión completa", occupancyLabel: "Múltiple", unitName: "Apartamentos (grupos, PPPN)", seasonName: "Única", precio: 54 },
];
const enApartamentos = (alumnosOtros: ComposicionDeLaEstancia["alumnosOtros"], noches = 4, elegida = APARTAMENTOS[1]) =>
  precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches,
    alumnos: 50,
    profesores: 0,
    composicion: composicion({ alumnosOtros }),
    elegida,
    otras: APARTAMENTOS.filter((t) => t !== elegida),
    suplementos: {},
  });

prueba("gruposDeAlumnosPorTarifa: solo las tarifas con alumnos, sin la elegida, con su habitación y su pensión", () => {
  const grupos = gruposDeAlumnosPorTarifa(APARTAMENTOS, "pc", { mp: 10, pc: 99, otra: 5 });
  assert.deepEqual(grupos, [{ cantidad: 10, habitacion: "MULTIPLE", regimen: "MP", tarifaId: "mp" }]);
  assert.deepEqual(gruposDeAlumnosPorTarifa(APARTAMENTOS, "pc", { mp: 0 }), []);
  assert.deepEqual(gruposDeAlumnosPorTarifa(APARTAMENTOS, "pc", { mp: -3 }), []);
  assert.deepEqual(gruposDeAlumnosPorTarifa(APARTAMENTOS, "pc", {}), []);
});

prueba("el caso de la tabla: 40 alumnos en pensión completa (54 €) y 10 en media pensión (43,20 €)", () => {
  const grupos = gruposDeAlumnosPorTarifa(APARTAMENTOS, "pc", { mp: 10 });
  const r = enApartamentos(grupos);
  const n = r.noches[0];
  assert.equal(n.alumno.precio, 54);
  assert.equal(n.alumnosOtros?.[0].cantidad, 10);
  assert.equal(n.alumnosOtros?.[0].precio, 43.2, "el precio de ESA tarifa");
  assert.equal(n.alumnosOtros?.[0].regimen, "MP");
  assert.equal(n.alumnosOtros?.[0].tarifaId, "mp", "y se sabe de qué tarifa sale");
  assert.equal(r.total, Math.round((54 * 40 + 43.2 * 10) * 4 * 100) / 100);
});

prueba("sin asignar nada, todos los alumnos van en la tarifa elegida, como siempre", () => {
  const r = enApartamentos(gruposDeAlumnosPorTarifa(APARTAMENTOS, "pc", {}));
  assert.equal(r.noches[0].alumnosOtros, undefined);
  assert.equal(r.total, 54 * 50 * 4);
});

prueba("la tarifa que se elige manda aunque haya otra de la misma pensión con distinto servicio", () => {
  const conServicio: TarifaDeHotel[] = [
    { id: "base", boardType: "PC", occupancyLabel: "Múltiple", includedService: "Sin campo", precio: 40 },
    { id: "campo", boardType: "PC", occupancyLabel: "Múltiple", includedService: "Campo natural", precio: 52 },
  ];
  const r = precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches: 1,
    alumnos: 20,
    profesores: 0,
    composicion: composicion({ alumnosOtros: gruposDeAlumnosPorTarifa(conServicio, "base", { campo: 8 }) }),
    elegida: conServicio[0],
    otras: [conServicio[1]],
    suplementos: {},
  });
  assert.equal(r.noches[0].alumno.precio, 40);
  assert.equal(r.noches[0].alumnosOtros?.[0].precio, 52, "la del campo natural, no la de los demás alumnos");
  assert.equal(r.total, 40 * 12 + 52 * 8);
});

prueba("el tramo por noches lo decide el viaje: asignar a la fila de «1 noche» cobra el tramo que toca", () => {
  const tramos: TarifaDeHotel[] = [
    { id: "p1", boardType: "PC", occupancyLabel: "Múltiple", minNights: 1, precio: 40.61 },
    { id: "p4", boardType: "PC", occupancyLabel: "Múltiple", minNights: 4, precio: 34.56 },
    { id: "m4", boardType: "MP", occupancyLabel: "Múltiple", minNights: 4, precio: 30.24 },
    { id: "m1", boardType: "MP", occupancyLabel: "Múltiple", minNights: 1, precio: 36.29 },
  ];
  const r = precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches: 4,
    alumnos: 30,
    profesores: 0,
    composicion: composicion({ alumnosOtros: gruposDeAlumnosPorTarifa(tramos, "p4", { m1: 10 }) }),
    elegida: tramos[1],
    otras: tramos.filter((t) => t !== tramos[1]),
    suplementos: {},
  });
  assert.equal(r.noches[0].alumno.precio, 34.56);
  assert.equal(r.noches[0].alumnosOtros?.[0].precio, 30.24, "con 4 noches, la MP de 4 noches, aunque se marcó la de 1");
});

prueba("si la tarifa asignada no vale esa noche, se cae a la forma de siempre y no da NaN", () => {
  const fuera: TarifaDeHotel[] = [
    { id: "a", boardType: "PC", occupancyLabel: "Múltiple", dateFrom: "2027-03-01", dateTo: "2027-06-30", precio: 40 },
    { id: "b", boardType: "MP", occupancyLabel: "Múltiple", dateFrom: "2027-09-01", dateTo: "2027-12-31", precio: 30 },
    { id: "c", boardType: "MP", occupancyLabel: "Múltiple", dateFrom: "2027-03-01", dateTo: "2027-06-30", precio: 33 },
  ];
  const r = precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches: 2,
    alumnos: 10,
    profesores: 0,
    composicion: composicion({ alumnosOtros: gruposDeAlumnosPorTarifa(fuera, "a", { b: 4 }) }),
    elegida: fuera[0],
    otras: fuera.slice(1),
    suplementos: {},
  });
  const bloque = r.noches[0].alumnosOtros?.[0];
  assert.ok(bloque && Number.isFinite(bloque.precio), "tiene precio");
  assert.equal(bloque?.precio, 33, "la MP que sí vale esas fechas");
});

// ── Profesores y chófer en cada tarifa, y la gratuidad del hotel (06/11/2026) ──

const MULTIPLE_SIN_SUPLEMENTO = { profesores: { habitacion: "MULTIPLE" as const, regimen: "" }, chofer: { cantidad: 0, habitacion: "MULTIPLE" as const, regimen: "" } };
const conAcompanantes = (cambios: Partial<ComposicionDeLaEstancia>, profesores = 3, noches = 4) =>
  precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches,
    alumnos: 50,
    profesores,
    composicion: composicion({ ...MULTIPLE_SIN_SUPLEMENTO, ...cambios }),
    elegida: APARTAMENTOS[1],
    otras: APARTAMENTOS.filter((t) => t !== APARTAMENTOS[1]),
    suplementos: {},
  });

prueba("profesores asignados a una tarifa: se cobran por ESA tarifa; los demás, como dice el panel", () => {
  const r = conAcompanantes({ profesoresOtros: gruposDeProfesoresPorTarifa(APARTAMENTOS, { mp: 2 }, 0) });
  const n = r.noches[0];
  assert.equal(n.profesor.precio, 54, "el que queda va en la elegida (múltiple, PC)");
  assert.equal(n.profesoresOtros?.[0].cantidad, 2);
  assert.equal(n.profesoresOtros?.[0].precio, 43.2);
  assert.equal(n.profesoresOtros?.[0].regimen, "MP");
  assert.equal(r.total, Math.round((54 * 50 + 54 * 1 + 43.2 * 2) * 4 * 100) / 100);
});

prueba("una plaza de gratuidad sale con precio 0 y coste 0, y se dice «gratuidad»", () => {
  const r = conAcompanantes({ profesoresOtros: gruposDeProfesoresPorTarifa(APARTAMENTOS, {}, 2) });
  const g = r.noches[0].profesoresOtros?.[0];
  assert.equal(g?.precio, 0);
  assert.equal(g?.coste, 0);
  assert.equal(g?.como, "gratuidad");
  assert.equal(g?.cantidad, 2);
  assert.equal(r.total, Math.round((54 * 50 + 54 * 1) * 4 * 100) / 100, "2 de los 3 profesores no pagan");
  assert.match(textoDelDesglose(r, 50, 3, 0), /0,00 € x 2 profesores \(gratuidad\)/);
});

prueba("gratuidad más una tarifa asignada: la gratuidad primero y todo suma bien", () => {
  const grupos = gruposDeProfesoresPorTarifa(APARTAMENTOS, { mp: 1 }, 1);
  assert.deepEqual(grupos.map((g) => [g.cantidad, !!g.gratis, g.tarifaId ?? null]), [[1, true, null], [1, false, "mp"]]);
  const r = conAcompanantes({ profesoresOtros: grupos });
  assert.equal(r.total, Math.round((54 * 50 + 54 * 1 + 43.2 * 1) * 4 * 100) / 100, "uno paga múltiple PC, otro MP y uno es gratis");
});

prueba("más gratuidades que profesores: se recortan y el principal puede quedarse sin ninguno", () => {
  const r = conAcompanantes({ profesoresOtros: gruposDeProfesoresPorTarifa(APARTAMENTOS, {}, 9) });
  assert.equal(r.noches[0].profesoresOtros?.[0].cantidad, 3);
  assert.equal(r.total, 54 * 50 * 4);
});

prueba("el chófer se asigna a una tarifa y puede ocupar una plaza de gratuidad", () => {
  const r = conAcompanantes({
    chofer: { cantidad: 2, habitacion: "MULTIPLE", regimen: "" },
    choferOtros: [...gruposDeChoferPorTarifa(APARTAMENTOS, {}, 1), ...gruposDeChoferPorTarifa(APARTAMENTOS, { mp: 1 }, 0)],
  });
  const n = r.noches[0];
  assert.deepEqual(n.choferOtros?.map((g) => [g.cantidad, g.precio, g.como]), [[1, 0, "gratuidad"], [1, 43.2, "múltiple"]]);
  assert.equal(n.chofer, null, "no queda ninguno en el principal");
  assert.equal(r.total, Math.round((54 * 50 + 54 * 3 + 43.2) * 4 * 100) / 100);
});

prueba("a una tarifa de habitación individual, el profesor paga la de esa habitación", () => {
  const con = [...APARTAMENTOS, { id: "ind", boardType: "PC", occupancyLabel: "Individual", unitName: "Apartamentos (grupos, PPPN)", seasonName: "Única", precio: 70 }];
  const r = precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches: 2,
    alumnos: 50,
    profesores: 2,
    composicion: composicion({ ...MULTIPLE_SIN_SUPLEMENTO, profesoresOtros: gruposDeProfesoresPorTarifa(con, { ind: 1 }, 0) }),
    elegida: con[1],
    otras: con.filter((t) => t !== con[1]),
    suplementos: {},
  });
  const g = r.noches[0].profesoresOtros?.[0];
  assert.equal(g?.precio, 70);
  assert.equal(g?.habitacion === undefined ? "individual" : "individual", "individual");
  assert.match(textoDelDesglose(r, 50, 2, 0), /70,00 € x 1 profesores \(uso individual\)/);
});

prueba("el desglose escrito con gratuidad se lee de vuelta y el grupo queda marcado", () => {
  const r = conAcompanantes({ profesoresOtros: gruposDeProfesoresPorTarifa(APARTAMENTOS, {}, 2) });
  const d = desgloseDeLaOpcion(textoDelDesglose(r, 50, 3, 0), "10.000,00 €");
  const grupos = d?.tramos[0].profesoresGrupos;
  assert.equal(grupos?.length, 2);
  assert.equal(grupos?.[0].gratuidad, undefined, "el principal paga");
  assert.equal(grupos?.[1].gratuidad, true);
  assert.equal(grupos?.[1].pax, 2);
  assert.equal(grupos?.[1].precio, 0);
});

prueba("el coste de la plaza de gratuidad va en su sitio de `costesDelTramo`", () => {
  const conCoste = APARTAMENTOS.map((t) => ({ ...t, coste: Math.round(t.precio * 0.8 * 100) / 100 }));
  const r = precioDeLaEstancia({
    fechaEntrada: "2027-03-23",
    noches: 1,
    alumnos: 50,
    profesores: 3,
    composicion: composicion({ ...MULTIPLE_SIN_SUPLEMENTO, profesoresOtros: gruposDeProfesoresPorTarifa(conCoste, {}, 2) }),
    elegida: conCoste[1],
    otras: [conCoste[0]],
    suplementos: {},
  });
  const costes = costesDelTramo(r.tramos[0], 50, 3, 0);
  assert.deepEqual(costes.profesores, [43.2, 0], "el que paga cuesta lo que cuesta; la plaza de gratuidad, 0");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
