/**
 * La ventana de «Lo que hemos entendido», que alguien lee y valida.
 *
 * Lo que más importa aquí es la firma. El visto bueno tiene que caducar: si
 * alguien valida, y después el colegio manda un segundo correo que cambia las
 * fechas, el presupuesto no puede salir con un «revisado» que corresponde a
 * otros datos.
 *
 * Y la segunda: distinguir «falta y hace falta» de «no lo han dicho». Pintar
 * en ámbar que no hay presupuesto por alumno cuando el colegio simplemente no
 * lo dijo es alarmar por nada, y a la tercera vez ya nadie mira los ámbares.
 *
 * Cómo correrla:  npm run test:validacion
 * No necesita base de datos: son funciones puras.
 */
import assert from "node:assert/strict";

import {
  bloquesParaValidar,
  firmaDeLaPeticion,
  loQueFaltaDeVerdad,
  nochesDe,
} from "../src/domain/validacionDeLaPeticion";

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

/** La petición del IES Jaume Balmes, ya completa. */
const COMPLETA = {
  destinationText: "Salou",
  dateFrom: "2027-05-12",
  dateTo: "2027-05-16",
  participants: 48,
  teachers: 4,
  ageRangeText: "15-17",
  regimeRequested: "pensión completa",
  categoryRequested: "3*",
  topePorAlumno: 300,
  requisitos: ["Alergias / dietas especiales", "Habitación adaptada / accesibilidad"],
  centreName: "IES Jaume Balmes",
  email: "marta@iesjaumebalmes.cat",
  firstName: "Marta",
  lastName: "Ferrer",
  opportunityName: "IES JAUME BALMES 2027",
  canal: "GENERIC",
  departamento: "GROUPS",
};

const fila = (p: typeof COMPLETA | Record<string, unknown>, que: string) =>
  bloquesParaValidar(p).flatMap((b) => b.filas).find((f) => f.que === que);

console.log("\nLos datos agrupados como se leen");

prueba("cuatro bloques, en el orden de quien revisa", () => {
  // Catorce campos en fila no se revisan; cuatro bloques de tres o cuatro, sí.
  assert.deepEqual(
    bloquesParaValidar(COMPLETA).map((b) => b.titulo),
    ["El viaje", "El grupo", "Lo que piden", "El centro y el contacto"],
  );
});

prueba("cada bloque dice para qué sirve", () => {
  for (const b of bloquesParaValidar(COMPLETA)) {
    assert.ok(b.para.length > 20, `«${b.titulo}» sin explicar para qué sirve`);
  }
});

prueba("las noches se calculan, no se piden", () => {
  assert.equal(fila(COMPLETA, "Noches")?.valor, "4");
  assert.equal(nochesDe("2027-05-12", "2027-05-16"), 4);
});

prueba("una salida anterior a la llegada no da noches negativas", () => {
  assert.equal(nochesDe("2027-05-16", "2027-05-12"), null);
  assert.equal(nochesDe("", "2027-05-16"), null);
});

prueba("el destino explica que busca en toda la comarca", () => {
  assert.match(String(fila(COMPLETA, "Destino")?.nota), /Cambrils/);
});

console.log("\n«Falta» no es lo mismo que «no lo han dicho»");

prueba("sin destino, sale en ámbar", () => {
  assert.equal(fila({ ...COMPLETA, destinationText: "" }, "Destino")?.falta, true);
});

prueba("sin presupuesto por alumno, NO sale en ámbar", () => {
  // Un colegio puede no tener tope. Alarmar por eso hace que a la tercera vez
  // nadie mire los ámbares.
  const f = fila({ ...COMPLETA, topePorAlumno: null }, "Presupuesto por alumno");
  assert.equal(f?.falta, undefined);
  assert.equal(f?.valor, "no lo han dicho");
});

prueba("sin edades tampoco: no es obligatoria", () => {
  // Lo pidió Javier: «a veces no sabemos la edad al principio».
  assert.equal(fila({ ...COMPLETA, ageRangeText: "" }, "Edades")?.falta, undefined);
});

