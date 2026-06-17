# Handoff - Viajes Velero Ops

> Documento de compactación de contexto para continuar el trabajo en una conversación nueva
> sin arrastrar todo el historial. Última actualización: 2026-06-17.
>
> **App**: consola interna de operaciones (React+TS+Vite / Express / Prisma+SQLite). Requiere
> **login** con roles ADMIN/USER y registra auditoría. Dos grandes áreas: flujo **comercial**
> (Nuevo registro / Existente → Zoho CRM) y **módulo documental** (importar tarifas desde PDF con
> IA, revisar por pestañas y publicar al inventario). Rama de trabajo `feat/documental-review-workspace`,
> remoto `origin` = `https://github.com/aquinatoa/Viajes-Velero` (todo lo de abajo **commiteado y
> empujado**).
>
> **Commits de esta tanda (más reciente arriba):**
> - _(esta sesión, 2026-06-17)_ Popup a **5 pasos** (Actividades como paso propio) + arreglos del
>   **envío a CRM** (nombre/fase/importe/Descripción legible + resumen y enlace al trato) + fix
>   **"fetch failed"** (autorrelanzado con el CA) + nuevo entorno **"Confirmar solicitud"** (lista de
>   tratos del CRM con confirmar: opción/fase/nota). Ver **"Sesión 2026-06-17"** abajo.
> - Pantalla inicial nueva (landing "Dirección B") + popup "Planificar solicitud"
>   de 4 pasos + mejoras de parser + búsqueda de alojamientos (dedupe + scoring afinado) +
>   limpieza de la BBDD de alojamientos. Ver **"Rediseño 2026-06-16"** abajo.
> - `a652ef9` "Mi cuenta" (Perfiles activado: cambiar la propia contraseña)
> - `4348115` handoff: validación E2E de los flujos comerciales
> - `0badc59` Topbar (notificaciones/ayuda/usuario) + limpieza CSS del sidebar antiguo
> - `85d5488` Sidebar v2 (menú modular/colapsable) + navegación por URL (router propio)
> - `a7de364` extraer `DocumentWorkspace` de `InventoryDocumentsPanel`
> - `0f3cd7b` seguridad: validación zod en auth + `.env.example` genérico
> - `c9169db` aviso visible de análisis IA en modo mock
> - `c642cc4` tests del flujo documental de actividades (21→31)
>
> **Estado de validación:** los flujos **Nuevo** (registro → propuesta → crear deal en Zoho) y
> **Existente** (buscar → aprobar opción en Zoho) están **validados E2E contra Zoho real** (ver
> "Validación end-to-end"). 31/31 tests, build OK.
>
> **⚠️ OPERATIVO IMPORTANTE — Zoho tras el proxy TLS:** el backend solo alcanza Zoho si Node tiene el
> bundle de CA. `npm run dev` a secas arranca SIN él → las llamadas a Zoho fallan con `fetch failed`.
> Arrancar con `NODE_EXTRA_CA_CERTS=/c/Users/User/corp-ca-bundle.pem npm.cmd run dev` (o
> `NODE_OPTIONS=--use-system-ca` en Node 24). Pendiente: meterlo en un script `dev`.
>
> **Pendientes principales:** _(de la sesión 2026-06-17, ver su sección)_ alinear la **fase inicial**
> del alta de tratos con el pipeline real de Zoho ("Nueva" no está en sus fases); **cargar precios/edades
> de actividades** (las 264 tarifas están a 0/null) para que el coste/alumno y el Amount las incluyan;
> opcional: **etiquetar** los tratos de viaje para que "Confirmar" no liste los 200 de consultoría.
> _Anteriores:_ módulos del menú aún deshabilitados (Roles y permisos, Logs del sistema, Publicar
> documento, "Nueva con 1/2/3 opciones"); extender `zod` a los endpoints comercial/inventario;
> reconstruir tarifas de los hoteles cuyo PDF tiene tabla difícil (Calypso, Palas Pineda, MedPlaya,
> campings) — ver "Rediseño 2026-06-16". Detalle en las secciones siguientes.

## Sesión 2026-06-17 — Popup 5 pasos + arreglos CRM + "Confirmar solicitud"

Sesión larga sobre los flujos comerciales. **Build OK · 31/31 tests · verificado E2E con Edge
headless** (incluida un **alta real en Zoho** creada y luego borrada). **Pendiente de commit al
escribir esto** (el usuario pidió commitear al final). Archivos tocados: `server/zoho.ts`,
`server/index.ts`, `server/loadEnv.ts`, `server/searchDb.ts`, `src/components/plan/PlanRequestModal.tsx`,
`src/components/confirm/ConfirmRequestsPanel.tsx` (NUEVO), `src/services/{crmService,proposalService,apiClient}.ts`,
`src/domain/types.ts`, `src/router.ts`, `src/App.tsx`, `src/components/home/HomeLanding.tsx`,
`src/components/sidebar/sidebar.config.ts`, `src/styles.css`, `.env` (no versionado) y `.env.example`.

**1. Popup "Planificar solicitud" → ahora 5 pasos** (antes 4). Paso de **Actividades** separado entre
Alojamientos y Enviar a CRM: `1 Solicitud · 2 Datos · 3 Alojamientos · 4 Actividades · 5 Enviar a CRM`.
- **Paso 3 (Alojamientos) pulido**: ranking top-3 con medallas (sobre el score, no el orden mostrado),
  **panel comparativo** arriba (opciones elegidas con precio/coste-alumno/presupuesto), barra de
  **orden** (coincidencia/precio/coste) + filtro **"solo dentro de presupuesto"**, microinteracciones
  (hover-lift, `aria-pressed`). El "muro de chips" de actividades se SACÓ de aquí.
- **Paso 4 (Actividades) NUEVO** (`StepActividades`): catálogo de **tarjetas** con **buscador** por
  nombre/ubicación, botón "+ Añadir / ✓ Añadida", tope de 24 con "Ver todas (N más)". Las actividades
  se eligen **una vez para todo el viaje** (decisión del usuario) → `builder.selectedActivityIds`
  (lista única); al construir la propuesta se asignan a TODAS las opciones (`activitiesByOption`
  derivado en `handleBuildProposal`). `ProposalBuilderState` ganó `selectedActivityIds`.
- **Coste con actividades**: el precio de actividad (`salePvpAmount`) se integra en coste/alumno,
  total de grupo y sello de presupuesto **cuando exista**; hoy salen **"a consultar"** (ver caveat de
  datos abajo). `pvpSnapshot` = "A consultar" cuando es 0. `summaryText` pluraliza y cuenta actividades
  **únicas**.

