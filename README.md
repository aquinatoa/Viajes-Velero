# Viajes Velero Ops MVP

Aplicación interna de operaciones para recibir solicitudes de viajes en grupo, normalizarlas sin inventar datos, validar campos críticos, buscar inventario estructurado, construir propuestas y preparar payloads CRM.

## Qué incluye esta iteración

- parser más honesto con `missingFields` y `warnings`
- validación operativa diferenciada para cliente nuevo y existente
- búsquedas estructuradas con respuestas `ok`, `no_matches` o `insufficient_filters`
- propuesta más robusta con hasta 3 alojamientos y actividades asociadas por opción
- payload CRM separado en contacto, cuenta, oportunidad, opción aprobada y actividades
- contratos de servicios más consistentes y cercanos a un futuro MCP

## Stack

- React + TypeScript + Vite
- Prisma + PostgreSQL como base relacional
- capa de servicios modular lista para integración MCP y Zoho futura
- repositorio mock en memoria y datos semilla estructurados para esta fase

## Servicios compartidos

Exportados desde `src/services/mcpTools.ts`:

- `parseTripRequest`
- `validateTripRequest`
- `searchAccommodations`
- `searchActivities`
- `buildProposal`
- `approveProposal`
- `prepareCrmPayload`
- `findCandidateOpportunities`
- `confirmFinalSelection`
- `importRates`

## Qué sigue mock

- persistencia operativa principal todavía en memoria
- parser basado en reglas y regex, no en NLP real
- la importación ya sale de Excel real, pero aún faltan más reglas de limpieza y normalización
- CRM sin llamadas reales a Zoho

## Desarrollo

```bash
npm install
cp .env.example .env
npm run dev
```

`npm run dev` arranca:

- la UI en `http://localhost:5173`
- la API local Prisma en `http://localhost:8787`

La búsqueda de alojamientos y actividades ya consulta la base real vía API local.

## Base de datos

El esquema Prisma está en `prisma/schema.prisma` e incluye:

- `clients`
- `trip_requests`
- `accommodations`
- `accommodation_rates`
- `activities`
- `activity_rates`
- `trip_proposals`
- `proposal_accommodation_options`
- `proposal_activity_options`
- `crm_sync_logs`

Hace falta un PostgreSQL. Para levantar uno local en Docker:

```bash
docker run -d --name oravia-pg -e POSTGRES_USER=oravia -e POSTGRES_PASSWORD=oravia \
  -e POSTGRES_DB=oravia -p 5433:5432 postgres:16-alpine
```

Con `DATABASE_URL` apuntando a él, inicializar es:

```bash
npm run prisma:generate
npm run prisma:migrate      # aplica prisma/migrations/
npm run prisma:seed
npm run prisma:import-rates
```

Las pruebas crean su propio esquema temporal y lo eliminan al terminar, así que
no tocan los datos de trabajo. Toman la conexión de `TEST_DATABASE_URL` si
existe y, si no, de `DATABASE_URL`.

## Extracción de texto de documentos PDF

El módulo documental de inventario incluye extracción básica de texto (sin IA y sin OCR) para los archivos PDF ya subidos. La lógica está en `server/pdfTextExtraction.ts` y se ejecuta desde `POST /api/inventory/documents/:id/analyze`:

- si el documento no tiene archivo, la API responde con un error claro
- si el archivo no es PDF, se registra una incidencia `INFO` y queda pendiente
- si es PDF con capa de texto, se guarda una `DocumentExtraction` con `extractionMethod: "TEXT"`
- si es PDF escaneado sin texto, se registra una incidencia `WARNING` y `extractionStatus` pasa a `NEEDS_OCR`

Usa la dependencia [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) (build *legacy* para Node).

### Nota de instalación tras certificado TLS corporativo

En equipos con interceptación TLS corporativa, `npm install` puede fallar con `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. La solución segura es usar el almacén de certificados del sistema (no desactivar la verificación):

```bash
NODE_OPTIONS=--use-system-ca npm install
```

No usar `npm audit fix --force` ni desactivar `strict-ssl`.

## Importación inicial desde Excel

Se añadió un importador real en `prisma/importRates.ts` para cargar:

- `ACCOMMODATION_RATES_XLSX`
- `ACTIVITY_RATES_XLSX`

Por defecto usa:

- `/Users/anthony/Downloads/Viajes Velero/OK TARIFAS Costes.xlsx`
- `/Users/anthony/Downloads/Viajes Velero/TARIFAS GRUPOS 2026.xlsx`
