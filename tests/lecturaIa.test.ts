/**
 * La IA que lee la solicitud se SUMA a las reglas, no las sustituye
 * (reunión con Oravia, 05/11/2026). Aquí se prueba lo que decide: qué se
 * descarta de lo que dice el modelo y cómo se funde con lo ya entendido.
 * No llama a ningún modelo.
 *
 * Cómo correrla:  npm run test:lectura-ia
 */
import assert from "node:assert/strict";

import {
  frasesDeLaIa,
  instruccionesLecturaIa,
  normalizarLecturaIa,
  sumarLecturaIa,
  type EntradaDeSuma,
} from "../src/domain/lecturaIa";
import { claveDeRequisito, mismoRequisito } from "../src/domain/requisitos";
import { readTripMessage } from "../src/services/requestService";

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

const MENSAJE =
  "Dear Pablo,\n\ngot a new request from FC Weinfelden-Bürglen\n\n12.03.-16.03.2027\n\n24 pax\n\nNatural Grass\n\nBungalows\n\nMSH: Mediterranean Sports Hub";
const RESPUESTA = "anthonyquinatoa@gmail.com\nAnthony Quinatoa";
const TEXTOS = [MENSAJE, RESPUESTA];

const BUENA = {
  contactoNombre: "Anthony",
  contactoApellidos: "Quinatoa",
  contactoEmail: "anthonyquinatoa@gmail.com",
  centro: "FC Weinfelden-Bürglen",
  departamento: "SPORTS",
  destino: "Cambrils",
  fechaEntrada: "2027-03-12",
  fechaSalida: "2027-03-16",
  alumnos: 24,
  profesores: null,
  regimen: null,
  citas: {
    contactoNombre: "Anthony Quinatoa",
    centro: "FC Weinfelden-Bürglen",
    departamento: "FC Weinfelden-Bürglen",
    destino: "Mediterranean Sports Hub",
    fechaEntrada: "12.03.-16.03.2027",
    fechaSalida: "12.03.-16.03.2027",
    alumnos: "24 pax",
  },
};

function entradaVacia(sobre: Partial<EntradaDeSuma> = {}): EntradaDeSuma {
  return {
    entendido: readTripMessage("").normalized,
    tope: null,
    requisitos: [],
    contacto: { firstName: "", lastName: "", email: "", centreName: "" },
    departamento: "",
    fijados: [],
    ...sobre,
  };
}

console.log("\nValidar lo que dice el modelo");

prueba("una lectura buena pasa entera, con sus citas", () => {
  const l = normalizarLecturaIa(BUENA, TEXTOS);
  assert.equal(l.contacto.email, "anthonyquinatoa@gmail.com");
  assert.equal(l.contacto.firstName, "Anthony");
  assert.equal(l.contacto.lastName, "Quinatoa");
  assert.equal(l.centreName, "FC Weinfelden-Bürglen");
  assert.equal(l.departamento, "SPORTS");
  assert.equal(l.campos.destinationText, "Cambrils");
  assert.equal(l.campos.dateFrom, "2027-03-12");
  assert.equal(l.campos.participants, 24);
  assert.equal(l.citas.participants, "24 pax");
  assert.deepEqual(l.descartado, []);
});

prueba("un correo que no está escrito en ninguna parte se descarta (no se inventa)", () => {
  const l = normalizarLecturaIa({ ...BUENA, contactoEmail: "info@fcweinfelden.ch" }, TEXTOS);
  assert.equal(l.contacto.email, "");
  assert.ok(l.descartado.some((d) => d.includes("contactoEmail")));
});

prueba("un nombre que no aparece en el texto se descarta", () => {
  const l = normalizarLecturaIa({ ...BUENA, contactoNombre: "Pablo", contactoApellidos: "Ferrer" }, TEXTOS);
  assert.equal(l.contacto.lastName, "");
});

prueba("un dato sin cita, o con una cita que no está en el texto, se descarta", () => {
  const sinCita = normalizarLecturaIa({ ...BUENA, citas: { ...BUENA.citas, alumnos: undefined } }, TEXTOS);
  assert.equal(sinCita.campos.participants, undefined);
  const citaFalsa = normalizarLecturaIa({ ...BUENA, citas: { ...BUENA.citas, alumnos: "somos 24 jugadores" } }, TEXTOS);
  assert.equal(citaFalsa.campos.participants, undefined);
  assert.ok(citaFalsa.descartado.some((d) => d.includes("alumnos")));
});

prueba("la cita se compara sin mayúsculas, acentos ni saltos de línea", () => {
  const l = normalizarLecturaIa({ ...BUENA, citas: { ...BUENA.citas, centro: "fc  weinfelden-burglen" } }, TEXTOS);
  assert.equal(l.centreName, "FC Weinfelden-Bürglen");
});

