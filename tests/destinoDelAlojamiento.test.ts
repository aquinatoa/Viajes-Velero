/**
 * La lista de alojamientos enseña primero los del destino pedido y deja los de
 * cerca a un clic; y el buscador entiende los nombres como los escribe Sports
 * (feedback de Javier del 16/11/2026).
 *
 * Cómo correrla:  npm run test:destino
 *
 * No necesita base de datos ni servidor. Los nombres y las localidades son los
 * del catálogo real de producción a 16/11/2026.
 */
import assert from "node:assert/strict";

import { algunCampoCoincide } from "../src/domain/aliasDeProveedor";
import { estaEnElDestino, separarPorDestino } from "../src/domain/destinoDelAlojamiento";

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

const CATALOGO: Array<{ accommodationName: string; locality: string | null; categoryType: string | null }> = [
  { accommodationName: "Camping Joan – Bungalow Park (Cambrils)", locality: "Cambrils", categoryType: null },
  { accommodationName: "Apartamentos Voralmar Mas d'en Gran (Cambrils)", locality: "Cambrils", categoryType: null },
  { accommodationName: "Hotel Cesar Augustus 3* (Salou/Cambrils)", locality: "Salou/Cambrils", categoryType: "3*" },
  { accommodationName: "Hotel Planas 3* (Salou)", locality: "Salou", categoryType: "3*" },
  { accommodationName: "Villa Bonita / Aloha", locality: "CAMBRILS", categoryType: null },
  { accommodationName: "Mediterrània MED1", locality: "Cambrils", categoryType: null },
  { accommodationName: "Mediterrània MED2/3", locality: "Cambrils", categoryType: null },
  { accommodationName: "Apartaments Pins Platja (Cambrils)", locality: "Cambrils", categoryType: null },
  { accommodationName: "Hotel Santa Mónica Playa 3* (Salou)", locality: "Salou", categoryType: "3*" },
  { accommodationName: "Taiga Resorts Delta de l'Ebre (L'Ampolla)", locality: "L'Ampolla", categoryType: null },
  { accommodationName: "Hotel MedPlaya Calypso 4* (Salou)", locality: "Salou", categoryType: "4*" },
  { accommodationName: "4R Hotels 3* – Salou & Calafell (Salou Park Resort II)", locality: "Salou / Calafell", categoryType: "3*" },
  { accommodationName: "PortAventura World 4* Roulette (Vila-seca/Salou)", locality: "Vila-seca/Salou", categoryType: "4*" },
  { accommodationName: "Hotel Canada Palace 4* (Calafell)", locality: "Calafell", categoryType: "4*" },
  { accommodationName: "Camping Platja Cambrils", locality: "", categoryType: null },
];

const nombres = (lista: Array<{ accommodationName: string }>) => lista.map((a) => a.accommodationName);
const buscar = (texto: string) =>
  nombres(CATALOGO.filter((a) => algunCampoCoincide([a.accommodationName, a.locality, a.categoryType], texto)));

console.log("\nPrimero los del destino pedido");

prueba("pidiendo Cambrils, solo quedan a la vista los de Cambrils", () => {
  const { delDestino, deCerca } = separarPorDestino(CATALOGO, "Cambrils", (a) => a);
  assert.ok(delDestino.every((a) => /cambrils/i.test(a.accommodationName + a.locality)), nombres(delDestino).join(" | "));
  assert.ok(nombres(deCerca).includes("Hotel Planas 3* (Salou)"));
  assert.ok(nombres(deCerca).includes("Hotel Canada Palace 4* (Calafell)"));
  assert.equal(delDestino.length + deCerca.length, CATALOGO.length);
});

prueba("Salou y Cambrils ya no dan la misma lista", () => {
  const salou = nombres(separarPorDestino(CATALOGO, "Salou", (a) => a).delDestino);
  const cambrils = nombres(separarPorDestino(CATALOGO, "Cambrils", (a) => a).delDestino);
  assert.notDeepEqual([...salou].sort(), [...cambrils].sort());
  assert.ok(salou.includes("Hotel Planas 3* (Salou)") && !cambrils.includes("Hotel Planas 3* (Salou)"));
  assert.ok(cambrils.includes("Mediterrània MED1") && !salou.includes("Mediterrània MED1"));
});

