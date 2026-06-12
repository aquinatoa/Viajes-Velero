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
- Prisma + SQLite como base relacional
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

La búsqueda de alojamientos y actividades ya consulta la SQLite real vía API local.

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

Para inicializar SQLite local:

```bash
npm run prisma:generate
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /tmp/viajes_velero_schema.sql
sqlite3 prisma/dev.db < /tmp/viajes_velero_schema.sql
npm run prisma:seed
npm run prisma:import-rates
```

## Importación inicial desde Excel

Se añadió un importador real en `prisma/importRates.ts` para cargar:

- `ACCOMMODATION_RATES_XLSX`
- `ACTIVITY_RATES_XLSX`

Por defecto usa:

- `/Users/anthony/Downloads/Viajes Velero/OK TARIFAS Costes.xlsx`
- `/Users/anthony/Downloads/Viajes Velero/TARIFAS GRUPOS 2026.xlsx`
