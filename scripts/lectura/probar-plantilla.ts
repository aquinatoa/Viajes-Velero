/**
 * Pasa la plantilla de actividades por el lector sin IA y cuenta qué sale.
 * No toca la base de datos ni llama a ningún proveedor.
 *
 *   node --import tsx scripts/lectura/probar-plantilla.ts "Documentos de Tarifas/PLANTILLA_....xlsx"
 */
import { leerPlantillaDeActividades } from "../../server/plantillaDeActividades";

const fichero = process.argv[2];
if (!fichero) {
  console.error("Falta la ruta del Excel.");
  process.exit(1);
}

const r = leerPlantillaDeActividades(fichero, "prueba");
if (!r) {
  console.log("Este fichero NO tiene la forma de la plantilla de actividades.");
  process.exit(1);
}

console.log(r.documentSummary);
console.log(
  `actividades: ${r.detectedActivities.length} · tarifas: ${r.candidateActivityRates.length} · condiciones: ${r.candidatePolicies.length} · avisos: ${r.warnings.length}`,
);

const conProveedor = r.detectedActivities.filter((a) => a.activityName.includes(" · "));
console.log(`nombres con proveedor (repetidos entre proveedores): ${conProveedor.length}`);
for (const a of conProveedor) console.log(`  ${a.activityName}`);

const cuenta = <T,>(valores: T[]) => {
  const m = new Map<string, number>();
  for (const v of valores) m.set(String(v), (m.get(String(v)) ?? 0) + 1);
  return [...m].map(([k, n]) => `${k}: ${n}`).join(" · ");
};
console.log("unidades:", cuenta(r.candidateActivityRates.map((t) => t.rateUnit)));
console.log("años:", cuenta(r.candidateActivityRates.map((t) => t.year)));
console.log(
  `sin venta: ${r.candidateActivityRates.filter((t) => t.salePvpAmount == null).length} · sin coste: ${r.candidateActivityRates.filter((t) => t.costNetAmount == null).length} · rawText > 60: ${r.candidateActivityRates.filter((t) => (t.rawText ?? "").length > 60).length}`,
);

const grupos = new Set<string>();
for (const t of r.candidateActivityRates) grupos.add(`${t.ageLabel ?? "—"} → ${t.minPax ?? "·"}-${t.maxPax ?? "·"}`);
console.log("variantes (grupo/edad → min-max):");
for (const g of [...grupos].slice(0, 25)) console.log(`  ${g}`);

const primera = r.detectedActivities[0];
console.log("\nejemplo de actividad:", JSON.stringify(primera, null, 2));
console.log("ejemplo de tarifa:", JSON.stringify(r.candidateActivityRates[0], null, 2));
console.log("sus condiciones:");
for (const p of r.candidatePolicies.filter((p) => p.activityName === primera.activityName)) {
  console.log(`  [${p.policyType}] ${p.policyText.slice(0, 90)}`);
}
if (r.warnings.length) {
  console.log("\navisos:");
  for (const w of r.warnings.slice(0, 10)) console.log(`  ${w}`);
}