prueba("fechas imposibles, números absurdos y departamentos raros no pasan", () => {
  const l = normalizarLecturaIa(
    { ...BUENA, fechaEntrada: "2027-02-30", alumnos: 9999999, departamento: "OTRO", citas: { ...BUENA.citas } },
    TEXTOS,
  );
  assert.equal(l.campos.dateFrom, undefined);
  assert.equal(l.campos.participants, undefined);
  assert.equal(l.departamento, "");
});

prueba("lo que no es un objeto no rompe nada", () => {
  for (const malo of [null, undefined, "hola", 42, []]) {
    const l = normalizarLecturaIa(malo, TEXTOS);
    assert.deepEqual(l.campos, {});
    assert.equal(l.contacto.email, "");
  }
});

console.log("\nSumarla a lo que entendieron las reglas");

prueba("rellena los huecos: el contacto y el centro llegan al formulario", () => {
  const ia = normalizarLecturaIa(BUENA, TEXTOS);
  const suma = sumarLecturaIa(entradaVacia(), ia);
  assert.deepEqual(suma.contacto, {
    email: "anthonyquinatoa@gmail.com",
    firstName: "Anthony",
    lastName: "Quinatoa",
    centreName: "FC Weinfelden-Bürglen",
  });
  assert.equal(suma.departamento, "SPORTS");
  assert.equal(suma.entendido?.destinationText, "Cambrils");
  assert.equal(suma.entendido?.participants, 24);
});

prueba("NO pisa lo que las reglas ya leyeron: queda como duda", () => {
  const ia = normalizarLecturaIa(BUENA, TEXTOS);
  const reglas = { ...readTripMessage("").normalized, participants: 21, destinationText: "Cambrils" };
  const suma = sumarLecturaIa(entradaVacia({ entendido: reglas }), ia);
  assert.notEqual(suma.entendido?.participants, 24, "no cambia los alumnos");
  assert.equal(suma.entendido?.participants ?? 21, 21);
  assert.deepEqual(suma.dudas.map((d) => [d.etiqueta, d.reglas, d.ia]), [["los alumnos", "21", "24"]]);
});

prueba("NO toca lo que una persona fijó a mano, ni lo discute", () => {
  const ia = normalizarLecturaIa(BUENA, TEXTOS);
  const suma = sumarLecturaIa(entradaVacia({ fijados: ["participants", "destinationText", "email"] }), ia);
  assert.equal(suma.entendido?.participants ?? null, null);
  assert.equal(suma.entendido?.destinationText ?? "", "");
  assert.equal(suma.contacto.email, undefined);
  assert.equal(suma.dudas.length, 0);
});

prueba("el contacto que ya está escrito no se pisa", () => {
  const ia = normalizarLecturaIa(BUENA, TEXTOS);
  const suma = sumarLecturaIa(
    entradaVacia({ contacto: { firstName: "Ruth", lastName: "", email: "ruth@oravia.com", centreName: "" } }),
    ia,
  );
  assert.equal(suma.contacto.firstName, undefined);
  assert.equal(suma.contacto.email, undefined);
  assert.equal(suma.contacto.lastName, "Quinatoa", "solo el hueco");
});

prueba("el departamento del usuario manda sobre el que adivine la IA", () => {
  const ia = normalizarLecturaIa(BUENA, TEXTOS);
  assert.equal(sumarLecturaIa(entradaVacia({ departamento: "GROUPS" }), ia).departamento, "");
});

prueba("si no hay nada nuevo, no cambia nada y no pide buscar de nuevo", () => {
  const ia = normalizarLecturaIa(BUENA, TEXTOS);
  const completo = {
    ...readTripMessage("").normalized,
    destinationText: "Cambrils",
    dateFrom: "2027-03-12",
    dateTo: "2027-03-16",
    participants: 24,
  };
  const suma = sumarLecturaIa(
    entradaVacia({
      entendido: completo,
      contacto: { firstName: "Anthony", lastName: "Quinatoa", email: "anthonyquinatoa@gmail.com", centreName: "FC Weinfelden-Bürglen" },
      departamento: "SPORTS",
    }),
    ia,
  );
  assert.equal(suma.entendido, null);
  assert.equal(suma.anadidos.length, 0);
  assert.equal(suma.cambiaLaBusqueda, false);
});

prueba("los requisitos nuevos se suman sin repetir los que ya había", () => {
  const ia = normalizarLecturaIa({ ...BUENA, requisitos: ["Autocar", "campo de césped natural"] }, TEXTOS);
  const suma = sumarLecturaIa(entradaVacia({ requisitos: ["autocar"] }), ia);
  assert.deepEqual(suma.requisitos, ["autocar", "campo de césped natural"]);
  const fijado = sumarLecturaIa(entradaVacia({ requisitos: ["autocar"], fijados: ["requisitos"] }), ia);
  assert.deepEqual(fijado.requisitos, ["autocar"]);
});