prueba("un alojamiento repartido en dos pueblos cuenta en los dos", () => {
  const cesar = { accommodationName: "Hotel Cesar Augustus 3*", locality: "Salou/Cambrils" };
  assert.ok(estaEnElDestino(cesar, "Salou"));
  assert.ok(estaEnElDestino(cesar, "cambrils"));
  assert.ok(estaEnElDestino({ locality: "Salou / Calafell" }, "Calafell"));
  assert.ok(estaEnElDestino({ locality: "Vila-seca/Salou" }, "Salou"));
  assert.ok(!estaEnElDestino({ locality: "Vila-seca/Salou" }, "Cambrils"));
});

prueba("mayúsculas y tildes no cuentan, y sin localidad se mira el nombre", () => {
  assert.ok(estaEnElDestino({ locality: "CAMBRILS" }, "Cambrils"));
  assert.ok(estaEnElDestino({ locality: "L'Ampolla" }, "l'ampolla"));
  assert.ok(estaEnElDestino({ locality: "", accommodationName: "Camping Platja Cambrils" }, "Cambrils"));
  assert.ok(!estaEnElDestino({ locality: "", accommodationName: "Camping Platja Cambrils" }, "Salou"));
});

prueba("sin destino, o sin ninguno en el destino, no se esconde nada", () => {
  assert.equal(separarPorDestino(CATALOGO, "", (a) => a).deCerca.length, 0);
  const lejos = separarPorDestino(CATALOGO, "Reus", (a) => a);
  assert.equal(lejos.delDestino.length, CATALOGO.length);
  assert.equal(lejos.deCerca.length, 0);
});

prueba("el orden que trae la búsqueda no se toca", () => {
  const { delDestino } = separarPorDestino(CATALOGO, "Salou", (a) => a);
  const enCatalogo = CATALOGO.filter((a) => delDestino.includes(a));
  assert.deepEqual(nombres(delDestino), nombres(enCatalogo));
});

console.log("\nEl buscador, con los nombres que escribe Sports");

prueba("«med 1», «med 2» y «med 3» encuentran su Mediterrània", () => {
  assert.deepEqual(buscar("med 1"), ["Mediterrània MED1"]);
  assert.deepEqual(buscar("MED 2"), ["Mediterrània MED2/3"]);
  assert.deepEqual(buscar("med 3"), ["Mediterrània MED2/3"]);
  assert.deepEqual(buscar("med3"), ["Mediterrània MED2/3"]);
  assert.deepEqual(buscar("med1"), ["Mediterrània MED1"]);
});

prueba("«Cambrils Park», entero o a medio escribir, lleva a sus alojamientos", () => {
  for (const escrito of ["cambrils park", "cambrils par", "Cambrils Pa"]) {
    const hallados = buscar(escrito);
    for (const suyo of ["Villa Bonita / Aloha", "Mediterrània MED1", "Mediterrània MED2/3"]) {
      assert.ok(hallados.includes(suyo), `${escrito} → ${hallados.join(" | ")}`);
    }
    assert.ok(!hallados.includes("Apartamentos Voralmar Mas d'en Gran (Cambrils)"), `${escrito}: «par» no es «apartamentos»`);
  }
});

prueba("«Cambrils Park MED 1» da solo el MED1", () => {
  assert.deepEqual(buscar("Cambrils Park MED 1"), ["Mediterrània MED1"]);
  assert.deepEqual(buscar("msh villa"), ["Villa Bonita / Aloha"]);
});

prueba("las palabras valen en cualquier orden", () => {
  assert.deepEqual(buscar("planas hotel"), ["Hotel Planas 3* (Salou)"]);
  assert.deepEqual(buscar("salou calypso"), ["Hotel MedPlaya Calypso 4* (Salou)"]);
});

prueba("lo que no existe sigue sin salir, y una letra suelta no cuela medio catálogo", () => {
  assert.deepEqual(buscar("hotel inexistente"), []);
  assert.deepEqual(buscar("med 9"), []);
  assert.ok(!buscar("4r").includes("PortAventura World 4* Roulette (Vila-seca/Salou)"));
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
