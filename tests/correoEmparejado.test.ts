/**
 * A qué viaje va cada correo que entra.
 *
 * Es la regla de la que depende toda la bandeja. Equivocarse aquí no da error:
 * pone la respuesta de un colegio en el expediente de otro, y nadie lo nota
 * hasta que alguien contesta una cosa por otra. Es literalmente el fallo de
 * Zoho que la app viene a sustituir.
 *
 * El plan era emparejar por subdirección —`groups+ORV-2026-0184@…`—, que no
 * falla nunca. Probado contra su servidor el 25/09/2026: NO funciona, el
 * correo se acepta y desaparece. De ahí las tres vías que se prueban aquí.
 *
 * Cómo correrla:  npm run test:correo
 * No necesita base de datos ni IMAP: la regla es una función pura.
 */
import assert from "node:assert/strict";

import {
  direccionDe,
  emparejar,
  messageIdsCitados,
  normalizarMessageId,
  referenciaEn,
  type EnvioConocido,
} from "../server/correoEmparejado";

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

/** Tres envíos como los que hay de verdad, dos del mismo colegio. */
const ENVIOS: EnvioConocido[] = [
  {
    id: "d1",
    reference: "ORV-2026-0184",
    messageId: "<abc123@oraviatravel.com>",
    recipientEmail: "marta@iesjaumebalmes.cat",
  },
  {
    id: "d2",
    reference: "ORV-2026-0185",
    messageId: "<def456@oraviatravel.com>",
    recipientEmail: "marta@iesjaumebalmes.cat",
  },
  {
    id: "d3",
    reference: "ORV-2026-0190",
    messageId: null, // envío antiguo, de antes de guardar el Message-ID
    recipientEmail: "ampa@iesramonycajal.es",
  },
];

const correo = (cambios: Record<string, unknown> = {}) => ({
  de: "marta@iesjaumebalmes.cat",
  asunto: "Consulta",
  ...cambios,
});

console.log("\nPor Message-ID, que es lo que no falla");

prueba("una respuesta normal cae en su expediente", () => {
  const r = emparejar(correo({ inReplyTo: "<abc123@oraviatravel.com>" }), ENVIOS);
  assert.equal(r?.deliveryId, "d1");
  assert.equal(r?.emparejadoPor, "MESSAGE_ID");
});

prueba("también si el cliente solo rellena References", () => {
  // Hay clientes de correo que rellenan uno y no el otro.
  const r = emparejar(correo({ referencias: "<otro@x.com> <def456@oraviatravel.com>" }), ENVIOS);
  assert.equal(r?.deliveryId, "d2");
});

prueba("los ángulos y las mayúsculas no rompen la comparación", () => {
  // Unos clientes lo guardan con ángulos y otros sin ellos.
  const r = emparejar(correo({ inReplyTo: " ABC123@ORAVIATRAVEL.COM " }), ENVIOS);
  assert.equal(r?.deliveryId, "d1");
});

prueba("el Message-ID manda sobre el asunto", () => {
  // Alguien reenvía la propuesta 0185 escribiendo sobre el hilo de la 0184.
  // La máquina sabe de qué hilo viene; el asunto lo escribió una persona.
  const r = emparejar(
    correo({ inReplyTo: "<abc123@oraviatravel.com>", asunto: "RE: ORV-2026-0185" }),
    ENVIOS,
  );
  assert.equal(r?.deliveryId, "d1");
  assert.equal(r?.emparejadoPor, "MESSAGE_ID");
});

console.log("\nPor la referencia del asunto");

prueba("con «RE:» y todo lo que le añade el cliente", () => {
  const r = emparejar(correo({ asunto: "RE: RE: Propuesta ORV-2026-0185 · Salou" }), ENVIOS);
  assert.equal(r?.deliveryId, "d2");
  assert.equal(r?.emparejadoPor, "ASUNTO");
});

