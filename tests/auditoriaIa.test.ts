/**
 * El auditor de «Lo que hemos entendido» (prueba de Anthony, 05/11/2026).
 *
 * Los valores son los de su captura: el régimen era una frase del chat, los
 * requisitos salían repetidos en dos idiomas y nada lo avisaba. Aquí se prueba
 * lo que decide qué veredicto del modelo se acepta. No llama a ningún modelo.
 *
 * Cómo correrla:  npm run test:auditoria
 */
import assert from "node:assert/strict";

import {
  instruccionesAuditoria,
  normalizarAuditoria,
  resumenDeAuditoria,
  valoresParaAuditar,
} from "../src/domain/auditoriaIa";
import { CLIENTES_ESPECIALES } from "../src/domain/documentImportTypes";

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

const CLIENTE =
  "Dear Pablo,\n\ngot a new request from FC Weinfelden-Bürglen\n\n12.03.-16.03.2027\n\n24 pax\n\nNatural Grass\n\nBungalows\n\nMSH: Mediterranean Sports Hub";
const CHAT = "de los 24 pasajeros somos 20 alumnos y 4 profesores. \n\nSoy Anthony Quinatoa, aquinatoa@neointec.com";
const TTOO = "Destination Travelclub";
const TEXTOS = [CLIENTE, CHAT, TTOO];
const CODIGOS = CLIENTES_ESPECIALES.map((c) => c.codigo);

// Lo que enseñaba la ventana en la captura.
const VALORES = valoresParaAuditar(
  {
    destinationText: "Cambrils",
    dateFrom: "2027-03-12",
    dateTo: "2027-03-16",
    participants: 20,
    teachers: 4,
    ageRangeText: "",
    regimeRequested: "de los 24 pasajeros somos 20 alumnos y 4 profesores. Soy Anthony Quinatoa,",
    categoryRequested: "",
    topePorAlumno: null,
    requisitos: ["Natural Grass", "Bungalows", "Césped natural"],
    centreName: "FC Weinfelden-Bürglen",
    email: "aquinatoa@neointec.com",
    firstName: "Anthony",
    lastName: "Quinatoa",
    opportunityName: "FC WEINFELDEN-BÜRGLEN 2027",
    canal: "SWISS_TTOO",
    departamento: "SPORTS",
  },
  CLIENTES_ESPECIALES,
);

console.log("\nQué se le enseña al auditor");

prueba("salen las filas que se auditan y no las que la app calcula", () => {
  const claves = VALORES.map((v) => v.clave);
  assert.deepEqual(claves, [
    "destino", "fechas", "alumnos", "profesores", "edades", "regimen", "categoria", "presupuesto",
    "requisitos", "centro", "contacto", "correo", "cotizamosPara", "departamento",
  ]);
});

prueba("lo vacío llega vacío, no como «no lo han dicho»; el canal y el departamento llevan su código", () => {
  const por = (c: string) => VALORES.find((v) => v.clave === c)!;
  assert.equal(por("edades").valor, "");
  assert.equal(por("presupuesto").valor, "");
  assert.equal(por("cotizamosPara").codigo, "SWISS_TTOO");
  assert.equal(por("cotizamosPara").valor, "Cliente especial · Turoperador suizo");
  assert.equal(por("departamento").codigo, "SPORTS");
  assert.equal(por("fechas").valor, "2027-03-12 → 2027-03-16");
});

prueba("el texto para el modelo trae los valores, el texto y no el correo", () => {
  const p = instruccionesAuditoria(
    [{ texto: CLIENTE, origen: "colegio" }, { texto: CHAT, origen: "chat" }],
    VALORES,
    new Date("2026-11-05T10:00:00Z"),
    CLIENTES_ESPECIALES,
  );
  assert.ok(p.includes("regimen («Régimen»): de los 24 pasajeros"));
  assert.ok(p.includes("SWISS_TTOO: Turoperador suizo"));
  assert.ok(!p.includes("correo («Correo»)"), "el correo no se le fía al modelo");
  assert.ok(p.indexOf("[1] (del cliente)") < p.indexOf("[2] (escrito por quien cotiza)"));
});

