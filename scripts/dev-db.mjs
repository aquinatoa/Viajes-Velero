/**
 * PostgreSQL local para desarrollo, sin Docker y sin instalar nada.
 *
 * El README documentaba levantar la base con Docker, pero en un portátil de
 * trabajo sin Docker (ni permisos para instalarlo) eso deja la app sin forma de
 * arrancar en local: desde que la base pasó de SQLite a PostgreSQL, no había
 * manera de probar nada sin tocar producción. Esto usa un PostgreSQL embebido
 * que se descarga con las dependencias, vive en `.pg-local/` y no se registra
 * como servicio del sistema.
 *
 *   npm run db:local          arranca (y crea la base la primera vez)
 *   npm run db:local -- --seed    además siembra datos de ejemplo
 *   npm run db:local:reset    borra los datos y empieza de cero
 *
 * Se queda escuchando hasta que lo pares con Ctrl+C. Los datos se conservan
 * entre arranques; para vaciarlos, usa --reset.
 */
import EmbeddedPostgres from "embedded-postgres";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DIR = ".pg-local";
const PUERTO = 5433;
const USUARIO = "oravia";
const CLAVE = "oravia";
const BASE = "oravia";
const URL = `postgresql://${USUARIO}:${CLAVE}@localhost:${PUERTO}/${BASE}`;

const opciones = process.argv.slice(2);
const reiniciar = opciones.includes("--reset");
const sembrar = opciones.includes("--seed") || reiniciar;

if (reiniciar && existsSync(DIR)) {
  console.log("Borrando los datos anteriores…");
  rmSync(DIR, { recursive: true, force: true });
}

const primeraVez = !existsSync(DIR);

const pg = new EmbeddedPostgres({
  databaseDir: DIR,
  user: USUARIO,
  password: CLAVE,
  port: PUERTO,
  persistent: true,
  /**
   * UTF-8 explícito, y no es un detalle menor.
   *
   * initdb hereda la configuración regional de Windows: en un equipo en español
   * crea el clúster en WIN1252. Producción es UTF-8, así que la base local
   * fallaría donde producción funciona — y de la peor manera. El 26/08/2026, la
   * lectura de la tarifa de PortAventura reventó con
   * `22P05: character with byte sequence 0xe2 0x89 0xa5 ... has no equivalent
   * in encoding "WIN1252"`, que es un simple «≥» en una condición del hotel.
   */
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: (mensaje) => {
    // El arranque de postgres escupe mucho ruido; solo interesan los errores y
    // el aviso de que ya acepta conexiones.
    if (/ready to accept connections/.test(String(mensaje))) {
      console.log("PostgreSQL listo.");
    }
  },
  onError: (error) => console.error(String(error)),
});

if (primeraVez) {
  console.log("Creando el clúster (solo la primera vez, tarda unos segundos)…");
  await pg.initialise();
}

await pg.start();

if (primeraVez) {
  await pg.createDatabase(BASE);
  console.log(`Base «${BASE}» creada.`);
}

/** Ejecuta un script de npm con DATABASE_URL apuntando a la base local. */
function ejecutar(titulo, script) {
  console.log(`\n· ${titulo}`);
  // En Windows npm es un .cmd, que no se puede lanzar sin shell. Se pasa el
  // comando entero como cadena para no encadenar argumentos sin escapar.
  const resultado = spawnSync(`npm run ${script}`, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: URL },
  });
  if (resultado.status !== 0) {
    throw new Error(`Falló: npm run ${script}`);
  }
}

try {
  // Siempre: así la base local se pone al día sola cuando alguien añade una
  // migración, sin que haya que acordarse.
  ejecutar("Aplicando migraciones", "prisma:migrate");
  if (sembrar) {
    ejecutar("Sembrando datos de ejemplo", "prisma:seed");
  }
} catch (error) {
  console.error(`\n${error.message}`);
  await pg.stop();
  process.exit(1);
}

console.log(`
────────────────────────────────────────────────────────────
  PostgreSQL local en marcha.

  DATABASE_URL="${URL}"

  Ponlo en tu .env y, en OTRA terminal:   npm run dev

  Ctrl+C para pararlo. Los datos se conservan.
────────────────────────────────────────────────────────────
`);

const parar = async () => {
  console.log("\nParando PostgreSQL…");
  try {
    await pg.stop();
  } catch {
    // Si ya estaba parado, no hay nada que hacer.
  }
  process.exit(0);
};

process.on("SIGINT", parar);
process.on("SIGTERM", parar);

// Mantener el proceso vivo: el clúster corre aparte, pero al morir este proceso
// se queda huérfano y el puerto ocupado.
setInterval(() => {}, 1 << 30);
