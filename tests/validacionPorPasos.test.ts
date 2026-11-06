/**
 * Validar «Lo que hemos entendido» paso a paso (Oravia, 05/11/2026).
 *
 * Los pasos, qué bloquea, cuándo caduca una confirmación, la frase de arriba y
 * el subrayado del mensaje original. Los datos son los de la prueba del club suizo.
 * No necesita base de datos ni modelo.
 *
 * Cómo correrla:  npm run test:pasos
 */
import assert from "node:assert/strict";

import { FILA_A_CLAVE, type ClaveAuditada } from "../src/domain/auditoriaIa";
import { CLIENTES_ESPECIALES } from "../src/domain/documentImportTypes";
import { compactadorDeSaltos, localizarCita, trocearConMarcas } from "../src/domain/marcasEnTexto";
import {
  SECCIONES,
  SECCIONES_QUE_BLOQUEAN,
  estaConfirmada,
  faltaEnSeccion,
  firmaDeSeccion,
  fechasEnPalabras,
  fraseDeLaPeticion,
  pasosPorConfirmar,
  resumenDeSeccion,
  sePuedeVerLoBuscado,
  seccionDeLaClave,
  type Confirmaciones,
} from "../src/domain/seccionesDeValidacion";
import { bloquesParaValidar, type PeticionParaValidar } from "../src/domain/validacionDeLaPeticion";

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

const PETICION: PeticionParaValidar = {
  destinationText: "Cambrils",
  dateFrom: "2027-03-12",
  dateTo: "2027-03-16",
  participants: 20,
  teachers: 4,
  ageRangeText: "",
  regimeRequested: "",
  categoryRequested: "",
  topePorAlumno: null,
  requisitos: ["Natural Grass", "Bungalows"],
  centreName: "FC Weinfelden-Bürglen",
  email: "aquinatoa@neointec.com",
  firstName: "Anthony",
  lastName: "Quinatoa",
  opportunityName: "FC WEINFELDEN-BÜRGLEN 2027",
  canal: "SWISS_TTOO",
  departamento: "SPORTS",
};

function confirmarTodo(p: PeticionParaValidar, ids = SECCIONES.map((s) => s.id)): Confirmaciones {
  return Object.fromEntries(ids.map((id) => [id, firmaDeSeccion(id, p)]));
}

console.log("\nLos pasos");

prueba("hay cuatro pasos que bloquean y «Centro y contacto» no", () => {
  assert.deepEqual(SECCIONES_QUE_BLOQUEAN, ["viaje", "grupo", "piden", "tarifas"]);
  assert.equal(SECCIONES.find((s) => s.id === "contacto")?.bloquea, false);
});

prueba("cada dato que audita la IA pertenece a un solo paso, y todos están cubiertos", () => {
  const claves = new Set<ClaveAuditada>(Object.values(FILA_A_CLAVE));
  const vistas = SECCIONES.flatMap((s) => s.claves);
  assert.equal(new Set(vistas).size, vistas.length, "ninguna clave en dos pasos");
  assert.deepEqual([...claves].sort(), [...vistas].sort());
  assert.equal(seccionDeLaClave("departamento"), "tarifas");
  assert.equal(seccionDeLaClave("regimen"), "piden");
});

prueba("todas las filas que enseña un paso existen en la ventana, y ninguna está en dos pasos", () => {
  const existentes = bloquesParaValidar(PETICION).flatMap((b) => b.filas.map((f) => f.que));
  const enPasos = SECCIONES.flatMap((s) => s.filas);
  assert.equal(new Set(enPasos).size, enPasos.length);
  assert.deepEqual([...enPasos].sort(), [...existentes].sort(), "ninguna fila se queda sin paso");
});

console.log("\nQué bloquea y cuándo caduca una confirmación");

prueba("sin confirmar nada no se enseñan los alojamientos: faltan los cuatro pasos", () => {
  assert.deepEqual(pasosPorConfirmar({}, PETICION), ["viaje", "grupo", "piden", "tarifas"]);
  assert.equal(sePuedeVerLoBuscado({}, PETICION), false);
});

prueba("con los cuatro confirmados se puede seguir, y confirmar «Centro y contacto» no hace falta", () => {
  const c = confirmarTodo(PETICION, SECCIONES_QUE_BLOQUEAN);
  assert.equal(sePuedeVerLoBuscado(c, PETICION), true);
  assert.equal(estaConfirmada(c, "contacto", PETICION), false);
});

prueba("si falta UN paso, no se puede seguir y se dice cuál", () => {
  const c = confirmarTodo(PETICION, ["viaje", "grupo", "piden"]);
  assert.deepEqual(pasosPorConfirmar(c, PETICION), ["tarifas"]);
  assert.equal(sePuedeVerLoBuscado(c, PETICION), false);
});

