/**
 * Los subformularios del trato («Servicios Contratados» y los que haya) con
 * sus columnas, y los campos de la sección de presupuesto (importes, margen,
 * depósito…), con su tipo y, si son fórmula, la fórmula. Solo lectura.
 *
 *   node scripts/subformularios-del-trato.mjs ["IES JAUME BALMES 2027"]
 *
 * Con un nombre de trato, enseña además lo que hay hoy en sus subformularios.
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
const token = (await (await fetch(url, { method: "POST" })).json()).access_token;
const cab = { Authorization: `Zoho-oauthtoken ${token}` };
const modulo = e.ZOHO_DEALS_MODULE || "Deals";

async function campos(mod) {
  const r = await (await fetch(`${e.ZOHO_API_DOMAIN}/crm/v8/settings/fields?module=${mod}`, { headers: cab })).json();
  if (!r.fields) console.log(`  (no se pudieron leer los campos de ${mod}: ${JSON.stringify(r).slice(0, 200)})`);
  return r.fields ?? [];
}

function describir(f) {
  const partes = [`${f.api_name}  «${f.field_label}»  ${f.data_type}`];
  if (f.data_type === "picklist" && f.pick_list_values?.length) {
    partes.push("opciones: " + f.pick_list_values.map((p) => p.display_value).join(" | "));
  }
  if (f.data_type === "lookup" && f.lookup?.module?.api_name) partes.push(`→ ${f.lookup.module.api_name}`);
  if (f.data_type === "formula" && f.formula) partes.push(`fórmula: ${f.formula.expression ?? JSON.stringify(f.formula)}`);
  if (f.data_type === "rollup_summary" && f.rollup_summary) partes.push(`rollup: ${JSON.stringify(f.rollup_summary).slice(0, 200)}`);
  if (f.read_only) partes.push("(solo lectura)");
  if (f.system_mandatory) partes.push("(obligatorio)");
  return partes.join("  ·  ");
}

const delTrato = await campos(modulo);

console.log("=== SUBFORMULARIOS DEL TRATO ===");
const subformularios = delTrato.filter((f) => f.data_type === "subform");
for (const s of subformularios) {
  const mod = s.subform?.module ?? s.subform?.api_name ?? "?";
  console.log(`\n${s.api_name}  «${s.field_label}»  → módulo ${mod}`);
  const columnas = await campos(mod);
  for (const c of columnas) {
    if (["Parent_Id", "id", "Created_Time", "Modified_Time", "Currency", "Exchange_Rate"].includes(c.api_name)) continue;
    console.log("   · " + describir(c));
  }
}

console.log("\n=== CAMPOS DE PRESUPUESTO / IMPORTES (no subformulario) ===");
const interesantes = delTrato.filter(
  (f) =>
    f.data_type !== "subform" &&
    /presupuesto|servicio|margen|deposito|depósito|cobrad|pendiente|amount|importe|total|enlace|opci/i.test(
      `${f.api_name} ${f.field_label}`,
    ),
);
for (const f of interesantes) console.log(" · " + describir(f));

const nombre = process.argv[2];
if (nombre) {
  const b = await (
    await fetch(`${e.ZOHO_API_DOMAIN}/crm/v8/${modulo}/search?criteria=(Deal_Name:equals:${encodeURIComponent(nombre)})`, { headers: cab })
  ).json();
  const id = b.data?.[0]?.id;
  if (id) {
    const r = await (await fetch(`${e.ZOHO_API_DOMAIN}/crm/v8/${modulo}/${id}`, { headers: cab })).json();
    const t = r.data?.[0] ?? {};
    console.log(`\n=== LO QUE HAY HOY EN «${nombre}» (${id}) ===`);
    for (const s of subformularios) console.log(`${s.api_name}: ${JSON.stringify(t[s.api_name] ?? null, null, 1).slice(0, 1200)}`);
    for (const f of interesantes) console.log(`${f.api_name}: ${JSON.stringify(t[f.api_name] ?? null)}`);
  }
}
