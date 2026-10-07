/**
 * Escribe `.env.servidor` con TODO lo que la app necesita, tomando de `.env`
 * lo que ya está verificado y marcando lo que en el servidor tiene que ser
 * distinto.
 *
 * No imprime ningún secreto: los valores van del fichero al fichero. Lo único
 * que sale por pantalla es el NOMBRE de cada variable y si está rellena.
 *
 * Uso:  node generar-env-servidor.mjs
 */
import fs from "node:fs";

const leer = (ruta) => {
  if (!fs.existsSync(ruta)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(ruta, "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
};

const local = leer(".env");
const prod = leer(".env.produccion");

/** `d` = de dónde sale; `nota` = qué hay que saber. */
const BLOQUES = [
  {
    titulo: "Base de datos",
    vars: [
      {
        k: "DATABASE_URL",
        // Sale de `DATABASE_URL_PROD` del .env local, que es donde está apuntada
        // la del servidor. Si no está, queda el marcador y hay que rellenarlo.
        d: local.DATABASE_URL_PROD ? "FIJO" : "SERVIDOR",
        valor: local.DATABASE_URL_PROD
          ? local.DATABASE_URL_PROD.replace(/^"+|"+$/g, "")
          : "postgresql://USUARIO:CLAVE@localhost:5432/oravia?schema=public",
        nota:
          "La del servidor, NO la local (que apunta al Postgres embebido del 5433). " +
          "CONFIRMAR contra el .env que ya tiene el servidor antes de reiniciar: si no " +
          "coincide, la API no arranca.",
      },
    ],
  },
  {
    titulo: "Quién entra",
    vars: [
      { k: "ADMIN_EMAIL", d: "PRODUCCION", nota: "El admin que se crea al arrancar si no existe." },
      { k: "ADMIN_PASSWORD", d: "PRODUCCION", nota: "Cámbiala en cuanto entren los usuarios reales." },
    ],
  },
  {
    titulo: "La app",
    vars: [
      { k: "API_PORT", d: "FIJO", valor: "8787", nota: "El puerto del Node detrás de nginx." },
      {
        k: "PUBLIC_BASE_URL",
        d: "PRODUCCION",
        nota: "El enlace que reciben los colegios. Con TLS ya emitido, https://",
      },
      { k: "CORS_ORIGINS", d: "SERVIDOR", valor: "", nota: "Vacío si el front lo sirve el mismo nginx." },
      {
        k: "ORAVIA_STORAGE_DIR",
        d: "FIJO",
        valor: "/opt/oravia/storage",
        nota:
          "ES LA QUE YA USA EL SERVIDOR: los documentos subidos tienen guardada en la " +
          "base una ruta /opt/oravia/storage/inventory-documents/... (comprobado el " +
          "05/10). NO cambiarla: cualquier otro valor deja huerfano lo ya subido. " +
          "Y no dejarla vacia, porque vacio resuelve a ./storage, dentro de la release.",
      },
    ],
  },
  {
    titulo: "Zoho CRM · verificado, funciona",
    vars: [
      { k: "ZOHO_REGION", d: "LOCAL" },
      { k: "ZOHO_ACCOUNTS_DOMAIN", d: "LOCAL" },
      { k: "ZOHO_API_DOMAIN", d: "LOCAL" },
      { k: "ZOHO_CLIENT_ID", d: "LOCAL" },
      { k: "ZOHO_CLIENT_SECRET", d: "LOCAL" },
      { k: "ZOHO_REFRESH_TOKEN", d: "LOCAL", nota: "No caduca salvo que lo revoquen." },
      {
        k: "ZOHO_REDIRECT_URI",
        d: "SERVIDOR",
        valor: "http://195.20.235.4/callback",
        nota: "Es la que esta dada de alta en la consola de Zoho. Si algun dia se registra la de https://presupuesto.oraviatravel.com/callback, se cambia aqui a la vez.",
      },
      { k: "ZOHO_DEALS_MODULE", d: "LOCAL" },
      { k: "ZOHO_CONTACTS_MODULE", d: "LOCAL" },
      { k: "ZOHO_ACCOUNTS_MODULE", d: "LOCAL" },
      { k: "ZOHO_DEAL_STAGE", d: "LOCAL", nota: "Fase con la que nace el trato." },
      { k: "ZOHO_DEAL_OPTIONS_FIELD", d: "LOCAL", nota: "Campo donde va el detalle de las opciones." },
      { k: "ZOHO_APPROVED_OPTION_FIELD", d: "LOCAL" },
      { k: "ZOHO_CA_BUNDLE", d: "SERVIDOR", valor: "", nota: "Solo hacía falta por el proxy TLS de la oficina." },
    ],
  },
  {
    titulo: "Correo · SMTP verificado. IMAP conecta, pero el buzón no recibe",
    vars: [
      { k: "MAIL_HOST", d: "LOCAL" },
      { k: "MAIL_PORT", d: "LOCAL" },
      { k: "MAIL_SECURE", d: "LOCAL" },
      { k: "MAIL_IMAP_HOST", d: "LOCAL" },
      { k: "MAIL_IMAP_PORT", d: "LOCAL" },
      { k: "MAIL_GROUPS_ADDRESS", d: "LOCAL" },
      { k: "MAIL_GROUPS_NAME", d: "LOCAL" },
      { k: "MAIL_GROUPS_APP_PASSWORD", d: "LOCAL" },
      { k: "MAIL_SPORTS_ADDRESS", d: "LOCAL" },
      { k: "MAIL_SPORTS_NAME", d: "LOCAL" },
      { k: "MAIL_SPORTS_APP_PASSWORD", d: "LOCAL" },
      {
        k: "MAIL_TEST_RECIPIENT",
        d: "FIJO",
        valor: "",
        nota: "VACIO SIEMPRE EN EL SERVIDOR. Con valor, TODO el correo se desvia ahi y los colegios no reciben nada.",
      },
      {
        k: "MAIL_RECOGER",
        d: "FIJO",
        valor: "1",
        nota: "Enciende la recogida del correo entrante. En local va a 0: mira el buzon real.",
      },
      { k: "MAIL_CADA_MINUTOS", d: "FIJO", valor: "5" },
      { k: "MAIL_CARPETAS", d: "SERVIDOR", valor: "", nota: "Vacio = INBOX." },
      { k: "MAIL_PER_TRIP_DOMAIN", d: "SERVIDOR", valor: "", nota: "Direccion por expediente. NO funciona en su servidor." },
    ],
  },
  {
    titulo: "Lectura de documentos con IA",
    vars: [
      { k: "AI_PROVIDER", d: "LOCAL" },
      { k: "AI_MODEL", d: "LOCAL" },
      { k: "ANTHROPIC_API_KEY", d: "LOCAL", nota: "Tiene coste por documento leido." },
    ],
  },
];

const lineas = [
  "# .env del SERVIDOR · Oravia Travel Group",
  "#",
  "# Generado el " + new Date().toISOString().slice(0, 10) + " desde el .env local ya probado.",
  "#",
  "# Como leerlo:",
  "#   [verificado]  el valor viene del .env local y esta comprobado funcionando",
  "#   [CAMBIAR]     hay que poner el del servidor antes de arrancar",
  "#   [vacio]       a proposito: vacio es el comportamiento correcto",
  "#",
  "# Este fichero NO va a git (.gitignore ignora .env.*). Subelo por SCP o pegalo",
  "# a mano en el servidor, nunca por chat ni por correo.",
  "",
];

const resumen = [];

for (const bloque of BLOQUES) {
  lineas.push("# " + "─".repeat(72));
  lineas.push("# " + bloque.titulo);
  lineas.push("# " + "─".repeat(72));
  for (const v of bloque.vars) {
    const deLocal = local[v.k];
    const deProd = prod[v.k];
    let valor;
    let estado;

    if (v.d === "PRODUCCION" && deProd !== undefined) {
      valor = deProd;
      estado = "verificado";
    } else if (v.d === "LOCAL" && deLocal !== undefined && deLocal !== "") {
      valor = deLocal;
      estado = "verificado";
    } else if (v.valor !== undefined) {
      valor = v.valor;
      // Un valor de servidor que ya conocemos (la URL de retorno registrada en
      // Zoho) no hay que cambiarlo a mano: va verificado.
      estado = v.valor === "" ? "vacio" : v.d === "FIJO" || v.d === "SERVIDOR" ? "verificado" : "CAMBIAR";
    } else {
      valor = "";
      estado = "CAMBIAR";
    }

    if (v.nota) lineas.push("# " + v.nota);
    lineas.push(`# [${estado}]`);
    lineas.push(`${v.k}=${valor}`);
    lineas.push("");
    resumen.push({ k: v.k, estado, relleno: valor !== "" });
  }
}

fs.writeFileSync(".env.servidor", lineas.join("\n"), "utf8");

console.log("\nEscrito .env.servidor\n");
const ancho = Math.max(...resumen.map((r) => r.k.length));
for (const r of resumen) {
  const marca = r.estado === "CAMBIAR" ? "!" : r.estado === "vacio" ? "·" : "✓";
  console.log(`  ${marca} ${r.k.padEnd(ancho)}  ${r.estado}${r.relleno ? "" : "  (sin valor)"}`);
}
const faltan = resumen.filter((r) => r.estado === "CAMBIAR");
console.log(`\n${resumen.length} variables · ${faltan.length} que hay que rellenar a mano\n`);