**2. Búsqueda de actividades (`server/searchDb.ts`) — relajada para que aparezcan.** Antes daban **0**
(el scoring exigía edad, que está vacía en BBDD). Ahora: ubicación **exacta +50** o **misma zona +18**
(Costa Daurada ampliada con Deltebre/Riumar/La Canonja/Delta del Ebro/Amposta/PortAventura; Vall d'Aran
→ Pirineo, excluido para Salou); edad suma si hay dato (+40) y si NO hay dato **no penaliza (+8)**;
**umbral bajado 50→15**; **dedupe por actividad** (mejor tarifa). Para Salou salen ~103.

**3. Envío a CRM (paso 5) — arreglado (varios bugs reales).** `crmService.ts` + `server/zoho.ts`:
- **`Deal_Name` = lo escrito en "Nombre de la oportunidad"** (antes se autogeneraba e ignoraba lo del
  usuario). Se pasa `opportunityName` a `prepareNewOpportunityPayload`.
- **`Stage` = "Nueva"** (antes "Qualification", inválido en la org del backend; default en `zoho.ts` y
  `.env` actualizados). _OJO_: ver hallazgo de pipelines abajo.
- **`Amount`** = total de la opción 1 (parseado del texto). **`Description` legible** (cabecera del
  grupo + opciones con precios + actividades) en vez del **JSON crudo** anterior.
- **Resumen de éxito + enlace**: tras crear, el paso 5 muestra check verde con Nombre/Importe/Fase/ID
  y botón **"Abrir trato en Zoho"** (deep link). `createZohoOpportunity` ahora devuelve
  `dealUrl/dealName/amount`. Bloque "Lo que se registrará en Zoho" antes de enviar.

**4. Fix "fetch failed" al enviar a Zoho — RESUELTO de forma permanente.** Causa: proxy TLS corporativo;
Node solo confía en el bundle si arranca con `NODE_EXTRA_CA_CERTS`, y `npm run dev` no lo ponía. Ahora
**`server/loadEnv.ts` autorrelanza el proceso** con `NODE_EXTRA_CA_CERTS` si en `.env` está
`ZOHO_CA_BUNDLE` y el archivo existe (guard `__VELERO_CA_RELAUNCHED`). En `.env` local:
`ZOHO_CA_BUNDLE="C:/Users/User/corp-ca-bundle.pem"`. Así **`npm run dev` a secas YA alcanza Zoho** (sin
el comando manual del CA). `.env.example` documenta la variable (vacía).

**5. Nuevo entorno "Confirmar solicitud" (reemplaza el flujo Existente por email).**
- La card "Confirmar" de la portada y el sidebar ("Confirmar solicitud → Solicitudes en CRM") llevan a
  **`/confirmar`** (página `confirm` nueva en `src/router.ts`). El flujo viejo `existing` (App.tsx,
  búsqueda por email) queda en el código pero **ya no se enlaza**.
- `src/components/confirm/ConfirmRequestsPanel.tsx` (NUEVO): **lista TODOS los tratos** del CRM (decisión
  del usuario; mezcla viajes + consultoría) como tarjetas (fase con badge, importe, cuenta/contacto, y
  destino/fechas/grupo parseados de la Descripción). **Buscador + filtro por fase + orden**. Modal de
  **Confirmar**: detalle legible de la propuesta + **elegir opción final (1/2/3)** + **avanzar de fase**
  (desplegable con las fases reales) + **añadir nota** (todo sin destruir la Descripción) + "Abrir en Zoho".
- Backend `server/zoho.ts`: `listZohoDeals` (GET Deals con campos, orden por Modified_Time),
  `getZohoDealStages` (pick_list de Stage), `updateZohoDeal` (GET+PUT preservando Description; gestiona
  línea "▸ Opción elegida…" y notas fechadas). Endpoints `GET /api/crm/opportunities`,
  `GET /api/crm/deal-stages`, `POST /api/crm/opportunities/:id/update` (auditoría `CRM_OPPORTUNITY_UPDATE`).
  apiClient: `listZohoOpportunitiesApi`, `fetchZohoDealStagesApi`, `updateZohoOpportunityApi`.

**HALLAZGOS / CAVEATS importantes para la próxima sesión:**
- ⚠️ **El conector MCP de Zoho (claude.ai) es OTRA org distinta de la del backend.** El backend
  (`zohoapis.eu`, token del `.env`) tiene fases reales: *Preparando Presupuesto · Presupuesto Enviado ·
  Seguimiento al Presupuesto · Pendiente de depósito · Oportunidad Ganada · Pendiente de pago resto ·
  Cierre Administrativo · Expediente cerrado · Oportunidad Perdida · Lista de Espera · …*. El MCP mostró
  otras (Nueva/En análisis/…) → **no usar el MCP para limpiar/leer datos del backend** (no los ve). El
  alta de prueba se borró con un script puntual usando el token del `.env` (refresh + DELETE).
- ⚠️ **Incoherencia de fase**: los tratos de viaje se crean en **"Nueva"**, que NO está en la lista de
  fases reales de arriba (¿pertenece a otro pipeline/layout?). El alta funcionó igualmente (Zoho lo
  aceptó). **Pendiente decidir**: alinear la fase inicial del alta con el pipeline real (p. ej.
  "Preparando Presupuesto") para coherencia con "Confirmar".
- ⚠️ **Actividades sin datos**: las 264 tarifas de actividad están **a 0/null en precio y edad**. Las
  actividades son seleccionables y van al CRM como "a consultar", pero el **coste/alumno y el Amount NO
  las incluyen** hasta cargar tarifas reales (vía flujo documental). El módulo de coste ya está listo
  para cuando haya precios.
- "Confirmar" lista **200 tratos** (toda la cartera). Si molesta el ruido de consultoría, se puede
  **etiquetar** los viajes al crear y filtrar por etiqueta (propuesto y descartado por ahora).
- Deep link del trato: `…/crm/tab/Deals/<id>` sin `orgId` (abre si estás logueado en la org). Si tu
  Zoho exige `orgId`, añadirlo (se obtiene de la org).

## Rediseño 2026-06-16 — Landing + Popup "Planificar solicitud" + BBDD de alojamientos

Sesión de rediseño visual y de datos. **Build OK.** Verificado E2E con Edge headless (login real +
modal + Zoho real). El **login se mantiene** como puerta (no se quitó): el prompt pedía "sin login /
usuario desde Zoho", pero el backend exige `Authorization: Bearer`; se dejó preparado el puente a
Zoho sin romper nada (ver `toCurrentUser`).

