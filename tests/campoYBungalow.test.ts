/**
 * Césped natural, artificial y bungalows: el club lo pide y el cotizador tiene
 * que entenderlo (petición real de suizos del 18/11/2026: «Natural Grass»,
 * «Bungalows», MSH).
 *
 * Cómo correrla:  npm run test:campo
 *
 * No necesita base de datos ni servidor. Los textos de tarifa son los del
 * catálogo de producción a 18/11/2026.
 */
import assert from "node:assert/strict";

import {
  afinidadConElCampo,
  campoDeLaTarifa,
  campoDelRequisito,
  esBungalow,
  esRequisitoDeBungalow,
  loQuePideElClub,
} from "../src/domain/campoYBungalow";
import { comprobar } from "../server/encajeConLaPeticion";

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

console.log("\nLo que pide el club");

prueba("«Natural Grass», «césped natural», «campo natural» y «hierba natural» son césped natural", () => {
  for (const r of ["Natural Grass", "natural grass pitch", "césped natural", "Campo natural", "campo de hierba natural"]) {
    assert.equal(campoDelRequisito(r), "natural", r);
  }
});

prueba("«Artificial Turf», «césped artificial» y «campo artificial» son césped artificial", () => {
  for (const r of ["Artificial Turf", "artificial grass", "césped artificial", "Campo artificial"]) {
    assert.equal(campoDelRequisito(r), "artificial", r);
  }
});

prueba("lo que no habla de campo no es un campo: «Parque natural», «Bungalows», «autocar»", () => {
  for (const r of ["Parque natural del Delta", "Bungalows", "autocar", "habitación adaptada"]) {
    assert.equal(campoDelRequisito(r), null, r);
  }
});

prueba("«Bungalows» y «mobil-home» son bungalow; «Natural Grass», no", () => {
  assert.ok(esRequisitoDeBungalow("Bungalows"));
  assert.ok(esRequisitoDeBungalow("bungalow"));
  assert.ok(!esRequisitoDeBungalow("Natural Grass"));
});

prueba("la petición del club suizo: campo natural y bungalows", () => {
  assert.deepEqual(loQuePideElClub(["Natural Grass", "Bungalows", "MSH: Mediterranean Sports Hub"]), {
    campo: "natural",
    bungalow: true,
  });
});

prueba("si pide los dos campos, no se prefiere ninguno", () => {
  assert.equal(loQuePideElClub(["césped natural", "césped artificial"]).campo, null);
});

console.log("\nEl campo de cada tarifa (textos del catálogo)");

prueba("venta general y suizo: natural, artificial y sin campo", () => {
  assert.equal(campoDeLaTarifa("Aloj + Campo Natural / Fútbol Playa (1.30h)"), "natural");
  assert.equal(campoDeLaTarifa("Campo natural"), "natural");
  assert.equal(campoDeLaTarifa("Aloj + Campo Artificial (1.30h)"), "artificial");
  assert.equal(campoDeLaTarifa("Campo artificial"), "artificial");
  assert.equal(campoDeLaTarifa("Sin campo (acompañante)"), "sin campo");
  assert.equal(campoDeLaTarifa("Aloj sin campo"), "sin campo");
  assert.equal(campoDeLaTarifa("PRECIO FINAL: alojamiento + régimen"), null);
});

prueba("la afinidad solo cuenta el campo pedido", () => {
  const pide = loQuePideElClub(["Natural Grass"]);
  assert.equal(afinidadConElCampo("Campo natural", pide), 1);
  assert.equal(afinidadConElCampo("Campo artificial", pide), 0);
  assert.equal(afinidadConElCampo("Campo natural", loQuePideElClub([])), 0);
});

console.log("\nQué es un bungalow");

prueba("Villa Bonita / Aloha es bungalow (Javier, 17/11) aunque el nombre no lo diga", () => {
  assert.ok(esBungalow(["Cambrils Park · Villa Bonita / Aloha"]));
  assert.ok(esBungalow(["Camping Joan – Bungalow Park (Cambrils)"]));
  assert.ok(esBungalow(["Hotel X", "1 PAX X BUNG"]));
});

prueba("MED 1 o un hotel no son bungalows", () => {
  assert.ok(!esBungalow(["Cambrils Park · MED 1", "DOBLE", "Campo natural"]));
  assert.ok(!esBungalow(["Hotel Planas 3* (Salou)"]));
});

console.log("\n«Lo que pidió el centro»");

const PIDE = { requisitos: ["Natural Grass", "Bungalows"] };
const VILLA_BONITA = {
  textos: [],
  nombre: "Cambrils Park · Villa Bonita / Aloha",
  deSusTarifas: ["Campo natural", "Campo artificial", "Sin campo (acompañante)", "DOBLE", "1 PAX X BUNG"],
};
const linea = (lista: ReturnType<typeof comprobar>, que: string) => lista.find((c) => c.que === que);

prueba("con la tarifa de campo natural: ✓ césped natural y ✓ bungalows", () => {
  const r = comprobar(PIDE, VILLA_BONITA, { boardType: "PC", includedService: "Campo natural" }, {});
  assert.equal(linea(r, "Césped natural")?.estado, "cumple");
  assert.equal(linea(r, "Bungalows")?.estado, "cumple");
});

prueba("si se eligió la de artificial y tiene natural: «—» y dice que se cambie", () => {
  const r = comprobar(PIDE, VILLA_BONITA, { boardType: "PC", includedService: "Campo artificial" }, {});
  assert.equal(linea(r, "Césped natural")?.estado, "no_consta");
  assert.match(linea(r, "Césped natural")?.detalle ?? "", /cámbiala/);
});

prueba("un hotel que solo trae campo artificial: ✗ césped natural", () => {
  const r = comprobar(
    PIDE,
    { textos: [], nombre: "Otro hotel", deSusTarifas: ["Campo artificial"] },
    { boardType: "PC", includedService: "Campo artificial" },
    {},
  );
  assert.equal(linea(r, "Césped natural")?.estado, "no_cumple");
  assert.equal(linea(r, "Bungalows")?.estado, "no_consta");
});

prueba("un hotel sin campos en sus tarifas: «—», no «✗»", () => {
  const r = comprobar(PIDE, { textos: ["Parque natural a 5 km"], nombre: "Hotel Planas 3* (Salou)" }, { boardType: "PC" }, {});
  assert.equal(linea(r, "Césped natural")?.estado, "no_consta");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