prueba("cero profesores es una respuesta; no saberlo, no", () => {
  assert.equal(fila({ ...COMPLETA, teachers: 0 }, "Profesores")?.valor, "0");
  assert.equal(fila({ ...COMPLETA, teachers: null }, "Profesores")?.valor, "no lo han dicho");
});

prueba("lo que falta de verdad se puede listar de un tirón", () => {
  const faltan = loQueFaltaDeVerdad({ ...COMPLETA, destinationText: "", email: "", centreName: "" });
  assert.deepEqual(faltan, ["Destino", "Centro", "Correo"]);
});

prueba("una petición completa no tiene nada en ámbar", () => {
  assert.deepEqual(loQueFaltaDeVerdad(COMPLETA), []);
});

prueba("sin apellidos, el contacto está incompleto", () => {
  assert.equal(fila({ ...COMPLETA, lastName: "" }, "Contacto")?.falta, true);
});

console.log("\nEl departamento, que vale para dos cosas a la vez");

prueba("sin departamento sale en ámbar", () => {
  // No es un detalle: sin él, el trato del CRM sale sin clasificar —Oravia lo
  // rellena en el 99% de los suyos— y el correo se va por Grupos aunque el
  // viaje sea de Deportivo.
  assert.equal(fila({ ...COMPLETA, departamento: "" }, "Departamento")?.falta, true);
});

prueba("y con él, se lee con su nombre de verdad", () => {
  assert.equal(fila(COMPLETA, "Departamento")?.valor, "Grupos");
  assert.equal(
    fila({ ...COMPLETA, departamento: "SPORTS" }, "Departamento")?.valor,
    "Turismo Deportivo",
  );
});

prueba("cambiarlo invalida el visto bueno", () => {
  // Cambia el buzón desde el que sale el correo: no puede colarse con una
  // revisión hecha sobre el otro.
  assert.notEqual(firmaDeLaPeticion(COMPLETA), firmaDeLaPeticion({ ...COMPLETA, departamento: "SPORTS" }));
});

console.log("\nLa firma: el visto bueno tiene que caducar");

prueba("los mismos datos dan la misma firma", () => {
  assert.equal(firmaDeLaPeticion(COMPLETA), firmaDeLaPeticion({ ...COMPLETA }));
});

prueba("cambiar las fechas la invalida", () => {
  // El caso real: alguien valida y el colegio manda un segundo correo con
  // otras fechas.
  assert.notEqual(firmaDeLaPeticion(COMPLETA), firmaDeLaPeticion({ ...COMPLETA, dateTo: "2027-05-17" }));
});

prueba("cambiar el número de alumnos también", () => {
  assert.notEqual(firmaDeLaPeticion(COMPLETA), firmaDeLaPeticion({ ...COMPLETA, participants: 60 }));
});

prueba("y el correo del contacto, que es a quién se envía", () => {
  assert.notEqual(firmaDeLaPeticion(COMPLETA), firmaDeLaPeticion({ ...COMPLETA, email: "otra@colegio.es" }));
});

prueba("y el canal, que cambia qué tarifas se ofrecen", () => {
  assert.notEqual(firmaDeLaPeticion(COMPLETA), firmaDeLaPeticion({ ...COMPLETA, canal: "SWISS_TTOO" }));
});

prueba("mayúsculas y espacios de más NO la invalidan", () => {
  // Tocar un campo y dejarlo igual con un espacio detrás no puede tirar un
  // visto bueno: sería pedir revalidar por nada.
  assert.equal(
    firmaDeLaPeticion(COMPLETA),
    firmaDeLaPeticion({ ...COMPLETA, destinationText: "  SALOU ", centreName: "IES Jaume Balmes " }),
  );
});

prueba("el orden de los requisitos tampoco", () => {
  assert.equal(
    firmaDeLaPeticion(COMPLETA),
    firmaDeLaPeticion({ ...COMPLETA, requisitos: [...COMPLETA.requisitos].reverse() }),
  );
});

prueba("pero añadir un requisito sí", () => {
  assert.notEqual(
    firmaDeLaPeticion(COMPLETA),
    firmaDeLaPeticion({ ...COMPLETA, requisitos: [...COMPLETA.requisitos, "Picnic / comida para llevar"] }),
  );
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
