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

// Los PDFs de las entregas se escriben en disco. Van a un almacén aparte para
// no pisar los de `storage/`: la primera referencia de la BD temporal es
// ORV-2026-0001, que en el almacén real es un documento de verdad.
const testStorage = path.join(projectRoot, "prisma", "test-storage");

function removeTestStorage() {
  try {
    rmSync(testStorage, { recursive: true, force: true });
  } catch {
    // Mismo caso que la BD: en Windows puede quedar bloqueado. Se borra en la
    // siguiente corrida.
  }
}

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
  process.env.ORAVIA_STORAGE_DIR = testStorage;

  // 2) Crear el esquema en la BD temporal desde cero.
  removeTestDb();
  removeTestStorage();
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
  const commercial = await import("../server/commercialDb.ts");
  const { PrismaClient } = await import("@prisma/client");

  // --- regla de precios según lo declarado al subir ----------------------------
  // Es la pieza que toca dinero: si un documento de venta se toma por coste, sus
  // precios salen con el margen encima. No depende de la BD, así que va primero.
  const pricing = await import("../server/pricing.ts");

  console.log("\nRegla de precios (compra vs. venta):");

  await test("documento de COMPRA: aplica el margen del documento, no el 8% fijo", () => {
    const resuelto = pricing.resolveRatePrices({ costAmount: 65 }, "PURCHASE", 12);
    assert.equal(resuelto.costPrice, 65, "el coste se conserva");
    assert.equal(resuelto.salePrice, 72.8, "65 + 12% = 72,80");
  });

  await test("documento de COMPRA sin margen declarado: usa el 8% por defecto", () => {
    const resuelto = pricing.resolveRatePrices({ costAmount: 100 }, "PURCHASE", null);
    assert.equal(resuelto.salePrice, 108);
  });

  await test("documento de COMPRA: da igual en qué campo colocara la IA la cifra", () => {
    const enNeto = pricing.resolveRatePrices({ netAmount: 65 }, "PURCHASE", 12);
    const enPvp = pricing.resolveRatePrices({ pvpAmount: 65 }, "PURCHASE", 12);
    assert.equal(enNeto.salePrice, 72.8);
    assert.equal(enPvp.salePrice, 72.8, "un PVP en un documento de compra sigue siendo coste");
  });

  await test("documento de VENTA: se guarda tal cual, sin sumarle margen", () => {
    // El caso real del 10/08/2026: la tarifa pactada con el turoperador suizo
    // cayó en "neto" y el código antiguo la habría publicado a 100,44 €.
    const resuelto = pricing.resolveRatePrices({ netAmount: 93 }, "SALE");
    assert.equal(resuelto.salePrice, 93, "el precio pactado no se toca");
    assert.equal(resuelto.costPrice, null, "un documento de venta no dice lo que cuesta");
  });

  await test("documento de VENTA: el PVP manda sobre los demás importes", () => {
    const resuelto = pricing.resolveRatePrices({ pvpAmount: 73, netAmount: 65 }, "SALE");
    assert.equal(resuelto.salePrice, 73);
  });

  await test("sin declarar (UNKNOWN): se mantiene el comportamiento anterior", () => {
    const conPvp = pricing.resolveRatePrices({ netAmount: 100, pvpAmount: 150 }, "UNKNOWN");
    assert.equal(conPvp.salePrice, 150, "el PVP explícito prevalecía");
    const sinPvp = pricing.resolveRatePrices({ netAmount: 100 }, "UNKNOWN");
    assert.equal(sinPvp.salePrice, 108, "y si no, coste + 8%");
  });

  await test("sin ningún importe: no se inventa un precio", () => {
    for (const kind of ["PURCHASE", "SALE", "UNKNOWN"] as const) {
      assert.equal(pricing.resolveRatePrices({}, kind).salePrice, null, `${kind} debe dar null`);
    }
  });

  await test("una tarifa pactada con un canal no vale para otro cliente", () => {
    // Regla del filtro de cotización, aislada: sin canal vale para todos; con
    // canal, solo para el suyo. Es lo que impide cotizar a un colegio con el
    // precio pactado con el turoperador suizo.
    const vale = (rateSegment: string | null, pedido: string | null) =>
      !rateSegment || rateSegment === pedido;

    assert.equal(vale("SWISS_TTOO", "SWISS_TTOO"), true, "su canal, sí");
    assert.equal(vale("SWISS_TTOO", "GENERIC"), false, "otro canal, no");
    assert.equal(vale("SWISS_TTOO", null), false, "sin decir el cliente, tampoco");
    assert.equal(vale(null, "SWISS_TTOO"), true, "lo cargado sin canal sirve para todos");
    assert.equal(vale(null, null), true);
  });

  await test("toRateKind solo admite los tres valores conocidos", () => {
    assert.equal(pricing.toRateKind("PURCHASE"), "PURCHASE");
    assert.equal(pricing.toRateKind("SALE"), "SALE");
    assert.equal(pricing.toRateKind("VENTA"), "UNKNOWN", "un valor raro no se cuela");
    assert.equal(pricing.toRateKind(undefined), "UNKNOWN");
  });

  // --- comprobaciones automáticas de las tarifas -------------------------------
  console.log("\nComprobaciones automáticas de tarifas:");

  const checks = await import("../src/domain/rateChecks.ts");

  const tarifa = (
    id: string,
    boardType: string,
    includedService: string,
    occupancyLabel: string,
    pvpAmount: number,
    rawText: string,
  ) => ({ id, boardType, includedService, occupancyLabel, pvpAmount, rawText });

  await test("pasa limpio un bloque correcto (el real de Villa Bonita)", () => {
    const filas = [
      tarifa("a", "PC", "Campo artificial", "DOBLE", 73, "PC 73 € - Aloj + Campo Artificial — DOBLE"),
      tarifa("b", "PC", "Campo artificial", "INDIVIDUAL", 92, "PC 92 € - Aloj + Campo Artificial — INDIVIDUAL"),
      tarifa("c", "MP", "Campo artificial", "DOBLE", 67, "MP 67 € - Aloj + Campo Artificial — DOBLE"),
      tarifa("d", "PC", "Sin campo", "DOBLE", 65, "PC 65 € - Aloj sin campo — DOBLE"),
    ];
    assert.equal(checks.checkRates(filas).size, 0, "no debe señalar nada");
  });

  await test("detecta un precio que no está en su texto de origen", () => {
    const filas = [
      tarifa("x", "PC", "Campo artificial", "DOBLE", 86, "PC 88 € - Aloj + Campo Artificial — DOBLE"),
    ];
    const avisos = checks.checkRates(filas).get("x") ?? [];
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].code, "PRICE_NOT_IN_SOURCE");
  });

  await test("no señala una tarifa sin texto de origen (no hay con qué contrastar)", () => {
    const filas = [{ id: "y", boardType: "PC", pvpAmount: 99, rawText: "" }];
    assert.equal(checks.checkRates(filas).size, 0);
  });

  await test("detecta que individual salga más barato que doble", () => {
    const filas = [
      tarifa("d1", "PC", "Campo artificial", "DOBLE", 92, "PC 92 € DOBLE"),
      tarifa("i1", "PC", "Campo artificial", "INDIVIDUAL", 73, "PC 73 € INDIVIDUAL"),
    ];
    const avisos = checks.checkRates(filas).get("i1") ?? [];
    assert.ok(avisos.some((a: { code: string }) => a.code === "OCCUPANCY_ORDER"));
  });

  await test("detecta que pensión completa salga más barata que media pensión", () => {
    const filas = [
      tarifa("pc", "PC", "Sin campo", "DOBLE", 60, "PC 60 € DOBLE"),
      tarifa("mp", "MP", "Sin campo", "DOBLE", 67, "MP 67 € DOBLE"),
    ];
    const avisos = checks.checkRates(filas).get("pc") ?? [];
    assert.ok(avisos.some((a: { code: string }) => a.code === "BOARD_ORDER"));
  });

  await test("detecta que sin campo salga más caro que con campo", () => {
    const filas = [
      tarifa("sin", "PC", "Sin campo", "DOBLE", 90, "PC 90 € sin campo DOBLE"),
      tarifa("con", "PC", "Campo artificial", "DOBLE", 73, "PC 73 € Campo Artificial DOBLE"),
    ];
    const avisos = checks.checkRates(filas).get("sin") ?? [];
    assert.ok(avisos.some((a: { code: string }) => a.code === "SERVICE_ORDER"));
  });

  console.log("\nComprobaciones de tarifas de actividad:");

  await test("una tarifa de actividad correcta pasa limpia", () => {
    const filas = [
      { id: "ok", rateUnit: "PER_GROUP", salePvpAmount: 190, rawText: "Cesped Artificial 190 EUR 286 EUR" },
    ];
    assert.equal(checks.checkActivityRates(filas).size, 0);
  });

  await test("detecta un precio de actividad que no esta en su origen", () => {
    const filas = [
      { id: "mal", rateUnit: "PER_GROUP", salePvpAmount: 195, rawText: "Cesped Artificial 190 EUR 286 EUR" },
    ];
    const avisos = checks.checkActivityRates(filas).get("mal") ?? [];
    assert.ok(avisos.some((a: { code: string }) => a.code === "PRICE_NOT_IN_SOURCE"));
  });

  await test("detecta que no se sepa si el precio es por equipo o por persona", () => {
    const filas = [{ id: "sin", salePvpAmount: 190, rawText: "Campo 190 EUR" }];
    const avisos = checks.checkActivityRates(filas).get("sin") ?? [];
    assert.ok(avisos.some((a: { code: string }) => a.code === "UNIT_UNKNOWN"));
  });

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
        occupancyLabel: "Doble",
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

  // --- un documento con varios alojamientos ------------------------------------
  // El caso real de Fútbol Salou: un PDF con tres establecimientos. Antes se
  // aplastaban en uno y las 70 tarifas colgaban del primero.
  console.log("\nDocumento con varios alojamientos:");

  const multiDocument = await db.createInventoryDocument({
    targetType: "ACCOMMODATION",
    controlName: "Tarifas Fútbol Salou 2027",
    controlLocation: LOCALITY,
    controlYear: 2027,
  });

  const rate = (accommodationName: string | null, pvp: number) => ({
    accommodationName,
    seasonName: null,
    year: 2027,
    dateFrom: null,
    dateTo: null,
    boardType: "PC",
    unitName: null,
    rateUnit: null,
    occupancyLabel: "DOBLE",
    minNights: null,
    currency: "EUR",
    pvpAmount: pvp,
    netAmount: null,
    costAmount: null,
    rawText: null,
  });

  const multiAnalysis = {
    mode: "mock" as const,
    documentSummary: "Tres alojamientos en un mismo documento",
    detectedAccommodation: null,
    detectedAccommodations: [
      { accommodationName: "Villa Bonita / Aloha", locality: LOCALITY },
      { accommodationName: "Mediterrània MED2/3", locality: LOCALITY },
      { accommodationName: "Mediterrània MED1", locality: LOCALITY },
    ],
    detectedActivities: [],
    candidateRates: [
      rate("Villa Bonita / Aloha", 73),
      rate("Villa Bonita / Aloha", 92),
      rate("Mediterrània MED2/3", 78),
      // Nombre con ruido: debe reconocerse igualmente.
      rate("  mediterrània med1 (doble)  ", 88),
      // Sin etiqueta: cae en el primero, pero avisando.
      rate(null, 65),
    ],
    candidateSupplements: [
      { accommodationName: "Mediterrània MED1", concept: "Miniestadi", amount: 6 },
    ],
    candidatePolicies: [],
    candidateBlackoutDates: [],
    warnings: [],
    confidence: 0.9,
  };

  const multiCreated = await db.createInventoryDocumentStaging(multiDocument.id, multiAnalysis, {
    targetType: "ACCOMMODATION",
    controlName: "Tarifas Fútbol Salou 2027",
  });

  await test("crea un alojamiento por cada establecimiento del documento", () => {
    assert.equal(multiCreated.accommodations, 3, "tres hoteles, tres registros");
    assert.equal(multiCreated.rates, 5);
  });

  await test("cada tarifa queda colgada de su alojamiento", async () => {
    const stored = await db.getInventoryDocumentDetail(multiDocument.id);
    const porNombre = new Map(
      (stored?.stagingAccommodations ?? []).map((accommodation: { accommodationName: string; rates: unknown[] }) => [
        accommodation.accommodationName,
        accommodation.rates.length,
      ]),
    );
    // Villa Bonita: sus 2 + la huérfana sin etiqueta.
    assert.equal(porNombre.get("Villa Bonita / Aloha"), 3);
    assert.equal(porNombre.get("Mediterrània MED2/3"), 1);
    assert.equal(porNombre.get("Mediterrània MED1"), 1, "el nombre con ruido se reconoce");
  });

  await test("avisa de los alojamientos encontrados y de la tarifa sin dueño", () => {
    const todos = multiCreated.warnings.join(" | ");
    assert.match(todos, /3 alojamientos/, "debe decir cuántos hoteles trae");
    assert.match(todos, /no decían a qué alojamiento/, "debe avisar de la tarifa sin etiqueta");
  });

  await test("publicar sin aprobar el alojamiento explica el motivo y cuenta las tarifas", async () => {
    // Nada aprobado todavía en este documento: las 5 tarifas se quedan fuera y
    // el motivo tiene que ser accionable, no un "omitidos: 5".
    const simulacion = await db.dryRunPublishApprovedInventoryDocument(multiDocument.id, {
      controlYear: 2027,
    });
    const motivos = simulacion.skipReasons ?? [];
    assert.ok(motivos.length > 0, "tiene que decir por qué no entra nada");
    const total = motivos.reduce((suma: number, motivo: { count: number }) => suma + motivo.count, 0);
    assert.equal(total, 5, "los motivos cubren las 5 tarifas");
    assert.ok(
      motivos.every((motivo: { fix: string | null }) => motivo.fix),
      "cada motivo dice qué hacer",
    );
  });

  await test("con varios alojamientos, aprobar no basta: hay que firmar el reparto", async () => {
    const prisma = new PrismaClient();
    try {
      // Todo aprobado, como si la revisión hubiera ido bien.
      const alojamientos = await prisma.stagingAccommodation.findMany({
        where: { sourceDocumentId: multiDocument.id },
        include: { rates: true, adjustments: true },
      });
      await db.bulkUpdateStagingReview("accommodations", alojamientos.map((a) => a.id), "APPROVED");
      await db.bulkUpdateStagingReview(
        "accommodation-rates",
        alojamientos.flatMap((a) => a.rates.map((r) => r.id)),
        "APPROVED",
      );

      // Aun así no entra nada: falta decir de quién es cada bloque.
      const frenado = await db.dryRunPublishApprovedInventoryDocument(multiDocument.id, {
        controlYear: 2027,
      });
      assert.equal(frenado.accommodationsToPublish, 0, "nada se publica sin confirmar el reparto");
      const motivo = (frenado.skipReasons ?? []).find(
        (m: { code: string }) => m.code === "ASSIGNMENT_NOT_CONFIRMED",
      );
      assert.ok(motivo, "el motivo tiene que ser el reparto sin confirmar");
      assert.ok(motivo.fix, "y decir qué hacer");

      // Se firma el reparto de uno solo: entra ese y nada más.
      const uno = alojamientos.find((a) => a.accommodationName === "Mediterrània MED1")!;
      const firmado = await db.confirmAccommodationAssignmentDb(multiDocument.id, [uno.id]);
      assert.equal(firmado.confirmed, 1);

      const conUno = await db.dryRunPublishApprovedInventoryDocument(multiDocument.id, {
        controlYear: 2027,
      });
      assert.equal(conUno.accommodationsToPublish, 1, "solo entra el alojamiento firmado");

      // Y al firmar el resto, entran los tres.
      await db.confirmAccommodationAssignmentDb(
        multiDocument.id,
        alojamientos.map((a) => a.id),
      );
      const conTodos = await db.dryRunPublishApprovedInventoryDocument(multiDocument.id, {
        controlYear: 2027,
      });
      assert.equal(conTodos.accommodationsToPublish, 3);
    } finally {
      await prisma.$disconnect();
    }
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
  await test("las condiciones se publican con estructura, no como texto", async () => {
    const prisma = new PrismaClient();
    try {
      const alojamientos = await prisma.accommodation.findMany({
        where: { sourceDocumentId: document.id },
        include: { policies: true, adjustments: true, blackoutDates: true },
      });
      const politicas = alojamientos.flatMap((a) => a.policies);
      assert.ok(politicas.length > 0, "la política aprobada debe llegar a su propia tabla");
      assert.ok(politicas[0].policyType, "conserva su tipo, no solo el texto");
      assert.equal(politicas[0].sourceDocumentId, document.id, "mantiene la trazabilidad");
      // El texto se conserva además: es lo que lee el colegio en la propuesta.
      assert.ok(alojamientos[0].conditionsText, "el texto sigue estando");
    } finally {
      await prisma.$disconnect();
    }
  });

  await test("la trazabilidad lista lo publicado con su staging de origen", async () => {
    const live = await db.getPublishedInventoryByDocument(document.id);
    assert.equal(live.accommodationCount, 1);
    assert.equal(live.accommodationRateCount, 1);
    const published = live.accommodations[0];
    assert.equal(published.sourceStagingId, accId, "debe conservar el id de staging de origen");
    assert.equal(published.rates[0]?.sourceStagingId, rateWithPrice!.id);
  });

  await test("publicar conserva la ocupación de la tarifa", async () => {
    // Se perdía al publicar: en Fútbol Salou, la misma línea vale 73 € en doble
    // y 92 € en individual, y sin este dato las dos son indistinguibles.
    const prisma = new PrismaClient();
    try {
      const publicada = await prisma.accommodationRate.findFirst({
        where: { sourceDocumentId: document.id },
        select: { occupancyLabel: true },
      });
      assert.equal(publicada?.occupancyLabel, "Doble");
    } finally {
      await prisma.$disconnect();
    }
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

  console.log("\nFlujo documental de ACTIVIDADES:");

  // El análisis IA solo detecta la actividad (nombre, proveedor, ubicación…); sus
  // tarifas y políticas no salen del análisis, así que se siembran directamente
  // en staging vía Prisma para ejercitar el resto de la cadena (aprobar → publicar
  // → trazar → buscar → retirar) igual que con alojamientos.
  const activityPrisma = new PrismaClient();

  const ACTIVITY_DOC_NAME = "Excursiones Salou 2026";

  const activityDocument = await db.createInventoryDocument({
    targetType: "ACTIVITY",
    controlName: ACTIVITY_DOC_NAME,
    controlLocation: LOCALITY,
    controlYear: CONTROL_YEAR,
  });

  const activityAnalysis = {
    mode: "mock" as const,
    documentSummary: "Documento de actividades de prueba",
    detectedAccommodation: null,
    detectedActivities: [
      {
        activityName: "PortAventura día completo",
        supplierName: "PortAventura World",
        locationMain: LOCALITY,
        activityType: "Parque temático",
        durationText: "1 día",
        descriptionText: "Entrada de día completo al parque.",
      },
    ],
    candidateRates: [],
    candidateSupplements: [],
    candidatePolicies: [],
    candidateBlackoutDates: [],
    warnings: [],
    confidence: 0.9,
  };

  const activityCreated = await db.createInventoryDocumentStaging(
    activityDocument.id,
    activityAnalysis,
    { targetType: "ACTIVITY", controlName: ACTIVITY_DOC_NAME },
  );
  await test("crea candidatos staging de actividad (1 actividad, sin alojamiento)", () => {
    assert.equal(activityCreated.activities, 1);
    assert.equal(activityCreated.accommodations, 0);
  });

  // Localizar la actividad staging recién creada y sembrarle tarifas + política.
  const activityDetail = await db.getInventoryDocumentDetail(activityDocument.id);
  assert.ok(activityDetail, "el detalle del documento de actividad debe existir");
  const stagingActivity = activityDetail!.stagingActivities[0];
  assert.ok(stagingActivity, "debe haber una actividad staging");
  const stagingActivityId = stagingActivity.id;

  // Tarifa publicable (con precio, moneda, edad), tarifa sin precio (debe omitirse).
  const seededRateWithPrice = await activityPrisma.stagingActivityRate.create({
    data: {
      stagingActivityId,
      year: CONTROL_YEAR,
      currency: "EUR",
      salePvpAmount: 45,
      ageLabel: "8-17 años",
      ageMin: 8,
      ageMax: 17,
      reviewStatus: "PENDING",
    },
  });
  const seededRateNoPrice = await activityPrisma.stagingActivityRate.create({
    data: {
      stagingActivityId,
      year: CONTROL_YEAR,
      currency: "EUR",
      ageLabel: "Adulto",
      reviewStatus: "PENDING",
    },
  });
  const seededActivityPolicy = await activityPrisma.stagingActivityPolicy.create({
    data: {
      stagingActivityId,
      policyType: "CANCELLATION",
      policyText: "Cancelación gratuita hasta 7 días antes.",
      reviewStatus: "PENDING",
    },
  });

  // --- aprobar en lote (la actividad, la tarifa con precio y la política) -------
  await test("las tarifas de actividad llegan a su actividad (antes se descartaban)", async () => {
    const docAct = await db.createInventoryDocument({
      targetType: "ACTIVITY",
      controlName: "Alquiler de campos 2027",
      controlYear: 2027,
    });

    const analisis = {
      mode: "mock" as const,
      documentSummary: "Alquiler de instalaciones",
      detectedAccommodation: null,
      detectedAccommodations: [],
      detectedActivities: [
        { activityName: "Alquiler campo césped artificial" },
        { activityName: "Partido amistoso" },
      ],
      candidateRates: [],
      candidateActivityRates: [
        {
          activityName: "Alquiler campo césped artificial",
          rateUnit: "PER_GROUP",
          year: 2027,
          currency: "EUR",
          salePvpAmount: 120,
          durationText: "90 min",
          rawText: "Campo artificial 1,30 h — 120 € por equipo",
        },
        {
          activityName: "Partido amistoso",
          rateUnit: "PER_GROUP",
          year: 2027,
          currency: "EUR",
          salePvpAmount: 250,
          ageLabel: "fin de semana",
          rawText: "Partido amistoso fin de semana — 250 €",
        },
        // Sin actividad que la reciba: debe avisar y no colarse.
        {
          activityName: "Clase de vela",
          year: 2027,
          currency: "EUR",
          salePvpAmount: 40,
          rawText: "Vela 40 €",
        },
      ],
      candidateSupplements: [],
      candidatePolicies: [],
      candidateBlackoutDates: [],
      warnings: [],
      confidence: 0.9,
    };

    const creado = await db.createInventoryDocumentStaging(docAct.id, analisis, {
      targetType: "ACTIVITY",
      controlName: "Alquiler de campos 2027",
    });

    assert.equal(creado.activities, 2);
    assert.equal(creado.activityRates, 3, "se leyeron las tres del documento");

    const detalle = await db.getInventoryDocumentDetail(docAct.id);
    const porNombre = new Map(
      (detalle?.stagingActivities ?? []).map((a: { activityName: string; rates: unknown[] }) => [
        a.activityName,
        a.rates.length,
      ]),
    );
    assert.equal(porNombre.get("Alquiler campo césped artificial"), 1, "el precio llega a su actividad");
    assert.equal(porNombre.get("Partido amistoso"), 1);
    assert.match(
      creado.warnings.join(" | "),
      /no encajan con ninguna actividad/,
      "avisa del precio sin dueño en vez de tragárselo",
    );
  });

  await test("aprueba actividad + tarifa con precio + política; omite la tarifa sin precio", async () => {
    const actResult = await db.bulkUpdateStagingReview("activities", [stagingActivityId], "APPROVED");
    assert.equal(actResult.updated, 1);

    const rateResult = await db.bulkUpdateStagingReview(
      "activity-rates",
      [seededRateWithPrice.id, seededRateNoPrice.id],
      "APPROVED",
    );
    assert.equal(rateResult.updated, 1, "solo la tarifa de actividad con precio debe aprobarse");
    assert.equal(rateResult.skipped.length, 1, "la tarifa de actividad sin precio debe omitirse");

    const policyResult = await db.bulkUpdateStagingReview(
      "activity-policies",
      [seededActivityPolicy.id],
      "APPROVED",
    );
    assert.equal(policyResult.updated, 1);
  });

  const activityPublishContext = { controlLocation: LOCALITY, controlYear: CONTROL_YEAR };

  // --- dry-run de publicación de actividad ------------------------------------
  await test("el dry-run de publicación de actividad refleja lo aprobado sin escribir", async () => {
    const dryRun = await db.dryRunPublishApprovedInventoryDocument(
      activityDocument.id,
      activityPublishContext,
    );
    assert.equal(dryRun.hasPublishableCandidates, true);
    assert.equal(dryRun.activitiesToPublish, 1);
    assert.equal(dryRun.activityRatesToPublish, 1);
    assert.equal(dryRun.wouldReplaceExisting, false);

    const live = await db.getPublishedInventoryByDocument(activityDocument.id);
    assert.equal(live.activityCount, 0, "el dry-run no debe escribir actividades");
  });

  // --- publicar actividad ------------------------------------------------------
  await test("publica solo la actividad aprobada al inventario operativo", async () => {
    const result = await db.publishApprovedInventoryDocument(
      activityDocument.id,
      activityPublishContext,
    );
    assert.equal(result.activities, 1);
    assert.equal(result.activityRates, 1);
  });

  // --- trazabilidad de la actividad publicada ---------------------------------
  await test("la trazabilidad lista la actividad publicada con su staging de origen", async () => {
    const live = await db.getPublishedInventoryByDocument(activityDocument.id);
    assert.equal(live.activityCount, 1);
    assert.equal(live.activityRateCount, 1);
    const publishedActivity = live.activities[0];
    assert.equal(publishedActivity.sourceStagingId, stagingActivityId);
    assert.equal(publishedActivity.rates[0]?.sourceStagingId, seededRateWithPrice.id);
  });

  // --- trazabilidad en la búsqueda operativa de actividades -------------------
  await test("la búsqueda operativa de actividades muestra el documento de origen", async () => {
    const result = await search.searchActivitiesDb({
      destinationText: LOCALITY,
      dateFrom: "2026-07-10",
      dateTo: "2026-07-17",
      ageRangeText: "10-14",
    });
    assert.equal(result.status, "ok", "debe encontrar la actividad publicada");
    const match = result.matches.find(
      (item) => item.activity.sourceDocumentId === activityDocument.id,
    );
    assert.ok(match, "el resultado debe referenciar el documento de origen");
    assert.equal(match!.activity.sourceDocumentName, ACTIVITY_DOC_NAME);
  });

  // --- idempotencia de la publicación de actividad ----------------------------
  await test("republicar la actividad es idempotente (no duplica)", async () => {
    const dryRun = await db.dryRunPublishApprovedInventoryDocument(
      activityDocument.id,
      activityPublishContext,
    );
    assert.equal(dryRun.wouldReplaceExisting, true, "debe detectar publicación previa");

    await db.publishApprovedInventoryDocument(activityDocument.id, activityPublishContext);
    const live = await db.getPublishedInventoryByDocument(activityDocument.id);
    assert.equal(live.activityCount, 1, "no debe duplicar la actividad");
    assert.equal(live.activityRateCount, 1, "no debe duplicar la tarifa de actividad");
  });

  // --- el catálogo global incluye la actividad --------------------------------
  await test("el catálogo global incluye la actividad con su documento de origen", async () => {
    const catalog = await db.getPublishedInventoryCatalog();
    const entry = catalog.activities.find(
      (item) => item.sourceDocumentId === activityDocument.id,
    );
    assert.ok(entry, "la actividad publicada debe aparecer en el catálogo");
    assert.equal(entry!.sourceDocumentName, ACTIVITY_DOC_NAME);
    assert.equal(entry!.rates.length, 1);
  });

  // --- retirada granular de una tarifa de actividad ---------------------------
  await test("retira una sola tarifa de actividad publicada", async () => {
    const before = await db.getPublishedInventoryByDocument(activityDocument.id);
    const rateId = before.activities[0]?.rates[0]?.id;
    assert.ok(rateId, "debe existir una tarifa de actividad publicada");

    const result = await db.unpublishPublishedItem("activity-rate", rateId!);
    assert.ok(result);
    assert.equal(result!.removedActivityRates, 1);

    const after = await db.getPublishedInventoryByDocument(activityDocument.id);
    assert.equal(after.activityCount, 1, "la actividad debe seguir publicada");
    assert.equal(after.activityRateCount, 0, "su tarifa debe haberse retirado");
  });

  // --- retirada granular de la actividad completa -----------------------------
  await test("retira una actividad publicada completa", async () => {
    const before = await db.getPublishedInventoryByDocument(activityDocument.id);
    const activityId = before.activities[0]?.id;
    assert.ok(activityId, "debe existir una actividad publicada");

    const result = await db.unpublishPublishedItem("activity", activityId!);
    assert.ok(result);
    assert.equal(result!.removedActivities, 1);

    const after = await db.getPublishedInventoryByDocument(activityDocument.id);
    assert.equal(after.activityCount, 0, "ya no debe quedar actividad publicada");
  });

  await activityPrisma.$disconnect();

  console.log("\nFlujo comercial (persistencia real en BD):");

  // Necesita un Accommodation real (FK de las opciones de propuesta).
  const prisma = new PrismaClient();
  const acc = await prisma.accommodation.create({
    data: { accommodationName: "Hotel Comercial Test", locality: "Salou" },
  });

  let commercialClientId = "";
  let commercialProposalId = "";

  await test("upsert de cliente por email", async () => {
    const client = await commercial.upsertClientFromIntakeDb({
      email: "comercial@example.com",
      firstName: "Ana",
      lastName: "García",
      clientType: "new",
    });
    assert.ok(client.id);
    assert.equal(client.email, "comercial@example.com");
    assert.equal(client.fullName, "Ana García");
    commercialClientId = client.id;

    // Idempotencia por email: segundo upsert marca recurrente, no duplica.
    const again = await commercial.upsertClientFromIntakeDb({
      email: "comercial@example.com",
      firstName: "Ana",
      lastName: "García",
      clientType: "new",
    });
    assert.equal(again.id, client.id, "no debe duplicar el cliente");
    assert.equal(again.isReturningCustomer, true);
  });

  await test("guarda una solicitud de viaje", async () => {
    const req = await commercial.saveTripRequestDb({
      clientId: commercialClientId,
      originalMessage: "Grupo escolar Salou 42 pax",
      destinationText: "Salou",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-05",
      participants: 42,
      teachers: 4,
      requestStatus: "READY_FOR_SEARCH",
    });
    assert.ok(req.id);
    assert.equal(req.destinationText, "Salou");
    assert.equal(req.requestStatus, "READY_FOR_SEARCH");

    // El historial del cliente ya devuelve esta solicitud (oportunidades candidatas).
    const history = await commercial.getClientTripRequestsDb(commercialClientId);
    assert.equal(history.length, 1);
  });

  await test("guarda una propuesta con opción de alojamiento (FK real)", async () => {
    const req = await commercial.saveTripRequestDb({
      clientId: commercialClientId,
      originalMessage: "segunda",
      requestStatus: "READY_FOR_SEARCH",
    });
    const proposal = await commercial.saveTripProposalDb({
      tripRequestId: req.id,
      versionNumber: 1,
      proposalStatus: "READY_FOR_APPROVAL",
      summaryText: "1 opción",
      accommodationOptions: [
        {
          optionNumber: 1,
          accommodationId: acc.id,
          accommodationNameSnapshot: "Hotel Comercial Test",
          totalPvpText: "5.000,00 €",
        },
      ],
      activityOptions: [],
    });
    assert.ok(proposal.id);
    assert.equal(proposal.accommodationOptions.length, 1);
    assert.equal(proposal.accommodationOptions[0].accommodationNameSnapshot, "Hotel Comercial Test");
    commercialProposalId = proposal.id;
  });

  await test("aprueba la propuesta y fija la opción elegida", async () => {
    const approved = await commercial.approveTripProposalDb(commercialProposalId, 1);
    assert.ok(approved);
    assert.equal(approved!.proposalStatus, "APPROVED");
    assert.equal(approved!.approvedOptionNumber, 1);
    assert.equal(approved!.accommodationOptions[0].isSelected, true);
  });

  // --- reintentar el cierre del lienzo -----------------------------------------
  // El cierre encadena cliente → solicitud → propuesta → trato → documento. Si
  // revienta a mitad, el operador vuelve a pulsar el botón. Lo que se prueba
  // aquí es que ese segundo intento NO deja rastro doble: ni solicitudes, ni
  // propuestas, ni —sobre todo— un segundo trato en el CRM del cliente.
  console.log("\nReintentar el cierre del lienzo (no duplicar):");

  const delivery = await import("../server/proposalDelivery.ts");

  /** Marca una entrega como ya salida, sin pasar por el correo. */
  async function marcarComoEnviada(deliveryId: string) {
    await prisma.proposalDelivery.update({
      where: { id: deliveryId },
      data: { status: "SENT", sentAt: new Date() },
    });
  }

  async function nuevaSolicitud(mensaje: string) {
    return commercial.saveTripRequestDb({
      clientId: commercialClientId,
      originalMessage: mensaje,
      destinationText: "Salou",
      dateFrom: "2027-04-10",
      dateTo: "2027-04-14",
      participants: 40,
      teachers: 4,
      requestStatus: "READY_FOR_SEARCH",
    });
  }

  function opcion(nombre: string, optionNumber = 1) {
    return {
      optionNumber,
      accommodationId: acc.id,
      accommodationNameSnapshot: nombre,
      dateFrom: "2027-04-10",
      dateTo: "2027-04-14",
      nights: 4,
      participants: 40,
      teachers: 4,
      totalPvpText: "16.000,00 €",
    };
  }

  let reintentoRequestId = "";

  await test("reintentar actualiza la solicitud en vez de crear otra", async () => {
    const antes = await prisma.tripRequest.count({ where: { clientId: commercialClientId } });
    const primera = await nuevaSolicitud("Fútbol Salou 2027");
    reintentoRequestId = primera.id;

    // Segundo intento: el operador ha corregido el número de alumnos.
    const segunda = await commercial.saveTripRequestDb({
      id: primera.id,
      clientId: commercialClientId,
      originalMessage: "Fútbol Salou 2027",
      destinationText: "Salou",
      dateFrom: "2027-04-10",
      dateTo: "2027-04-14",
      participants: 44,
      teachers: 4,
      requestStatus: "READY_FOR_SEARCH",
    });

    assert.equal(segunda.id, primera.id, "no debe crear una segunda solicitud");
    assert.equal(segunda.participants, 44, "la corrección debe quedar guardada");
    const despues = await prisma.tripRequest.count({ where: { clientId: commercialClientId } });
    assert.equal(despues, antes + 1, "solo una solicitud nueva tras los dos intentos");
  });

  await test("el trato de Zoho se crea una sola vez por solicitud", async () => {
    let llamadas = 0;
    const crear = async () => {
      llamadas += 1;
      return { dealId: "ZOHO-DEAL-1", dealUrl: "https://crm.zoho.eu/deal/1", dealName: "Fútbol Salou" };
    };

    const primero = await commercial.ensureTripRequestDealDb(reintentoRequestId, crear);
    assert.equal(primero.dealId, "ZOHO-DEAL-1");
    assert.equal(primero.reused, false);

    const segundo = await commercial.ensureTripRequestDealDb(reintentoRequestId, crear);
    assert.equal(llamadas, 1, "el segundo intento NO debe llamar a Zoho");
    assert.equal(segundo.dealId, "ZOHO-DEAL-1");
    assert.equal(segundo.dealUrl, "https://crm.zoho.eu/deal/1");
    assert.equal(segundo.reused, true);
  });

  await test("reintentar reescribe la propuesta y sus opciones, no las acumula", async () => {
    const req = await nuevaSolicitud("Reintento de propuesta");

    const primera = await commercial.saveTripProposalDb({
      tripRequestId: req.id,
      versionNumber: 1,
      proposalStatus: "READY_FOR_APPROVAL",
      summaryText: "1 opción",
      accommodationOptions: [opcion("Hotel A")],
      activityOptions: [],
    });

    // Entre el fallo y el reintento, el operador cambia de hotel.
    const segunda = await commercial.saveTripProposalDb({
      tripRequestId: req.id,
      versionNumber: 1,
      proposalStatus: "READY_FOR_APPROVAL",
      summaryText: "1 opción (revisada)",
      accommodationOptions: [opcion("Hotel B")],
      activityOptions: [],
    });

    assert.equal(segunda.id, primera.id, "no debe crear una segunda propuesta");
    assert.equal(segunda.accommodationOptions.length, 1, "las opciones se sustituyen, no se suman");
    assert.equal(segunda.accommodationOptions[0].accommodationNameSnapshot, "Hotel B");
    assert.equal(segunda.summaryText, "1 opción (revisada)");

    const propuestas = await prisma.tripProposal.count({ where: { tripRequestId: req.id } });
    assert.equal(propuestas, 1);
  });

  await test("preparar dos veces conserva la referencia y no numera de nuevo", async () => {
    const req = await nuevaSolicitud("Reintento de entrega");
    const propuesta = await commercial.saveTripProposalDb({
      tripRequestId: req.id,
      versionNumber: 1,
      proposalStatus: "READY_FOR_APPROVAL",
      accommodationOptions: [opcion("Hotel A")],
      activityOptions: [],
    });

    const primera = await delivery.prepareDelivery({
      proposalId: propuesta.id,
      recipientEmail: "colegio@example.com",
      recipientName: "Colegio Test",
    });
    const segunda = await delivery.prepareDelivery({
      proposalId: propuesta.id,
      recipientEmail: "colegio@example.com",
      recipientName: "Colegio Test",
    });

    assert.equal(segunda.id, primera.id, "debe reaprovechar el borrador");
    assert.equal(segunda.reference, primera.reference, "no debe quemar otra referencia");

    const entregas = await prisma.proposalDelivery.count({ where: { proposalId: propuesta.id } });
    assert.equal(entregas, 1);
  });

  await test("lo que ya salió no se reescribe: se abre una propuesta nueva", async () => {
    const req = await nuevaSolicitud("Ya enviada");
    const propuesta = await commercial.saveTripProposalDb({
      tripRequestId: req.id,
      versionNumber: 1,
      proposalStatus: "READY_FOR_APPROVAL",
      accommodationOptions: [opcion("Hotel A")],
      activityOptions: [],
    });
    const entrega = await delivery.prepareDelivery({
      proposalId: propuesta.id,
      recipientEmail: "colegio@example.com",
    });
    await marcarComoEnviada(entrega.id);

    // La propuesta enviada es historia: guardar otra vez no la pisa.
    const otra = await commercial.saveTripProposalDb({
      tripRequestId: req.id,
      versionNumber: 1,
      proposalStatus: "READY_FOR_APPROVAL",
      accommodationOptions: [opcion("Hotel B")],
      activityOptions: [],
    });
    assert.notEqual(otra.id, propuesta.id, "no debe tocar una propuesta ya enviada");

    const original = await prisma.tripProposal.findUnique({
      where: { id: propuesta.id },
      include: { accommodationOptions: true },
    });
    assert.equal(original!.accommodationOptions[0].accommodationNameSnapshot, "Hotel A");

    // Y la solicitud tampoco: su historia ya viajó al cliente.
    const solicitud = await commercial.saveTripRequestDb({
      id: req.id,
      clientId: commercialClientId,
      originalMessage: "Ya enviada",
      participants: 99,
      requestStatus: "READY_FOR_SEARCH",
    });
    assert.notEqual(solicitud.id, req.id, "una solicitud ya enviada no se reescribe");
  });

  // --- de dónde sale cada tarifa: la cita y el reparto --------------------------
  // `rawText` lo escribe la IA. Comprobar un precio contra el fragmento que ella
  // misma eligió no demuestra nada: si se equivoca con convicción, escribe el
  // fragmento acorde y la comprobación pasa. El testigo independiente es el
  // texto del PDF.
  console.log("\nDe dónde sale cada tarifa (cita y reparto):");

  const bloques = await import("../src/domain/rateChecks.ts");

  // Un documento como el real: tres bloques de precios, uno por hotel.
  const TEXTO_PDF = [
    "PRECIOS ALOJAMIENTO (1) Villa Bonita / Aloha",
    "PC 65 € pax y noche 82 € pax y noche",
    "PRECIOS ALOJAMIENTO (2) Mediterrania MED2/3",
    "PC 70 € pax y noche 87 € pax y noche",
    "PRECIOS ALOJAMIENTO (3) Mediterrania MED1",
    "PC 79 € pax y noche 112 € pax y noche",
  ].join(" ");

  await test("una cita que no está en el documento se señala", () => {
    const avisos = bloques.checkRateBlocks(
      [
        {
          id: "a1",
          accommodationName: "Villa Bonita / Aloha",
          rates: [
            { id: "r-inventada", boardType: "PC", pvpAmount: 65, rawText: "PC 65 € en temporada alta con desayuno incluido" },
            { id: "r-real", boardType: "PC", pvpAmount: 65, rawText: "PC 65 € pax y noche" },
          ],
        },
        {
          id: "a2",
          accommodationName: "Mediterrania MED1",
          rates: [{ id: "r-otro", boardType: "PC", pvpAmount: 79, rawText: "PC 79 € pax y noche" }],
        },
      ],
      TEXTO_PDF,
    );

    const inventada = avisos.get("r-inventada") ?? [];
    assert.equal(inventada[0]?.code, "FRAGMENT_NOT_IN_DOCUMENT");
    assert.equal(avisos.has("r-real"), false, "la cita que sí está no se señala");
  });

  await test("un reparto limpio no genera ruido", () => {
    const avisos = bloques.checkRateBlocks(
      [
        {
          id: "a1",
          accommodationName: "Villa Bonita / Aloha",
          rates: [{ id: "v1", boardType: "PC", pvpAmount: 65, rawText: "PC 65 € pax y noche 82 € pax y noche" }],
        },
        {
          id: "a2",
          accommodationName: "Mediterrania MED1",
          rates: [{ id: "m1", boardType: "PC", pvpAmount: 79, rawText: "PC 79 € pax y noche 112 € pax y noche" }],
        },
      ],
      TEXTO_PDF,
    );
    assert.equal(avisos.size, 0);
  });

  await test("con un solo alojamiento no hay reparto que firmar", () => {
    assert.equal(bloques.requiereConfirmarReparto(1), false);
    assert.equal(bloques.requiereConfirmarReparto(3), true);
  });

  // --- ocupación y canal: cotizar la tarifa que toca ---------------------------
  // Los números salen del PDF real "TARIFAS FUTBOL 2027 CLIENTE MSH GENÉRICO":
  // Villa Bonita / Aloha, PC con campo artificial, 73 € en doble y 92 € en
  // individual. Son la misma línea de la tabla, y hasta ahora el catálogo no
  // sabía distinguirlas.
  console.log("\nOcupación y canal (la tarifa correcta):");

  const villa = await prisma.accommodation.create({
    data: {
      accommodationName: "Villa Bonita / Aloha",
      locality: "Salou",
      accommodationType: "Hotel",
      rates: {
        create: [
          {
            year: 2027,
            boardType: "PC",
            includedService: "Campo artificial 1,30 h",
            occupancyLabel: "Doble",
            pvpAmount: 73,
            currency: "EUR",
          },
          {
            year: 2027,
            boardType: "PC",
            includedService: "Campo artificial 1,30 h",
            occupancyLabel: "Individual",
            pvpAmount: 92,
            currency: "EUR",
          },
          {
            year: 2027,
            boardType: "PC",
            includedService: "Campo artificial 1,30 h",
            occupancyLabel: "Doble",
            pvpAmount: 66,
            currency: "EUR",
            clientSegment: "SWISS_TTOO",
          },
        ],
      },
    },
  });

  const filtrosSalou = {
    destinationText: "Salou",
    dateFrom: "2027-04-10",
    dateTo: "2027-04-15",
    participants: 40,
    teachers: 4,
    boardType: "Pensión completa",
  };

  await test("al cotizar se ofrece la tarifa compartida, no la individual", async () => {
    const resultado = await search.searchAccommodationsDb({
      ...filtrosSalou,
      clientSegment: "GENERIC",
    });
    const match = resultado.matches.find((m) => m.accommodation.id === villa.id);
    assert.ok(match, "Villa Bonita debe aparecer");
    assert.equal(match!.rate.pvpAmount, 73, "los alumnos van en doble, no a 92 €");
    assert.equal(match!.rate.occupancyLabel, "Doble");
  });

  await test("la tarifa de los profesores viaja con la del grupo", async () => {
    const resultado = await search.searchAccommodationsDb({
      ...filtrosSalou,
      clientSegment: "GENERIC",
    });
    const match = resultado.matches.find((m) => m.accommodation.id === villa.id);
    assert.ok(match!.singleRate, "debe encontrar la de uso individual");
    assert.equal(match!.singleRate!.pvpAmount, 92);
    assert.equal(match!.singleRate!.includedService, "Campo artificial 1,30 h", "misma línea de la tabla");
  });

  await test("una tarifa pactada con un canal no se ofrece a otro cliente", async () => {
    const paraColegio = await search.searchAccommodationsDb({
      ...filtrosSalou,
      clientSegment: "GENERIC",
    });
    const colegio = paraColegio.matches.find((m) => m.accommodation.id === villa.id);
    assert.equal(colegio!.rate.pvpAmount, 73, "al colegio NO se le da el precio del turoperador");

    const paraSuizo = await search.searchAccommodationsDb({
      ...filtrosSalou,
      clientSegment: "SWISS_TTOO",
    });
    const suizo = paraSuizo.matches.find((m) => m.accommodation.id === villa.id);
    assert.equal(suizo!.rate.pvpAmount, 66, "el turoperador sí ve la suya, que antes era invisible");
  });

  await test("el total incluye a los profesores, y a su precio", async () => {
    const pricingUi = await import("../src/services/pricing.ts");
    // 40 alumnos a 73 € + 4 profesores a 92 €, cinco noches.
    assert.equal(
      pricingUi.totalAlojamiento({
        unitPrice: 73,
        teacherPrice: 92,
        participants: 40,
        teachers: 4,
        nights: 5,
      }),
      16440,
    );
    // Antes los profesores no se cobraban: 14.600 €, 1.840 € menos.
    assert.equal(
      pricingUi.totalAlojamiento({
        unitPrice: 73,
        teacherPrice: 92,
        participants: 40,
        teachers: 0,
        nights: 5,
      }),
      14600,
    );
    // Sin tarifa individual en el documento, los profesores van al precio del grupo.
    assert.equal(
      pricingUi.totalAlojamiento({
        unitPrice: 73,
        teacherPrice: 73,
        participants: 40,
        teachers: 4,
        nights: 5,
      }),
      16060,
    );
  });

  await prisma.$disconnect();

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
    removeTestStorage();
  });