prueba("y si no está en el asunto, se mira el cuerpo", () => {
  // El correo que mandamos la pone ahí: «indicando la referencia ORV-…».
  const r = emparejar(
    correo({ asunto: "Sobre el viaje", cuerpo: "Hola, sobre la ORV-2026-0184 queríamos deciros…" }),
    ENVIOS,
  );
  assert.equal(r?.deliveryId, "d1");
});

prueba("en minúsculas también, que alguien la escribirá a mano", () => {
  const r = emparejar(correo({ asunto: "sobre orv-2026-0184" }), ENVIOS);
  assert.equal(r?.deliveryId, "d1");
});

prueba("una referencia que no es de nadie NO cae en otro sitio", () => {
  // Es la trampa importante: teniendo una referencia equivocada, adivinar por
  // remitente daría un emparejamiento seguro y erróneo.
  const r = emparejar(correo({ asunto: "RE: ORV-2026-9999" }), ENVIOS);
  assert.equal(r, null);
});

console.log("\nPor remitente, y solo sin dudas");

prueba("quien tiene UN solo viaje abierto se empareja", () => {
  const r = emparejar(correo({ de: "ampa@iesramonycajal.es", asunto: "Una pregunta" }), ENVIOS);
  assert.equal(r?.deliveryId, "d3");
  assert.equal(r?.emparejadoPor, "REMITENTE");
});

prueba("con dos viajes abiertos NO se adivina", () => {
  // Marta tiene la 0184 y la 0185. Elegir al azar acierta la mitad de las
  // veces, y la otra mitad manda la conversación al viaje equivocado.
  const r = emparejar(correo({ de: "marta@iesjaumebalmes.cat", asunto: "Una pregunta" }), ENVIOS);
  assert.equal(r, null);
});

prueba("uno cerrado deja de contar, y entonces sí hay uno solo", () => {
  const envios = ENVIOS.map((e) => (e.id === "d2" ? { ...e, cerrado: true } : e));
  const r = emparejar(correo({ de: "marta@iesjaumebalmes.cat", asunto: "Una pregunta" }), envios);
  assert.equal(r?.deliveryId, "d1");
});

prueba("el formato «Nombre <correo>» no estorba", () => {
  const r = emparejar(correo({ de: '"AMPA Ramón y Cajal" <AMPA@iesramonycajal.es>' }), ENVIOS);
  assert.equal(r?.deliveryId, "d3");
});

prueba("un desconocido se queda sin expediente", () => {
  const r = emparejar(correo({ de: "proveedor@hotel.com", asunto: "Oferta" }), ENVIOS);
  assert.equal(r, null);
});

console.log("\nLas piezas sueltas");

prueba("los Message-ID citados salen en orden y sin repetir", () => {
  const ids = messageIdsCitados({
    de: "x@y.z", asunto: "",
    inReplyTo: "<c@x>",
    referencias: "<a@x> <b@x> <c@x>",
  });
  assert.deepEqual(ids, ["c@x", "a@x", "b@x"]);
});

prueba("sin cabeceras de hilo no se inventa ninguno", () => {
  assert.deepEqual(messageIdsCitados({ de: "x@y.z", asunto: "" }), []);
});

prueba("normalizar quita ángulos, espacios y mayúsculas", () => {
  assert.equal(normalizarMessageId(" <ABC@X.COM> "), "abc@x.com");
  assert.equal(normalizarMessageId(null), "");
});

prueba("la referencia se reconoce con cuatro dígitos o más", () => {
  assert.equal(referenciaEn("Propuesta ORV-2026-0184"), "ORV-2026-0184");
  assert.equal(referenciaEn("ORV-2026-12345"), "ORV-2026-12345");
  assert.equal(referenciaEn("nada que ver"), null);
});

prueba("la dirección se saca de cualquiera de las dos formas", () => {
  assert.equal(direccionDe("Marta <Marta@Centro.CAT>"), "marta@centro.cat");
  assert.equal(direccionDe("  marta@centro.cat "), "marta@centro.cat");
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
