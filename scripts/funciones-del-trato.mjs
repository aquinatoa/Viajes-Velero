/**
 * Las automatizaciones del trato que tocan «Servicios Contratados» y el
 * Importe: las reglas de flujo y el código de sus funciones. Solo lectura.
 * Necesita un token con ZohoCRM.settings.functions.READ y
 * ZohoCRM.settings.workflow_rules.READ.
 *
 *   node scripts/funciones-del-trato.mjs
 */
import fs from "node:fs";

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
const t = await (await fetch(url, { method: "POST" })).json();
console.log("ámbitos:", t.scope);
const cab = { Authorization: `Zoho-oauthtoken ${t.access_token}` };
const api = async (ruta) => {
  const r = await fetch(`${e.ZOHO_API_DOMAIN}/crm/v8/${ruta}`, { headers: cab });
  const texto = await r.text();
  try { return { status: r.status, body: JSON.parse(texto) }; } catch { return { status: r.status, body: texto }; }
};

console.log("\n=== reglas de flujo de Deals ===");
const reglas = await api("settings/workflow_rules?module=Deals");
const lista = reglas.body?.workflow_rules ?? [];
if (!lista.length) console.log("  ", reglas.status, JSON.stringify(reglas.body).slice(0, 300));
const interesantes = lista.filter((w) => /Subform|Presupuesto|Importe|Servicios|Gestor/i.test(w.name));
for (const w of interesantes) {
  const det = (await api(`settings/workflow_rules/${w.id}?module=Deals`)).body?.workflow_rules?.[0] ?? w;
  console.log(`\n· ${det.name} (${det.id}) · activa=${det.active} · ejecuta=${JSON.stringify(det.execute_when ?? det.execution ?? {}).slice(0, 220)}`);
  if (det.conditions) console.log("    condiciones:", JSON.stringify(det.conditions).slice(0, 600));
  const acciones = det.actions ?? det.instant_actions ?? [];
  console.log("    acciones:", JSON.stringify(acciones).slice(0, 500));
}

console.log("\n=== funciones ===");
const funciones = await api("settings/functions?type=org&category=automation");
const fl = funciones.body?.functions ?? [];
if (!fl.length) console.log("  ", funciones.status, JSON.stringify(funciones.body).slice(0, 300));
for (const f of fl.filter((x) => /Subform|Presupuesto|Importe|Servicios|Gestor/i.test(x.api_name ?? x.display_name ?? x.name ?? ""))) {
  const nombre = f.api_name ?? f.display_name ?? f.name;
  console.log(`\n──── ${nombre} (${f.id}) ────`);
  const det = await api(`settings/functions/${f.id}?source=crm`);
  const fn = det.body?.functions?.[0] ?? det.body;
  const script = fn?.script ?? fn?.source ?? fn?.code ?? null;
  console.log(script ? script : `  (sin código: ${det.status} ${JSON.stringify(fn).slice(0, 300)})`);
}
