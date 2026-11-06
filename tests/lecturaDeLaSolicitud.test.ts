/**
 * Lo entendido de una solicitud, calculado de todo lo dicho (reunión con Oravia,
 * 05/11/2026): lo que se cuenta en el chat se quedaba sin asignar a «Lo que
 * hemos entendido».
 *
 * Cómo correrla:  npm run test:lectura-solicitud
 *
 * No necesita base de datos ni servidor. Tiene dos partes:
 *
 *   · una GUARDA DE REGRESIÓN: con un solo mensaje, la lectura nueva da lo mismo
 *     que la de siempre (`readTripMessage`), para cada mensaje del conjunto;
 *   · los casos del fallo: datos que llegan en el chat, en cualquier orden.
 *
 * El conjunto de mensajes (`MENSAJES`) crece con cada incidencia. Los de Ruth y
 * Ricard reales, anonimizados, se añaden aquí cuando Oravia los mande.
 */
import assert from "node:assert/strict";

import {
  frasesDeDiscrepancia,
  leerLaSolicitud,
  textosEnOrden,
  type EntradaDeLectura,
} from "../src/services/lecturaDeLaSolicitud";
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

const HOY = new Date("2026-11-05T10:00:00Z");

function entrada(parcial: Partial<EntradaDeLectura>): EntradaDeLectura {
  return {
    mensajes: [],
    respuestas: [],
    previo: null,
    topePrevio: null,
    requisitosPrevios: [],
    fijados: [],
    hoy: HOY,
    ...parcial,
  };
}

// ── El conjunto de mensajes ──────────────────────────────────────────────────

const MENSAJES: Record<string, string> = {
  "Deportivo en inglés (Ricard, 27/10)":
    "got a new request from FC Sins in MSH\n\nBungalows\n\n21 pax\n\n17.-21. February\n\nNatural or Artificial",
  "Colegio de Madrid completo":
    "Hola, buenos días: Soy María López, del IES Ramón y Cajal de Madrid. Estamos organizando el viaje de fin de curso a Salou del 18 al 22 de mayo de 2027. Seríamos 48 alumnos de entre 15 y 17 años y 4 profesores. Nos interesa un hotel de 3 estrellas en pensión completa. Un saludo.",
  "Demo Jaume Balmes (mes delante)":
    "Buenos días: Soy Marta Ferrer, del IES Jaume Balmes. Estamos preparando el viaje de fin de curso para mayo de 2027, del 12 al 16.",
  "Mensaje corto sin destino":
    "Hola Soy Anthony del instituto figueras pacheco y busco hacer un viaje de 4 dias para los alumnos de 15 años.",
};

console.log("\nGuarda de regresión: un solo mensaje se lee como siempre");

for (const [nombre, mensaje] of Object.entries(MENSAJES)) {
  prueba(nombre, () => {
    const antes = readTripMessage(mensaje, HOY).normalized;
    const ahora = leerLaSolicitud(entrada({ mensajes: [mensaje] })).entendido;
    assert.deepEqual(ahora, antes);
  });
}

console.log("\nLo que se contesta en el chat no ensucia «Información a tener en cuenta»");

const CLUB = MENSAJES["Deportivo en inglés (Ricard, 27/10)"];

prueba("el correo y el nombre del contacto no van al texto libre (caso real del 05/11)", () => {
  const s = leerLaSolicitud(
    entrada({
      mensajes: [CLUB],
      respuestas: [
        { texto: "anthonyquinatoa@gmail.com\nAnthony Quinatoa", trasMensajes: 1 },
        { texto: "Anthony Quinatoa", trasMensajes: 1 },
      ],
    }),
  );
  assert.ok(!/@/.test(s.entendido.requirementsText), s.entendido.requirementsText);
  assert.ok(!/Quinatoa/.test(s.entendido.requirementsText), s.entendido.requirementsText);
});

prueba("una respuesta corta («48», «Salou») no pasa al texto libre", () => {
  const solo = leerLaSolicitud(entrada({ mensajes: [CLUB] })).entendido.requirementsText;
  const s = leerLaSolicitud(
    entrada({
      mensajes: [CLUB],
      respuestas: [
        { texto: "48", trasMensajes: 1 },
        { texto: "Salou", trasMensajes: 1 },
        { texto: "pensión completa", trasMensajes: 1 },
      ],
    }),
  );
  assert.equal(s.entendido.requirementsText, solo);
});

prueba("una frase de verdad sin el correo pegado sí pasa", () => {
  const s = leerLaSolicitud(
    entrada({
      mensajes: [CLUB],
      respuestas: [
        { texto: "Necesitan salida de entrenamiento todas las tardes y mi correo es lpena@club.ch", trasMensajes: 1 },
      ],
    }),
  );
  assert.match(s.entendido.requirementsText, /entrenamiento todas las tardes/);
  assert.ok(!/@/.test(s.entendido.requirementsText));
});

console.log("\nEl orden en que se dijeron las cosas");

