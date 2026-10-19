/**
 * Clientes especiales en la base de datos (Anthony, 19/10/2026: «cualquier
 * cliente, cliente especial, y pedir los datos del cliente especial o tomarlos
 * del documento»). Lo que no depende de la base: comparar nombres, el código
 * con el que se guardan sus tarifas y lo que vale para darlo de alta.
 *
 * Cómo correrla:  npm run test:clientes
 */
import assert from "node:assert/strict";

import {
  codigoDeClienteEspecial,
  mismoCliente,
  nombreDelCanal,
  pareceElMismo,
} from "../src/domain/clientesEspeciales";
import { CLIENTES_ESPECIALES } from "../src/domain/documentImportTypes";
import { bloquesParaValidar } from "../src/domain/validacionDeLaPeticion";
import { problemasDelAlta } from "../server/clientesEspeciales";

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

const suizo = CLIENTES_ESPECIALES.find((c) => c.codigo === "SWISS_TTOO")!;
const azul = CLIENTES_ESPECIALES.find((c) => c.codigo === "AZUL_MARINO")!;

console.log("El código de sus tarifas");

prueba("el nombre en mayúsculas, sin tildes ni espacios", () => {
  assert.equal(codigoDeClienteEspecial("Viajes Álamo", new Set()), "VIAJES_ALAMO");
  assert.equal(codigoDeClienteEspecial("  Club Nàutic  de Salou! ", new Set()), "CLUB_NAUTIC_DE_SALOU");
});

prueba("si ya existe, con un número detrás", () => {
  assert.equal(codigoDeClienteEspecial("Azul Marino", new Set(["AZUL_MARINO"])), "AZUL_MARINO_2");
  assert.equal(codigoDeClienteEspecial("Azul Marino", new Set(["AZUL_MARINO", "AZUL_MARINO_2"])), "AZUL_MARINO_3");
});

prueba("nunca GENERIC, que es «cualquier cliente»", () => {
  assert.equal(codigoDeClienteEspecial("Generic", new Set()), "GENERIC_2");
});

prueba("un nombre sin letras ni números no deja el código vacío", () => {
  assert.equal(codigoDeClienteEspecial("···", new Set()), "CLIENTE");
});

console.log("Reconocer un cliente que ya existe");

prueba("el mismo nombre escrito de otra manera", () => {
  assert.ok(mismoCliente("Azul Marino", "AZUL MARINO"));
  assert.ok(mismoCliente("Turoperador Suizo", "turoperador suizo"));
  assert.ok(!mismoCliente("Azul Marino", "Azul"));
  assert.ok(!mismoCliente("", ""));
});

prueba("lo que se lee del documento casa por el nombre o por quién es", () => {
  assert.ok(pareceElMismo(suizo, "Destination Travelclub"));
  assert.ok(pareceElMismo(azul, "Viajes Azul Marino S.L."));
  assert.ok(!pareceElMismo(azul, "Halcón Viajes"));
});

prueba("un nombre corto solo casa si es idéntico", () => {
  assert.ok(!pareceElMismo(azul, "Azul"));
});

console.log("Darlo de alta");

prueba("el nombre es obligatorio", () => {
  assert.deepEqual(problemasDelAlta({ nombre: "  " }), ["Falta el nombre del cliente."]);
  assert.deepEqual(problemasDelAlta({ nombre: "Azul Marino" }), []);
});

prueba("el porcentaje es opcional y razonable", () => {
  assert.deepEqual(problemasDelAlta({ nombre: "X", porcentajeSobrePvp: "" }), []);
  assert.deepEqual(problemasDelAlta({ nombre: "X", porcentajeSobrePvp: -10 }), []);
  assert.equal(problemasDelAlta({ nombre: "X", porcentajeSobrePvp: -100 }).length, 1);
  assert.equal(problemasDelAlta({ nombre: "X", porcentajeSobrePvp: "mucho" }).length, 1);
});

console.log("El canal en palabras");

prueba("cualquier cliente, uno conocido y uno nuevo de la base", () => {
  assert.equal(nombreDelCanal("GENERIC"), "Cualquier cliente");
  assert.equal(nombreDelCanal(""), "Cualquier cliente");
  assert.equal(nombreDelCanal("AZUL_MARINO"), "Cliente especial · Azul Marino");
  const nuevos = [...CLIENTES_ESPECIALES, { codigo: "VIAJES_ALAMO", nombre: "Viajes Álamo", detalle: "", porcentajeSobrePvp: null }];
  assert.equal(nombreDelCanal("VIAJES_ALAMO", nuevos), "Cliente especial · Viajes Álamo");
});

prueba("el resumen de la petición dice el cliente especial nuevo por su nombre", () => {
  const nuevos = [...CLIENTES_ESPECIALES, { codigo: "VIAJES_ALAMO", nombre: "Viajes Álamo", detalle: "", porcentajeSobrePvp: null }];
  const fila = bloquesParaValidar({ canal: "VIAJES_ALAMO" } as never, nuevos)
    .flatMap((b) => b.filas)
    .find((f) => f.que === "Cotizamos para");
  assert.equal(fila?.valor, "Cliente especial · Viajes Álamo");
  const general = bloquesParaValidar({ canal: "GENERIC" } as never)
    .flatMap((b) => b.filas)
    .find((f) => f.que === "Cotizamos para");
  assert.equal(general?.valor, "Colegio, club o agencia");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
