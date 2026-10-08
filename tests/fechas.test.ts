/**
 * Leer fechas escritas como las escribe un colegio.
 *
 * El caso que destapó el fallo salió probando el chat: el correo de ejemplo
 * dice «para mayo de 2027, del 12 al 16» —el mes delante— y el lector devolvía
 * dos fechas vacías. Reconocía «del 12 al 16 de mayo de 2027» pero no lo mismo
 * dicho al revés, que es como escribe media España.
 *
 * `hoy` se pasa siempre: una prueba que mire el reloj caduca sola y un día
 * falla sin que nadie haya tocado nada.
 *
 * Cómo correrla:  npm run test:fechas
 * No necesita base de datos: son funciones puras.
 */
import assert from "node:assert/strict";

import { leerRango, leerUnaFecha } from "../src/domain/fechas";

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

/** Un día fijo, para que «el próximo mayo» signifique siempre lo mismo. */
const HOY = new Date("2026-09-25T00:00:00Z");
const rango = (t: string) => leerRango(t, HOY);

console.log("\nEl caso que faltaba: el mes delante");

prueba("«mayo de 2027, del 12 al 16»", () => {
  // El correo de ejemplo del IES Jaume Balmes, literal.
  assert.deepEqual(rango("el viaje de fin de curso para mayo de 2027, del 12 al 16."), {
    desde: "2027-05-12",
    hasta: "2027-05-16",
  });
});

prueba("«junio 2027 entre el 3 y el 7»", () => {
  assert.deepEqual(rango("Nos vendría bien junio 2027 entre el 3 y el 7"), {
    desde: "2027-06-03",
    hasta: "2027-06-07",
  });
});

prueba("y sin año: «en mayo, del 12 al 16»", () => {
  assert.deepEqual(rango("Sería en mayo, del 12 al 16"), { desde: "2027-05-12", hasta: "2027-05-16" });
});

prueba("un mes que ya pasó se entiende del año que viene", () => {
  // Escrito el 25/9/2026, «en marzo» es marzo de 2027: nadie pide presupuesto
  // para un viaje que ya ocurrió.
  assert.equal(rango("para marzo, del 3 al 7").desde, "2027-03-03");
});

console.log("\nLo que ya funcionaba tiene que seguir funcionando");

prueba("ISO", () => {
  assert.deepEqual(rango("del 2027-05-12 al 2027-05-16"), { desde: "2027-05-12", hasta: "2027-05-16" });
});

prueba("día primero con año", () => {
  assert.deepEqual(rango("del 12 al 16 de mayo de 2027"), { desde: "2027-05-12", hasta: "2027-05-16" });
});

prueba("con los dos meses escritos", () => {
  assert.deepEqual(rango("del 2 de mayo al 6 de junio de 2027"), { desde: "2027-05-02", hasta: "2027-06-06" });
});

prueba("«entre el … y el …»", () => {
  assert.deepEqual(rango("entre el 12 y el 16 de mayo de 2027"), { desde: "2027-05-12", hasta: "2027-05-16" });
});

prueba("numérico DD/MM/AAAA", () => {
  assert.deepEqual(rango("12/05/2027 - 16/05/2027"), { desde: "2027-05-12", hasta: "2027-05-16" });
});

prueba("día primero sin año", () => {
  assert.deepEqual(rango("del 10 al 14 de mayo"), { desde: "2027-05-10", hasta: "2027-05-14" });
});

prueba("un viaje que cruza el año", () => {
  assert.deepEqual(rango("del 28 de diciembre al 3 de enero"), { desde: "2026-12-28", hasta: "2027-01-03" });
});

console.log("\nLo que NO puede leer como fecha");

prueba("«48 alumnos de 4º de ESO» no son fechas", () => {
  // Con un hueco mayor entre el mes y los números, «4» se colaba como día.
  assert.deepEqual(rango("Somos 48 alumnos de 4º de ESO. Queremos ir en verano."), {
    desde: "",
    hasta: "",
  });
});

prueba("el punto corta: no une dos frases distintas", () => {
  assert.deepEqual(rango("Queremos ir en mayo. Seríamos unos 48 alumnos de 4º de ESO."), {
    desde: "",
    hasta: "",
  });
});

prueba("un texto sin fechas devuelve vacío, no una fecha de hoy", () => {
  assert.deepEqual(rango("Hola, queremos un presupuesto para el viaje de fin de curso."), {
    desde: "",
    hasta: "",
  });
});

prueba("un día imposible no se lee", () => {
  assert.deepEqual(rango("mayo de 2027, del 45 al 60"), { desde: "", hasta: "" });
});

console.log("\nUna sola fecha, la que se contesta en el chat");

const una = (t: string) => leerUnaFecha(t, HOY);

prueba("las formas que escribe la gente", () => {
  for (const texto of ["12/05/2027", "12-05-2027", "12.5.2027", "2027-05-12", "12 de mayo de 2027", "12 mayo 2027"]) {
    assert.equal(una(texto), "2027-05-12", `con «${texto}»`);
  }
});

prueba("sin año, el próximo que llegue", () => {
  assert.equal(una("12 de mayo"), "2027-05-12");
});

prueba("lo que no se entiende es null, no una fecha inventada", () => {
  // El chat lo dice y lo vuelve a preguntar. Guardar una fecha a medias
  // significa cotizar una temporada que no es.
  assert.equal(una("el puente de mayo"), null);
  assert.equal(una("cuando podáis"), null);
  assert.equal(una(""), null);
});

prueba("un mes imposible no cuela", () => {
  assert.equal(una("12/13/2027"), null);
});


console.log("\nEl formato del turoperador suizo: el año solo al final");

prueba("«Date: 31.01. – 06.02.2027» (la petición que dio el 400 de Ricard)", () => {
  assert.deepEqual(rango("Date: 31.01. – 06.02.2027"), { desde: "2027-01-31", hasta: "2027-02-06" });
});

prueba("con barras y guion corto: «31/01 - 06/02/2027»", () => {
  assert.deepEqual(rango("31/01 - 06/02/2027"), { desde: "2027-01-31", hasta: "2027-02-06" });
});

prueba("si cruza el año, la primera fecha es del año anterior", () => {
  assert.deepEqual(rango("30.12. – 03.01.2027"), { desde: "2026-12-30", hasta: "2027-01-03" });
});

prueba("con las dos fechas completas sigue mandando el formato de siempre", () => {
  assert.deepEqual(rango("31.01.2027 – 06.02.2027"), { desde: "2027-01-31", hasta: "2027-02-06" });
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