prueba("cambiar un dato caduca SOLO la confirmación de su paso", () => {
  const c = confirmarTodo(PETICION);
  const cambiada = { ...PETICION, regimeRequested: "Media pensión" };
  assert.deepEqual(pasosPorConfirmar(c, cambiada), ["piden"]);
  assert.equal(estaConfirmada(c, "viaje", cambiada), true);
  assert.deepEqual(pasosPorConfirmar(c, { ...PETICION, canal: "GENERIC" }), ["tarifas"]);
  assert.deepEqual(pasosPorConfirmar(c, { ...PETICION, dateTo: "2027-03-17" }), ["viaje"]);
  assert.deepEqual(pasosPorConfirmar(c, { ...PETICION, teachers: 5 }), ["grupo"]);
});

prueba("lo que no es de un paso no lo toca: cambiar el correo no caduca el viaje ni las tarifas", () => {
  const c = confirmarTodo(PETICION);
  assert.deepEqual(pasosPorConfirmar(c, { ...PETICION, email: "otro@x.es" }), []);
  assert.equal(estaConfirmada(c, "contacto", { ...PETICION, email: "otro@x.es" }), false);
});

prueba("el orden de los requisitos o las mayúsculas del destino no caducan nada", () => {
  const c = confirmarTodo(PETICION);
  assert.deepEqual(pasosPorConfirmar(c, { ...PETICION, requisitos: ["Bungalows", "Natural Grass"], destinationText: "CAMBRILS" }), []);
});

prueba("no se puede confirmar un paso al que le falta lo que hace falta (el departamento)", () => {
  assert.deepEqual(faltaEnSeccion("tarifas", { ...PETICION, departamento: "" }), ["Departamento"]);
  assert.deepEqual(faltaEnSeccion("viaje", { ...PETICION, destinationText: "" }), ["Destino", "Noches"].filter((x) => x === "Destino"));
  assert.deepEqual(faltaEnSeccion("tarifas", PETICION), []);
});

prueba("el resumen del paso plegado dice lo que hay, sin lo que no dijeron ni lo que calcula la app", () => {
  assert.equal(resumenDeSeccion("viaje", PETICION), "Cambrils · 2027-03-12 → 2027-03-16");
  assert.equal(resumenDeSeccion("grupo", PETICION), "20 · 4");
  assert.equal(resumenDeSeccion("tarifas", PETICION, CLIENTES_ESPECIALES), "Cliente especial · Turoperador suizo · Turismo Deportivo");
});

console.log("\nLa frase de arriba");

const texto = (p: PeticionParaValidar) => fraseDeLaPeticion(p, CLIENTES_ESPECIALES).map((x) => x.texto).join("");

prueba("el caso del club suizo", () => {
  assert.equal(
    texto(PETICION),
    "FC Weinfelden-Bürglen (Turismo Deportivo · cliente especial Turoperador suizo) pide Cambrils del 12 al 16 de marzo de 2027, 4 noches, para 20 alumnos y 4 profesores.",
  );
});

prueba("solo los datos van en negrita", () => {
  const datos = fraseDeLaPeticion(PETICION, CLIENTES_ESPECIALES).filter((x) => x.dato).map((x) => x.texto);
  assert.deepEqual(datos, ["FC Weinfelden-Bürglen", "Cambrils", "12 al 16 de marzo de 2027", "4 noches", "20 alumnos y 4 profesores"]);
});

prueba("lo que falta se dice que falta, no se inventa", () => {
  assert.equal(texto({}), "Esta solicitud no dice el destino, sin fechas, sin número de alumnos.");
  assert.equal(
    texto({ destinationText: "Salou", dateFrom: "2027-05-12", dateTo: "2027-05-16", participants: 48 }),
    "Esta solicitud pide Salou del 12 al 16 de mayo de 2027, 4 noches, para 48 alumnos.",
  );
});

prueba("singular y plural, y un colegio corriente no lleva «cliente especial»", () => {
  assert.equal(
    texto({ centreName: "IES Balmes", departamento: "GROUPS", canal: "GENERIC", destinationText: "Salou", dateFrom: "2027-05-12", dateTo: "2027-05-13", participants: 1, teachers: 1 }),
    "IES Balmes (Grupos) pide Salou del 12 al 13 de mayo de 2027, 1 noche, para 1 alumno y 1 profesor.",
  );
});

prueba("las fechas se dicen según cruzan mes o año", () => {
  assert.equal(fechasEnPalabras("2027-03-30", "2027-04-03"), "30 de marzo al 3 de abril de 2027");
  assert.equal(fechasEnPalabras("2026-12-28", "2027-01-02"), "28 de diciembre de 2026 al 2 de enero de 2027");
  assert.equal(fechasEnPalabras("2027-13-01", "2027-03-02"), "");
});

console.log("\nSubrayar el mensaje original");

const CLIENTE =
  "Dear Pablo,\n\ngot a new request from FC Weinfelden-Bürglen\n\n12.03.-16.03.2027\n\n24 pax\n\nNatural Grass\n\nBungalows\n\nMSH: Mediterranean Sports Hub";