**1. Pantalla inicial nueva (portada del widget) — "Dirección B: Panel claro".**
- `src/components/home/HomeLanding.tsx` (nuevo): portada a pantalla completa **sin sidebar ni login**
  (early-return en `App.tsx`, como el `/callback`). Header + hero de marca con bienvenida dinámica,
  **dos cards** (azul "Planificar" / verde "Confirmar"), **tuerca de Configuraciones** arriba-derecha
  (solo admin → navega a `/admin/usuarios`), y bloques "Resumen general" / "Actividad reciente" con
  **estados honestos** ("—" / "sin datos", sin contadores falsos).
- `src/router.ts`: nueva página `home` + ruta `/inicio` (destino por defecto tras login).
- `src/domain/types.ts`: tipo `CurrentUser` (`id/name/email/role`). Puente en `App.tsx`
  `toCurrentUser(AuthUser)` (ADMIN→admin, USER→operativo) — **único punto a cambiar** para Zoho.
- `src/components/sidebar/` : item **"Inicio"** (icono `home`) para volver a la portada desde los flujos.
- La card "Planificar" **abre el popup** (no navega); "Confirmar" navega a `/existente/buscar`.

**2. Popup "Planificar solicitud" (slide 1) — flujo completo de 4 pasos.**
- `src/components/plan/PlanRequestModal.tsx` (nuevo): estética premium tipo reservas, **reutiliza los
  servicios existentes** (`parseTripRequest`, `searchAccommodationsApi`, `buildProposal`, CRM…), sin
  tocar backend. Pasos: **1 Solicitud** (chat del mensaje del cliente → `rawTripRequestText`; varios
  mensajes se concatenan) · **2 Datos del viaje** · **3 Alojamientos** · **4 Enviar a CRM**.
- Paso 2 = barra tipo reserva **Destino · Entrada · Salida · Grupo · Filtros**:
  - **Calendario de rango** propio (`DateRangePicker`, sin libs): 2 meses, selección entrada→salida,
    "N noches", navegación de meses, cierre con backdrop/Escape.
  - **Configurador de grupo** (`GroupPopover`): **Adultos / Niños / Bebés** con steppers `–/+`.
    Mapeo: **Niños→`participants`** (alumnos), **Adultos→`teachers`** (profesores), **Bebés→contador
    local** (se guarda/muestra, **no se envía aún** a búsqueda/CRM).
  - **Icono de filtros** abre/cierra "Detalles del viaje" (país, edad, régimen, categoría, requisitos),
    ya no como sección fija. Punto verde si tienen contenido.
  - Escape cierra primero el popover, no el modal (guard por `document.querySelector`).
- Paso 3 = una tarjeta por hotel (ver dedupe), con chips, "**por qué encaja**" (= `matchReasons`),
  precio /pax y "Elegir" (hasta 3 opciones); actividades por opción debajo.
- La página `/nuevo-registro` sigue accesible como respaldo; el popup la sustituye en la práctica.
- Estilos `.home-*` y `.pm-*` en `src/styles.css` (no se tocaron estilos previos).

**3. Parser de la solicitud (`src/services/requestService.ts`) — mejoras.**
- **Fechas en español**: "del 18 al 22 de mayo de 2026", "entre el 11 y el 15…", `DD/MM/AAAA` (antes
  solo ISO). · **Destino**: catálogo ampliado (Salou, Cambrils, La Pineda, Tarragona, Costa Daurada)
  y **preferencia por preposición** ("a/en Salou" gana a "de Madrid" origen). · **Edad**: "entre 15 y
  16 años", "de 14 a 17 años". · **Categoría**: "4 estrellas" → `4*`. · **Régimen** insensible a
  acentos.

**4. Búsqueda de alojamientos (`server/searchDb.ts`) — dedupe + scoring afinado.**
- **Dedupe**: una coincidencia **por alojamiento** (su mejor tarifa), no por tarifa. Antes salían
  ~192 (alojamientos × tarifas) con el mismo hotel repetido; ahora una tarjeta por hotel.
