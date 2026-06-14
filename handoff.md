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
- **Inventario documental** (antes "Datos y MCP"): renderiza solo `<InventoryDocumentsPanel />`.
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
- `POST /documents/:id/file` subir · `POST /documents/:id/analyze` extraer texto del PDF.
- `POST /documents/:id/ai-analyze` análisis IA de vista previa (no guarda) ·
  `POST /documents/:id/create-staging` crear candidatos · `POST /documents/:id/regenerate-staging`
  descartar y recrear.
- `PATCH /staging/:entity/:id` editar un candidato · `PATCH /staging/bulk`
  `{ entity, ids, reviewStatus }` cambio de estado en lote.
- `GET /documents/:id/publish-approved/dry-run` simular publicación ·
  `POST /documents/:id/publish-approved` publicar (idempotente por `sourceDocumentId`).
- `GET /documents/:id/published` trazabilidad de lo vivo ·
  `GET /documents/:id/unpublish/dry-run` simular retirada · `POST /documents/:id/unpublish` retirar.

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

## Próximos pasos sugeridos (no iniciados)

- Hacer la columna "Por revisar" accionable (clic → abre la pestaña Pendientes) y/o ordenar la
  lista por "más pendientes primero".
- Pruebas automatizadas del flujo documental (crear/aprobar en lote/dry-run/publicar/retirar).
- Mostrar la trazabilidad de origen documental también desde la búsqueda operativa.
- Si `InventoryDocumentsPanel.tsx` crece más, extraer el workspace a su propio archivo.

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