console.log("\nRequisitos que son el mismo escrito de dos formas");

prueba("«Natural Grass» y «Césped natural» son el mismo requisito (prueba del 05/11)", () => {
  assert.equal(mismoRequisito("Natural Grass", "Césped natural"), true);
  assert.equal(mismoRequisito("campo de césped natural", "Natural Grass"), true);
  assert.equal(mismoRequisito("Bungalows", "bungalow"), true);
  assert.equal(claveDeRequisito("Se necesita autocar"), "autocar");
});

prueba("requisitos distintos NO se confunden", () => {
  assert.equal(mismoRequisito("Césped natural", "Césped artificial"), false);
  assert.equal(mismoRequisito("Autocar", "Bungalows"), false);
  assert.equal(mismoRequisito("", "Autocar"), false);
});

prueba("la IA no vuelve a añadir un requisito que ya estaba con otras palabras", () => {
  const ia = normalizarLecturaIa({ ...BUENA, requisitos: ["Césped natural", "Bungalows", "Autocar"] }, TEXTOS);
  const suma = sumarLecturaIa(entradaVacia({ requisitos: ["Natural Grass", "Bungalows"] }), ia);
  assert.deepEqual(suma.requisitos, ["Natural Grass", "Bungalows", "Autocar"]);
});

console.log("\nPara quién se cotiza y el departamento: la IA los contrasta");

const CLIENTES = [
  { codigo: "SWISS_TTOO", nombre: "Turoperador suizo", detalle: "Destination · Travelclub", porcentajeSobrePvp: null },
  { codigo: "AZUL_MARINO", nombre: "Azul Marino", detalle: "precio propio pactado", porcentajeSobrePvp: null },
];
const CODIGOS = CLIENTES.map((c) => c.codigo);
const MENSAJE_TTOO = "Hello Pablo, Destination Travelclub here. 24 pax, 12.03.-16.03.2027, MSH Cambrils.";
const BUENA_TTOO = {
  ...BUENA,
  cotizamosPara: "SWISS_TTOO",
  citas: { ...BUENA.citas, cotizamosPara: "Destination Travelclub here" },
};

prueba("un cliente especial con su nombre escrito pasa, con su cita", () => {
  const l = normalizarLecturaIa(BUENA_TTOO, [MENSAJE_TTOO, RESPUESTA], CODIGOS);
  assert.equal(l.canal, "SWISS_TTOO");
  assert.equal(l.citas.canal, "Destination Travelclub here");
});

prueba("un código que no existe, o uno real sin cita en el texto, no pasa (daría tarifas que no son)", () => {
  const inventado = normalizarLecturaIa({ ...BUENA_TTOO, cotizamosPara: "OPERADOR_X" }, TEXTOS, CODIGOS);
  assert.equal(inventado.canal, "");
  assert.ok(inventado.descartado.some((d) => d.includes("cotizamosPara")));
  const sinPrueba = normalizarLecturaIa(BUENA_TTOO, TEXTOS, CODIGOS); // el mensaje del club no nombra al operador
  assert.equal(sinPrueba.canal, "");
  assert.ok(sinPrueba.descartado.some((d) => d.includes("cotizamosPara")));
});

prueba("«GENERIC» pasa sin cita y sin lista de clientes", () => {
  assert.equal(normalizarLecturaIa({ ...BUENA, cotizamosPara: "GENERIC" }, TEXTOS).canal, "GENERIC");
  assert.equal(normalizarLecturaIa({ ...BUENA, cotizamosPara: null }, TEXTOS, CODIGOS).canal, "");
});

prueba("el texto para el modelo lleva la lista de clientes especiales", () => {
  const p = instruccionesLecturaIa([{ texto: MENSAJE_TTOO, origen: "colegio" }], new Date("2026-11-05T10:00:00Z"), CLIENTES);
  assert.ok(p.includes("SWISS_TTOO: Turoperador suizo (Destination · Travelclub)"));
  assert.ok(p.includes("cotizamosPara"));
});

const TTOO = normalizarLecturaIa(BUENA_TTOO, [MENSAJE_TTOO, MENSAJE, RESPUESTA], CODIGOS);

prueba("si nadie ha tocado «Cotizamos para» y el mensaje nombra al operador, lo pone y lo cuenta", () => {
  const suma = sumarLecturaIa(entradaVacia({ canal: "GENERIC", clientes: CLIENTES }), TTOO);
  assert.equal(suma.canal, "SWISS_TTOO");
  assert.equal(suma.cambiaLaBusqueda, true);
  const frase = frasesDeLaIa(suma);
  assert.match(frase, /para quién cotizamos → Cliente especial · Turoperador suizo/);
  assert.match(frase, /de «Destination Travelclub here»/);
});

