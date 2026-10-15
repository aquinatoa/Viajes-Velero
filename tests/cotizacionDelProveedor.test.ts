/**
 * La cotización del proveedor para lo que no está en el catálogo: lo que se
 * hace con la lectura del modelo y las cuentas del margen (Javier, 29/09 y
 * 13/10/2026). La llamada al modelo no se prueba aquí: se prueba lo que se
 * hace con lo que devuelve, que es donde un precio mal entendido haría daño.
 *
 * Cómo correrla:  npm run test:cotizacion
 */
import assert from "node:assert/strict";

import {
  importe,
  MARGEN_DEPORTIVO,
  MARGEN_GRUPOS,
  margenDelDepartamento,
  normalizarLectura,
  precioConMargen,
} from "../src/domain/cotizacionDelProveedor";

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

console.log("El margen");

prueba("Grupos al 8 %, Turismo Deportivo al 12 %, y sin departamento el de Grupos", () => {
  assert.equal(margenDelDepartamento("GROUPS"), MARGEN_GRUPOS);
  assert.equal(margenDelDepartamento("SPORTS"), MARGEN_DEPORTIVO);
  assert.equal(margenDelDepartamento(""), 8);
  assert.equal(MARGEN_DEPORTIVO, 12);
});

prueba("el precio de venta es el coste con el margen, redondeado al céntimo", () => {
  assert.equal(precioConMargen(42, 8), 45.36);
  assert.equal(precioConMargen(42, 12), 47.04);
  assert.equal(precioConMargen(38.5, 8), 41.58);
  assert.equal(precioConMargen(10, 0), 10);
});

console.log("Los importes que devuelve el modelo");

prueba("número, texto con coma, con «€» o con punto de miles", () => {
  assert.equal(importe(42), 42);
  assert.equal(importe("42,50"), 42.5);
  assert.equal(importe("42,50 €"), 42.5);
  assert.equal(importe("1.250,00"), 1250);
  assert.equal(importe("45.5"), 45.5);
});

prueba("cero, negativo, vacío o basura no son un precio", () => {
  assert.equal(importe(0), null);
  assert.equal(importe(-3), null);
  assert.equal(importe(""), null);
  assert.equal(importe("a consultar"), null);
  assert.equal(importe(null), null);
});

console.log("La lectura de un hotel");

prueba("se queda con lo que encaja y con la cita de dónde sale", () => {
  const l = normalizarLectura(
    {
      nombre: "Hotel Planas",
      dondeOProveedor: "Salou",
      regimen: "pc",
      coste: "42,00",
      costeProfesor: 55,
      iva: "incluido",
      condiciones: "1 gratuidad cada 25 de pago. Depósito del 30 %.",
      cita: "Pensión completa 42 € por persona y noche, IVA incluido",
      avisos: ["Las fechas del correo son del 12 al 15 de marzo."],
    },
    "hotel",
  );
  assert.equal(l.nombre, "Hotel Planas");
  assert.equal(l.regimen, "PC");
  assert.equal(l.coste, 42);
  assert.equal(l.costeProfesor, 55);
  assert.equal(l.iva, "incluido");
  assert.equal(l.cita, "Pensión completa 42 € por persona y noche, IVA incluido");
  assert.deepEqual(l.avisos, ["Las fechas del correo son del 12 al 15 de marzo."]);
});

prueba("sin precio: el coste queda vacío y se avisa, en vez de inventar uno", () => {
  const l = normalizarLectura({ nombre: "Hotel Planas", coste: null, avisos: [] }, "hotel");
  assert.equal(l.coste, null);
  assert.match(l.avisos[0], /No he encontrado un precio por alumno y noche/);
});

prueba("un régimen que no es PC, MP, AD ni SA no se da por bueno", () => {
  assert.equal(normalizarLectura({ regimen: "todo incluido", coste: 40 }, "hotel").regimen, "");
});

prueba("un IVA que no se entiende cuenta como «no lo dice»", () => {
  assert.equal(normalizarLectura({ coste: 40, iva: "21%" }, "hotel").iva, "no lo dice");
  assert.equal(normalizarLectura({ coste: 40, iva: "no incluido" }, "hotel").iva, "no incluido");
});

prueba("una respuesta que no es un objeto no revienta: lectura vacía con aviso", () => {
  const l = normalizarLectura("lo siento", "hotel");
  assert.equal(l.coste, null);
  assert.equal(l.nombre, "");
  assert.equal(l.avisos.length, 1);
});

console.log("La lectura de una actividad");

prueba("una actividad no tiene régimen ni precio de profesor", () => {
  const l = normalizarLectura(
    { nombre: "Visita a la bodega", dondeOProveedor: "Celler Mas Ferran", regimen: "PC", coste: 12, costeProfesor: 9 },
    "actividad",
  );
  assert.equal(l.regimen, "");
  assert.equal(l.costeProfesor, null);
  assert.equal(l.coste, 12);
  assert.equal(l.dondeOProveedor, "Celler Mas Ferran");
});

prueba("sin precio, el aviso habla de alumno, no de noche", () => {
  const l = normalizarLectura({}, "actividad");
  assert.match(l.avisos[0], /precio por alumno: ponlo a mano/);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
