# Handoff - Viajes Velero Ops

> Documento de compactación de contexto para continuar el trabajo en una conversación nueva
> sin arrastrar todo el historial. Última actualización: 2026-06-14.
>
> Estado: el módulo documental (importar tarifas desde PDF con IA, revisar y publicar) está
> completo y operativo, con una experiencia de uso por pestañas y tablas pensada para gestionar
> muchos alojamientos. La importación masiva por Excel se retiró del app (queda como script CLI).
> Trabajo reciente commiteado en la rama `feat/documental-review-workspace` (no hay remoto git).

## Goal we are working toward

Módulo documental de inventario para importar tarifas desde PDFs de proveedores/hoteles. Flujo:

1. Registrar documento.
2. Subir PDF.
3. Extraer texto del PDF.
4. Analizar el texto con IA real (Anthropic/Claude).
5. Crear candidatos staging revisables.
6. Revisar/aprobar/rechazar candidatos manualmente (en tablas, a escala).
7. Publicar solo candidatos aprobados al inventario operativo (manual, con dry-run + confirmación).
8. Mantener trazabilidad del origen documental y poder retirar lo publicado.

El flujo nunca publica automáticamente. La revisión humana es obligatoria.

## Stack y arranque

- React + TypeScript + Vite (frontend) · Express (backend, `server/index.ts`) · Prisma + SQLite
  (`prisma/dev.db`).
- API local en `http://localhost:8787`; Vite en `http://localhost:5173` (CORS para 5173/5174).
- `npm.cmd run dev` arranca API + Vite con `concurrently`.
- Extracción PDF con `pdfjs-dist` (build legacy) en `server/pdfTextExtraction.ts`.
- IA real con Anthropic/Claude vía SDK oficial `@anthropic-ai/sdk` en `server/aiDocumentAnalysis.ts`.
  Alternativa OpenAI (Responses API vía `fetch`) si `AI_PROVIDER=openai` y `AI_API_KEY`; el
  proveedor principal es Anthropic.
- Variables en `.env` local (NO versionado; solo `.env.example` con valores vacíos):
  ```
  AI_PROVIDER=anthropic
  ANTHROPIC_API_KEY=
  AI_MODEL=claude-sonnet-4-5
  ```

## Navegación del app

Sidebar con 3 páginas (`src/components/Sidebar.tsx`, `src/App.tsx`):

- **Nuevo registro** y **Existente**: flujos comerciales (solicitud → propuesta → CRM Zoho). No
  tocados en este trabajo. Usan `/api/search/accommodations` y `/api/search/activities`.
- **Inventario documental** (id de página `"inventory"`, antes `"mcp"`): renderiza solo
  `<InventoryDocumentsPanel />`. Tiene un toggle interno "Documentos" / "Catálogo publicado".
  El bloque de importación masiva por Excel y el explorador "Ver todo lo importado" se eliminaron
  del app (ver "Cambios recientes").

## Modelo de datos (Prisma, `prisma/schema.prisma`)

- Documental: `SourceDocument`, `DocumentExtraction`, `ImportIssue`, `StagingAccommodation`,
  `StagingAccommodationRate`, `StagingAccommodationAdjustment`, `StagingAccommodationPolicy`,
  `StagingAccommodationBlackoutDate`, `StagingActivity`, `StagingActivityRate`,
  `StagingActivityPolicy`. Los hijos de staging caen por `onDelete: Cascade`.
- Operativo: `Accommodation`, `AccommodationRate`, `Activity`, `ActivityRate` — con campos de
  trazabilidad nullable `sourceDocumentId`, `sourceStagingId` (y `currency` en tarifas), añadidos
  vía `prisma db push` aditivo. NO borrar `dev.db` ni usar `migrate reset`.

## Endpoints actuales (backend)

Documental (todos bajo `/api/inventory`):

- `POST /documents` crear · `GET /documents` listar (incluye contadores
  `candidateCount`/`pendingReviewCount`/`approvedCount` por documento) · `GET /documents/:id`
  detalle (los `Decimal` de Prisma se serializan a number).
- `POST /documents/:id/file` subir/reemplazar · `DELETE /documents/:id/file` quitar archivo ·
  `PATCH /documents/:id` editar metadatos de control · `POST /documents/:id/analyze` extraer texto.
- `POST /documents/:id/ai-analyze` análisis IA de vista previa (no guarda) ·
  `POST /documents/:id/create-staging` crear candidatos · `POST /documents/:id/regenerate-staging`
  descartar y recrear.
- `PATCH /staging/:entity/:id` editar un candidato · `PATCH /staging/bulk`
  `{ entity, ids, reviewStatus }` cambio de estado en lote.
- `GET /documents/:id/publish-approved/dry-run` simular publicación ·
  `POST /documents/:id/publish-approved` publicar (idempotente por `sourceDocumentId`).