prueba("si lo elegido coincide con el mensaje, la IA dice que lo ha comprobado", () => {
  const suma = sumarLecturaIa(entradaVacia({ canal: "SWISS_TTOO", clientes: CLIENTES, departamento: "SPORTS" }), TTOO);
  assert.equal(suma.canal, "");
  assert.equal(suma.dudas.length, 0);
  const frase = frasesDeLaIa(suma);
  assert.match(frase, /He comprobado/);
  assert.match(frase, /Cliente especial · Turoperador suizo/);
  assert.match(frase, /el departamento: Turismo Deportivo/);
});

prueba("un cliente corriente: dice que no hay nada que apunte a un cliente especial", () => {
  const ia = normalizarLecturaIa({ ...BUENA, cotizamosPara: "GENERIC" }, TEXTOS, CODIGOS);
  const frase = frasesDeLaIa(sumarLecturaIa(entradaVacia({ canal: "GENERIC", clientes: CLIENTES, departamento: "SPORTS" }), ia));
  assert.match(frase, /Colegio, club o agencia \(nada en el mensaje apunta a un cliente especial\)/);
});

prueba("lo elegido a mano NO se cambia, pero se avisa de que el mensaje dice otra cosa", () => {
  const suma = sumarLecturaIa(entradaVacia({ canal: "GENERIC", clientes: CLIENTES, fijados: ["canal"] }), TTOO);
  assert.equal(suma.canal, "");
  assert.equal(suma.dudas.length, 1);
  assert.match(frasesDeLaIa(suma), /para quién cotizamos, lo elegido Colegio, club o agencia y la IA Cliente especial · Turoperador suizo/);
});

prueba("si se eligió un operador y el mensaje es de otro, avisa sin cambiar", () => {
  const suma = sumarLecturaIa(entradaVacia({ canal: "AZUL_MARINO", clientes: CLIENTES }), TTOO);
  assert.equal(suma.canal, "");
  assert.deepEqual(suma.dudas.map((d) => [d.reglas, d.ia]), [["Cliente especial · Azul Marino", "Cliente especial · Turoperador suizo"]]);
});

prueba("si el departamento elegido no cuadra con el mensaje, avisa sin cambiarlo", () => {
  const suma = sumarLecturaIa(entradaVacia({ departamento: "GROUPS", canal: "GENERIC", clientes: CLIENTES }), normalizarLecturaIa(BUENA, TEXTOS, CODIGOS));
  assert.equal(suma.departamento, "");
  assert.deepEqual(suma.dudas.map((d) => [d.etiqueta, d.reglas, d.ia]), [["el departamento", "Grupos", "Turismo Deportivo"]]);
  assert.match(frasesDeLaIa(suma), /el departamento, lo elegido Grupos y la IA Turismo Deportivo/);
});

prueba("sin que se le diga el canal actual, no opina sobre «Cotizamos para»", () => {
  const suma = sumarLecturaIa(entradaVacia(), TTOO);
  assert.equal(suma.canal, "");
  assert.equal(suma.comprobado.length, 0);
});

console.log("\nLo que se le cuenta a quien cotiza");

prueba("el chat dice qué añadió la IA y de qué frase", () => {
  const ia = normalizarLecturaIa(BUENA, TEXTOS);
  const frase = frasesDeLaIa(sumarLecturaIa(entradaVacia(), ia));
  assert.match(frase, /La IA ha añadido/);
  assert.match(frase, /el nombre del contacto → Anthony/);
  assert.match(frase, /de «24 pax»/);
  assert.match(frase, /el departamento → Turismo Deportivo/);
});

prueba("el chat cuenta en qué no está de acuerdo con las reglas", () => {
  const ia = normalizarLecturaIa(BUENA, TEXTOS);
  const reglas = { ...readTripMessage("").normalized, participants: 21 };
  const frase = frasesDeLaIa(sumarLecturaIa(entradaVacia({ entendido: reglas }), ia));
  assert.match(frase, /lee distinto/);
  assert.match(frase, /las reglas 21 y la IA 24/);
});

prueba("el texto que se le pasa al modelo trae los mensajes en orden y quién los escribió", () => {
  const p = instruccionesLecturaIa(
    [
      { texto: MENSAJE, origen: "colegio" },
      { texto: RESPUESTA, origen: "chat" },
    ],
    new Date("2026-11-05T10:00:00Z"),
  );
  assert.match(p, /Hoy es 2026-11-05/);
  assert.ok(p.indexOf("[1] (del cliente)") < p.indexOf("[2] (escrito por quien cotiza)"));
  assert.ok(p.includes("anthonyquinatoa@gmail.com"));
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
