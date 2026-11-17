/**
 * El documento del cliente en su idioma: castellano, catalán, inglés o francés
 * (Oravia, 23/09/2026; hecho el 17/11/2026).
 *
 * Cómo correrla:  npm run test:idioma
 *
 * No llama a ningún modelo: el traductor de las pruebas es de mentira.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CLAVES_DE_TEXTO,
  IDIOMAS_DEL_DOCUMENTO,
  conTextosTraducidos,
  conservaLasCifras,
  fechaEnIdioma,
  idiomaDelAsunto,
  idiomaDelDocumento,
  texto,
  textosTraducibles,
  type IdiomaDelDocumento,
} from "../src/domain/idiomaDelDocumento";
import { documentoEnIdioma, traducirTextos, type Traductor } from "../server/traduccionDelDocumento";
import { detectLanguage } from "../src/services/requestService";

let pasadas = 0;
let fallidas = 0;
/** Las pruebas van una detrás de otra: las del traductor comparten carpeta y contador. */
async function prueba(nombre: string, cuerpo: () => void | Promise<void>) {
  try {
    await cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.log(`  FALLA  ${nombre}`);
    console.log(`         ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log("\nQué idioma toca");

await prueba("lo que guarda la solicitud se reconoce, se escriba como se escriba", () => {
  for (const [valor, idioma] of [
    ["Catalán", "ca"], ["català", "ca"], ["CAT", "ca"], ["Valenciano", "ca"],
    ["Inglés", "en"], ["English", "en"], ["en", "en"],
    ["Francés", "fr"], ["français", "fr"], ["FR", "fr"],
    ["Español", "es"], ["Castellano", "es"], ["", "es"], [null, "es"], ["Alemán", "es"],
  ] as Array<[string | null, IdiomaDelDocumento]>) {
    assert.equal(idiomaDelDocumento(valor), idioma, String(valor));
  }
});

await prueba("el idioma de la petición se reconoce en los cuatro: castellano, catalán, inglés y francés", () => {
  assert.equal(detectLanguage("Hola, somos el colegio San José. Necesitamos presupuesto para 48 alumnos y 4 profesores, 4 noches en pensión completa. Gracias."), "Español");
  assert.equal(detectLanguage("Hola, bon dia. Som l'Institut Jaume Balmes i voldríem pressupost per a 48 alumnes i 4 professors, 4 nits amb pensió completa. Gràcies."), "Catalán");
  assert.equal(detectLanguage("Hello, we are FC Niederbipp. We would like a quote for 20 players and 3 coaches, 4 nights half board. Kind regards."), "Inglés");
  assert.equal(detectLanguage("Bonjour, nous sommes un club de football. Nous souhaitons un devis pour 20 joueurs et 3 entraîneurs, 4 nuits en demi-pension. Merci."), "Francés");
  assert.equal(detectLanguage("Salou 12-16/05/2027 48+4"), "");
  // Y de ahí, el idioma del documento.
  assert.equal(idiomaDelDocumento(detectLanguage("Bon dia, som l'escola i necessitem pressupost per a 30 alumnes.")), "ca");
});

console.log("\nLos rótulos fijos");

await prueba("todos los rótulos están en los cuatro idiomas y con los mismos huecos", () => {
  const huecos = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
  for (const clave of CLAVES_DE_TEXTO) {
    const base = texto("es", clave);
    for (const idioma of IDIOMAS_DEL_DOCUMENTO) {
      const t = texto(idioma, clave);
      assert.ok(t.trim().length > 0, `${clave} vacío en ${idioma}`);
      assert.equal(huecos(t), huecos(base), `${clave} en ${idioma} no tiene los mismos huecos`);
    }
  }
});

await prueba("el idioma con el que salió una propuesta se lee del asunto de su correo", () => {
  for (const idioma of IDIOMAS_DEL_DOCUMENTO) {
    assert.equal(idiomaDelAsunto(texto(idioma, "correoAsunto", { ref: "ORV-2026-0009", titulo: "FC Weinfelden 2027" })), idioma);
  }
  // Lo enviado antes de los idiomas, y cualquier cosa rara, es castellano.
  assert.equal(idiomaDelAsunto("Propuesta ORV-2026-0006 · IES JAUME BALMES 2027"), "es");
  assert.equal(idiomaDelAsunto("RE: Proposal ORV-2026-0009"), "es");
  assert.equal(idiomaDelAsunto(null), "es");
});

await prueba("los valores se colocan en su hueco", () => {
  assert.equal(texto("es", "opcion", { n: 2 }), "Opción 2");
  assert.equal(texto("ca", "opcion", { n: 2 }), "Opció 2");
  assert.equal(texto("en", "pagina", { i: 1, n: 3 }), "Page 1 of 3");
  assert.equal(texto("fr", "correoAsunto", { ref: "ORV-2026-0009", titulo: "FC Weinfelden" }), "Proposition ORV-2026-0009 · FC Weinfelden");
  assert.equal(texto("en", "haceFaltaElDeposito", { antes: texto("en", "antesDel", { fecha: "12 May 2027" }) }), "We'll get started. To confirm the booking we need the deposit by 12 May 2027; we'll email you the payment details.");
});

await prueba("las fechas salen en el idioma", () => {
  const dia = new Date("2027-05-12T00:00:00Z");
  assert.equal(fechaEnIdioma(dia, "es"), "12 de mayo de 2027");
  assert.equal(fechaEnIdioma(dia, "en"), "12 May 2027");
  assert.equal(fechaEnIdioma(dia, "fr"), "12 mai 2027");
  assert.match(fechaEnIdioma(dia, "ca"), /12 (de maig|maig) (de |del )?2027/);
  assert.equal(fechaEnIdioma(null, "en"), "");
});

console.log("\nLo que se manda a traducir");

const DOCUMENTO = {
  opciones: [
    {
      optionNumber: 1,
      nombre: "Hotel Planas 3* (Salou)",
      total: "8.971,04 €",
      detalles: ["Pensión completa", "4 noches"],
      porAlumno: "172,52 € por alumno",
      desglose: [{ titulo: "Del 12 al 16 de mayo", lineas: ["48 alumnos a 43,13 € por noche", "4 profesores a 43,13 € por noche"] }],
      condiciones: [{ etiqueta: "Gratuidades", texto: "1 gratuidad cada 25 pax de pago." }],
    },
  ],
  resumen: { filas: [{ optionNumber: 1, nombre: "Hotel Planas 3* (Salou)", total: "8.971,04 €" }], nota: "El precio por alumno reparte todo lo de la opción." },
  notas: "Los profesores firman a la llegada.",
};

await prueba("se mandan los textos con palabras, sin repetir, y nunca los nombres ni los importes", () => {
  const textos = textosTraducibles(DOCUMENTO, ["nombre"]);
  assert.ok(textos.includes("Pensión completa"));
  assert.ok(textos.includes("48 alumnos a 43,13 € por noche"));
  assert.ok(textos.includes("Los profesores firman a la llegada."));
  assert.ok(!textos.includes("Hotel Planas 3* (Salou)"));
  assert.ok(!textos.includes("8.971,04 €"));
  assert.equal(new Set(textos).size, textos.length);
});

await prueba("cada texto vuelve a su sitio traducido; lo que no tiene traducción se queda", () => {
  const mapa = new Map([["Pensión completa", "Full board"], ["4 noches", "4 nights"]]);
  const r = conTextosTraducidos(DOCUMENTO, mapa, ["nombre"]);
  assert.deepEqual(r.opciones[0].detalles, ["Full board", "4 nights"]);
  assert.equal(r.opciones[0].nombre, "Hotel Planas 3* (Salou)");
  assert.equal(r.opciones[0].total, "8.971,04 €");
  assert.equal(r.notas, "Los profesores firman a la llegada.");
  assert.equal(DOCUMENTO.opciones[0].detalles[0], "Pensión completa");
});

await prueba("una traducción vale si conserva todas las cifras, aunque cambie el orden o los separadores", () => {
  assert.ok(conservaLasCifras("48 alumnos a 43,13 € por noche", "48 students at €43.13 per night"));
  assert.ok(conservaLasCifras("Del 12 al 16 de mayo", "From 12 to 16 May"));
  assert.ok(conservaLasCifras("8.971,04 € en total", "8,971.04 € in total"));
  assert.ok(!conservaLasCifras("48 alumnos a 43,13 € por noche", "46 students at €43.13 per night"));
  assert.ok(!conservaLasCifras("1 gratuidad cada 25 pax", "1 free place for every 20 pax"));
  assert.ok(!conservaLasCifras("4 noches", "nights"));
  // El «1» suelto se puede escribir con letra: «une nuit», «a one-night stay».
  assert.ok(conservaLasCifras("sin gratuidad en grupos de 1 noche", "pas de gratuité pour les groupes d'une nuit"));
  assert.ok(conservaLasCifras("1 gratuidad cada 25 pax", "une gratuité pour 25 pax"));
});

console.log("\nEl traductor");

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "oravia-traducciones-"));
let llamadas = 0;
const DICCIONARIO: Record<string, string> = {
  "Pensión completa": "Full board",
  "4 noches": "4 nights",
  "172,52 € por alumno": "€172.52 per student",
  "Del 12 al 16 de mayo": "From 12 to 16 May",
  "48 alumnos a 43,13 € por noche": "48 students at 43,13 € per night",
  // Esta cambia una cifra: no se puede aceptar.
  "4 profesores a 43,13 € por noche": "5 teachers at 43,13 € per night",
  Gratuidades: "Free places",
  "1 gratuidad cada 25 pax de pago.": "1 free place for every 25 paying pax.",
  "El precio por alumno reparte todo lo de la opción.": "The price per student spreads everything in the option.",
  "Los profesores firman a la llegada.": "Teachers sign on arrival.",
};
const deMentira: Traductor = async (textos) => {
  llamadas += 1;
  return textos.map((t) => DICCIONARIO[t] ?? "");
};

await prueba("traduce, descarta la que cambia una cifra y guarda lo demás para no volver a preguntar", async () => {
  const textos = textosTraducibles(DOCUMENTO, ["nombre"]);
  const primera = await traducirTextos(textos, "en", deMentira, carpeta);
  assert.equal(primera.mapa.get("Pensión completa"), "Full board");
  assert.deepEqual(primera.sinTraducir, ["4 profesores a 43,13 € por noche"]);
  // Una llamada para todos y un reintento para la que no pasó.
  assert.equal(llamadas, 2);
  // La segunda vez no se pregunta nada: lo traducido está guardado y lo imposible, apuntado.
  const preguntadas: string[] = [];
  const segunda = await traducirTextos(textos, "en", async (lista) => {
    preguntadas.push(...lista);
    return lista.map(() => "x");
  }, carpeta);
  assert.deepEqual(preguntadas, []);
  assert.deepEqual(segunda.sinTraducir, ["4 profesores a 43,13 € por noche"]);
  assert.equal(segunda.mapa.size, textos.length - 1);
});

await prueba("en castellano no se llama a nadie", async () => {
  const antes = llamadas;
  const r = await documentoEnIdioma(DOCUMENTO, "es", deMentira, carpeta);
  assert.equal(r.documento, DOCUMENTO);
  assert.equal(r.idioma, "es");
  assert.equal(llamadas, antes);
});

await prueba("el documento entero en inglés, con los nombres y los importes intactos", async () => {
  const r = await documentoEnIdioma(DOCUMENTO, "en", deMentira, carpeta);
  assert.equal(r.idioma, "en");
  assert.match(r.aviso ?? "", /1 texto se queda en castellano/);
  assert.equal(r.documento.opciones[0].desglose[0].lineas[1], "4 profesores a 43,13 € por noche");
  assert.equal(r.documento.opciones[0].nombre, "Hotel Planas 3* (Salou)");
  assert.equal(r.documento.opciones[0].total, "8.971,04 €");
  assert.deepEqual(r.documento.opciones[0].detalles, ["Full board", "4 nights"]);
  assert.equal(r.documento.opciones[0].condiciones[0].etiqueta, "Free places");
  assert.equal(r.documento.notas, "Teachers sign on arrival.");
});

await prueba("si el traductor falla, el documento sale ENTERO en castellano y se dice por qué", async () => {
  const otra = fs.mkdtempSync(path.join(os.tmpdir(), "oravia-traducciones-"));
  const r = await documentoEnIdioma(DOCUMENTO, "fr", async () => { throw new Error("sin clave"); }, otra);
  assert.equal(r.idioma, "es");
  assert.equal(r.documento, DOCUMENTO);
  assert.match(r.aviso ?? "", /No se pudo traducir al francés \(sin clave\)/);
  fs.rmSync(otra, { recursive: true, force: true });
});

await prueba("si el traductor devuelve menos textos de los que se le dieron, tampoco se acepta nada a medias", async () => {
  const otra = fs.mkdtempSync(path.join(os.tmpdir(), "oravia-traducciones-"));
  const r = await traducirTextos(["Pensión completa", "4 noches"], "ca", async () => ["Pensió completa"], otra);
  assert.equal(r.mapa.get("Pensión completa"), "Pensió completa");
  assert.deepEqual(r.sinTraducir, ["4 noches"]);
  fs.rmSync(otra, { recursive: true, force: true });
});

fs.rmSync(carpeta, { recursive: true, force: true });
console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
