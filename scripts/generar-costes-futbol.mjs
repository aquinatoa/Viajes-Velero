/**
 * Genera la migración que pone el COSTE a las tarifas de fútbol publicadas,
 * leyéndolo del Excel de desglose de Cambrils Park.
 *
 * Las tarifas de fútbol se cargaron de los PDF de venta (general y turoperador
 * suizo), que no dicen lo que cuestan: el CRM no podía calcular margen. El
 * Excel `TARIFAS_MSH_2027_DESGLOSE_COSTE-VENTA_SUIZA-GENERAL.xlsx` trae, por
 * alojamiento, campo, ocupación y régimen, el coste y las dos ventas. Javier
 * confirmó el 13/10/2026 que es el de 2027. Sus ventas coinciden una a una
 * con lo publicado, así que no se vuelve a subir nada: se añade el coste a la
 * tarifa cuya venta casa.
 *
 * Lo que el Excel no trae se queda sin coste: el alojamiento y desayuno de la
 * venta general (18) y los bungalós de la suiza (6).
 *
 *   node scripts/generar-costes-futbol.mjs > prisma/migrations/<carpeta>/migration.sql
 */
import XLSX from "xlsx";

const EXCEL = "Tarifas 26-27 Oravia/TARIFAS_MSH_2027_DESGLOSE_COSTE-VENTA_SUIZA-GENERAL.xlsx";
const hoja = XLSX.readFile(EXCEL).Sheets["DESGLOSE COSTE-VENTA 2027"];
const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: null });

// Cómo se llama cada alojamiento en la venta general publicada. En la suiza
// los tres van juntos como «CAMBRILS PARK-FUTBOL SALOU».
const EN_LA_GENERAL = {
  "Mediterranea 1": "Mediterrània MED1",
  "Mediterranea 2-3": "Mediterrània MED2/3",
  "Villa Bonita": "Villa Bonita / Aloha",
};
const CAMPO = { Artificial: "%rtificial%", "Natural / F.Playa": "%atural%", "Acompañante": "%in campo%" };
const OCUPACION = { Doble: "DOBLE", Individual: "INDIVIDUAL|1 PAX X HAB" };
const REGIMEN = { "P. Completa": "PC", "M. Pensión": "MP" };

let alojamiento = null;
let campo = null;
let ocupacion = null;
const valores = [];
for (const f of filas) {
  const [a, c, o, r, , , coste, , , suiza, , , general] = f;
  if (typeof a === "string" && a.startsWith("◆")) continue;
  if (!REGIMEN[r] || typeof coste !== "number") continue;
  if (a) alojamiento = a;
  if (c) campo = c;
  if (o) ocupacion = o;
  if (!EN_LA_GENERAL[alojamiento] || !CAMPO[campo] || !OCUPACION[ocupacion]) {
    throw new Error(`Fila sin traducir: ${JSON.stringify(f)}`);
  }
  const comun = `'${REGIMEN[r]}', '${CAMPO[campo]}', '${OCUPACION[ocupacion]}'`;
  valores.push(`  ('Fútbol Salou 2027 · venta general', '${EN_LA_GENERAL[alojamiento]}', ${comun}, ${general}, ${coste})`);
  valores.push(`  ('Fútbol Salou 2027 · venta turoperador suizo', NULL, ${comun}, ${suiza}, ${coste})`);
}
if (valores.length !== 72) throw new Error(`Esperaba 72 combinaciones (36 por canal) y salen ${valores.length}.`);

console.log(`-- GENERADO por scripts/generar-costes-futbol.mjs desde
-- ${EXCEL}. No editar a mano.
--
-- El coste de las tarifas de fútbol publicadas, que se cargaron de los PDF
-- de venta y no lo traían. Se pone solo donde la venta publicada coincide con
-- la del Excel y el coste está vacío. Esperado: 36 de la venta general y 36
-- de la suiza; el alojamiento y desayuno y los bungalós se quedan sin coste
-- porque el Excel no los trae.
UPDATE "AccommodationRate" r
SET "netSaleAmount" = v.coste
FROM "Accommodation" a, "SourceDocument" d, (VALUES
${valores.join(",\n")}
) AS v(documento, alojamiento, regimen, campo, ocupacion, venta, coste)
WHERE r."accommodationId" = a."id"
  AND a."sourceDocumentId" = d."id"
  AND d."controlName" = v.documento
  AND (v.alojamiento IS NULL OR a."accommodationName" = v.alojamiento)
  AND r."boardType" = v.regimen
  AND r."includedService" ILIKE v.campo
  AND r."occupancyLabel" ~* ('^(' || v.ocupacion || ')$')
  AND round(r."pvpAmount" * 100) = round(v.venta * 100)
  AND r."netSaleAmount" IS NULL;`);