const CHAT = "de los 24 pasajeros somos 20 alumnos y 4 profesores. \n\nSoy Anthony Quinatoa, aquinatoa@neointec.com";

prueba("encuentra una frase aunque cambien mayúsculas, acentos o saltos de línea", () => {
  const r = localizarCita(CLIENTE, "fc weinfelden-burglen")!;
  assert.equal(CLIENTE.slice(r[0], r[1]), "FC Weinfelden-Bürglen");
  const dos = localizarCita(CLIENTE, "Natural Grass Bungalows")!;
  assert.equal(CLIENTE.slice(dos[0], dos[1]), "Natural Grass\n\nBungalows");
  assert.equal(localizarCita(CLIENTE, "no está escrito"), null);
  assert.equal(localizarCita(CLIENTE, "a"), null, "una letra no es una frase");
});

prueba("el texto vuelve entero al juntar los trozos, marque lo que marque", () => {
  const trozos = trocearConMarcas(CHAT, [
    { clave: "alumnos", cita: "20 alumnos", aviso: false },
    { clave: "regimen", cita: "de los 24 pasajeros somos 20 alumnos y 4 profesores", aviso: true },
    { clave: "correo", cita: "aquinatoa@neointec.com", aviso: false },
  ]);
  assert.equal(trozos.map((t) => t.texto).join(""), CHAT);
});

prueba("dos datos sobre el mismo trozo lo comparten; es de aviso solo si TODOS lo dan por malo", () => {
  const trozos = trocearConMarcas(CHAT, [
    { clave: "alumnos", cita: "20 alumnos", aviso: false },
    { clave: "regimen", cita: "de los 24 pasajeros somos 20 alumnos y 4 profesores", aviso: true },
  ]);
  const alumnos = trozos.find((t) => t.texto === "20 alumnos")!;
  assert.deepEqual(alumnos.claves.sort(), ["alumnos", "regimen"]);
  assert.equal(alumnos.aviso, false, "«20 alumnos» está bien usado para los alumnos");
  const dosMalos = trocearConMarcas(CHAT, [
    { clave: "regimen", cita: "20 alumnos", aviso: true },
    { clave: "alumnos", cita: "20 alumnos", aviso: true },
  ]).find((t) => t.texto === "20 alumnos")!;
  assert.equal(dosMalos.aviso, true);
  const solo = trozos.find((t) => t.texto.startsWith("de los 24"))!;
  assert.deepEqual(solo.claves, ["regimen"]);
});

prueba("el centro y el departamento comparten la frase del cliente", () => {
  const trozos = trocearConMarcas(CLIENTE, [
    { clave: "centro", cita: "FC Weinfelden-Bürglen", aviso: false },
    { clave: "departamento", cita: "FC Weinfelden-Bürglen", aviso: false },
    { clave: "destino", cita: "MSH: Mediterranean Sports Hub", aviso: false },
  ]);
  assert.deepEqual(trozos.find((t) => t.texto === "FC Weinfelden-Bürglen")?.claves, ["centro", "departamento"]);
  assert.deepEqual(trozos.find((t) => t.texto.startsWith("MSH"))?.claves, ["destino"]);
});

prueba("una frase que no está en este texto no subraya nada; sin marcas, un solo trozo", () => {
  assert.deepEqual(trocearConMarcas(CLIENTE, [{ clave: "x", cita: "texto que no existe", aviso: false }]), [{ texto: CLIENTE, claves: [], aviso: false }]);
  assert.equal(trocearConMarcas(CLIENTE, []).length, 1);
  assert.deepEqual(trocearConMarcas("", []), [{ texto: "", claves: [], aviso: false }]);
});

console.log("\nSaltos de línea al pintar el mensaje");

prueba("un correo «a renglón por frase» no gasta una línea en blanco entre frases", () => {
  const compactar = compactadorDeSaltos(CLIENTE);
  assert.equal(compactar("Dear Pablo,\n\ngot a new request from "), "Dear Pablo,\ngot a new request from ");
  assert.doesNotMatch(compactar(CLIENTE), /\n\n/);
});

prueba("una línea que solo lleva espacios tampoco cuenta", () => {
  assert.equal(compactadorDeSaltos(CLIENTE)("Dear Pablo,\n\n \n\ngot"), "Dear Pablo,\ngot");
});

prueba("si son párrafos largos se deja una línea en blanco entre ellos, no varias", () => {
  const parrafo = "Estimados señores, nos ponemos en contacto con ustedes para solicitar presupuesto de alojamiento para nuestro grupo.";
  const texto = `${parrafo}\n\n\n\n${parrafo}`;
  assert.equal(compactadorDeSaltos(texto)(texto), `${parrafo}\n\n${parrafo}`);
});

prueba("compactar no toca el texto de dentro: sin saltos, queda igual", () => {
  assert.equal(compactadorDeSaltos("hola")("MSH: Mediterranean Sports Hub"), "MSH: Mediterranean Sports Hub");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
