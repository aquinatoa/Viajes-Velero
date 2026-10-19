/**
 * Tarifas ad hoc: un hotel o una actividad fuera del catálogo, con el precio
 * del proveedor (Ruth, 29/09/2026; Javier, 08/10/2026).
 *
 * Cómo correrla:  npm run test:adhoc
 */
import assert from "node:assert/strict";

import {
  actividadComoResultado,
  codigoDeRegimen,
  conLoAdHoc,
  esAdHoc,
  hotelComoResultado,
  nuevoIdAdHoc,
  problemasDeLaActividad,
  problemasDelHotel,
  sustituidosPor,
  type HotelAdHoc,
} from "../src/domain/adHoc";
import { totalAlojamiento } from "../src/services/pricing";

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

const hotel: HotelAdHoc = {
  id: nuevoIdAdHoc(),
  nombre: "Hotel Golden Donaire",
  localidad: "La Pineda",
  regimen: "PC",
  precioAlumno: 52.5,
  precioProfesor: 70,
  condiciones: "1 gratuidad por cada 25 de pago.",
  origen: "Hola Ruth, os confirmamos 48,60 € neto por pax y noche en PC…",
};

console.log("Identificarlo");

prueba("el id empieza por adhoc: y no se repite", () => {
  const a = nuevoIdAdHoc();
  const b = nuevoIdAdHoc();
  assert.equal(esAdHoc(a), true);
  assert.notEqual(a, b);
  assert.equal(esAdHoc("cmuw0nc3200dwyduwbi77r5xm"), false);
  assert.equal(esAdHoc(null), false);
});

console.log("Lo que hace falta");

prueba("un hotel necesita nombre, régimen y precio de alumno", () => {
  assert.deepEqual(problemasDelHotel(hotel), []);
  assert.equal(problemasDelHotel({ ...hotel, nombre: " " }).length, 1);
  assert.equal(problemasDelHotel({ ...hotel, regimen: "" }).length, 1);
  assert.equal(problemasDelHotel({ ...hotel, precioAlumno: 0 }).length, 1);
  assert.equal(problemasDelHotel({ ...hotel, precioProfesor: null }).length, 0, "sin precio de profesor vale");
});

prueba("una actividad necesita nombre y precio por alumno", () => {
  assert.equal(problemasDeLaActividad({ nombre: "Bodega", precioPorAlumno: 12 }).length, 0);
  assert.equal(problemasDeLaActividad({ nombre: "", precioPorAlumno: 12 }).length, 1);
  assert.equal(problemasDeLaActividad({ nombre: "Bodega", precioPorAlumno: 0 }).length, 1);
});

prueba("el régimen de la petición se traduce al código del desplegable", () => {
  assert.equal(codigoDeRegimen("pensión completa"), "PC");
  assert.equal(codigoDeRegimen("media pensión"), "MP");
  assert.equal(codigoDeRegimen("MP"), "MP");
  assert.equal(codigoDeRegimen("alojamiento y desayuno"), "AD");
  assert.equal(codigoDeRegimen(""), "");
});

console.log("Como un resultado de búsqueda");

prueba("el hotel lleva su precio de alumnos y, aparte, el de profesores en individual", () => {
  const r = hotelComoResultado(hotel, 2027);
  assert.equal(r.accommodation.id, hotel.id);
  assert.equal(r.rate.pvpAmount, 52.5);
  assert.equal(r.rate.boardType, "PC");
  assert.equal(r.singleRate?.pvpAmount, 70);
  assert.equal(r.adHoc, true);
  assert.equal(hotelComoResultado({ ...hotel, precioProfesor: null }, 2027).singleRate, null);
});

prueba("el texto del proveedor (con su coste) NUNCA va a lo que sale en el documento del colegio", () => {
  const r = hotelComoResultado(hotel, 2027);
  const visible = [r.accommodation.observations, r.accommodation.conditionsText, r.accommodation.freePolicy].join(" ");
  assert.ok(!visible.includes("48,60"), visible);
  assert.equal(r.accommodation.conditionsText, "1 gratuidad por cada 25 de pago.");
  const a = actividadComoResultado(
    { id: nuevoIdAdHoc(), nombre: "Bodega", proveedor: "Mas Ferran", precioPorAlumno: 12, descripcion: "Visita y cata de mosto.", origen: "Coste 9 €" },
    2027,
  );
  assert.equal(a.activity.descriptionText, "Visita y cata de mosto.");
  assert.ok(!a.activity.descriptionText.includes("9 €"));
});