- `GET /documents/:id/published` trazabilidad de lo vivo ·
  `GET /documents/:id/unpublish/dry-run` simular retirada · `POST /documents/:id/unpublish` retirar.
- `GET /documents/:id/delete/dry-run` simular borrado · `DELETE /documents/:id` borrar documento
  (409 si tiene publicados).
- `GET /catalog` catálogo global del inventario publicado (con origen documental) ·
  `DELETE /published/:kind/:id` retirada granular (kind: accommodation | activity |
  accommodation-rate | activity-rate).

Eliminados: `/documents/:id/approve|reject|publish` (estado a nivel de documento) y
`/api/data/summary|catalog|import` (importación Excel). Siguen `/api/search/*` y `/api/crm/*`.

## Funcionalidad lista (validada en runtime)

- Crear documento, subir PDF, extraer texto (evita TEXT duplicado con incidencia INFO
  `TEXT_ALREADY_EXTRACTED`).
- Análisis IA real con Anthropic (o mock con aviso si falta `ANTHROPIC_API_KEY`).
- Crear / regenerar candidatos staging.
- Revisión a escala en **tabla** (`RateReviewTable`): selección múltiple, aprobar 1 clic por fila
  (aprueba también el padre, vía `handleApproveWithParent`), acciones en lote, edición en línea.
  Aplica a TODOS los tipos: tarifas, suplementos, políticas, fechas especiales (columnas vía
  `CandidateColumn[]`).
- Control de calidad (conteos por estado + advertencias previas a publicar).
- Dry-run de publicación + confirmación explícita; publicación idempotente.
- Trazabilidad de lo publicado por documento; retirar publicación (idempotente, solo por
  `sourceDocumentId`, recuperable) con dry-run + confirmación que lista qué se quita.
- Incidencias agrupadas por tipo; eventos INFO repetibles se "superseden" (solo la última queda
  activa). El panel muestra "N activa(s) (+M resuelta(s))".
- Lista de documentos con buscador y columna "Por revisar".

## Workspace del documento (UX por pestañas)

`InventoryDocumentsPanel.tsx` (un único componente grande; si crece, extraer a su propio archivo).
El detalle se organiza en pestañas con contador:

- **Resumen**: archivo fuente, acciones del pipeline (Ejecutar análisis → Analizar con IA → Crear
  candidatos), contadores de staging, control de calidad, banner "aprobado sin publicar",
  regenerar candidatos, vista previa del análisis IA.
- **Pendientes / Aprobados / Rechazados**: tabla de candidatos del estado correspondiente.
- **Publicados**: trazabilidad en vivo + retirar publicación.
- **Incidencias**: incidencias agrupadas + extracciones.

Componentes clave: `RateReviewTable` (tabla genérica de candidatos), `StagingEditableCard` (editor;
se re-sincroniza con `useEffect` al cambiar desde fuera), `QualityControlPanel`, `ImportIssuesPanel`.

## Cambios recientes (rama `feat/documental-review-workspace`)

Commits (base `d866b1e`, más reciente arriba):

- `2ae64c7` Quitar la importación masiva por Excel del app (bloque "Datos y MCP" + explorador +
  endpoints `/api/data/*` + funciones apiClient). Los datos cargados NO se borran; el importador
  Excel sigue como CLI (`npm run prisma:import-rates`).
- `c544841` Columna "Por revisar" en la lista de documentos (contadores en `listInventoryDocuments`).
- `601397a` Rediseño: workspace por pestañas + tablas unificadas de revisión; backend de bulk,
  regenerar, dry-run, retirada y trazabilidad; superseding de incidencias; serialización de
  Decimals; buscador; limpieza de código muerto.

Limpieza ya hecha: eliminados `RatePriceSummary`/`extractAmountFromText`, estado de filtro
`reviewFilter`, botones/endpoints/APIs de aprobar/rechazar/publicar a nivel de documento, y CSS
sin uso (`.rate-prices`, `.bulk-toolbar`, etc.).

Nota Prisma: el IDE puede marcar `sourceDocumentId`/`sourceStagingId`/`rates` en tablas operativas
como inexistentes — es ruido del TS-server (cliente generado desactualizado). `tsc -b` no
typechquea `server/` (corre con `tsx`) y en runtime el cliente sí los conoce. Con la API detenida,
`npm.cmd run prisma:generate` lo limpia.

## Documento de prueba de referencia: "4R 4 estrellas"

- Archivo: `Tarifas_grupos_compra_2026_4R_4_estrellas[1].pdf` (PDF con capa de texto).
- La IA generó staging real: 1 alojamiento ("4R Salou Park Resort I", Salou), ~40 tarifas, 7
  suplementos, 17 políticas.
