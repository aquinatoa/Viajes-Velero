# Handoff - Viajes Velero Ops

> Documento de compactación de contexto para continuar el trabajo en una conversación nueva
> sin arrastrar todo el historial. Última actualización: Bloque 7 (limpieza, trazabilidad y
> control de calidad del módulo documental) completado en sus Fases 1–5, más el Bloque 8
> (rediseño de usabilidad de la revisión), con análisis IA real de Anthropic/Claude Sonnet
> funcionando. Producto listo para pruebas finales.

## Goal we are working toward

Estamos construyendo el módulo documental de inventario para importar tarifas desde PDFs de
proveedores/hoteles. El objetivo es que el flujo sea:

1. Registrar documento.
2. Subir PDF.
3. Extraer texto del PDF.
4. Analizar el texto con IA real.
5. Crear candidatos staging revisables.
6. Revisar/aprobar/rechazar candidatos manualmente.
7. Publicar solo candidatos aprobados al inventario operativo.
8. Mantener trazabilidad del origen documental.

El flujo nunca debe publicar automáticamente. La revisión humana es obligatoria.

## Current state of the code

- Proyecto React + TypeScript + Vite.
- Backend Express en `server/index.ts`.
- Prisma + SQLite con `prisma/dev.db`.
- API local en `http://localhost:8787`.
- Frontend Vite en `http://localhost:5173`.
- CORS local funcionando (orígenes `http://localhost:5173` y `5174`).
- Extracción PDF con `pdfjs-dist` (build legacy) en `server/pdfTextExtraction.ts`.
- Módulo documental con estos modelos Prisma (`prisma/schema.prisma`):
  - `SourceDocument`
  - `DocumentExtraction`
  - `ImportIssue`
  - `StagingAccommodation`
  - `StagingAccommodationRate`
  - `StagingAccommodationAdjustment`
  - `StagingAccommodationPolicy`
  - `StagingAccommodationBlackoutDate`
  - `StagingActivity`, `StagingActivityRate`, `StagingActivityPolicy`
- Tablas operativas: `Accommodation`, `AccommodationRate`, `Activity`, `ActivityRate`
  (con campos de trazabilidad añadidos: `sourceDocumentId`, `sourceStagingId`, y `currency`
  en las tarifas; columnas nullable).
- Integración IA real con Anthropic/Claude Sonnet en `server/aiDocumentAnalysis.ts`,
  vía el SDK oficial `@anthropic-ai/sdk`.
- Variables esperadas (en `.env` local, NO versionado):
  ```
  AI_PROVIDER=anthropic
  ANTHROPIC_API_KEY=
  AI_MODEL=claude-sonnet-4-5
  ```
- También existe una rama OpenAI previa (Responses API, vía `fetch`) como alternativa si
  `AI_PROVIDER=openai` y hay `AI_API_KEY`, pero el proveedor principal actual es Anthropic.
- SDK oficial `@anthropic-ai/sdk` instalado (no se usa `npm audit fix`).
- No hay claves reales en el código.
- `.env` local no debe versionarse.
- `.env.example` contiene solo variables vacías o de ejemplo.

### Estado del árbol de trabajo

El arreglo de precios PVP/neto (incluido el caso "Precio detectado") ya está commiteado:

- `server/aiDocumentAnalysis.ts` — parser JSON robusto + logs; `max_tokens` 16000.
- `server/documentImportDb.ts` — la validación de precio acepta PVP **o** neto; la publicación
  usa `pvpAmount ?? netAmount`; mapea `netAmount`→`netSaleAmount`, `costAmount`→`netAzulmarinoAmount`.
- `src/components/inventory/InventoryDocumentsPanel.tsx` — las tarjetas de tarifa muestran
  "Precio PVP", "Precio neto", "Coste" y, si solo hay un importe sin tipo claro, "Precio detectado".

### Bloque 7 (limpieza, trazabilidad y control de calidad)

Fases completadas (todas con `npm.cmd run build` verde):

