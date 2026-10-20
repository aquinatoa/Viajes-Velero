// El lector de la plantilla de hoteles de Oravia («TARIFES REVISADES HOTELS»):
// las celdas de suplementos tal como vienen en el Excel real (20/10/2026).
import assert from "node:assert/strict";
import { leerSuplementos, regimenYExtra } from "../server/plantillaDeHoteles";

let pasadas = 0;
let fallidas = 0;
function prueba(nombre: string, fn: () => void) {
  try {
    fn();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.log(`  FALLA  ${nombre}`);
    console.log(`        ${error instanceof Error ? error.message : String(error)}`);
  }
}

const resumen = (txt: string) =>
  leerSuplementos(txt).suplementos.map((s) => `${s.tipo}|${s.concept}|${s.amount}${s.amountType === "porcentaje" ? "%" : "€"}|${s.appliesPer ?? "-"}|${s.conditionText ?? "-"}`);

prueba("4R: sábado/víspera, individual, doble profes y servicio extra, cada uno con lo suyo", () => {
  assert.deepEqual(resumen("Sábado/víspera festivo +25% (1-2 noches). Individual +75% s/múltiple. Doble profes +10%. Servicio extra (des./alm./cena) +9€/pax."), [
    "suplemento|Sábado/víspera festivo|25%|-|1-2 noches",
    "suplemento|Individual|75%|-|s/múltiple",
    "suplemento|Doble profes|10%|-|-",
    "suplemento|Servicio extra (des./alm./cena)|9€|pax|-",
  ]);
});

prueba("Bali: la etiqueta «Corta estancia» vale para «2 noches»; la unidad no se queda como condición", () => {
  assert.deepEqual(resumen("Corta estancia: 1 noche +7€/pax · 2 noches +5€/pax/noche. Individual adicional +20€/pax · Doble adicional +7€/pax (bajo petición)."), [
    "suplemento|Corta estancia: 1 noche|7€|pax|-",
    "suplemento|Corta estancia: 2 noches|5€|pax/noche|-",
    "suplemento|Individual adicional|20€|pax|-",
    "suplemento|Doble adicional|7€|pax|bajo petición",
  ]);
});

prueba("California: «excepto» parte en dos; «Tarifa ya incluye…» es nota, no suplemento", () => {
  const r = leerSuplementos("Tarifa ya incluye supl. estudiantes en doble +25% s/precio Múltiple. Estancia 1-2 noches: +10% en todos los períodos, excepto 12/06–25/06 +15%.");
  assert.deepEqual(r.notas, ["Tarifa ya incluye supl. estudiantes en doble +25% s/precio Múltiple"]);
  assert.deepEqual(r.suplementos.map((s) => `${s.concept}|${s.amount}|${s.conditionText}`), [
    "Estancia 1-2 noches|10|en todos los períodos, excepto 12/06–25/06",
    "Estancia 1-2 noches en 12/06–25/06|15|Periodo 12/06–25/06",
  ]);
});

prueba("«Suplemento habitación doble» no pierde letras; DUI y single son individual", () => {
  assert.deepEqual(resumen("Suplemento habitación doble: +40% (1 de cada 25 personas sin suplemento). Suplemento habitación individual: +120%."), [
    "suplemento|habitación doble|40%|-|1 de cada 25 personas sin suplemento",
    "suplemento|habitación individual|120%|-|-",
  ]);
  assert.deepEqual(resumen("Suplemento DUI: 25 €."), ["suplemento|DUI|25€|-|-"]);
  assert.deepEqual(resumen("Supl. single +25€."), ["suplemento|single|25€|-|-"]);
});

prueba("L'Orri: «13 €(esc)/16 €(ad)» son dos; «/hab/noche» es habitación/noche", () => {
  assert.deepEqual(resumen("Hab. ind./doble 15 €/hab/noche · ropa cama 3 € · comida/cena extra 13 €(esc)/16 €(ad) · 1 sola noche 5 €."), [
    "suplemento|Hab. ind./doble|15€|habitación/noche|-",
    "suplemento|ropa cama|3€|-|-",
    "suplemento|comida/cena extra (esc)|13€|-|-",
    "suplemento|comida/cena extra (ad)|16€|-|-",
    "suplemento|1 sola noche|5€|-|-",
  ]);
});

prueba("Comtat: niños con y sin cargo; desayuno de adultos y de niños", () => {
  const r = leerSuplementos("Suplemento 3ª y 4ª persona: +20 € por noche y persona. Niños en apartamento: 0-2 años sin cargo; 3-10 años 6 € por niño (con 2 adultos). Suplemento desayuno: adultos 8 €, niños 4 €.");
  assert.deepEqual(r.suplementos.map((s) => `${s.concept}|${s.amount}|${s.appliesPer}|${s.conditionText}`), [
    "3ª y 4ª persona|20|pax/noche|null",
    "Niños en apartamento: 3-10 años|6|pax|con 2 adultos",
    "desayuno: adultos|8|null|null",
    "desayuno: niños|4|null|null",
  ]);
  assert.deepEqual(r.notas, ["Niños en apartamento: 0-2 años sin cargo"]);
});

