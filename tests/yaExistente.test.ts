/**
 * «Ya existente» (Ruth, 24/11/2026): al volver a subir un documento, lo que ya
 * está publicado igual no se vuelve a revisar. Aquí, las firmas con las que se
 * compara: funciones puras, sin base de datos.
 *
 * Cómo correrla:  npm run test:ya-existente
 */
import assert from "node:assert/strict";
import {
  claveDeNombre,
  firmaDeCondicion,
  firmaDeTarifaDeActividad,
  firmaDeTarifaDeActividadConCoste,
  firmaDeTarifaDeHotel,
} from "../server/yaExistente";
import { sinDecidirEnAprobados } from "../server/documentImportDb";

let pasadas = 0;
let fallidas = 0;
function prueba(nombre: string, fn: () => void) {
  try {
    fn();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.error(`  MAL ${nombre}`, error);
  }
}

const hotel = {
  year: 2027,
  seasonName: "T. Baja",
  dateFrom: new Date("2027-04-01T00:00:00Z"),
  dateTo: new Date("2027-05-31T00:00:00Z"),
  minNights: 2,
  boardType: "PC",
  tariffUnit: "pax/noche",
  occupancyLabel: "Doble",
  unitName: null,
  minPax: null,
  includedService: null,
  clientSegment: null,
  pvpAmount: 47.52,
  netSaleAmount: 44,
};

prueba("la misma tarifa de hotel da la misma firma, aunque cambien mayúsculas, espacios o el tipo del importe", () => {
  const publicada = { ...hotel, seasonName: "t.  baja", clientSegment: "GENERIC", pvpAmount: "47.520", netSaleAmount: "44.00" };
  assert.equal(firmaDeTarifaDeHotel(hotel), firmaDeTarifaDeHotel(publicada));
});

prueba("un precio distinto NO es ya existente", () => {
  assert.notEqual(firmaDeTarifaDeHotel(hotel), firmaDeTarifaDeHotel({ ...hotel, pvpAmount: 48 }));
  assert.notEqual(firmaDeTarifaDeHotel(hotel), firmaDeTarifaDeHotel({ ...hotel, netSaleAmount: 44.5 }));
});

prueba("otra pensión, otro periodo u otro canal NO es ya existente", () => {
  assert.notEqual(firmaDeTarifaDeHotel(hotel), firmaDeTarifaDeHotel({ ...hotel, boardType: "MP" }));
  assert.notEqual(firmaDeTarifaDeHotel(hotel), firmaDeTarifaDeHotel({ ...hotel, dateTo: new Date("2027-06-15T00:00:00Z") }));
  assert.notEqual(firmaDeTarifaDeHotel(hotel), firmaDeTarifaDeHotel({ ...hotel, clientSegment: "TTOO_SUIZO" }));
});

const entrada = {
  year: 2027, seasonName: null, dateFrom: null, dateTo: null, ageLabel: "Adulto (18-59) · Entrada · Periodo B",
  ageMin: 18, ageMax: 59, rateUnit: "PER_PAX", minPax: 20, maxPax: null, clientSegment: "GENERIC", salePvpAmount: 84, costNetAmount: 67.2,
};

prueba("actividad: sin coste en el documento se compara solo el precio (el coste del catálogo puede ser posterior)", () => {
  assert.equal(firmaDeTarifaDeActividad({ ...entrada, costNetAmount: null }), firmaDeTarifaDeActividad(entrada));
  assert.notEqual(firmaDeTarifaDeActividadConCoste({ ...entrada, costNetAmount: 70 }), firmaDeTarifaDeActividadConCoste(entrada));
  assert.notEqual(firmaDeTarifaDeActividad({ ...entrada, salePvpAmount: 86 }), firmaDeTarifaDeActividad(entrada));
});

prueba("el mismo hotel se reconoce con o sin tildes y signos", () => {
  assert.equal(claveDeNombre("Cambrils Park · MED 1"), claveDeNombre("cambrils park - med 1"));
  assert.equal(claveDeNombre("Hotel Nàutic"), claveDeNombre("HOTEL NAUTIC"));
  assert.notEqual(claveDeNombre("Cambrils Park · MED 1"), claveDeNombre("Cambrils Park · MED 2"));
});

prueba("una condición con otro texto NO es ya existente", () => {
  const c = { policyType: "GRATUIDAD", policyText: "1 gratis cada 10 escolares" };
  assert.equal(firmaDeCondicion(c), firmaDeCondicion({ ...c, policyText: "1 gratis cada 10  escolares " }));
  assert.notEqual(firmaDeCondicion(c), firmaDeCondicion({ ...c, policyText: "1 gratis cada 15 escolares" }));
});

prueba("publicar se para si un hotel aprobado tiene filas sin decidir (se perderían)", () => {
  const plan = {
    accommodations: [
      { accommodationName: "Hotel A", reviewStatus: "APPROVED", rates: [{ reviewStatus: "APPROVED" }, { reviewStatus: "PENDING", pvpAmount: 50 }], adjustments: [{ reviewStatus: "NEEDS_CHANGES" }], policies: [], blackoutDates: [] },
      { accommodationName: "Hotel B", reviewStatus: "APPROVED", rates: [{ reviewStatus: "APPROVED" }, { reviewStatus: "REJECTED" }], adjustments: [], policies: [], blackoutDates: [] },
      { accommodationName: "Hotel C", reviewStatus: "PENDING", rates: [{ reviewStatus: "PENDING" }], adjustments: [], policies: [], blackoutDates: [] },
      // Una tarifa sin importe no se puede aprobar: no bloquea.
      { accommodationName: "Hotel D", reviewStatus: "APPROVED", rates: [{ reviewStatus: "PENDING", pvpAmount: null, netAmount: null, costAmount: null }], adjustments: [], policies: [], blackoutDates: [] },
    ],
    activities: [{ activityName: "Act", reviewStatus: "APPROVED", rates: [{ reviewStatus: "PENDING", salePvpAmount: 12 }], policies: [] }],
  };
  // B: lo rechazado ya está decidido. C: el hotel sin aprobar no se publica ni sustituye nada.
  assert.deepEqual(sinDecidirEnAprobados(plan), [
    { nombre: "Hotel A", cuantas: 2 },
    { nombre: "Act", cuantas: 1 },
  ]);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas) process.exitCode = 1;
