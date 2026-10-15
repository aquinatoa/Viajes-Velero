/**
 * Genera la migración que separa en sus tres hoteles las tarifas del
 * turoperador suizo de Cambrils Park.
 *
 * El PDF «RATES MSH 2027 - DESTINATION-TRAVELCLUB» dice el hotel en cada línea
 * («MEDITERRANEA 1 ARTIFICIAL DOBLE», «MEDITERRANEA 2-3 …», «BUNGALOW …»), pero
 * al leerlo las 42 tarifas quedaron en UN solo alojamiento, «CAMBRILS
 * PARK-FUTBOL SALOU»: al cotizar para el suizo no se sabía qué hotel era. En la
 * venta general sí van separados (15/10/2026).
 *
 * El hotel de cada tarifa se sabe por su precio: el Excel de desglose de
 * Cambrils Park da la venta suiza de cada alojamiento, campo, ocupación y
 * régimen, y no hay dos iguales (se comprueba aquí). Los bungalós de ocupación
 * «1 PAX X BUNG», que el Excel no trae, son de Villa Bonita (su doble, 66 € en
 * PC con campo artificial, es la de Villa Bonita).
 *
 *   node scripts/generar-separar-cambrils-suizo.mjs > prisma/migrations/<carpeta>/migration.sql
 */
import XLSX from "xlsx";

const EXCEL = "Tarifas 26-27 Oravia/TARIFAS_MSH_2027_DESGLOSE_COSTE-VENTA_SUIZA-GENERAL.xlsx";
const DOC = "Fútbol Salou 2027 · venta turoperador suizo";
const JUNTOS = "CAMBRILS PARK-FUTBOL SALOU";
// Los mismos nombres que en la venta general, para que se reconozcan.
const HOTELES = {
  "Mediterranea 1": { nombre: "Mediterrània MED1", sufijo: "_med1" },
  "Mediterranea 2-3": { nombre: "Mediterrània MED2/3", sufijo: "_med23" },
  "Villa Bonita": { nombre: "Villa Bonita / Aloha", sufijo: "_vbonita" },
};
const CAMPO = { Artificial: "%rtificial%", "Natural / F.Playa": "%atural%", "Acompañante": "%in campo%" };
const OCUPACION = { Doble: "DOBLE", Individual: "INDIVIDUAL|1 PAX X HAB" };
const REGIMEN = { "P. Completa": "PC", "M. Pensión": "MP" };

const filas = XLSX.utils.sheet_to_json(XLSX.readFile(EXCEL).Sheets["DESGLOSE COSTE-VENTA 2027"], {
  header: 1,
  blankrows: false,
  defval: null,
});

let alojamiento = null;
let campo = null;
let ocupacion = null;
const valores = [];
const vistos = new Map();
for (const f of filas) {
  const [a, c, o, r, , , , , , suiza] = f;
  if (typeof a === "string" && a.startsWith("◆")) continue;
  if (!REGIMEN[r] || typeof suiza !== "number") continue;
  if (a) alojamiento = a;
  if (c) campo = c;
  if (o) ocupacion = o;
  const hotel = HOTELES[alojamiento];
  if (!hotel || !CAMPO[campo] || !OCUPACION[ocupacion]) throw new Error(`Fila sin traducir: ${JSON.stringify(f)}`);
  const clave = `${REGIMEN[r]}|${campo}|${ocupacion}|${suiza}`;
  if (vistos.has(clave) && vistos.get(clave) !== hotel.sufijo) {
    throw new Error(`El precio no basta para saber el hotel: ${clave} vale para dos.`);
  }
  vistos.set(clave, hotel.sufijo);
  valores.push(`  ('${hotel.sufijo}', '${REGIMEN[r]}', '${CAMPO[campo]}', '${OCUPACION[ocupacion]}', ${suiza})`);
}
if (valores.length !== 36) throw new Error(`Esperaba 36 combinaciones y salen ${valores.length}.`);

const nuevos = Object.values(HOTELES)
  .map(
    (h) => `INSERT INTO "Accommodation" ("id", "accommodationName", "locality", "categoryType", "accommodationType",
  "observations", "conditionsText", "freePolicy", "sourceFile", "sourceDocumentId", "sourceStagingId", "createdAt", "updatedAt")
SELECT a."id" || '${h.sufijo}', '${h.nombre}', a."locality", a."categoryType", a."accommodationType",
  a."observations", a."conditionsText", a."freePolicy", a."sourceFile", a."sourceDocumentId", a."sourceStagingId", NOW(), NOW()
FROM juntos a
WHERE NOT EXISTS (SELECT 1 FROM "Accommodation" x WHERE x."id" = a."id" || '${h.sufijo}');`,
  )
  .join("\n\n");

console.log(`-- GENERADO por scripts/generar-separar-cambrils-suizo.mjs desde
-- ${EXCEL}. No editar a mano.
--
-- Separa en sus tres hoteles las 42 tarifas del turoperador suizo de Cambrils
-- Park, que la lectura del PDF juntó en «${JUNTOS}». El hotel de cada
-- tarifa sale de su precio (venta suiza del Excel de desglose); los bungalós
-- «1 PAX X BUNG», a Villa Bonita. Las tarifas no se tocan: solo cambian de
-- alojamiento. El alojamiento junto se borra si se queda vacío.
CREATE TEMP TABLE juntos AS
SELECT a.*
FROM "Accommodation" a
JOIN "SourceDocument" d ON d."id" = a."sourceDocumentId"
WHERE d."controlName" = '${DOC}' AND a."accommodationName" = '${JUNTOS}';

${nuevos}

UPDATE "AccommodationRate" r
SET "accommodationId" = j."id" || v.sufijo
FROM juntos j, (VALUES
${valores.join(",\n")}
) AS v(sufijo, regimen, campo, ocupacion, venta)
WHERE r."accommodationId" = j."id"
  AND r."boardType" = v.regimen
  AND r."includedService" ILIKE v.campo
  AND r."occupancyLabel" ~* ('^(' || v.ocupacion || ')$')
  AND round(r."pvpAmount" * 100) = round(v.venta * 100);

UPDATE "AccommodationRate" r
SET "accommodationId" = j."id" || '_vbonita'
FROM juntos j
WHERE r."accommodationId" = j."id" AND r."occupancyLabel" = '1 PAX X BUNG';

DELETE FROM "Accommodation" a
USING juntos j
WHERE a."id" = j."id"
  AND NOT EXISTS (SELECT 1 FROM "AccommodationRate" r WHERE r."accommodationId" = a."id");

DROP TABLE juntos;`);