prueba("Regente y Roulette: los descuentos son descuentos, también los de signo menos", () => {
  assert.deepEqual(resumen("Dto. 3ª pax en habitación: 25% en todos los periodos. Supl. individual: 27€/día (máx. 10% del total del grupo)."), [
    "descuento|Dto. 3ª pax en habitación|25%|-|en todos los periodos",
    "suplemento|individual|27€|noche|máx. 10% del total del grupo",
  ]);
  assert.deepEqual(resumen("Opción media pensión: −8€/pax/noche sobre PVP. Descuento 15% si se confirma antes del 19/02/2027 (o hasta agotar cupo)."), [
    "descuento|Opción media pensión|8€|pax/noche|sobre PVP",
    "descuento|Descuento|15%|-|si se confirma antes del 19/02/2027 (o hasta agotar cupo)",
  ]);
});

prueba("Camping Platja: la celda con «////» da un suplemento por concepto y periodo; el aviso final es nota", () => {
  const r = leerSuplementos(
    "Sábanas (opcional) (por pax) -- ABRIL / MAYO / OCTUBRE (Excepto Semana Santa y puentes)  -- 6€ //// JUNIO / SEPTIEMBRE (Excepto San Juan y puentes)  -- 6€ //// Comida extra ABRIL / MAYO / \nOCTUBRE (Excepto Semana Santa y \npuentes)  -- 15€ //// Merienda (por persona por comida)  ABRIL / MAYO / OCTUBRE (Excepto Semana Santa y puentes) -- 6,50€ -- JUNIO / SEPTIEMBRE (Excepto San Juan y puentes) -- 6,50€ · ACTUALIZADO 14/08/2026: se añaden filas con el PRECIO FINAL.",
  );
  assert.deepEqual(r.suplementos.map((s) => `${s.concept}|${s.amount}|${s.appliesPer}|${s.conditionText}`), [
    "Sábanas (opcional)|6|pax|ABRIL / MAYO / OCTUBRE (Excepto Semana Santa y puentes)",
    "Sábanas (opcional)|6|pax|JUNIO / SEPTIEMBRE (Excepto San Juan y puentes)",
    "Comida extra|15|null|ABRIL / MAYO / OCTUBRE (Excepto Semana Santa y puentes)",
    "Merienda|6.5|pax/servicio|ABRIL / MAYO / OCTUBRE (Excepto Semana Santa y puentes)",
    "Merienda|6.5|pax/servicio|JUNIO / SEPTIEMBRE (Excepto San Juan y puentes)",
  ]);
  assert.deepEqual(r.notas, ["ACTUALIZADO 14/08/2026: se añaden filas con el PRECIO FINAL"]);
});

prueba("Albergue y Camping Joan: lo que no lleva importe es nota; «ACTUALIZADO» y «Desglose» también", () => {
  const albergue = leerSuplementos("Cama supletoria +10 €/cama · Alquiler de toallas 3,50 €/juego. Sábanas INCLUIDAS, toallas NO incluidas.");
  assert.deepEqual(albergue.suplementos.map((s) => `${s.concept}|${s.appliesPer}`), ["Cama supletoria|cama", "Alquiler de toallas|juego"]);
  assert.deepEqual(albergue.notas, ["Sábanas INCLUIDAS, toallas NO incluidas"]);
  const joan = leerSuplementos("Bici 1 día 13 €/pax. · ACTUALIZADO 14/08/2026: las tarifas MP (34/37 €) y PC (44/47 €) son el PRECIO FINAL. Desglose: alojamiento 14/17 € + MP 20 € o PC 30 €.");
  assert.deepEqual(joan.suplementos.map((s) => s.concept), ["Bici 1 día"]);
  assert.equal(joan.notas.length, 2);
});

prueba("Eurosalou: «2 noches o menos +20%» y el suplemento por fechas señaladas", () => {
  assert.deepEqual(resumen("Estancias de 2 noches o menos: +20%. Suplemento +15 €/pax/día en: 1 mayo, 24-25-26 junio, 15 agosto, 11 septiembre, 11 octubre y 31 octubre."), [
    "suplemento|Estancias de 2 noches o menos|20%|-|-",
    "suplemento|Suplemento|15€|pax/noche|en: 1 mayo, 24-25-26 junio, 15 agosto, 11 septiembre, 11 octubre y 31 octubre",
  ]);
});

prueba("régimen: el código aparte y lo demás como servicio incluido; «MP + Picnic» se respeta", () => {
  assert.deepEqual(regimenYExtra("SA (solo alojamiento)"), { codigo: "SA", extra: null });
  assert.deepEqual(regimenYExtra("ALOJAMIENTO CON MP (menores ≤16)"), { codigo: "MP", extra: "menores ≤16" });
  assert.deepEqual(regimenYExtra("MP (PRECIO FINAL: alojamiento + régimen)"), { codigo: "MP", extra: "PRECIO FINAL: alojamiento + régimen" });
  assert.deepEqual(regimenYExtra("MP + Picnic"), { codigo: "MP + Picnic", extra: null });
  assert.deepEqual(regimenYExtra("PC"), { codigo: "PC", extra: null });
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
