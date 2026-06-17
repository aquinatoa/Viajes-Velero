import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function loadDotEnvFile() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();
    process.env[key] = stripWrappingQuotes(rawValue);
  }
}

loadDotEnvFile();

/**
 * Proxy TLS corporativo: Node solo confía en el bundle de CA si arranca con
 * NODE_EXTRA_CA_CERTS (se lee una vez al iniciar el proceso, no en caliente).
 * Si en el .env se define ZOHO_CA_BUNDLE y existe, RELANZAMOS el proceso una vez
 * con esa variable puesta, para que las llamadas a Zoho funcionen aunque se
 * arranque con un simple `npm run dev`. Sin esto, fallan con "fetch failed".
 */
function relaunchWithCaBundleIfNeeded() {
  const bundle = process.env.ZOHO_CA_BUNDLE?.trim();
  if (!bundle || process.env.__VELERO_CA_RELAUNCHED === "1") {
    return;
  }
  if (!existsSync(bundle)) {
    console.warn(`[loadEnv] ZOHO_CA_BUNDLE apunta a un archivo inexistente: ${bundle}`);
    return;
  }
  if (process.env.NODE_EXTRA_CA_CERTS === bundle) {
    return; // ya se arrancó con el CA puesto (p. ej. comando manual)
  }
  const result = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_EXTRA_CA_CERTS: bundle,
      __VELERO_CA_RELAUNCHED: "1",
    },
  });
  process.exit(result.status ?? 0);
}

relaunchWithCaBundleIfNeeded();
