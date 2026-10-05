/**
 * Hasta dónde llegó una solicitud a medias.
 *
 * Sale de una pregunta razonable que la pantalla no sabía contestar: «ya envié
 * esta propuesta, ¿por qué me sigue apareciendo una pendiente?». Era correcto
 * —había dos intentos del mismo colegio, y el pendiente nunca llegó a elegir
 * alojamientos— pero las dos líneas de la lista eran idénticas y para saberlo
 * había que mirar la base de datos.
 *
 * Cómo correrla:  npm run test:avance
 * No necesita base de datos: es una función pura.
 */
import assert from "node:assert/strict";

import { avanceDelBorrador } from "../server/avanceDelBorrador";

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

console.log("\nPor dónde se quedó");

prueba("el caso real: la petición hecha y ningún hotel elegido", () => {
  // Es el borrador que quedó colgado: 1 mensaje, 5 respuestas del chat,
  // destino Salou y 48 alumnos, pero `elegidos` vacío. Nunca se envió.
  assert.equal(
    avanceDelBorrador({
      mensajes: ["Buenos días…"],
      conversacion: [1, 2, 3, 4, 5],
      entendido: { destinationText: "Salou", dateFrom: "2027-05-12" },
      elegidos: [],
      programaBase: [],
    }),
    "la petición, sin alojamientos elegidos",
  );
});

prueba("con alojamientos y actividades se dicen los dos", () => {
  assert.equal(
    avanceDelBorrador({
      mensajes: ["…"],
      entendido: { destinationText: "Salou" },
      elegidos: ["a", "b", "c"],
      programaBase: ["x", "y", "z"],
    }),
    "3 alojamientos · 3 actividades",
  );
});

prueba("con alojamientos y sin actividades, solo los alojamientos", () => {
  assert.equal(
    avanceDelBorrador({ entendido: { destinationText: "Salou" }, elegidos: ["a"], programaBase: [] }),
    "1 alojamiento",
  );
});

prueba("solo el correo pegado, sin leer todavía", () => {
  assert.equal(avanceDelBorrador({ mensajes: ["Buenos días…"], elegidos: [] }), "solo el mensaje pegado");
});

prueba("un borrador vacío lo dice, no se inventa un avance", () => {
  assert.equal(avanceDelBorrador({}), "sin nada guardado");
  assert.equal(avanceDelBorrador(null), "sin nada guardado");
});

console.log("\nLo que puede haber dejado rastro fuera");

prueba("con solicitud creada se avisa: puede haber trato en el CRM", () => {
  // Descartarlo sin saberlo deja un trato huérfano en Zoho.
  const linea = avanceDelBorrador({
    solicitudId: "cmugsx79o000kyd1s5mbijvw9",
    entendido: { destinationText: "Salou" },
    elegidos: ["a", "b"],
    programaBase: [],
  });
  assert.equal(linea, "2 alojamientos · ya tiene solicitud creada");
});

prueba("y también cuando todavía no se eligió nada", () => {
  const linea = avanceDelBorrador({ solicitudId: "req-1", entendido: { dateFrom: "2027-05-12" }, elegidos: [] });
  assert.match(linea, /ya tiene solicitud creada/);
});

prueba("sin solicitud NO se avisa de nada", () => {
  const linea = avanceDelBorrador({ entendido: { destinationText: "Salou" }, elegidos: ["a"] });
  assert.ok(!/solicitud creada/.test(linea), linea);
});

console.log("\nDatos rotos no rompen la lista");

prueba("listas que no son listas se tratan como vacías", () => {
  const carga = { elegidos: "3" as unknown as unknown[], mensajes: null, entendido: null };
  assert.equal(avanceDelBorrador(carga), "sin nada guardado");
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