- **Scoring**: categoría con **exclusión de categoría inferior** (piden 4★ → no se cuelan 2★/3★;
  exacta +35, upgrade +20); **destino por zona** (Salou→Costa Daurada; se descartan otras zonas —
  Costa Brava/Pirineo; exacto +40, zona +18); **régimen por código** MP/PC/AD/SA (casa "pensión
  completa" con `PC`); **fechas** (+20 cubre / +6 solapa) y **estancia mínima** (+8 / −10).

**5. BBDD de alojamientos — limpieza y reconstrucción (solo alojamientos).**
- **Fuente**: los ~40 PDFs por hotel del ZIP `Documentos de Tarifas/RE_ próximos pasos…zip` (el Excel
  `OK TARIFAS Costes.xlsx` que sembró los datos está mal estructurado y NO está en esta máquina).
- **Metadatos**: limpiados los 49 (nombre/localidad/categoría/tipo) desde las cabeceras de los PDFs;
  borrado 1 registro basura ("Hotel 4R ***", 0 tarifas).
- **Tarifas reconstruidas** (leídas del PDF, importes verificados) de los hoteles de tabla limpia:
  **4R Hotel 3★, 4R Salou Park Resort I 4★, Eurosalou, Terra Aurea, Voralmar** (+ dedupe del 4R 4★).
  El resto mantiene sus tarifas del Excel.
- **Borrado** de **14 alojamientos sin precio usable** (Evenia ×3, El Acebo, Can Solé, Camping Joan,
  El Garrofer, Vall Natura, casas de colonias Descoberta…) y de **401 filas de tarifa a 0 €** del
  resto → la búsqueda ya no muestra tarjetas a 0. Quedan **33 alojamientos · 554 tarifas**.
- **Backups** de `dev.db` antes de cada paso destructivo en `prisma/dev.db.bak-*` (gitignored).
- **Pendiente**: reconstruir tarifas de los hoteles con tabla difícil/escaneada (Calypso, Palas
  Pineda, MedPlaya Sant Eloi/Santa Mónica, Canada Palace, California, campings) — idealmente vía el
  **flujo documental con revisión humana**. Mejorar el scoring de capacidad/grupo mínimo si se quiere.

**6. Paso 1 (autorrelleno) y paso 3 (decisión) del popup — 2ª tanda.**
- **Autorrelleno de datos del cliente** (`extractClientInfo` en `requestService.ts`): al pegar/añadir
  el mensaje, se rellenan **Email · Nombre · Apellidos · Nombre de oportunidad** (tipo de viaje +
  destino + año). Heurístico, no pisa lo escrito a mano; se ejecuta al añadir y al normalizar.
- **Paso 3 enriquecido para decidir** (`StepAlojamientos` + `extractRequestExtras`):
  - **Ranking top-3** con medallas oro/plata/bronce (cinta + borde de color).
  - **Coste estimado por alumno** (precio × noches) y **total de grupo** (× nº alumnos); los productos
    por apartamento se calculan por apto, no por pax.
  - **Etiqueta de coincidencia** Excelente/Buena/Parcial (según score).
  - **Presupuesto/alumno** detectado del mensaje → **sello por tarjeta** "✓ Dentro de presupuesto ·
    N€ de margen" / "⚠ +N€ sobre presupuesto", y el tope en la barra-resumen.
  - **Requisitos a confirmar** detectados del mensaje (panel ámbar): alergias/dietas, habitación
    adaptada/accesibilidad, habitaciones de profes cercanas, picnic, transporte. Recordatorios, no
    auto-comprobables.
- Descartado por falta de dato fiable: capacidad/grupo mínimo, distancia a playa/servicios.

## Autenticación y roles (RBAC) + auditoría — HECHO

La app exige **login** (operadores internos). Verificado por captura y pruebas de API.

- **Modelos** (Prisma): `User` (email único, passwordHash/Salt, role, isActive), `AuthToken`
  (sesión, 12h), `AuditLog`. Enum `UserRole { ADMIN USER }`.
- **`server/auth.ts`**: hash `scrypt` (nativo, sin deps), tokens opacos, middleware
  `requireAuth`/`requireRole`, `writeAudit`/`listAuditLog`, y `ensureAdminFromEnv()` (crea el admin
  inicial al arrancar desde `ADMIN_EMAIL`/`ADMIN_PASSWORD` del `.env`; no sobreescribe si ya existe).
- **Rutas**: `/api/auth/login|logout|me`, `/api/auth/users` (CRUD, ADMIN), `/api/audit` (ADMIN).
  Guardas por prefijo en `index.ts`: **`/api/inventory` = solo ADMIN**; `/api/commercial`,
  `/api/search`, `/api/crm` = requieren sesión (ambos roles). `/api/auth/login` y `/api/health`
  públicos. **El backend es la fuente de verdad del acceso** (la UI solo oculta).
- **Roles**: **ADMIN** = todo. **USER** = solo el flujo comercial (*Nuevo registro* + *Existente*);
  sin Inventario/Usuarios/Auditoría (403 en backend + ocultos en sidebar).
- **Auditoría**: login/logout, crear/editar usuario, publicar/retirar/borrar documento, crear
  oportunidad CRM. Vista admin en "Auditoría".
- **Frontend**: `apiClient` envía `Authorization: Bearer`, maneja 401 global (evento
  `velero:unauthenticated` → vuelve al login). `LoginPage`, estado de sesión en `App.tsx`, gating del
  sidebar por rol, "Cerrar sesión". Paneles admin: `components/admin/UsersPanel.tsx`,
  `components/admin/AuditPanel.tsx`.

**Credenciales/setup (IMPORTANTE):**
- El admin inicial se define en `.env`: `ADMIN_EMAIL` / `ADMIN_PASSWORD` (placeholders en
  `.env.example`). En el `.env` local de desarrollo se dejó un admin temporal
  `admin@viajesvelero.com` / `velero-admin-2026` — **CAMBIAR**. También hay un usuario de prueba
  `ana@viajesvelero.com` / `usuario-2026` (rol USER) creado para validar; bórralo/cámbialo.
- **Cambiar `ADMIN_PASSWORD` en `.env`** y las contraseñas de prueba antes de uso real.
- Flujo de dev: al arrancar `npm run dev`, hay que **iniciar sesión** para ver la app.

Pendientes/ideas futuras de auth (no hechas): "cambiar mi contraseña" para el propio usuario;
expiración/refresh de token más fina; rate-limiting del login; ampliar auditoría a más acciones.

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

## Sidebar v2 + navegación por URL — HECHO (commit `85d5488`, build OK, 31/31 tests, verificado por capturas)

Se rediseñó el menú lateral y se migró la navegación a **rutas reales** (router propio con History
API, sin dependencias). El cuerpo de las páginas NO se tocó (capa fina URL↔página).

- **Router**: `src/router.ts` (`Page`, `pageFromPath`, `routeForPage`). La URL es la fuente de
  verdad; `App.tsx` deriva `currentPage` de la ruta, navega con `navigatePath` (pushState), escucha
  `popstate` (atrás/adelante) y normaliza rutas desconocidas (p. ej. `/`, post-`/callback`) a
  `/nuevo-registro`. Rutas: `/nuevo-registro`, `/existente/buscar`·`/existente/aprobar`,
  `/inventario/documentos-ia`, `/admin/usuarios`, `/auditoria/acciones`. `main.tsx` sin cambios (no
  hay react-router). El flujo Zoho `/callback` sigue igual (early-return con `window.location`).
- **Sidebar v2** en `src/components/sidebar/`: `sidebar.config.ts` (config centralizada: secciones,
  items, children, permisos, badges, `status:"disabled"`), `icons.tsx` (set SVG inline, sin libs),
  `useSidebar.ts` (colapso persistido en `localStorage` `viajes-velero-sidebar-collapsed`, drawer
  móvil, submenús), `Sidebar.tsx` + `SidebarSection.tsx` + `SidebarItem.tsx`. Estados: activo
  (`aria-current`), hover, deshabilitado, submenú animado; **colapsable** (rail de iconos +
  tooltips), **drawer móvil** (hamburguesa + overlay + Escape + cierre al navegar), accesibilidad
  (`aria-expanded`, focus visible) y `prefers-reduced-motion` (global). Identidad conservada
  (azul-petróleo de marca + acento verde, calibrado más vivo para el fondo oscuro).
- **Permisos**: la config soporta 5 roles (`SidebarRole`) pero el backend sigue ADMIN/USER →
  mapeo `ADMIN→admin`, `USER→comercial`. Resultado igual que antes: USER ve solo Nuevo registro y
  Existente; ADMIN ve todo. Items sin permiso se ocultan; secciones vacías desaparecen.
- **Items "próximamente"** (deshabilitados, en gris, sin click): Publicar documento, Roles y
  permisos, Perfiles, Logs del sistema, y el submenú "Nueva con 1/2/3 opciones". Para activarlos:
  crear su pantalla y quitar `status:"disabled"` en `sidebar.config.ts`.
- **Cómo añadir una opción**: editar `sidebar.config.ts` (un objeto en la sección; `icon` por nombre
  de `icons.tsx`; `route` real o `status:"disabled"`; `permissions`; `badge`). Nada hardcodeado en
  los componentes.
- **Verificación**: build (64 módulos) + 31/31 tests + Edge headless: expandido, colapsado (rail +
  tooltip), submenú, navegación con cambio de URL y **botón atrás del navegador**, item activo por
  ruta, items deshabilitados en gris y **drawer móvil** (390px) con overlay. Cero errores de React.
- **Fuera de alcance** (no hecho): crear las pantallas de los items deshabilitados y ampliar el
  modelo de roles en backend.

## Barra superior (Topbar) + limpieza CSS — HECHO (commit `0badc59`, build OK, 31/31 tests, verificado por capturas)

- **Topbar** (`src/components/Topbar.tsx`): barra superior pegajosa con breadcrumb a la izquierda
  ("Viajes Velero / <sección>", el label se deriva de `currentPage` en `App.tsx`) y a la derecha
  **campana** (popover "No tienes notificaciones" — honesto, sin contador falso), **ayuda** (popover
  con texto breve) y **menú de usuario** (avatar con iniciales + nombre + rol + chevron → dropdown
  con email, badge de rol y "Cerrar sesión"). Los desplegables cierran al pulsar fuera o con Escape
  (`aria-haspopup`/`aria-expanded`). En `App.tsx` el shell autenticado se envolvió en
  `<div className="main-area">` (flex column: Topbar + `<main>`). CSS `.topbar*`/`.main-area` con
  tokens del sistema (sin glassmorphism). En móvil la topbar deja hueco al botón hamburguesa.
- **Limpieza CSS**: eliminado el CSS muerto del sidebar antiguo en `styles.css` (`.sidebar`,
  `.steps*`, `.sidebar__*`, `.sidebar .brand-block`, sus `@media` y la referencia en comentario).
  Además se corrigió un `@media (max-width:1024px)` que ponía `.app-shell` a 1fr (rompía el sidebar
  v2 entre 901–1024px): ahora el cambio a una sola columna solo ocurre a ≤900px (modo drawer).
- **Verificación**: build (65 módulos) + 31/31 tests + Edge headless (topbar por defecto, dropdown
  de usuario con "Cerrar sesión", popover de campana, y cambio de breadcrumb + item activo al
  navegar a Inventario). Cero errores de React.
- **Fuera de alcance**: la campana/ayuda son honestas pero sin fuente de datos real todavía (no hay
  sistema de notificaciones); conectar cuando exista.

## "Mi cuenta" (cambiar la propia contraseña) — HECHO (commit `a652ef9`, build OK, 31/31 tests, verificado por capturas)

Primer módulo deshabilitado activado: **Perfiles → "Mi cuenta"**.
- **Backend**: `changeOwnPassword(userId, current, new, keepToken)` en `server/auth.ts` (verifica la
  contraseña actual, actualiza el hash e invalida las DEMÁS sesiones, conserva la actual). Endpoint
  `POST /api/auth/change-password` (cualquier usuario autenticado) con `changePasswordSchema` (zod) y
  auditoría `PASSWORD_CHANGE`. apiClient `changeOwnPasswordApi`.
- **Frontend**: `src/components/admin/MiCuentaPanel.tsx` (datos del usuario + form actual/nueva/
  repetir, valida ≥8 y coincidencia). Ruta nueva `profile` → `/admin/perfiles` en `src/router.ts`.
  El item "Perfiles" del sidebar se activó como **"Mi cuenta"** (sigue en la sección admin para no
  descuadrarla). Además se añadió **"Mi cuenta" al menú de usuario del topbar** (accesible a todos
  vía dropdown; el Topbar recibió `onNavigate`). `AuditPanel` etiqueta `PASSWORD_CHANGE`.
- **Verificado** con Edge: error de contraseña actual incorrecta, cambio OK ("otras sesiones
  cerradas"), y revertido al valor original (admin sigue con `velero-admin-2026`).
- Quedan deshabilitados: Roles y permisos, Logs del sistema, Publicar documento, "Nueva con
  1/2/3 opciones". Siguiente decisión del usuario sobre cuál sigue.

## Navegación del app

La app exige **login** (ver "Autenticación y roles"). Tras entrar, `App.tsx` muestra el shell con
el sidebar v2 (`src/components/sidebar/`, ver "Sidebar v2 + navegación por URL"). La navegación es
por **rutas** (`src/router.ts`); las páginas internas (`Page`) se **gatean por rol**:

- **Nuevo registro** y **Existente** (ambos roles): flujos comerciales (solicitud → propuesta →
  CRM Zoho). Ya **persisten en BD real** (ver "Opción B"). Usan `/api/commercial/*`,
  `/api/search/*`, `/api/crm/*`.
- **Inventario documental** (solo ADMIN; id `"inventory"`, antes `"mcp"`): `<InventoryDocumentsPanel />`
  con toggle interno "Documentos" / "Catálogo publicado".
- **Usuarios y permisos** y **Auditoría** (solo ADMIN): `components/admin/UsersPanel.tsx` y
  `AuditPanel.tsx`.

El **Usuario** (rol USER) solo ve *Nuevo registro* y *Existente*. El pie del sidebar muestra el
usuario y "Cerrar sesión".

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

`DocumentWorkspace.tsx` (extraído de `InventoryDocumentsPanel.tsx`; ver "Extraer el workspace del
documento — HECHO"). El detalle se organiza en pestañas con contador:

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

## Trabajo recién completado (rama `feat/documental-review-workspace`, ya commiteado)

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

## Gestión del inventario publicado (ya commiteado, build OK, tests al día)

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

## Edición de registro, archivo y simplificación (ya commiteado, build OK, tests al día)

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

## Frontend: auditoría + pulido (commit `d58dbcc`)

Se auditó el frontend con la lente de la skill `impeccable` (+ `emil-design-eng`,
`redesign-existing-projects`) y se aplicó un pase de pulido **sin tocar funcionalidad ni flujos**:

- **Visual (P0)** en `src/styles.css`: `.section-card` sin `backdrop-filter` (glassmorphism), radio
  24→16px y una sola elevación (borde + sombra suave); `.staging-group` sin borde lateral de color
  (side-stripe); fondo del `:root` cambiado del degradado crema/arena a off-white neutro `#eef2f5`.
- **Accesibilidad/responsive (P1)**: `:focus-visible` global (anillo de foco), `::placeholder` con
  contraste, `.table-wrap { overflow-x: auto }` (las tablas anchas ya no desbordan), media queries
  que **colapsan el sidebar < 900px**.
- **Microinteracciones (P2)**: transiciones en botones + bloque `prefers-reduced-motion`.
- **Error boundary (#12)**: `src/components/ErrorBoundary.tsx` envuelve `<App/>` en `main.tsx` →
  fallo de render controlado en vez de pantalla en blanco.

**Segundo pase de craft (commit `2815cc1`)** — `impeccable` + `emil-design-eng`, corrige bugs reales:
- **BUG corregido**: `.primary` y `.stack`/`.compact` NO estaban definidos en `styles.css` pese a
  usarse 21× en el panel (botones primarios sin destacar, grupos de botones sin layout). Definidos.
- **Tokens de diseño** en `:root` (`--bg/--surface/--ink/--muted/--brand/--accent/--border/--radius*/
  --shadow/--ease-out`).
- **Botón base cohesivo** para los `<button>` sin clase (antes gris por defecto del navegador) +
  `:hover` y `:active { scale(0.97) }` (feedback de pulsación, Emil). Las clases específicas
  (`.link-action`, `.ws-tab`, `.steps__item`, `.status-tag--action`…) conservan su aspecto.
- **Tipografía**: `letter-spacing -0.02em` + `text-wrap: balance` en titulares; `max-width: 72ch` +
  `text-wrap: pretty` en prosa.
- **Inputs**: foco con borde de acento + anillo. `.actions-row` en fila y centrado.

Pendientes del informe NO aplicados: #11 (extraer workspace, ver abajo). **Verificación visual de
ambos pases: pendiente de que el usuario abra la app (`npm run dev`)**; no hay navegador en CLI
(el Chromium de Playwright/gstack quedó bloqueado por el proxy). Si algún ajuste visual no convence
(p. ej. el restyle de los `<button>` sin clase), es CSS y se afina rápido.

## Rediseño visual — "Consola de operaciones" (HECHO, commit posterior a `8b5c3da`)

El usuario eligió la **Dirección A: Consola de operaciones** (claro, denso, profesional) entre 3
propuestas. Objetivo intacto (herramienta operativa interna: documental + comercial). Solo CSS
(`src/styles.css`); funcionalidad y flujos sin tocar. Validado por captura (Edge headless).

Qué se hizo:
- **Tokens ampliados** en `:root`: paleta slate (`--bg/--surface/--surface-2/--ink/--ink-2/--muted`),
  marca (`--brand/--brand-700/--brand-050`), acento (`--accent`), y **estados** con tinte de fondo
  (`--ok/--warn/--danger/--info` + `*-bg`); radios (10/14), sombras (`--shadow-sm/--shadow`),
  `font-variant-numeric: tabular-nums` en datos.
- **Sidebar**: 264px, fondo de marca, ítem activo con barra de acento verde (`box-shadow: inset 3px`)
  — se eliminó el sand cálido `#f2c17d`; estados hover.
- **Tablas densas** (`table:not(.rate-table)`): contenedor `.table-wrap` con borde/radio; `thead th`
  sticky en mayúsculas + muted; zebra (`tr:nth-child(even)`); hover de fila. `.rate-table` conserva
  su estilo propio.
- **status-tag** con punto de estado (`::before`) para lectura rápida; `status-pill`/`alert`
  tokenizados a estados.
- **Cards** más planas (`--radius-lg`, `--shadow-sm`).

Próximos refinamientos visuales posibles (no hechos): escala tipográfica más marcada en titulares
de sección; estilizar el texto de la columna "Estado" como pill; revisar densidad de la
`.rate-table` para alinearla al nuevo sistema; modo oscuro como variante (Dirección C) si se quisiera.

## Extraer el workspace del documento — HECHO (commit `a7de364`, build OK, 31/31 tests, verificado por capturas)

El detalle/revisión se extrajo de `InventoryDocumentsPanel.tsx` a un componente propio
`src/components/inventory/DocumentWorkspace.tsx` (2310 líneas). El panel bajó de **2932 → 642
líneas** (solo lista + formulario + toggle de catálogo). Contrato:
`<DocumentWorkspace key={documentId} documentId initialTab reloadToken onChanged onClose />`.

- El workspace **gestiona su propio estado, errores/feedback y subida de archivo** (reemplazar/
  quitar el PDF del detalle); ya no comparte `selectedFiles` con la lista. Carga su detalle +
  trazabilidad en un `useEffect([documentId, reloadToken])`. Se monta con `key={documentId}`, así
  que cada documento arranca limpio (no hay reset manual).
- `onChanged` = `loadDocuments` del panel (refresca contadores/estado de la lista tras subir/quitar
  archivo, extraer texto, publicar, retirar y retirada granular — exactamente donde antes se
  llamaba a `loadDocuments`). `onClose` cierra el detalle. `initialTab` abre en una pestaña concreta
  (la columna "Por revisar" sigue abriendo en "Pendientes"). `reloadToken` se incrementa al editar
  los metadatos del documento abierto, para refrescarlo en silencio sin desmontarlo.
- Las etiquetas compartidas (`targetTypeLabels`, `statusLabels`, `extractionStatusLabels`) se
  movieron a `inventoryFormatting.ts`; las propias del workspace (incidencias, extracción, QC,
  `ImportIssuesPanel`, `QualityControlPanel`, etc.) viven en `DocumentWorkspace.tsx`.
- **Verificación**: build limpio (58 módulos) + 31/31 tests + recorrido con Edge headless
  (Playwright) que inició sesión, abrió el documento "4R 4 estrellas" y pulsó las 6 pestañas
  (Resumen/Pendientes/Aprobados/Rechazados/Publicados/Incidencias) capturando cada una. Todas
  renderizan (tablas de revisión, dry-run/publicar, trazabilidad con "Ver lo publicado", incidencias
  + extracciones) sin errores de React; el único 404 de consola es `favicon.ico` (preexistente). El
  "Cerrar detalle" desmonta el workspace correctamente.

## PRÓXIMA GRAN TAREA (decidida): migrar el flujo comercial a BD real — "Opción B"

**Problema (hallazgo crítico de la revisión técnica):** el flujo comercial (páginas *Nuevo
registro* / *Existente*) **mezcla fuentes de datos**:
- La búsqueda de alojamientos/actividades usa la **BD real** (`searchAccommodationsApi` →
  `server/searchDb.ts` → Prisma).
- Pero el armado de la propuesta y la persistencia usan **datos mock en memoria**:
  - `src/services/proposalService.ts` calcula precios con `findAccommodationRate`/`findActivityRate`
    desde `src/services/searchService.ts` → `src/data/mockData.ts`.
  - `src/services/requestService.ts` y `src/services/crmService.ts` guardan cliente/solicitud/
    propuesta en `src/data/mockDb.ts` (memoria → **se pierde al refrescar**).
- Consecuencia: como los `id` reales de BD no existen en el mock, una propuesta puede salir **sin
  precios o incorrectos**.

**Decisión del usuario: Opción B — migrar a BD real.** Progreso por incrementos:

**✅ Incremento 1 (HECHO, commit `d3497ee`, verificado en runtime): backend de persistencia.**
- `server/commercialDb.ts`: `upsertClientFromIntakeDb`, `findClientByEmailDb`, `saveTripRequestDb`,
  `saveTripProposalDb` (con opciones; `accommodationId`/`activityId` son FK reales del inventario),
  `approveTripProposalDb` (atómico), `getClientTripRequestsDb`.
- Endpoints `/api/commercial/*`: `GET/POST clients`, `GET clients/:id/trip-requests`,
  `POST trip-requests`, `POST proposals`, `POST proposals/:id/approve`.
- apiClient: `findClientByEmailApi`, `upsertClientApi`, `saveTripRequestApi`, `saveTripProposalApi`,
  `approveTripProposalApi`, `getClientTripRequestsApi`.
- Esquema Prisma: enums `RequestStatus`/`ProposalStatus` alineados con el dominio; +`summaryText`,
  +`accommodationNameSnapshot`, +`priceBreakdownText` (push aditivo; las tablas estaban vacías).

**✅ Incremento 2 (HECHO): frontend recableado al backend; mocks eliminados.**
- `src/services/requestService.ts`: `upsertClientFromRequest` → `upsertClientApi` (async);
  `saveNormalizedTripRequest` → `saveTripRequestApi` (async); se quitó el check de cliente mock de
  `parseTripRequest`/`validateTripRequest`. `findCandidateOpportunities` ahora usa datos REALES
  (`getClientTripRequestsApi`: solicitudes previas del cliente → `ask_user`; si no → `create_new`).
- `src/services/proposalService.ts`: `buildProposal` usa la **tarifa real** del match
  (`rate.pvpAmount || rate.netSaleAmount`) y persiste con `saveTripProposalApi` (async);
  `approveProposal` → `approveTripProposalApi`.
- `src/services/crmService.ts`: sin mockDb; `logCrmSyncAttempt` ya no persiste (log local);
  eliminadas `saveOpportunityToCrmMock`/`searchExistingOpportunities`/
  `prepareExistingOpportunityApprovalPayload` (muertas). `prepareNewOpportunityPayload`/
  `prepareCrmPayload` siguen (puras).
- `src/App.tsx`: `handleParseRequest` y `handleBuildProposal` ahora `async` con `await`.
- **Eliminados** `src/data/mockData.ts`, `src/data/mockDb.ts`, `src/services/searchService.ts`
  (dead tras migrar). `mcpTools.ts` ajustado.
- **Tests**: `tests/documentFlow.test.ts` añade el flujo comercial (crea Accommodation → upsert
  cliente → solicitud → propuesta con FK real → aprobar). Total **21/21**.

**✅ Validación end-to-end (HECHA con Edge headless + Zoho real, cliente de prueba desechable).**
Se recorrieron ambos flujos contra el stack real (BD + Zoho de producción) y se limpiaron los
registros de prueba al terminar:
- **Registro (Nuevo)**: normalizar → corregir destino en la revisión → buscar inventario (192
  alojamientos) → construir propuesta (precio real) → **enviar a Zoho** = deal creado correctamente
  (con contacto+cuenta "PRUEBA VALIDACION" y las opciones en `Description`). ✓
- **Actualización (Existente)**: buscar por email (encontró el deal tras indexar) → **aprobar
  opción** = OK. ✓
- Limpieza: deal/contacto/cuenta borrados de Zoho (200 SUCCESS) y cliente de prueba borrado de
  `dev.db` (cascade).

**Hallazgos de la validación (pendientes de decidir si se corrigen):**
1. **Zoho necesita el bundle CA para salir tras el proxy TLS corporativo.** `npm run dev` arranca el
   backend SIN el CA → las llamadas a Zoho fallan con `fetch failed` (500). Arrancar con
   `NODE_EXTRA_CA_CERTS=/c/Users/User/corp-ca-bundle.pem npm.cmd run dev` (o exportar esa var en el
   perfil del shell, o `NODE_OPTIONS=--use-system-ca` en Node 24). Sin esto, los pasos de Zoho NO
   funcionan aunque el código esté bien. *(Idea: añadir un script `dev:proxy` o documentarlo en el
   README; no se hardcodea la ruta en package.json porque es específica de esta máquina.)*
2. **El parser de texto libre no reconoce "Salou"** (su `destinationCatalog` en
   `src/services/requestService.ts` solo tiene Valencia/Gandia/Madrid/Barcelona), pero el inventario
   publicado es de Salou. Resultado: la solicitud queda con destino vacío y hay que **corregirlo a
   mano en el paso "Revisión normalizada"** (que existe justo para eso). *(Idea: ampliar el catálogo
   con Salou/Cambrils/etc., o que el parser extraiga el destino tras "en <ciudad>" como fallback.)*
3. **Latencia de indexado de Zoho:** buscar por email **justo después** de crear el deal devuelve 0;
   tras ~30 s ya aparece. La UI de Existente puede inducir a "no encontrado" si se busca demasiado
   pronto. *(Idea: aviso o reintento con backoff.)*

## Cobertura de tests del flujo de ACTIVIDADES — HECHO (commit `c642cc4`, build OK, 31/31 tests)

`tests/documentFlow.test.ts` añade una sección "Flujo documental de ACTIVIDADES" que espeja la de
alojamientos: crear documento (`targetType: "ACTIVITY"`) → staging de actividad vía análisis mock
(`detectedActivities`) → **sembrar tarifas/políticas de actividad directamente con Prisma** (el
análisis IA solo detecta la actividad, no sus tarifas) → aprobar en lote (omite la tarifa sin
`salePvpAmount`) → dry-run + publicar → trazabilidad (`getPublishedInventoryByDocument`) → búsqueda
operativa con origen (`searchActivitiesDb`, con `ageRangeText` para puntuar ≥50) → idempotencia →
catálogo global → retirada granular de tarifa y de actividad completa. Total **21 → 31 tests**.

## Endurecimiento de seguridad — PARCIAL (commit `0f3cd7b`, build OK, 31/31 tests, verificado en runtime)

- **`.env.example` genérico**: se quitaron las rutas reales con nombre de usuario
  (`/Users/anthony/...`) de `ACCOMMODATION_RATES_XLSX`/`ACTIVITY_RATES_XLSX`; ahora son placeholders.
- **Validación con `zod`** (ya era dependencia): nuevo `server/validation.ts` con `parseBody(schema,
  req, res)` (responde 400 con mensaje legible y devuelve null) + esquemas `loginSchema`,
  `createUserSchema` (valida formato de email), `updateUserSchema`. Cableado en los 3 endpoints de
  **auth** (`/api/auth/login`, `POST/PATCH /api/auth/users`). Verificado vía API: email inválido y
  contraseña corta → 400; login vacío → 400; credenciales malas → 401. Login deliberadamente laxo
  (solo no vacío) para no bloquear credenciales existentes. Los esquemas descartan claves
  desconocidas (no rompen clientes con campos extra). **Pendiente**: extender `zod` a los endpoints
  comerciales (`trip-requests`/`proposals` pasan `request.body as never` sin validar) y de inventario
  — se dejó fuera a propósito para no interferir con la verificación end-to-end del flujo comercial
  con Zoho (riesgo de rechazar payloads válidos antes de validarlos). Hacerlo tras esa verificación.
- **`xlsx` (CVEs)**: confirmado que la **librería** `xlsx` solo se usa en el CLI
  `prisma/importRates.ts` (las referencias en `InventoryDocumentsPanel.tsx` son solo el atributo
  `accept=".xlsx"` de un `<input type=file>`, no la librería). Procesa Excel locales de confianza por
  CLI, fuera de la superficie de ataque del servidor/app. No se cambió la dependencia (regla: no
  `npm audit fix --force`). Mitigación futura si se quisiera: fijar versión/parchear o migrar a
  `exceljs` en el importador.

## Otros próximos pasos sugeridos (no iniciados)

- Extender la validación `zod` a los endpoints comerciales y de inventario (ver arriba).

## Reglas y restricciones

- No borrar `prisma/dev.db` ni `storage/`.
- Flujos comerciales (Nuevo/Existente, CRM/tratos): el usuario aprobó migrarlos a BD real
  ("Opción B", ver sección "PRÓXIMA GRAN TAREA"). Antes de esa decisión la norma era no tocarlos.
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
npm.cmd run dev                   # API :8787 + Vite :5173 (la app PIDE LOGIN; admin desde .env)
# Para que ZOHO funcione tras el proxy TLS, arrancar con el bundle de CA:
NODE_EXTRA_CA_CERTS=/c/Users/User/corp-ca-bundle.pem npm.cmd run dev
npm.cmd run prisma:push           # db push aditivo (no reset)
npm.cmd run prisma:generate       # con la API detenida si da EPERM
npm.cmd run prisma:import-rates   # (CLI) resembrar base desde Excel, si hiciera falta
```

Notas de entorno:

- Remoto git: `origin` = `https://github.com/aquinatoa/Viajes-Velero`. Ramas `main` y
  `feat/documental-review-workspace` ya empujadas. Trabajar en la rama de feature y, al terminar un
  bloque, `git push`.
- En este equipo `npm install` puede requerir `NODE_OPTIONS=--use-system-ca` por interceptación
  TLS corporativa (sin desactivar `strict-ssl`). **`bun` NO respeta ese flag**: usa
  `NODE_EXTRA_CA_CERTS=/c/Users/User/corp-ca-bundle.pem` (bundle de las CA raíz de Windows que
  exporté para que `bun install` funcione tras el proxy TLS).
- Si `prisma:generate` falla por DLL bloqueada (`EPERM`), detén el proceso node de la API antes.

## Entorno de skills de Claude Code (instaladas esta sesión, fuera del repo)

En `~/.claude/skills/` (NO versionado; `.claude/` está en `.gitignore`):

- **gstack oficial** (`garrytan/gstack`, de Garry Tan, MIT) — skills `review`, `qa`, `investigate`,
  `careful`, `guard`, `devex-review`, `plan-*`, etc. Se instaló con `./setup` (requiere `bun`).
  Binario `browse.exe` compilado, pero la descarga de **Chromium (Playwright) quedó bloqueada por el
  proxy corporativo**, así que `/browse` y el QA con navegador real no funcionan aún (pendiente:
  `playwright install chromium` apuntando a la CA). OJO: el repo `greencm/gstuck` que se probó
  primero NO es el oficial (es un fork de terceros "telemetry-removed"); se eliminó.
- **Skills de diseño** (vía `npx skills add … --global`). Inventario completo instalado y ya
  cargado (verificado tras reiniciar Claude Code):
  - `emil-design-eng` — filosofía de Emil Kowalski: pulido de UI, componentes, animación, detalles.
  - `impeccable` — diseñar/rediseñar/criticar/auditar/pulir UI; vocabulario de diseño (Paul Bakaus).
  - `design-taste-frontend` (v2) — frontend "anti-slop" para landings/portfolios/rediseños.
  - `design-taste-frontend-v1` — versión v1 original (compatibilidad).
  - `high-end-visual-design` — diseño tipo agencia premium (fuentes, espaciado, sombras, cards).
  - `minimalist-ui` — interfaces editoriales minimalistas (monocromo cálido, bento plano).
  - `industrial-brutalist-ui` — UI brutalista/terminal para dashboards densos.
  - `gpt-taste` — UX/UI + motion GSAP avanzado (AIDA, bento, scrolltriggers).
  - `brandkit` — generación de imágenes de brand-kit / identidad.
  - `imagegen-frontend-web` — imágenes de referencia de diseño web (1 por sección).
  - `imagegen-frontend-mobile` — conceptos de pantallas de app móvil (solo imágenes).
  - `image-to-code` — generar diseño en imagen y luego implementarlo (Codex).
  - `stitch-design-taste` — genera `DESIGN.md` para Google Stitch.
  - `redesign-existing-projects` — auditar y elevar webs/apps existentes sin romperlas.
  - `full-output-enforcement` — evita truncado del LLM; fuerza salida completa.
- **gstack** — expuesta como skill `gstack` (navegador headless para QA/dogfood; Chromium PENDIENTE
  por el proxy). Sus sub-skills (`review`, `qa`, `investigate`, `careful`, `guard`, `devex-review`,
  `plan-*`, `ship`…) viven en `~/.claude/skills/gstack/`.
- **Encaje**: las de diseño elevan el acabado visual; útiles si se pule la UI (hoy es funcional, no
  de consumidor). `impeccable`/`emil-design-eng`/`redesign-existing-projects` son las más relevantes
  para mejorar este panel. `review`/`qa` de gstack, para revisión de código.
- Las skills se enumeran **al arrancar** Claude Code: tras instalar más, **reiniciar** para usarlas.

## Validación visual del frontend (capturas automáticas)

Sí se puede validar el frontend por capturas **sin descargar Chromium** (que el proxy bloquea):
usar el **Edge del sistema** vía Playwright (instalado en `~/.claude/skills/gstack/node_modules`).
Patrón usado (commit de validación visual): arrancar `npm run dev`, y desde `~/.claude/skills/gstack`
ejecutar un script node ESM con
`chromium.launch({ channel: "msedge", headless: true })` → `page.goto("http://localhost:5173")`
→ `page.screenshot(...)` guardando los PNG en la raíz del repo, leerlos y borrarlos. Sirve para
verificar layout/responsive (probado a 1440px y 390px). No hace falta permiso extra: solo arrancar
los servidores y ejecutar Edge headless. (Así se cazó y corrigió una regresión de `white-space` que
desbordaba el sidebar.)
