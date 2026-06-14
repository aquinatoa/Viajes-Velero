/**
 * Prueba de integración del flujo documental (sin frameworks externos).
 *
 * Ejercita la cadena completa contra una base SQLite TEMPORAL y aislada
 * (prisma/test-flow.db), nunca contra dev.db:
 *
 *   crear documento → crear candidatos staging → aprobar en lote →
 *   dry-run de publicación → publicar → trazabilidad (incl. búsqueda operativa
 *   con origen documental) → idempotencia → dry-run de retirada → retirar.
 *
 * Cómo correrla:  npm run test
 * (equivale a: node --import tsx tests/documentFlow.test.ts)
 *
 * La BD temporal se crea con `prisma db push` y se borra al terminar, así que
 * la prueba es repetible y no deja residuos. No toca dev.db ni storage/.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// BD temporal junto a dev.db (Prisma resuelve `file:` relativo a prisma/).
const TEST_DB_RELATIVE = "./test-flow.db";
const TEST_DB_URL = `file:${TEST_DB_RELATIVE}`;
const testDbAbsolute = path.join(projectRoot, "prisma", "test-flow.db");

function removeTestDb() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${testDbAbsolute}${suffix}`;
    if (existsSync(target)) {
      try {
        rmSync(target, { force: true });
      } catch {
        // En Windows el cliente Prisma mantiene el archivo SQLite bloqueado
        // mientras el proceso vive (EPERM). No pasa nada: el residuo se borra
        // al inicio de la siguiente corrida, cuando ya no hay handle abierto.
      }
    }
  }
}

// --- arnés mínimo de aserciones ------------------------------------------------
let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`  ✗ ${name}\n      ${message.replace(/\n/g, "\n      ")}`);
  }
}

async function main() {
  // 1) Apuntar el cliente Prisma a la BD temporal ANTES de importar los módulos
  //    que instancian PrismaClient (la importación es dinámica más abajo).
  process.env.DATABASE_URL = TEST_DB_URL;

  // 2) Crear el esquema en la BD temporal desde cero.
  removeTestDb();
  console.log("Preparando base de datos temporal (prisma db push)...");
  execFileSync(
    process.execPath,
    [path.join(projectRoot, "node_modules", "prisma", "build", "index.js"), "db", "push", "--skip-generate", "--accept-data-loss"],
    {
      cwd: projectRoot,
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      stdio: "inherit",
    },
  );

  // 3) Importar la lógica del flujo (ya con DATABASE_URL apuntando a la BD temporal).
  const db = await import("../server/documentImportDb.ts");
  const search = await import("../server/searchDb.ts");

  console.log("\nFlujo documental:");

  const CONTROL_NAME = "Tarifas Prueba 4R 2026";
  const CONTROL_YEAR = 2026;
  const LOCALITY = "Salou";

  // --- crear documento ---------------------------------------------------------
  const document = await db.createInventoryDocument({
    targetType: "ACCOMMODATION",
    controlName: CONTROL_NAME,
    controlLocation: LOCALITY,
    controlYear: CONTROL_YEAR,
  });
  await test("crea el documento de origen", () => {
    assert.ok(document.id, "el documento debe tener id");
    assert.equal(document.controlName, CONTROL_NAME);
  });

  // --- crear candidatos staging a partir de un análisis simulado ---------------
  const analysis = {
    mode: "mock" as const,
    documentSummary: "Documento de prueba",
    detectedAccommodation: {
      accommodationName: "4R Hotel de Prueba",
      locality: LOCALITY,
      categoryType: "4*",
      accommodationType: "Hotel",
    },
    detectedActivities: [],
    candidateRates: [
      // Tarifa publicable: trae precio neto (sin PVP), moneda y año.
      {
        seasonName: "Temporada alta",
        year: CONTROL_YEAR,
        dateFrom: "2026-07-01",
        dateTo: "2026-08-31",
        boardType: "Media pensión",
        currency: "EUR",
        netAmount: 85.5,
        rawText: "MP 85,50 EUR",
      },
      // Tarifa que debe OMITIRSE al publicar: sin precio.
      {
        seasonName: "Temporada baja",
        year: CONTROL_YEAR,
        currency: "EUR",
        rawText: "sin precio",
      },
    ],
    candidateSupplements: [],
    candidatePolicies: [
      { policyType: "CANCELLATION", policyText: "Cancelación gratuita hasta 30 días antes." },
    ],
    candidateBlackoutDates: [],
    warnings: [],
    confidence: 0.9,
  };

  const created = await db.createInventoryDocumentStaging(document.id, analysis, {
    targetType: "ACCOMMODATION",
    controlName: CONTROL_NAME,
  });
  await test("crea candidatos staging (1 alojamiento, 2 tarifas, 1 política)", () => {
    assert.equal(created.accommodations, 1);
    assert.equal(created.rates, 2);
    assert.equal(created.policies, 1);
  });

  // --- editar metadatos del documento -----------------------------------------
  await test("edita los metadatos de control del documento", async () => {
    const updated = await db.updateInventoryDocumentMetadata(document.id, {
      controlName: "Tarifas Prueba 4R 2026 (editado)",
      controlLocation: "Cambrils",
    });
    assert.equal(updated.controlName, "Tarifas Prueba 4R 2026 (editado)");
    assert.equal(updated.controlLocation, "Cambrils");
    // Restaurar para no afectar a las aserciones posteriores que usan el nombre.
    await db.updateInventoryDocumentMetadata(document.id, {
      controlName: CONTROL_NAME,
      controlLocation: LOCALITY,
    });
  });

  // --- localizar ids de staging ------------------------------------------------
  const detail = await db.getInventoryDocumentDetail(document.id);
  assert.ok(detail, "el detalle del documento debe existir");
  const stagingAcc = detail!.stagingAccommodations[0];
  assert.ok(stagingAcc, "debe haber un alojamiento staging");
  const accId = stagingAcc.id;
  const rateWithPrice = stagingAcc.rates.find((rate) => rate.netAmount != null);
  const rateNoPrice = stagingAcc.rates.find((rate) => rate.netAmount == null);
  const policyId = stagingAcc.policies[0]?.id;
  assert.ok(rateWithPrice && rateNoPrice && policyId, "deben existir las dos tarifas y la política");

  // --- aprobar en lote ---------------------------------------------------------
  await test("aprueba alojamiento + tarifa con precio + política en lote", async () => {
    const accResult = await db.bulkUpdateStagingReview("accommodations", [accId], "APPROVED");
    assert.equal(accResult.updated, 1);

    const rateResult = await db.bulkUpdateStagingReview(
      "accommodation-rates",
      [rateWithPrice!.id, rateNoPrice!.id],
      "APPROVED",
    );
    // La tarifa sin precio no puede aprobarse: queda en "skipped".
    assert.equal(rateResult.updated, 1, "solo la tarifa con precio debe aprobarse");
    assert.equal(rateResult.skipped.length, 1, "la tarifa sin precio debe omitirse al aprobar");

    const policyResult = await db.bulkUpdateStagingReview(
      "accommodation-policies",
      [policyId!],
      "APPROVED",
    );
    assert.equal(policyResult.updated, 1);
  });

  const publishContext = { controlLocation: LOCALITY, controlYear: CONTROL_YEAR };

  // --- dry-run de publicación --------------------------------------------------
  await test("el dry-run de publicación refleja lo aprobado sin escribir", async () => {
    const dryRun = await db.dryRunPublishApprovedInventoryDocument(document.id, publishContext);
    assert.equal(dryRun.hasPublishableCandidates, true);
    assert.equal(dryRun.accommodationsToPublish, 1);
    assert.equal(dryRun.accommodationRatesToPublish, 1);
    assert.equal(dryRun.wouldReplaceExisting, false);

    // El dry-run no debe haber publicado nada todavía.
    const live = await db.getPublishedInventoryByDocument(document.id);
    assert.equal(live.accommodationCount, 0, "el dry-run no debe escribir en el inventario");
  });

  // --- publicar ----------------------------------------------------------------
  await test("publica solo lo aprobado al inventario operativo", async () => {
    const result = await db.publishApprovedInventoryDocument(document.id, publishContext);
    assert.equal(result.accommodations, 1);
    assert.equal(result.accommodationRates, 1);
  });

  // --- trazabilidad ------------------------------------------------------------
  await test("la trazabilidad lista lo publicado con su staging de origen", async () => {
    const live = await db.getPublishedInventoryByDocument(document.id);
    assert.equal(live.accommodationCount, 1);
    assert.equal(live.accommodationRateCount, 1);
    const published = live.accommodations[0];
    assert.equal(published.sourceStagingId, accId, "debe conservar el id de staging de origen");
    assert.equal(published.rates[0]?.sourceStagingId, rateWithPrice!.id);
  });

  // --- trazabilidad en la búsqueda operativa -----------------------------------
  await test("la búsqueda operativa muestra el documento de origen", async () => {
    const result = await search.searchAccommodationsDb({
      destinationText: LOCALITY,
      dateFrom: "2026-07-10",
      dateTo: "2026-07-17",
    });
    assert.equal(result.status, "ok", "debe encontrar el alojamiento publicado");
    const match = result.matches.find((item) => item.accommodation.sourceDocumentId === document.id);
    assert.ok(match, "el resultado debe referenciar el documento de origen");
    assert.equal(match!.accommodation.sourceDocumentName, CONTROL_NAME);
  });

  // --- idempotencia ------------------------------------------------------------
  await test("publicar de nuevo es idempotente (no duplica)", async () => {
    const dryRun = await db.dryRunPublishApprovedInventoryDocument(document.id, publishContext);
    assert.equal(dryRun.wouldReplaceExisting, true, "debe detectar publicación previa");

    await db.publishApprovedInventoryDocument(document.id, publishContext);
    const live = await db.getPublishedInventoryByDocument(document.id);
    assert.equal(live.accommodationCount, 1, "no debe duplicar el alojamiento");
    assert.equal(live.accommodationRateCount, 1, "no debe duplicar la tarifa");
  });

  // --- dry-run de retirada -----------------------------------------------------
  await test("el dry-run de retirada cuenta lo que se quitaría sin borrar", async () => {
    const dryRun = await db.dryRunUnpublishInventoryDocument(document.id);
    assert.equal(dryRun.hasPublishedRecords, true);
    assert.equal(dryRun.accommodationsToRemove, 1);
    assert.equal(dryRun.accommodationRatesToRemove, 1);

    const live = await db.getPublishedInventoryByDocument(document.id);
    assert.equal(live.accommodationCount, 1, "el dry-run de retirada no debe borrar nada");
  });

  // --- retirar -----------------------------------------------------------------
  await test("retira del inventario lo publicado por el documento", async () => {
    const result = await db.unpublishInventoryDocument(document.id);
    assert.equal(result.accommodationsRemoved, 1);
    assert.equal(result.accommodationRatesRemoved, 1);

    const live = await db.getPublishedInventoryByDocument(document.id);
    assert.equal(live.accommodationCount, 0, "tras retirar no debe quedar nada publicado");
  });

  console.log("\nGestión del inventario (catálogo, borrado, retirada granular):");

  // Republicar para tener un estado conocido sobre el que probar lo nuevo.
  await db.publishApprovedInventoryDocument(document.id, publishContext);

  // --- catálogo global ---------------------------------------------------------
  await test("el catálogo global incluye el alojamiento con su documento de origen", async () => {
    const catalog = await db.getPublishedInventoryCatalog();
    const entry = catalog.accommodations.find((item) => item.sourceDocumentId === document.id);
    assert.ok(entry, "el alojamiento publicado debe aparecer en el catálogo");
    assert.equal(entry!.sourceDocumentName, CONTROL_NAME, "debe mostrar el documento de origen");
    assert.equal(entry!.rates.length, 1);
  });

  // --- borrado bloqueado por publicados ---------------------------------------
  await test("no deja borrar un documento con registros publicados", async () => {
    const dryRun = await db.dryRunDeleteInventoryDocument(document.id);
    assert.equal(dryRun.blockedByPublished, true);
    assert.equal(dryRun.publishedAccommodations, 1);

    await assert.rejects(
      () => db.deleteInventoryDocument(document.id),
      (error: unknown) => error instanceof db.DeleteDocumentValidationError,
      "borrar con publicados debe lanzar DeleteDocumentValidationError",
    );
  });

  // --- retirada granular -------------------------------------------------------
  await test("retira una sola tarifa publicada sin tocar el resto", async () => {
    const before = await db.getPublishedInventoryByDocument(document.id);
    const rateId = before.accommodations[0]?.rates[0]?.id;
    assert.ok(rateId, "debe existir una tarifa publicada");

    const result = await db.unpublishPublishedItem("accommodation-rate", rateId!);
    assert.ok(result);
    assert.equal(result!.removedAccommodationRates, 1);

    const after = await db.getPublishedInventoryByDocument(document.id);
    assert.equal(after.accommodationCount, 1, "el alojamiento debe seguir publicado");
    assert.equal(after.accommodationRateCount, 0, "su tarifa debe haberse retirado");
  });

  await test("retira un alojamiento publicado completo", async () => {
    const before = await db.getPublishedInventoryByDocument(document.id);
    const accommodationId = before.accommodations[0]?.id;
    assert.ok(accommodationId, "debe existir un alojamiento publicado");

    const result = await db.unpublishPublishedItem("accommodation", accommodationId!);
    assert.ok(result);
    assert.equal(result!.removedAccommodations, 1);

    const after = await db.getPublishedInventoryByDocument(document.id);
    assert.equal(after.accommodationCount, 0, "ya no debe quedar nada publicado");
  });

  await test("retirar un id inexistente devuelve null (404)", async () => {
    const result = await db.unpublishPublishedItem("accommodation", "id-que-no-existe");
    assert.equal(result, null);
  });

  // --- borrado permitido (ya sin publicados) ----------------------------------
  await test("borra el documento cuando ya no tiene publicados", async () => {
    const dryRun = await db.dryRunDeleteInventoryDocument(document.id);
    assert.equal(dryRun.blockedByPublished, false);

    await db.deleteInventoryDocument(document.id);

    const documents = await db.listInventoryDocuments();
    assert.equal(
      documents.some((item) => item.id === document.id),
      false,
      "el documento borrado no debe aparecer en la lista",
    );
  });

  // --- resumen -----------------------------------------------------------------
  console.log(`\n${passed} prueba(s) OK, ${failures.length} fallo(s).`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("\nError no controlado en la prueba:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    removeTestDb();
  });
