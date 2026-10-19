/**
 * El precio para un cliente especial (Javier, 28/09/2026): su tarifa propia
 * si la tiene; si no, la general con su porcentaje.
 *
 * Cómo correrla:  npm run test:especial
 */
import assert from "node:assert/strict";

import type { ClienteEspecial } from "../src/domain/documentImportTypes";
import { CLIENTES_ESPECIALES } from "../src/domain/documentImportTypes";
import { precioParaElCliente } from "../src/domain/precioClienteEspecial";

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

// Un porcentaje de ejemplo: los de verdad aún no los tenemos.
const conPorcentaje: ClienteEspecial[] = [
  { codigo: "AZUL_MARINO", nombre: "Azul Marino", detalle: "", porcentajeSobrePvp: -10 },
];

prueba("sin cliente especial, el precio general tal cual", () => {
  assert.deepEqual(precioParaElCliente(50, "GENERIC", { clientSegment: "" }, false, conPorcentaje), { precio: 50, motivo: null });
  assert.deepEqual(precioParaElCliente(50, null, { clientSegment: null }, false, conPorcentaje), { precio: 50, motivo: null });
});

prueba("su tarifa propia manda: no se le aplica porcentaje", () => {
  assert.equal(precioParaElCliente(80, "AZUL_MARINO", { clientSegment: "AZUL_MARINO" }, true, conPorcentaje).precio, 80);
  // La general de un hotel donde SÍ tiene propia tampoco se toca.
  assert.equal(precioParaElCliente(90, "AZUL_MARINO", { clientSegment: "" }, true, conPorcentaje).precio, 90);
});

prueba("sin tarifa propia: la general con su porcentaje, y se dice", () => {
  const r = precioParaElCliente(50, "AZUL_MARINO", { clientSegment: "" }, false, conPorcentaje);
  assert.equal(r.precio, 45);
  assert.match(r.motivo ?? "", /Azul Marino: −10 % sobre el PVP general/);
});

prueba("hoy nadie tiene porcentaje: se cotiza el general sin tocar", () => {
  for (const c of CLIENTES_ESPECIALES) {
    assert.equal(precioParaElCliente(50, c.codigo, { clientSegment: "" }, false).precio, 50, c.nombre);
  }
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