- Diagnóstico clave (ya resuelto): las tarifas traen el importe en `netAmount` (no `pvpAmount`)
  porque el PDF da precios netos; la publicación usa `pvpAmount ?? netAmount`. Los importes ya se
  muestran como número (no string).
- El estado de revisión del 4R se ha ido cambiando durante las pruebas (mezcla de pendientes y
  aprobados). No asumir un estado fijo: comprobar en la UI / `GET /documents/:id`.

## Trabajo recién completado (rama `feat/documental-review-workspace`, SIN commitear)

Los cuatro "próximos pasos" anteriores ya están hechos (build OK, 10/10 tests). Pendiente de commit:

- **Columna "Por revisar" accionable + orden**: en `InventoryDocumentsPanel.tsx` la lista se ordena
  por `pendingReviewCount` desc (copia, sort estable). El tag "N pendiente(s)" es ahora un botón
  (`status-tag--action`) que abre el detalle en la pestaña Pendientes (`handleViewDetail(id,
  "pendientes")`; nuevo parámetro opcional `initialTab`).
- **Trazabilidad en búsqueda operativa**: `Accommodation`/`Activity` (en `src/domain/types.ts`)
  tienen `sourceDocumentId?`/`sourceDocumentName?` (opcionales). `server/searchDb.ts` los resuelve
  con `loadSourceDocumentNames` (1 query, sin N+1) en ambas búsquedas. En `App.tsx` se muestra un
  badge "Origen: <doc>" (`.origin-tag`) en la tarjeta de alojamiento y como `title` en el chip de
  actividad.
- **Pruebas automatizadas**: `tests/documentFlow.test.ts` (sin frameworks; corre con `tsx`).
  `npm run test` ejercita crear → staging → aprobar en lote → dry-run → publicar → trazabilidad
  (incl. búsqueda) → idempotencia → dry-run retirada → retirar. Usa una BD SQLite TEMPORAL
  (`prisma/test-flow.db`, gitignored) creada con `prisma db push`; NO toca `dev.db`. En Windows el
  archivo temporal queda bloqueado al final (EPERM, normal): se borra al inicio de la corrida
  siguiente. Nuevo script `test` en package.json.
- **Refactor del panel**: se extrajeron dos módulos en `src/components/inventory/`:
  `inventoryFormatting.ts` (`getErrorMessage`, `formatAmount`, `stagingReviewStatusLabels/Options`)
  y `RateReviewTable.tsx` (`RateReviewTable`, `StagingEditableCard`, definiciones de campos y de
  columnas). El panel bajó de ~3150 a ~2510 líneas.

## Gestión del inventario publicado (SIN commitear, build OK, 16/16 tests)

Tres funciones nuevas pedidas por el usuario (borrar documento, retirada granular, catálogo global):

- **Eliminar documento**: botón "Eliminar" en la columna Acciones de la lista. Hace dry-run
  (`GET /documents/:id/delete/dry-run`); si el documento tiene registros publicados, **se bloquea**
  con aviso ("retíralos primero"). Si no, muestra banner de confirmación (conteo de staging que se
  borra) y borra con `DELETE /documents/:id` (cascade de extracciones/incidencias/staging; NO toca
  el inventario operativo ni Excel; NO borra el archivo físico de storage/). Backend:
  `deleteInventoryDocument` / `dryRunDeleteInventoryDocument` / `DeleteDocumentValidationError`.
- **Retirada granular**: en la pestaña "Publicados", botón "Quitar … del inventario" por
  alojamiento/actividad y enlace "quitar" por tarifa. Confirmación inline. Backend:
  `unpublishPublishedItem(kind, id)` con kind ∈ accommodation | activity | accommodation-rate |
  activity-rate; ruta `DELETE /api/inventory/published/:kind/:id` (404 si no existe). Las tarifas de
  un alojamiento/actividad caen por cascade; quitar un alojamiento que esté en una propuesta CRM
  también elimina esa opción de propuesta (mismo comportamiento que la retirada por documento).
- **Catálogo global**: nuevo toggle de vista en el panel ("Documentos" / "Catálogo publicado"),
  componente `InventoryCatalogView.tsx`. Lista TODO el inventario operativo (todos los documentos e
  incluso filas de Excel sin documento), agrupado en Alojamientos/Actividades, con buscador y un
  badge "Origen: <documento>" (o "importado (Excel)"). Backend: `getPublishedInventoryCatalog`
  (resuelve nombres de documento en una sola query), ruta `GET /api/inventory/catalog`.

