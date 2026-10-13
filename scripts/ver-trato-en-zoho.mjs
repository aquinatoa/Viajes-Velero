/**
 * Enseña cómo ha quedado UN trato en el CRM real: fase, importe, opciones de
 * presupuesto, opción aprobada y las últimas notas. Solo lectura.
 *
 *   node scripts/ver-trato-en-zoho.mjs "IES JAUME BALMES 2027"
 */
import fs from "node:fs";

const nombre = process.argv[2];
if (!nombre) {
  console.error("Falta el nombre del trato.");
  process.exit(1);
}

const e = {};
for (const linea of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) e[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
}

const url = new URL(`${e.ZOHO_ACCOUNTS_DOMAIN}/oauth/v2/token`);
url.searchParams.set("refresh_token", e.ZOHO_REFRESH_TOKEN);
url.searchParams.set("client_id", e.ZOHO_CLIENT_ID);
url.searchParams.set("client_secret", e.ZOHO_CLIENT_SECRET);
url.searchParams.set("grant_type", "refresh_token");
const token = (await (await fetch(url, { method: "POST" })).json()).access_token;
const cab = { Authorization: `Zoho-oauthtoken ${token}` };
const modulo = e.ZOHO_DEALS_MODULE || "Deals";

const busqueda = await (
  await fetch(
    `${e.ZOHO_API_DOMAIN}/crm/v8/${modulo}/search?criteria=(Deal_Name:equals:${encodeURIComponent(nombre)})`,
    { headers: cab },
  )
).json();
const trato = busqueda.data?.[0];
if (!trato) {
  console.log("No hay ningún trato con ese nombre.");
  process.exit(0);
}

const campos = [
  "Deal_Name", "Stage", "Amount", "Closing_Date", "Departamento", "Idioma",
  "N_mero_de_personas", "Profesor_entrenador", "Fecha_llegada_actividad", "Fecha_salida_actividad",
  "Opciones_de_Presupuesto", "Description", "Next_Step", "Modified_Time",
  e.ZOHO_APPROVED_OPTION_FIELD,
].filter(Boolean);

console.log(`Trato ${trato.id}`);
for (const c of campos) {
  const v = trato[c];
  const texto = v === null || v === undefined ? "(vacío)" : typeof v === "object" ? JSON.stringify(v) : String(v);
  console.log(`\n· ${c}:`);
  console.log(texto.split("\n").map((l) => "    " + l).join("\n"));
}

const notas = await (
  await fetch(`${e.ZOHO_API_DOMAIN}/crm/v8/${modulo}/${trato.id}/Notes?fields=Note_Title,Note_Content,Created_Time&per_page=10`, { headers: cab })
).json();
console.log("\n· Notas (las últimas):");
for (const n of notas.data ?? []) {
  console.log(`    ${n.Created_Time} · ${n.Note_Title ?? ""} · ${String(n.Note_Content ?? "").replace(/\s+/g, " ").slice(0, 160)}`);
}