- **Fase 1** — Panel de control de calidad en el detalle: conteos por estado de revisión
  (PENDING/APPROVED/REJECTED/NEEDS_CHANGES) y advertencias previas a publicar. Solo UI.
- **Fase 2A** — Dry-run de publicación: `buildPublishPlan()` (solo lectura) compartido por la
  publicación real y la simulación; endpoint `GET /api/inventory/documents/:id/publish-approved/dry-run`;
  `dryRunPublishApprovedInventoryDocument()`. No escribe nada.
- **Fase 2B** — Confirmación previa: el botón real exige una simulación reciente y una
  confirmación explícita ("Confirmar publicación real" / "Cancelar"); advertencias críticas vs
  informativas; la simulación se invalida al editar un candidato.
- **Fase 3** — Limpieza de incidencias: `ImportIssue` agrupadas por tipo, plegables, con conteos
  por severidad y badge "Histórica". Solo UI; no borra incidencias.
- **Fase 4** — Trazabilidad de lo publicado: endpoint `GET /api/inventory/documents/:id/published`
  (solo lectura) + `getPublishedInventoryByDocument()`; panel "¿Qué hay publicado ahora?" que
  lista los registros operativos vivos vinculados por `sourceDocumentId`/`sourceStagingId`.
- **Fase 5** — Retirar publicación (despublicar): `dryRunUnpublishInventoryDocument()` (solo
  lectura) + `unpublishInventoryDocument()` (borrado idempotente SOLO por `sourceDocumentId`,
  nunca toca filas de Excel; tarifas por `onDelete: Cascade`); endpoints
  `GET .../unpublish/dry-run` y `POST .../unpublish`; la retirada revierte el estado del documento
  de PUBLISHED a PENDING_REVIEW y registra incidencia INFO `UNPUBLISH_COMPLETED`. En la UI: botón
  "Retirar del inventario" con dry-run + confirmación explícita. Recuperable (se puede volver a
  publicar desde el staging aprobado). Verificado en runtime: `/published` y `/unpublish/dry-run`
  responden correctamente para "4R 4 estrellas" (1 alojamiento, 3 tarifas).

Nota Prisma: el cliente generado puede quedar desactualizado respecto al esquema (el IDE marca
`sourceDocumentId`/`sourceStagingId`/`rates` en tablas operativas como inexistentes). Es ruido del
TS-server: `tsc -b` no typechquea `server/` (corre con `tsx`) y en runtime el cliente sí los conoce
(la publicación real los usa). Con la API detenida, `npm.cmd run prisma:generate` lo limpia.

### Bloque 8 (usabilidad de la revisión documental)

Rediseño de la experiencia de revisión/publicación (todo con `npm.cmd run build` verde y
validado en runtime):

