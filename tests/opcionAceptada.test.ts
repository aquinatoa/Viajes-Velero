/**
 * Reconocer que el colegio acepta una opción en su respuesta.
 *
 * El correo que manda la app dice «Respondiendo a este correo nos decís cuál
 * preferís». Así que contestan por correo, y la única vía que hoy marca la
 * opción elegida es el botón de la página pública. Contestan «nos quedamos con
 * la 2» y no se entera nadie: ni arranca el plazo del depósito ni se mueve la
 * fase en el CRM.
 *
 * La regla que gobierna las pruebas es la de los falsos positivos. Marcar una
 * opción arranca un plazo de pago y mueve la fase en el CRM de un cliente:
 * equivocarse es reclamarle dinero a un colegio por un hotel que no pidió. Por
 * eso hay tantas pruebas de lo que NO debe reconocerse.
 *
 * Cómo correrla:  npm run test:aceptada
 */
import assert from "node:assert/strict";

import { opcionAceptadaEn } from "../src/domain/opcionAceptada";

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

/** Los tres hoteles de ORV-2026-0007, tal y como están en la base. */
const HOTELES = {
  1: "Hotel Planas 3* (Salou)",
  2: "Camping La Siesta 3* (Salou)",
  3: "Hotel Santa Mónica Playa 3* (Salou)",
};

console.log("\nCuando lo dicen con el número");

prueba("«nos quedamos con la opción 2»", () => {
  const r = opcionAceptadaEn("Hola, nos quedamos con la opción 2. Gracias.", HOTELES);
  assert.equal(r?.numero, 2);
  assert.equal(r?.confianza, "alta");
});

prueba("«aceptamos la opción número 3»", () => {
  assert.equal(opcionAceptadaEn("Aceptamos la opción número 3.", HOTELES)?.numero, 3);
});

prueba("escrito con letra", () => {
  assert.equal(opcionAceptadaEn("Elegimos la opción dos, por favor.", HOTELES)?.numero, 2);
  assert.equal(opcionAceptadaEn("Preferimos la opción tres.", HOTELES)?.numero, 3);
});

prueba("«nos quedamos con la 1», sin la palabra opción", () => {
  assert.equal(opcionAceptadaEn("Buenos días, nos quedamos con la 1.", HOTELES)?.numero, 1);
});

prueba("dice en qué se ha fijado, para poder discutirlo", () => {
  // Una propuesta sin el porqué no se puede revisar: hay que enseñar el trozo.
  const r = opcionAceptadaEn(
    "Gracias por el presupuesto. Lo hemos visto en dirección y nos quedamos con la opción 2.",
    HOTELES,
  );
  assert.match(String(r?.porque), /opción 2/);
});

console.log("\nCuando dicen el hotel, que es lo más normal");

prueba("«nos quedamos con el Santa Mónica»", () => {
  const r = opcionAceptadaEn("Nos quedamos con el Santa Mónica, nos encaja mejor.", HOTELES);
  assert.equal(r?.numero, 3);
  assert.equal(r?.confianza, "alta");
});

prueba("«el Camping La Siesta» sin verbo: se reconoce, con menos confianza", () => {
  const r = opcionAceptadaEn("Al final va a ser el Camping La Siesta.", HOTELES);
  assert.equal(r?.numero, 2);
  assert.equal(r?.confianza, "media");
});

prueba("sin los hoteles no puede adivinar el nombre", () => {
  assert.equal(opcionAceptadaEn("Nos quedamos con el Santa Mónica."), null);
});

console.log("\nLo que NO puede marcarse (aquí se juega el dinero de un colegio)");

prueba("«la 2 no nos vale» no es aceptar la 2", () => {
  // Sin mirar la negación se marcaría justo la que acaban de descartar.
  assert.equal(opcionAceptadaEn("La opción 2 no nos vale, es muy cara.", HOTELES), null);
});

prueba("«descartamos la opción 1»", () => {
  assert.equal(opcionAceptadaEn("Descartamos la opción 1.", HOTELES), null);
});

prueba("«el Santa Mónica no nos convence»", () => {
  assert.equal(opcionAceptadaEn("El Santa Mónica no nos convence.", HOTELES), null);
});

prueba("una pregunta no es una aceptación", () => {
  assert.equal(opcionAceptadaEn("¿Nos podéis enviar más información?", HOTELES), null);
});

prueba("la respuesta de hoy, que NO elige nada", () => {
  // La que mandó Anthony: cortés, sin decidir. Si esto marcara una opción, el
  // sistema sería inservible.
  assert.equal(
    opcionAceptadaEn(
      "Hola gracias por el presupuesto, lo vamos a compartir en direccion y os damos una respuesta lo antes posible. Gracias.",
      HOTELES,
    ),
    null,
  );
});

prueba("un número que no es una opción", () => {
  assert.equal(opcionAceptadaEn("Seremos 46 en vez de 48.", HOTELES), null);
  assert.equal(opcionAceptadaEn("Aceptamos la opción 7.", HOTELES), null);
});

prueba("un mensaje vacío", () => {
  assert.equal(opcionAceptadaEn("", HOTELES), null);
  assert.equal(opcionAceptadaEn("   ", HOTELES), null);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