prueba("cada respuesta va tras los mensajes que ya había y antes de los que llegaron después", () => {
  const textos = textosEnOrden(
    ["m1", "m2"],
    [
      { texto: "a tras m1", trasMensajes: 1 },
      { texto: "a tras m2", trasMensajes: 2 },
    ],
  );
  assert.deepEqual(textos, ["m1", "a tras m1", "m2", "a tras m2"]);
});

prueba("una respuesta con una posición imposible no se pierde: va al final", () => {
  assert.deepEqual(textosEnOrden(["m1"], [{ texto: "x", trasMensajes: 9 }]), ["m1", "x"]);
});

console.log("\nLo que se cuenta en el chat acaba en «lo entendido»");

const PRIMERO = "Hola, somos el IES Ramón y Cajal y queremos un viaje a Salou del 18 al 22 de mayo de 2027.";

prueba("las plazas, el régimen y los profesores contados en el chat se asignan", () => {
  const s = leerLaSolicitud(
    entrada({
      mensajes: [PRIMERO],
      respuestas: [{ texto: "Seríamos 48 alumnos y 4 profesores, en pensión completa.", trasMensajes: 1 }],
    }),
  );
  assert.equal(s.entendido.destinationText, "Salou");
  assert.equal(s.entendido.participants, 48);
  assert.equal(s.entendido.teachers, 4);
  assert.match(s.entendido.regimeRequested, /completa/i);
});

prueba("lo que el chat cuenta y no cabe en un campo va al texto libre (antes se perdía)", () => {
  const s = leerLaSolicitud(
    entrada({
      mensajes: [PRIMERO],
      respuestas: [
        { texto: "Queremos también una jornada de multiaventura y la entrada a PortAventura.", trasMensajes: 1 },
      ],
    }),
  );
  assert.match(s.entendido.requirementsText, /multiaventura/i);
  assert.match(s.entendido.requirementsText, /PortAventura/);
  assert.match(s.texto, /multiaventura/i);
});

prueba("el tipo de grupo y el idioma dichos en el chat se asignan", () => {
  const s = leerLaSolicitud(
    entrada({
      mensajes: ["Queremos viajar a Salou del 18 al 22 de mayo de 2027."],
      respuestas: [{ texto: "Somos un colegio, hola, necesitamos presupuesto para los alumnos.", trasMensajes: 1 }],
    }),
  );
  assert.equal(s.entendido.groupType, "Grupo escolar");
  assert.equal(s.entendido.language, "Español");
});

prueba("lo posterior manda: «somos 48» y luego «ahora son 50»", () => {
  const s = leerLaSolicitud(
    entrada({
      mensajes: ["Viaje a Salou del 18 al 22 de mayo de 2027, somos 48 alumnos."],
      respuestas: [{ texto: "Perdón, ahora son 50 alumnos.", trasMensajes: 1 }],
    }),
  );
  assert.equal(s.entendido.participants, 50);
});

prueba("lo que un texto no dice no borra lo ya entendido", () => {
  const primero = leerLaSolicitud(entrada({ mensajes: [PRIMERO] }));
  const despues = leerLaSolicitud(
    entrada({
      mensajes: [PRIMERO, "Gracias, esperamos su propuesta."],
      previo: primero.entendido,
    }),
  );
  assert.equal(despues.entendido.destinationText, "Salou");
  assert.equal(despues.entendido.dateFrom, primero.entendido.dateFrom);
});

console.log("\nLo que el operador fija a mano manda siempre");

prueba("un campo fijado no lo pisa ninguna lectura posterior", () => {
  const previo = { ...leerLaSolicitud(entrada({ mensajes: [PRIMERO] })).entendido, participants: 47 };
  const s = leerLaSolicitud(
    entrada({
      mensajes: [PRIMERO],
      respuestas: [{ texto: "Somos 50 alumnos.", trasMensajes: 1 }],
      previo,
      fijados: ["participants"],
    }),
  );
  assert.equal(s.entendido.participants, 47);
});

prueba("vaciar un campo a propósito también se respeta", () => {
  const previo = { ...leerLaSolicitud(entrada({ mensajes: [PRIMERO] })).entendido, teachers: null };
  const s = leerLaSolicitud(
    entrada({
      mensajes: [PRIMERO],
      respuestas: [{ texto: "Vamos 4 profesores.", trasMensajes: 1 }],
      previo,
      fijados: ["teachers"],
    }),
  );
  assert.equal(s.entendido.teachers, null);
});