prueba("lo ad hoc va delante y no se duplica al volver a buscar", () => {
  const r = hotelComoResultado(hotel, 2027);
  const catalogo = { matches: [{ ...r, accommodation: { ...r.accommodation, id: "otro" }, adHoc: false }] };
  const una = conLoAdHoc(catalogo, [r], (m) => m.accommodation.id);
  const dos = conLoAdHoc(una, [r], (m) => m.accommodation.id);
  assert.deepEqual(dos.matches.map((m) => m.accommodation.id), [hotel.id, "otro"]);
});

console.log("En la propuesta");

prueba("un hotel ad hoc se cotiza con su precio: (52,50 × 48 + 70 × 4) × 4 noches", () => {
  const r = hotelComoResultado(hotel, 2027);
  // Lo mismo que hace la propuesta: el PVP de la tarifa, y el de profesores aparte.
  const total = totalAlojamiento({
    unitPrice: r.rate.pvpAmount,
    teacherPrice: r.singleRate?.pvpAmount ?? r.rate.pvpAmount,
    participants: 48,
    teachers: 4,
    nights: 4,
  });
  assert.equal(total, 11200);
});

console.log("El coste del proveedor y que mande sobre el catálogo");

prueba("el coste viaja en la tarifa como neto: la propuesta lo guarda y el CRM lo usa", () => {
  const r = hotelComoResultado({ ...hotel, costeAlumno: 48.61, costeProfesor: 64.81, cotizacionId: "c1" }, 2027);
  assert.equal(r.rate.netSaleAmount, 48.61);
  assert.equal(r.singleRate?.netSaleAmount, 64.81);
  assert.equal(r.cotizacionId, "c1");
});

prueba("sin coste de profesor, el profesor cuesta lo del alumno", () => {
  const r = hotelComoResultado({ ...hotel, costeAlumno: 48.61, costeProfesor: null }, 2027);
  assert.equal(r.singleRate?.netSaleAmount, 48.61);
});

prueba("un borrador de antes (sin coste) sigue funcionando, con neto 0", () => {
  const r = hotelComoResultado(hotel, 2027);
  assert.equal(r.rate.netSaleAmount, 0);
  assert.equal(r.cotizacionId, null);
});

prueba("el mismo hotel del catálogo deja de salir cuando hay uno ad hoc", () => {
  const delCatalogo = { ...hotelComoResultado({ ...hotel, id: "cat-1", nombre: "GOLDEN DONAIRE" }, 2027), adHoc: false };
  const otro = { ...hotelComoResultado({ ...hotel, id: "cat-2", nombre: "Hotel Planas" }, 2027), adHoc: false };
  const propio = hotelComoResultado(hotel, 2027);
  const r = conLoAdHoc(
    { matches: [delCatalogo, otro] },
    [propio],
    (m) => m.accommodation.id,
    (m) => m.accommodation.accommodationName,
  );
  assert.deepEqual(r.matches.map((m) => m.accommodation.id), [hotel.id, "cat-2"]);
});

prueba("sin decir cómo se llama, solo se quita por id (como antes)", () => {
  const delCatalogo = { ...hotelComoResultado({ ...hotel, id: "cat-1" }, 2027), adHoc: false };
  const r = conLoAdHoc({ matches: [delCatalogo] }, [hotelComoResultado(hotel, 2027)], (m) => m.accommodation.id);
  assert.equal(r.matches.length, 2);
});

prueba("los del catálogo a los que sustituye: mismo nombre, sin tildes ni «Hotel»", () => {
  const matches = [
    { id: "cat-1", nombre: "Hotel Gólden Donaire" },
    { id: "cat-2", nombre: "Hotel Planas" },
    { id: hotel.id, nombre: hotel.nombre },
  ];
  assert.deepEqual(
    sustituidosPor(matches, hotel, (m) => m.id, (m) => m.nombre),
    ["cat-1"],
  );
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