console.log("\nQué veredictos se aceptan");

const BRUTO_BUENO = {
  campos: {
    destino: { estado: "correcto", cita: "MSH: Mediterranean Sports Hub" },
    fechas: { estado: "correcto", cita: "12.03.-16.03.2027" },
    alumnos: { estado: "correcto", cita: "20 alumnos" },
    profesores: { estado: "correcto", cita: "4 profesores" },
    edades: { estado: "correcto" },
    regimen: {
      estado: "no_cuadra",
      cita: "de los 24 pasajeros somos 20 alumnos y 4 profesores",
      valorCorrecto: "",
      motivo: "Es una frase del chat, no un régimen.",
    },
    requisitos: {
      estado: "no_cuadra",
      cita: "Natural Grass",
      valorCorrecto: "Natural Grass · Bungalows",
      motivo: "«Natural Grass» y «Césped natural» son lo mismo.",
    },
    centro: { estado: "correcto", cita: "FC Weinfelden-Bürglen" },
    contacto: { estado: "correcto", cita: "Soy Anthony Quinatoa" },
    cotizamosPara: { estado: "correcto", cita: "Destination Travelclub" },
    departamento: { estado: "correcto", cita: "got a new request from FC Weinfelden-Bürglen" },
  },
};

prueba("lo de la captura: el régimen y los requisitos salen como «no cuadra», lo demás comprobado", () => {
  const r = normalizarAuditoria(BRUTO_BUENO, TEXTOS, VALORES, CODIGOS);
  assert.equal(r.veredictos.regimen?.estado, "no_cuadra");
  assert.equal(r.veredictos.regimen?.sugerido, "", "sin valor bueno que poner");
  assert.equal(r.veredictos.regimen?.vaciar, true, "pero se puede quitar el dato malo");
  assert.equal(r.veredictos.requisitos?.vaciar, false);
  assert.equal(r.veredictos.destino?.vaciar, false);
  assert.equal(r.veredictos.requisitos?.estado, "no_cuadra");
  assert.equal(r.veredictos.requisitos?.sugerido, "Natural Grass · Bungalows");
  assert.equal(r.veredictos.destino?.estado, "correcto");
  assert.equal(r.veredictos.alumnos?.cita, "20 alumnos");
  assert.deepEqual(r.descartado, []);
  assert.deepEqual(resumenDeAuditoria(r), { comprobados: 9, porMirar: 2, sinRespaldo: 0 });
});

prueba("un «correcto» sin frase que esté en el texto baja a «sin respaldo»", () => {
  const r = normalizarAuditoria(
    { campos: { destino: { estado: "correcto", cita: "queremos ir a Salou" }, alumnos: { estado: "correcto" } } },
    TEXTOS, VALORES, CODIGOS,
  );
  assert.equal(r.veredictos.destino?.estado, "sin_respaldo");
  assert.equal(r.veredictos.alumnos?.estado, "sin_respaldo");
  assert.equal(r.descartado.length, 2);
});

prueba("un «no cuadra» sin frase en el texto no se da por malo: queda en «sin respaldo»", () => {
  const r = normalizarAuditoria(
    { campos: { destino: { estado: "no_cuadra", cita: "vamos a Salou", valorCorrecto: "Salou" } } },
    TEXTOS, VALORES, CODIGOS,
  );
  assert.equal(r.veredictos.destino?.estado, "sin_respaldo");
  assert.equal(r.veredictos.destino?.sugerido, "");
});

prueba("lo vacío y «correcto» no pide cita; «Colegio, club o agencia» tampoco (es ausencia de pistas)", () => {
  const generico = valoresParaAuditar({ canal: "GENERIC", departamento: "GROUPS" }, CLIENTES_ESPECIALES);
  const r = normalizarAuditoria(
    { campos: { edades: { estado: "correcto" }, cotizamosPara: { estado: "correcto" } } },
    TEXTOS, generico, CODIGOS,
  );
  assert.equal(r.veredictos.edades?.estado, "correcto");
  assert.equal(r.veredictos.cotizamosPara?.estado, "correcto");
});

