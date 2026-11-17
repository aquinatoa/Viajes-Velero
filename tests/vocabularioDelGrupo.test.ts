/**
 * «Jugadores y entrenadores» en lo que ve el cliente cuando la propuesta es de
 * Sports, y el total de cada opción con sus actividades sumadas
 * (Oravia, 16/11/2026).
 *
 * Cómo correrla:  npm run test:vocabulario
 *
 * No necesita base de datos ni servidor.
 */
import assert from "node:assert/strict";

import { documentoParaElCliente } from "../server/proposalPdf";
import { conVocabulario, conVocabularioEnTodo, vocabularioDelGrupo } from "../src/domain/vocabularioDelGrupo";

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

console.log("\nLas palabras del grupo");

prueba("para Sports: jugadores y entrenadores; para Grupos, lo de siempre", () => {
  assert.deepEqual(vocabularioDelGrupo("SPORTS"), { alumno: "jugador", alumnos: "jugadores", profesor: "entrenador", profesores: "entrenadores" });
  assert.equal(vocabularioDelGrupo("GROUPS").alumnos, "alumnos");
  assert.equal(vocabularioDelGrupo(null).profesores, "profesores");
});

prueba("un texto de Sports cambia todas las formas y respeta mayúsculas", () => {
  assert.equal(
    conVocabulario("40 alumnos: 57,51 € por noche · 6 profesores (al mismo precio que los alumnos)", "SPORTS"),
    "40 jugadores: 57,51 € por noche · 6 entrenadores (al mismo precio que los jugadores)",
  );
  assert.equal(conVocabulario("Profesores gratis", "SPORTS"), "Entrenadores gratis");
  assert.equal(conVocabulario("PROFESORES · 1 ALUMNO", "SPORTS"), "ENTRENADORES · 1 JUGADOR");
  assert.equal(conVocabulario("198,40 € por alumno y 1 profesor", "SPORTS"), "198,40 € por jugador y 1 entrenador");
  assert.equal(conVocabulario("Estudiantes y profesoras", "SPORTS"), "Jugadores y entrenadores");
});

prueba("para Grupos, o sin departamento, el texto no se toca", () => {
  const texto = "100 alumnos y 10 profesores";
  assert.equal(conVocabulario(texto, "GROUPS"), texto);
  assert.equal(conVocabulario(texto, null), texto);
  assert.equal(conVocabulario(null, "SPORTS"), null);
});

prueba("no rompe palabras que solo se parecen", () => {
  assert.equal(conVocabulario("Alumnado del profesorado", "SPORTS"), "Alumnado del profesorado");
});

prueba("sobre una estructura: traduce todo menos lo que se le dice que salte", () => {
  const doc = { titulo: "Para 20 alumnos", lista: ["1 profesor", { nota: "alumnos" }], notas: "Los profesores llegan antes", n: 3, nada: null };
  assert.deepEqual(conVocabularioEnTodo(doc, "SPORTS", ["notas"]), {
    titulo: "Para 20 jugadores",
    lista: ["1 entrenador", { nota: "jugadores" }],
    notas: "Los profesores llegan antes",
    n: 3,
    nada: null,
  });
  assert.equal(conVocabularioEnTodo(doc, "GROUPS"), doc);
});

console.log("\nEl documento del cliente");

// ORV-2026-0007: 40 jugadores y 6 entrenadores, 3 noches a 57,51 €, y tres servicios por grupo.
const entrada = (department: string | null) => ({
  reference: "ORV-2026-0007",
  clientName: "Club de prueba",
  destination: "Cambrils",
  dateFrom: new Date("2027-04-02T00:00:00Z"),
  dateTo: new Date("2027-04-05T00:00:00Z"),
  participants: 40,
  teachers: 6,
  department,
  notes: "Los profesores firman a la llegada.",
  options: [
    {
      optionNumber: 2,
      accommodationName: "Villa Bonita / Aloha",
      boardType: "Pensión completa",
      nights: 3,
      participants: 40,
      teachers: 6,
      totalPvpText: "7.936,38 €",
      totalAmount: 7936.38,
      priceBreakdownText: "57,51 € x 40 alumnos + 57,51 € x 6 profesores (mismo precio que los alumnos) x 3 noches",
      freePolicyText: null,
      conditionsText: null,
      observationsText: null,
      activities: [
        { name: "Entrenador asistente", priceText: "4,20 € por alumno", amount: 4.2, groupAmount: 168 },
        { name: "Fútbol Playa", priceText: "4,75 € por alumno", amount: 4.75, groupAmount: 190 },
        { name: "Luz Artificial", priceText: "0,70 € por alumno", amount: 0.7, groupAmount: 28 },
      ],
    },
  ],
});
// El tipo de entrada del PDF es más ancho que este caso: lo justo para montar el documento.
const documento = (department: string | null) => documentoParaElCliente(entrada(department) as never);

prueba("el total de la opción es alojamiento + actividades, y dice de qué está hecho", () => {
  const opcion = documento("GROUPS").opciones[0];
  assert.equal(opcion.total?.replace(/\s/g, " "), "8.322,38 €");
  assert.match(opcion.totalDetalle ?? "", /Alojamiento 7\.936,38\s€ \+ actividades 386,00\s€/);
});

prueba("la cabecera y el resumen del viaje dan la misma cifra", () => {
  const doc = documento("GROUPS");
  assert.equal(doc.opciones[0].total, doc.resumen?.filas[0].total);
});

prueba("sin actividades, el total sigue siendo el del alojamiento y no se desglosa", () => {
  const sin = entrada("GROUPS");
  sin.options[0].activities = [];
  const opcion = documentoParaElCliente(sin as never).opciones[0];
  assert.equal(opcion.total, "7.936,38 €");
  assert.ok(!opcion.totalDetalle);
});

prueba("para Sports, el documento dice jugadores y entrenadores en todas partes", () => {
  // Solo los textos: los nombres de los campos («porAlumno») no los ve nadie.
  const textos: string[] = [];
  const recoger = (v: unknown): void => {
    if (typeof v === "string") textos.push(v);
    else if (Array.isArray(v)) v.forEach(recoger);
    else if (v && typeof v === "object") Object.values(v).forEach(recoger);
  };
  recoger({ ...documento("SPORTS"), notas: null });
  const texto = textos.join(" | ");
  assert.ok(!/alumn|profesor|estudiant/i.test(texto), texto.match(/.{0,40}(alumn|profesor|estudiant).{0,40}/i)?.[0]);
  assert.match(texto, /40 jugadores/);
  assert.match(texto, /6 entrenadores/);
  assert.match(texto, /por jugador/);
});

prueba("para Grupos, el documento sigue diciendo alumnos y profesores", () => {
  const texto = JSON.stringify(documento("GROUPS"));
  assert.match(texto, /40 alumnos/);
  assert.match(texto, /6 profesores/);
  assert.ok(!/jugador|entrenador(es)?\b(?! asistente)/i.test(texto.replace(/Entrenador asistente/g, "")));
});

prueba("las notas de quien cotiza salen con sus palabras, también en Sports", () => {
  assert.equal(documento("SPORTS").notas, "Los profesores firman a la llegada.");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
