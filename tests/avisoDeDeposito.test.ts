/**
 * El aviso al propietario cuando la oportunidad pasa a «Pendiente de depósito»
 * (reunión con Oravia 05/11/2026; propietario = quien hace la propuesta, Anthony 06/11).
 *
 * Cómo correrla:  npm run test:aviso-deposito
 */
import assert from "node:assert/strict";

import { componerAvisoDeDeposito, type DatosDelAviso } from "../server/avisoDeDeposito";

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

const DATOS: DatosDelAviso = {
  propietario: "Marta Ruiz Pérez",
  referencia: "ORV-2026-0009",
  centro: "FC Weinfelden-Bürglen",
  opcion: 2,
  alojamiento: "Apartaments Pins Platja (Cambrils)",
  total: "5.616 €",
  depositoHasta: "16/12/2026",
  enlace: "https://app.oravia.test/p/abc123",
  apuntadoPor: null,
};

prueba("el asunto lleva la fase, la referencia y el centro", () => {
  assert.equal(componerAvisoDeDeposito(DATOS).asunto, "Pendiente de depósito · ORV-2026-0009 · FC Weinfelden-Bürglen");
});

prueba("el texto dice quién eligió, qué opción, el alojamiento, la fase y el vencimiento del depósito", () => {
  const t = componerAvisoDeDeposito(DATOS).texto;
  assert.match(t, /^Hola Marta,/);
  assert.match(t, /«FC Weinfelden-Bürglen» ha elegido la opción 2 de la propuesta ORV-2026-0009\./);
  assert.match(t, /Alojamiento: Apartaments Pins Platja \(Cambrils\) · total 5\.616 €\./);
  assert.match(t, /pasa a «Pendiente de depósito»\. El depósito vence el 16\/12\/2026\./);
  assert.match(t, /Propuesta: https:\/\/app\.oravia\.test\/p\/abc123/);
  assert.match(t, /la propuesta la hiciste tú/);
});

prueba("si lo apuntó alguien desde la app, se dice quién", () => {
  const t = componerAvisoDeDeposito({ ...DATOS, apuntadoPor: "Javier" }).texto;
  assert.match(t, /\(lo ha apuntado Javier desde la app\)/);
});

prueba("sin nombre, sin centro, sin alojamiento ni enlace, el correo sigue teniendo sentido", () => {
  const { asunto, texto } = componerAvisoDeDeposito({
    ...DATOS,
    propietario: null,
    centro: null,
    alojamiento: null,
    total: null,
    enlace: null,
  });
  assert.equal(asunto, "Pendiente de depósito · ORV-2026-0009");
  assert.match(texto, /^Hola,/);
  assert.match(texto, /Han elegido la opción 2/);
  assert.doesNotMatch(texto, /Alojamiento:|Propuesta:/);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