- **Revisión a escala**: tarjetas de candidatos **plegables** (resumen en una línea, editar al
  abrir); **acciones en lote** por alojamiento/actividad ("Aprobar alojamiento y todas", "Aprobar
  solo con precio y moneda", "Rechazar todas", "Pasar a pendientes"); **filtro por estado** (chips).
  - Backend: `PATCH /api/inventory/staging/bulk` `{ entity, ids, reviewStatus }` →
    `bulkUpdateStagingReview()` (valida por ítem; omite con motivo, no rompe el lote).
  - "Aprobar … y todas" aprueba el padre + sus tarifas para que el conjunto sea publicable.
- **Regenerar candidatos**: `POST /api/inventory/documents/:id/regenerate-staging` →
  `deleteInventoryDocumentStaging()` + recrear con IA (destructivo SOLO sobre staging). Botón con
  confirmación. "Crear candidatos revisables" se deshabilita si ya existen.
- **Aprobado ≠ publicado**: banner "tienes N cambios aprobados sin publicar" comparando staging
  aprobado publicable con la trazabilidad en vivo (que se carga automáticamente al abrir el detalle).
- **Retirada transparente**: la confirmación lista qué registros se quitarán.
- **Saneamiento**: `getInventoryDocumentDetail()` convierte los `Decimal` de Prisma a number
  (`decimalsToNumbers()`), así el staging expone importes numéricos (antes strings); el estado de
  extracción muestra "Extraído" si hay extracción TEXT/OCR aunque el campo guardado fuese
  "NOT_STARTED".
- Corrección: `StagingEditableCard` re-sincroniza su estado con `useEffect` cuando cambia desde
  fuera (acciones en lote/regeneración), evitando badges obsoletos.

Control de acumulación de incidencias: `addInventoryDocumentIssue` ahora "supersede" — al
registrar un evento INFO repetible (`AI_ANALYSIS_EXECUTED`, `STAGING_CANDIDATES_CREATED`,
`STAGING_REGENERATED`, `PUBLISH_COMPLETED`, `UNPUBLISH_COMPLETED`, `TEXT_ALREADY_EXTRACTED`) marca
como resueltas las anteriores del mismo tipo, así solo la última queda activa (historial intacto).
El panel muestra "N activa(s) (+M resuelta(s))".

### Workspace por pestañas (UX simple)

El detalle del documento se reorganizó en una barra de pestañas en lugar de un scroll largo:

- **Resumen**: archivo fuente, acciones del pipeline (Ejecutar análisis · Analizar con IA · Crear
  candidatos), estado/contadores de staging, control de calidad, banner "aprobado sin publicar",
  regenerar candidatos, y vista previa del análisis IA.
- **Pendientes / Aprobados / Rechazados**: TODOS los tipos de candidato (tarifas, suplementos,
  políticas, fechas especiales) se muestran en una **tabla** genérica (`RateReviewTable`, con
  columnas configurables vía `CandidateColumn[]`): selección múltiple, aprobación de 1 clic por
  fila (aprueba también el padre para que sea publicable mediante `handleApproveWithParent`),
  acciones en lote (Aprobar/Rechazar/A pendientes) y edición en línea al expandir la fila. La
  cabecera del alojamiento/actividad es una tarjeta plegable. Pensado para revisar cientos de
  candidatos sin fatiga. Las pestañas llevan contador.
- **Publicados**: trazabilidad en vivo de lo publicado + retirar publicación (con confirmación).
- **Incidencias**: incidencias agrupadas + extracciones.

Se eliminaron los botones legacy a nivel de documento (Aprobar/Rechazar/Publicar) que se solapaban
con el flujo real de publicación por candidatos. `InventoryDocumentsPanel.tsx` sigue siendo un
único componente grande; si crece más, conviene extraer el workspace a su propio archivo.

## Known working functionality

- Crear documentos de inventario.
- Subir PDF desde la UI.
- Extraer texto básico de PDFs.
- Evitar duplicados de extracción TEXT (incidencia INFO `TEXT_ALREADY_EXTRACTED`).
- Ejecutar análisis IA/mock (`POST /api/inventory/documents/:id/ai-analyze`).
- Ejecutar análisis real con Anthropic si hay `ANTHROPIC_API_KEY`; si no, modo mock con aviso.
- Crear candidatos staging desde el análisis IA
  (`POST /api/inventory/documents/:id/create-staging`).
- Revisar/aprobar/rechazar candidatos staging
  (`PATCH /api/inventory/staging/:entity/:id`).
- Publicar candidatos aprobados al inventario operativo
  (`POST /api/inventory/documents/:id/publish-approved`).
- Publicación idempotente por `sourceDocumentId`/`sourceStagingId`
  (borra lo publicado de ese documento y reinserta; no duplica).
- Preservar registros publicados desde documentos cuando se reimporta Excel
  (`prisma/importRates.ts` solo borra filas con `sourceDocumentId: null`).
- Build actual verde con `npm.cmd run build` (incluyendo los 3 archivos sin commit).

## Latest confirmed test state

- Documento probado: "4R 4 estrellas".
- Archivo fuente: `Tarifas_grupos_compra_2026_4R_4_estrellas[1].pdf` (≈95 KB, PDF con capa de texto).
- La IA real con Anthropic/Sonnet ya generó staging:
  - 1 alojamiento.
  - 40 tarifas.
  - 7 suplementos.
  - 17 políticas.
  - 0 fechas especiales.
  - 0 actividades.
- Esto confirma que la integración IA real funciona.
- El alojamiento detectado fue "4R Salou Park Resort I" (Salou, Tarragona, 4 estrellas, Hotel).
- Varias tarifas se crearon con `rawSourceText` como:
  - "05.01 - 14.03 & 01.11 - 20.12.26 3 noches o más 35,0 € M.P."
  - "05.01 - 14.03 & 01.11 - 20.12.26 3 noches o más 39,0 € P.C."
- Diagnóstico confirmado en la base de datos: las 40 tarifas tienen `netAmount != null` y
  `pvpAmount == null`. Es decir, Claude clasificó los importes como **precio neto** porque el
  PDF dice "La tarifa son Precios Netos (IVA 10% incluido)". La extracción es correcta; el
  síntoma "Precio PVP vacío" venía de que la UI solo mostraba `pvpAmount`. Esto ya se aborda en
  los 3 archivos sin commit (mostrar neto/coste + aceptar neto como precio).

## Files actively edited / relevant files

- `server/aiDocumentAnalysis.ts`
- `server/documentImportDb.ts`
- `server/index.ts`
- `server/pdfTextExtraction.ts`
- `server/documentStorage.ts`
- `server/loadEnv.ts`
- `prisma/schema.prisma`
- `prisma/importRates.ts`
- `src/components/inventory/InventoryDocumentsPanel.tsx`
- `src/services/apiClient.ts`
- `src/domain/documentImportTypes.ts`
- `src/styles.css`
- `package.json`
- `package-lock.json`
- `.env.example`

`.env` local contiene secretos (la clave real de Anthropic). NO debe imprimirse, compartirse ni
versionarse. Solo `.env.example` (con valores vacíos) se versiona.

## Important commits / milestones

Hitos reales obtenidos de `git log` (más reciente primero):

- `9ab51d1` Integrar Claude Sonnet para análisis documental
- `24abad4` / `408d53d` Conectar análisis IA real para documentos
- `9949baa` Ajustar estado visual de publicación documental
- `2e3baee` Publicar candidatos aprobados al inventario
- `5784dab` Mejorar coherencia visual del módulo documental
- `6665ae7` Añadir revisión y edición de candidatos documentales
- `e161fc9` Crear candidatos revisables desde análisis documental
- `01b6482` Preparar análisis IA de documentos
- `4a777a3` Evitar duplicados en extracción documental
- `9f05ca0` / `84470a2` Añadir/documentar extracción básica de texto PDF
- `c65fe9f` / `36f8f71` Añadir revisión humana de documentos de inventario
- `38bdf26` Mejorar visualmente subida de archivo documental
- `2a676d8` Permitir conexión frontend con API local (CORS/API local)
- `79acb59` Añadir subida de archivos desde la interfaz
- `d6d2253` Añadir subida de archivos a documentos de inventario

Nota: los 3 archivos modificados del arreglo de precios PVP/neto AÚN NO están commiteados.

## Everything tried that failed or needed correction

1. Repetir "Ejecutar análisis" creaba extracciones TEXT duplicadas.
   - Se corrigió evitando duplicados TEXT (no se crea otra si ya existe TEXT; se registra
     incidencia INFO `TEXT_ALREADY_EXTRACTED`).

2. El primer mock de IA solo creaba alojamiento y 0 tarifas.
   - Era esperado en modo mock (no inventa tarifas).
   - No servía para validar tarifas reales; para eso hace falta la IA real.

3. Al crear staging, alguna vez apareció "Cannot POST /create-staging".
   - Causa: servidor viejo sin reiniciar tras añadir el endpoint.
   - Solución: `taskkill /F /IM node.exe` y `npm.cmd run dev`.

4. Publicación al inventario necesitó migración aditiva.
   - Se añadieron campos nullable de trazabilidad (`sourceDocumentId`, `sourceStagingId`,
     `currency`) a las 4 tablas operativas vía `prisma db push` (additivo).
   - No borrar `dev.db`. No usar `migrate reset`.

5. OpenAI fue implementado inicialmente pero se decidió usar Claude/Anthropic.
   - OpenAI queda como alternativa (`AI_PROVIDER=openai` + `AI_API_KEY`), pero el foco actual
     es Anthropic.

6. Anthropic puede devolver JSON inválido si responde con markdown fences, comas finales o
   truncado.
   - Se ajustó el parser y el log de error.
   - En errores, buscar en la consola del servidor la línea:
     "Análisis IA Anthropic: JSON inválido del proveedor"
     con `stopReason` y `preview` de la salida.

7. `npm install` mostró mensaje de `npm audit`.
   - No ejecutar `npm audit fix` ni `npm audit fix --force`.
   - Nota: en este equipo, por interceptación TLS corporativa, `npm install` requiere
     `NODE_OPTIONS=--use-system-ca` (usa el almacén de certificados del sistema, sin desactivar
     `strict-ssl`).

8. Problema pendiente actual (precios):
   - La IA extrae tarifas con importes en `rawSourceText`.
   - La UI mostraba "Precio PVP" vacío.
   - Diagnosticado: el importe está en `netAmount` (no en `pvpAmount`), porque el documento da
     precios netos. Los 3 archivos sin commit ya muestran neto/coste y aceptan el neto como
     precio. Falta el caso "Precio detectado" (importe único sin tipo claro).

## Current blocker / next step

El arreglo de precios y todo el Bloque 7 (Fases 1–5: control de calidad, dry-run, confirmación
previa, limpieza de incidencias, trazabilidad de lo publicado y retirada/despublicar) están
terminados (ver sección "Bloque 7" arriba). Bloque 7 cerrado.

Posibles siguientes pasos (no iniciados):

- Mostrar la trazabilidad de origen documental también desde el catálogo/búsqueda operativa.
- Pruebas automatizadas del flujo documental (publicar/dry-run/retirar) si se desea cobertura.

Recordatorio al retomar:

- Tras editar el esquema o si el IDE marca `sourceDocumentId`/`sourceStagingId`/`rates` como
  inexistentes en tablas operativas, ejecutar `npm.cmd run prisma:generate` con la API detenida.
- No borrar candidatos existentes. No publicar automáticamente. Ejecutar `npm.cmd run build` al
  cerrar cada bloque.

## Rules and constraints

- No borrar `prisma/dev.db`.
- No borrar `storage/`.
- No tocar flujos comerciales ni tratos salvo petición explícita.
- No ejecutar `npm audit fix`.
- No ejecutar `npm audit fix --force`.
- No hacer commit automáticamente.
- No imprimir claves de `.env`.
- No modificar secretos.
- Mantener español neutro/latino en la UI.
- Usar "trato(s)" en vez de "oportunidad(es)" cuando aplique al CRM.
- Antes de cambios relevantes ejecutar `git status`.
- Si `git status` no está limpio, detenerse y reportar archivos modificados.
- Ejecutar `npm.cmd run build` al final de cada bloque.

## Useful commands

```powershell
cd "C:\Users\User\Documents\Viajes Velero Ops"
git status
npm.cmd run build
taskkill /F /IM node.exe
npm.cmd run dev
npm.cmd run prisma:push
npm.cmd run prisma:generate
```

Notas:
- `npm.cmd run dev` arranca API (`:8787`) y Vite (`:5173`) con `concurrently`.
- Si Prisma falla por DLL bloqueada (`EPERM`) al generar, hay un proceso node (la API) usando
  el motor: deténlo antes de `prisma:generate`.
- En este equipo, `npm install` puede requerir `NODE_OPTIONS=--use-system-ca` por el
  certificado TLS corporativo.