prueba("un valor explícito se aplica y pasa a quedar fijado (destino desconocido: Benidorm)", () => {
  const previo = leerLaSolicitud(entrada({ mensajes: ["Hola, queremos un viaje en mayo de 2027."] })).entendido;
  const s = leerLaSolicitud(entrada({ mensajes: ["Hola, queremos un viaje en mayo de 2027."], previo, explicitos: { destinationText: "Benidorm" } }));
  assert.equal(s.entendido.destinationText, "Benidorm");
  assert.ok(s.fijados.includes("destinationText"));
  assert.ok(s.fijados.includes("destinationCountry"), "el país va con el destino");
  // Y la siguiente lectura no lo cambia, aunque otro mensaje nombre Salou.
  const luego = leerLaSolicitud(
    entrada({
      mensajes: ["Hola, queremos un viaje en mayo de 2027.", "Por cierto, Salou nos queda cerca."],
      previo: s.entendido,
      fijados: s.fijados,
    }),
  );
  assert.equal(luego.entendido.destinationText, "Benidorm");
});

prueba("si el colegio contradice lo fijado, se respeta lo fijado PERO se avisa (no se ignora en silencio)", () => {
  const previo = { ...leerLaSolicitud(entrada({ mensajes: [PRIMERO] })).entendido, participants: 48 };
  const s = leerLaSolicitud(
    entrada({
      mensajes: [PRIMERO, "Perdón, somos 50 alumnos."],
      previo,
      fijados: ["participants"],
    }),
  );
  assert.equal(s.entendido.participants, 48);
  assert.equal(s.discrepancias.length, 1);
  assert.equal(s.discrepancias[0].campo, "participants");
  assert.equal(s.discrepancias[0].leido, 50);
  assert.equal(s.discrepancias[0].fijado, 48);
  assert.match(frasesDeDiscrepancia(s.discrepancias), /los alumnos.*50.*48/);
});

prueba("si lo que dice el texto coincide con lo fijado, no hay aviso", () => {
  const previo = { ...leerLaSolicitud(entrada({ mensajes: [PRIMERO] })).entendido, participants: 50 };
  const s = leerLaSolicitud(
    entrada({ mensajes: [PRIMERO, "Somos 50 alumnos."], previo, fijados: ["participants"] }),
  );
  assert.equal(s.discrepancias.length, 0);
});

prueba("una edad suelta se escribe también como media, para que el buscador la use", () => {
  const s = leerLaSolicitud(
    entrada({ mensajes: [PRIMERO], explicitos: { ageRangeText: "15" } }),
  );
  assert.equal(s.entendido.ageRangeText, "15");
  assert.equal(s.entendido.averageAgeText, "15 años");
});

console.log("\nEl tope y los requisitos");

prueba("el tope por alumno dicho en el chat se lee; el fijado a mano no se pisa", () => {
  const leido = leerLaSolicitud(
    entrada({ mensajes: [PRIMERO], respuestas: [{ texto: "Presupuesto de 350 € por alumno.", trasMensajes: 1 }] }),
  );
  assert.equal(leido.tope, 350);
  const fijado = leerLaSolicitud(
    entrada({
      mensajes: [PRIMERO],
      respuestas: [{ texto: "Presupuesto de 350 € por alumno.", trasMensajes: 1 }],
      topePrevio: 300,
      fijados: ["topePorAlumno"],
    }),
  );
  assert.equal(fijado.tope, 300);
});

prueba("los requisitos dichos en el chat se suman a los del primer mensaje", () => {
  const s = leerLaSolicitud(
    entrada({
      mensajes: ["Viaje a Salou del 18 al 22 de mayo de 2027. Hay dos alumnos con alergias."],
      respuestas: [{ texto: "Y necesitamos autocar desde el colegio.", trasMensajes: 1 }],
    }),
  );
  assert.ok(s.requisitos.includes("Alergias / dietas especiales"), s.requisitos.join("|"));
  assert.ok(s.requisitos.includes("Transporte / autocar"), s.requisitos.join("|"));
});

prueba("una lista de requisitos fijada a mano se respeta, y lo que diga el último texto se le suma", () => {
  const s = leerLaSolicitud(
    entrada({
      mensajes: [PRIMERO],
      respuestas: [{ texto: "Y necesitamos autocar desde el colegio.", trasMensajes: 1 }],
      requisitosPrevios: ["Picnic / comida para llevar"],
      fijados: ["requisitos"],
    }),
  );
  assert.deepEqual(s.requisitos, ["Picnic / comida para llevar", "Transporte / autocar"]);
});

console.log("\nLo que falta se calcula sobre lo entendido final");

prueba("tras contestar en el chat, ya no se pide lo que se acaba de decir", () => {
  const sin = leerLaSolicitud(entrada({ mensajes: ["Queremos un viaje a Salou en mayo de 2027."] }));
  assert.ok(sin.resultado.missingFields.some((f) => f.field === "participants"), "antes faltan las plazas");
  const con = leerLaSolicitud(
    entrada({
      mensajes: ["Queremos un viaje a Salou en mayo de 2027."],
      respuestas: [{ texto: "Del 18 al 22 de mayo, 48 alumnos.", trasMensajes: 1 }],
    }),
  );
  assert.ok(!con.resultado.missingFields.some((f) => f.field === "participants"));
  assert.ok(!con.resultado.missingFields.some((f) => f.field === "dateFrom"));
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