prueba("el valor propuesto se valida: un número que no lo es, una fecha imposible o un código inventado no se aplican", () => {
  const malo = (clave: string, valorCorrecto: string, cita: string) =>
    normalizarAuditoria({ campos: { [clave]: { estado: "no_cuadra", cita, valorCorrecto } } }, TEXTOS, VALORES, CODIGOS).veredictos[clave as never];
  assert.equal(malo("alumnos", "veinte", "20 alumnos")?.sugerido, "");
  assert.equal(malo("alumnos", "24", "24 pax")?.sugerido, "24");
  assert.equal(malo("fechas", "2027-02-30 → 2027-03-16", "12.03.-16.03.2027")?.sugerido, "");
  assert.equal(malo("fechas", "2027-03-13 → 2027-03-17", "12.03.-16.03.2027")?.sugerido, "2027-03-13 → 2027-03-17");
  assert.equal(malo("cotizamosPara", "OPERADOR_X", "Destination Travelclub")?.sugerido, "");
  const otroCanal = valoresParaAuditar({ canal: "AZUL_MARINO" }, CLIENTES_ESPECIALES);
  const conCanal = normalizarAuditoria(
    { campos: { cotizamosPara: { estado: "no_cuadra", cita: "Destination Travelclub", valorCorrecto: "swiss_ttoo" } } },
    TEXTOS, otroCanal, CODIGOS,
  );
  assert.equal(conCanal.veredictos.cotizamosPara?.sugerido, "SWISS_TTOO");
  assert.equal(malo("departamento", "SPORTS", "got a new request from FC Weinfelden-Bürglen")?.estado, "correcto", "lo propuesto ya es lo que hay");
});

prueba("si lo «correcto» que propone es lo mismo que ya hay, no se avisa de nada", () => {
  const r = normalizarAuditoria(
    { campos: { alumnos: { estado: "no_cuadra", cita: "20 alumnos", valorCorrecto: "20" } } },
    TEXTOS, VALORES, CODIGOS,
  );
  assert.equal(r.veredictos.alumnos?.estado, "correcto");
});

prueba("el correo no depende del modelo: escrito tal cual es correcto, y si no, sin respaldo", () => {
  const escrito = normalizarAuditoria({ campos: { correo: { estado: "no_cuadra", cita: "x" } } }, TEXTOS, VALORES, CODIGOS);
  assert.equal(escrito.veredictos.correo?.estado, "correcto");
  assert.equal(escrito.veredictos.correo?.cita, "aquinatoa@neointec.com");
  const otro = valoresParaAuditar({ email: "info@fcweinfelden.ch" }, CLIENTES_ESPECIALES);
  assert.equal(normalizarAuditoria({}, TEXTOS, otro, CODIGOS).veredictos.correo?.estado, "sin_respaldo");
  const vacio = valoresParaAuditar({ email: "" }, CLIENTES_ESPECIALES);
  assert.equal(normalizarAuditoria({}, TEXTOS, vacio, CODIGOS).veredictos.correo, undefined);
});

prueba("estados raros, claves que no se enseñaron y respuestas que no son un objeto no rompen nada", () => {
  const r = normalizarAuditoria(
    { campos: { alumnos: { estado: "quizás" }, nombreDelViaje: { estado: "correcto", cita: "FC" } } },
    TEXTOS, VALORES, CODIGOS,
  );
  assert.equal(r.veredictos.alumnos, undefined);
  assert.equal((r.veredictos as Record<string, unknown>).nombreDelViaje, undefined);
  for (const malo of [null, undefined, "hola", 42, [], { campos: "x" }]) {
    const x = normalizarAuditoria(malo, TEXTOS, VALORES, CODIGOS);
    assert.equal(Object.keys(x.veredictos).length, 1, "solo el correo, que se comprueba sin IA");
  }
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