Archivos nuevos: `InventoryCatalogView.tsx`. Tipos en `documentImportTypes.ts`
(`DryRunDeleteDocumentResult`, `DeleteDocumentResult`, `PublishedItemKind`, `UnpublishItemResult`,
`Catalog*`, `PublishedInventoryCatalog`). apiClient: `deleteInventoryDocumentApi`,
`dryRunDeleteInventoryDocumentApi`, `getInventoryCatalogApi`, `unpublishPublishedItemApi` (+ helper
`deleteJson`). Las pruebas (`npm run test`) ahora cubren también catálogo, borrado bloqueado/
permitido y retirada granular.

## Edición de registro, archivo y simplificación (SIN commitear, build OK, 17/17 tests)

- **Editar registro**: el formulario de registro se reutiliza para editar (botón "Editar" por fila →
  precarga y "Guardar cambios"/"Cancelar"). Backend `updateInventoryDocumentMetadata` +
  `PATCH /api/inventory/documents/:id` (valida nombre no vacío → 400). apiClient
  `updateInventoryDocumentApi`.
- **Reemplazar/quitar PDF**: en la pestaña Resumen del detalle, input de archivo con "Reemplazar
  archivo" + "Quitar archivo". Reemplazar = la subida existente (resetea extracción). Quitar:
  backend `removeInventoryDocumentFile` + `DELETE /api/inventory/documents/:id/file` (limpia campos
  del fichero, no borra el físico de storage/ ni el staging). apiClient
  `removeInventoryDocumentFileApi`.
- **Simplificar UI**: el formulario de registro es ahora plegable (botón "＋ Registrar documento");
  estado inicial guiado (`.empty-state`) con los 5 pasos cuando no hay documentos.
- **Limpieza**: eliminadas `getImportedCatalogDb`/`getInventorySummaryDb` (dead code en searchDb.ts).
  Renombrado el id de página `"mcp"` → `"inventory"` en App.tsx y Sidebar.tsx (NO confundir con
  `services/mcpTools`, que SÍ se usa: alimenta los flujos comerciales vía `mockData`/`searchService`/
  `mockDb` — NO son dead code).

## Pendiente clave: extraer el workspace del documento (DIFERIDO a propósito)

El render del detalle dentro de `InventoryDocumentsPanel.tsx` (~880 líneas, ~25 estados, ~20
handlers, subida de archivo compartida con la lista) debería extraerse a `DocumentWorkspace.tsx`
(contrato sugerido: `documentId`, `onChanged` para recargar la lista, `onClose`; que gestione su
propio estado/errores/archivo). Se dejó sin hacer **a propósito**: es refactor estructural sin
capacidad nueva, de alto riesgo de regresión, y su corrección NO la cubren los tests (validan el
backend, no el cableado React) → hay que verificarlo pestaña a pestaña con la app abierta. Hacerlo
como tarea propia.

## Próximos pasos sugeridos (no iniciados)

- **Extraer el workspace del documento** (ver arriba) — el ítem de estructura pendiente.
- Ampliar `tests/documentFlow.test.ts` con el flujo de ACTIVIDADES (hoy cubre alojamientos).
- Revisar/validar end-to-end los flujos comerciales (Nuevo/Existente + CRM Zoho), no tocados aquí.
- Aviso visible en UI cuando el análisis IA corre en modo mock (sin `ANTHROPIC_API_KEY`).

## Reglas y restricciones

- No borrar `prisma/dev.db` ni `storage/`.
- No tocar los flujos comerciales (Nuevo/Existente, CRM/tratos) salvo petición explícita.
- No ejecutar `npm audit fix` ni `npm audit fix --force`.
- No hacer commit automáticamente (solo cuando el usuario lo pide). No imprimir claves de `.env`.
- Mantener español neutro/latino en la UI. Usar "trato(s)" en vez de "oportunidad(es)" en el CRM.
- Antes de cambios relevantes ejecutar `git status`. Ejecutar `npm.cmd run build` al cerrar bloque.
- No publicar ni retirar automáticamente; siempre dry-run + confirmación humana.

## Comandos útiles

```powershell
cd "C:\Users\User\Documents\Viajes Velero Ops"
git status
npm.cmd run build                 # tsc -b && vite build
npm.cmd run test                  # pruebas del flujo documental (BD SQLite temporal)
taskkill /F /IM node.exe          # liberar :8787 / DLL de Prisma
npm.cmd run dev                   # API :8787 + Vite :5173
npm.cmd run prisma:push           # db push aditivo (no reset)
npm.cmd run prisma:generate       # con la API detenida si da EPERM
npm.cmd run prisma:import-rates   # (CLI) resembrar base desde Excel, si hiciera falta
```

Notas de entorno:

- En este equipo `npm install` puede requerir `NODE_OPTIONS=--use-system-ca` por interceptación
  TLS corporativa (sin desactivar `strict-ssl`).
- Si `prisma:generate` falla por DLL bloqueada (`EPERM`), detén el proceso node de la API antes.
- No hay remoto git configurado: los commits quedan en local en la rama
  `feat/documental-review-workspace`.
