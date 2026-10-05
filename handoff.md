# Handoff - Oravia (antes Viajes Velero Ops)

> Documento de compactación de contexto para continuar el trabajo en una conversación nueva
> sin arrastrar todo el historial. Última actualización: **2026-09-23** (escrita el 24/09).
>
> **Lo último está AL FINAL**, en «Estado a 23/09/2026», dentro de «Septiembre de 2026». Lo anterior
> se conservó tal cual se escribió y hay partes caducadas: donde ponga «31/31 tests» o «75» hoy son
> **198**, la rama `feat/documental-review-workspace` se fusionó hace tiempo, y el despliegue
> automático, que «no había funcionado nunca», funcionó por primera vez el 23/09/2026.
>
> **App**: consola interna de operaciones de **Oravia Travel Group** (React+TS+Vite / Express /
> Prisma+PostgreSQL). Convierte el mensaje de un colegio en una propuesta de hasta tres opciones, la
> **envía** con su documento, crea el trato en Zoho y persigue el depósito. **No es un CRM**: Zoho lo
> es, y compite mejor. Qué es la app y para quién, en `PRODUCT.md`; el sistema visual, en `DESIGN.md`;
> lo que viene, en `PROXIMOS-PASOS.md`.
>
> Remoto `origin` = `https://github.com/aquinatoa/Viajes-Velero`. Es una **cuenta personal**,
> no la organización de Neointec: queda pendiente decidir si se mueve. La rama de trabajo es
> **`main`**; `feat/documental-review-workspace` está fusionada y obsoleta.
>
> **La base ya no es SQLite, es PostgreSQL.** Para levantarla en local, `npm run db:local`
> (ver «Entorno local» al final).
>
> **Cinco pantallas** (menú en dos grupos): *Día a día* → **Propuestas** (inicio) y **Viajes**
> (+Calendario); *Gestión* → **Tarifas**, **Usuarios**, **Actividad**. **Nueva solicitud** no es una
> sección: es un botón fijo en la barra superior, porque es una acción, no un sitio.
>

## Cargar tarifas, auditado contra el PDF real (10/08/2026)

Se pasó el documento de compra por el proceso entero —registrar, subir, extraer,
leer, candidatos, aprobar, publicar— en base y almacén aislados, y se contrastó
lo publicado contra el propio PDF. Tres hallazgos.

**No se podía leer.** La respuesta de la IA se cortaba por longitud: el techo
estaba en 16.000 tokens de salida y este documento necesita **16.684**. El JSON
llegaba a medias y fallaba entero. Subido a 64.000 —el techo del modelo, no una
cifra elegida— y en streaming, porque a esa altura una petición normal se cae
por timeout. Ya entra todo: 3 alojamientos, 54 tarifas, 11 actividades con
precio, 5 suplementos, 7 políticas y las fechas excluidas.

**Los dos Mediterrània salieron cambiados.** El catálogo publicó MED1 a coste 70
y MED2/3 a 79; el PDF dice lo contrario. Se cotizaría el hotel caro al precio
del barato toda la temporada, con números que siguen pareciendo razonables.

**Los precios de actividad salieron cruzados**: Master class (230 €) acabó como
partido amistoso, el entrenador asistente (150 €) como amistoso de fin de
semana, y Césped Natural entró a 280/360 en vez de 360/540. Los "Desde 160 €" y
"Desde 280 €" van interleados en la tabla de campos del PDF.

### Qué se hizo con eso

**Confirmar el reparto es obligatorio.** Un documento con varios alojamientos no
publica ninguno hasta que alguien firma, hotel por hotel, que ese bloque de
precios es suyo — con el fragmento literal del PDF delante. Se guarda la fecha
en `StagingAccommodation.assignmentConfirmedAt`; sin ella, publicar omite el
alojamiento con un motivo accionable (`ASSIGNMENT_NOT_CONFIRMED`).

**Las citas se comprueban contra el PDF, no contra sí mismas.** `rawText` lo
escribe la IA: verificar un precio contra el fragmento que ella misma eligió no
demuestra nada, porque si se equivoca con convicción escribe el fragmento
acorde. La comprobación nueva exige que ese fragmento **exista en el texto
extraído del PDF**; si no está, la cita es inventada y el precio no se puede
verificar contra nada.

**Lo que se descartó, y por qué.** Se intentó deducir a qué hotel pertenece cada
bloque anclando cada tarifa al encabezado que la precede. En estos PDFs no
funciona: la capa de texto sale desordenada, los nombres aparecen lejos de sus
tablas y en otro orden, y el anclaje marcaba tarifas correctas como
sospechosas. Un aviso que se equivoca a menudo enseña a ignorar los avisos, que
es exactamente el fallo que se quiere evitar. Por eso el reparto lo firma una
persona en vez de adivinarlo la máquina.

**Sigue abierto:** publicamos 72,80 € donde la tarifa del cliente dice 73 € —MSH
redondea al euro y nosotros no—. Es decisión de negocio, sale en el presupuesto
que ve el colegio. Y la lectura no es reproducible: dos pasadas del mismo PDF
dieron 11 y 15 actividades, así que **aprobar una vez no vale para lo que salga
al regenerar**.

---

## Los tres PDFs del cliente, y qué faltaba para cotizarlos (10/08/2026)

Los tres documentos de `Fuentes/Tarifas - nueva App/`:

| Documento | Qué es | Cómo se registra |
|---|---|---|
| `ESP-TTOO-TARIFAS FS 2027.pdf` | Lo que **MSH os cobra** (lo emite MSH: Frank Araneta, mshub.es) | **De compra, margen 12 %** |
| `TARIFAS_FUTBOL_2027_CLIENTE MSH GENÉRICO.pdf` | **El anterior + 12 % exacto**, redondeado al euro | **No hace falta cargarlo** |
| `RATES MSH 2027- DESTINATION-TRAVELCLUB.Pdf` | Lo que **vosotros cobráis** al turoperador suizo (lo emite Velero Azul, firma André Steinauer) | **De venta · Turoperador suizo** |

Que el genérico sea el de compra + 12 % cuadra en las veinte cifras: 65→73,
70→78, 79→88, 230→258, 170→190, 255→286, 25→28, 40→45, 360→403, 5→6, 34→38.
Cargar los dos duplicaría los tres alojamientos.

Leerlos destapó **dos fallos que costaban dinero**:

**La ocupación se perdía al publicar.** La IA la lee bien —de las 54 tarifas del
genérico, la mitad son *Doble* y la mitad *Individual*—, pero
`AccommodationRate` no tenía el campo. En el catálogo quedaban dos tarifas
idénticas de Villa Bonita (PC, campo artificial) a 73 € y a 92 €, sin nada que
las distinguiera. Ahora se publica, la búsqueda ofrece **la compartida** (la de
los alumnos) y adjunta la individual como tarifa de los profesores.

**Los profesores no se cobraban.** El total era `precio × alumnos × noches`: en
un grupo de 40 + 4, cuatro personas dormían gratis toda la semana. Ahora
`totalAlojamiento` los cuenta a su precio —el de uso individual cuando el
documento lo trae— y el desglose lo dice en la propuesta. Con los números del
PDF: 16.440 € en vez de 14.600 €.

**Y el canal ya llega a la búsqueda.** El lienzo tiene un campo *Cotizamos para*
(colegio/club o turoperador suizo). Antes no lo mandaba nadie, así que las
tarifas pactadas con un canal quedaban cargadas y **muertas**: no aparecían
nunca.

Lo que **sigue sin cubrir** de estos PDFs:

1. **El suplemento de Miniestadi** (6 €/pax/noche) tiene importe pero nadie ha
   decidido si se suma solo al cotizar o solo se muestra.
2. **"Arbitraje: según categoría"** no tiene precio: se omite al publicar.
3. **El IVA no se registra.** Estas tarifas lo incluyen (10 % hostelería, 21 %
   deportivas); si un día entra un documento sin IVA, se mezclarán sin aviso.
4. **La regla de los profesores es una suposición nuestra**: van en individual.
   Si Javier tiene otra (gratuidades, profesor en doble), hay que preguntársela.

---

## Cerrar una solicitud se puede reintentar (10/08/2026)

El cierre del lienzo encadena cinco pasos —cliente, solicitud, propuesta, trato
en Zoho, documento— y **cualquiera puede fallar**. Cuando fallaba, el operador
volvía a pulsar el botón y cada intento dejaba rastro doble: otra propuesta,
otra referencia quemada (ORV-2026-0185 sin nada detrás) y, lo caro, **otro trato
en el CRM del cliente**, que desde la app no se puede limpiar.

La guarda estaba en el estado de la pantalla, que es justo lo que se pierde al
recargar el navegador. Ahora vive en la base de datos:

- **Un trato por solicitud.** La solicitud guarda su `crmDealId`; si ya lo tiene,
  ni se llama a Zoho. Comprobado en vivo contra el servidor, sin crear nada en el
  CRM.
- **La solicitud se reescribe**, no se duplica: el lienzo manda su `id`, que se
  guarda en el borrador del navegador para sobrevivir a una recarga.
- **La propuesta se reescribe** con las opciones de ahora, porque entre el fallo
  y el reintento el operador pudo cambiar de hotel.
- **La entrega conserva su referencia y su enlace**, y regenera el PDF (que se
  nombra por la referencia, así que se sobrescribe: no deja huérfanos).
- **Lo que ya salió es historia**: una solicitud o una propuesta con entrega
  SENT/SIMULATED no se toca; se abre una nueva.

Efecto lateral buscado: "Revisar y enviar" **prepara siempre**, no solo la
primera vez. Antes, volver atrás y cambiar de hotel dejaba en pantalla el
documento anterior.

También: `ORAVIA_STORAGE_DIR` mueve todo el almacén de ficheros. Lo necesitaban
las pruebas (la primera referencia de una BD limpia es ORV-2026-0001, que en
`storage/` es un documento de verdad) y hará falta en Azure.

**Pruebas: de 55 a 60.** Las cinco nuevas son las de no duplicar.

---

## Tanda del 10/08/2026 — el flujo documental, de punta a punta

El día se fue en que **cargar tarifas sea fiable**, porque de ahí salen todas las
propuestas: un precio mal aprobado son presupuestos mal hechos toda la temporada.
Se probó contra los tres PDFs reales de Fútbol Salou 2027, no con ejemplos.

**Lo que se declara al subir manda sobre lo que adivina la IA.** Un documento
dice ahora si trae precios **de compra** (con su margen: 8 % habitual, 12 % en
Deportivo) o **de venta** (y para qué cliente). El caso real que lo motivó: la
tarifa pactada con el turoperador suizo cayó en el campo "neto" y el código
antiguo la habría publicado a 100,44 € en vez de a los 93 € acordados.

**Un documento puede traer varios alojamientos.** Los PDFs traen tres hoteles;
antes se aplastaban en uno y las 54 tarifas colgaban del primero. Ahora cada
tarifa y cada suplemento vienen etiquetados y se reparten por nombre, tolerando
que la IA escriba "mediterrània med1 (doble)" donde la cabecera pone
"Mediterrània MED1".

**Las actividades ya pueden tener precio.** El esquema de la IA solo tenía una
lista de tarifas con forma de alojamiento, y el código que guardaba actividades
**descartaba cualquier tarifa**: el flujo documental nunca había podido cargar el
precio de un alquiler de campo. Con su propia estructura —por equipo, por hora,
por persona— entraron 11 actividades con 16 tarifas, cuadradas con la página 2
del PDF (Master class 258 €, campos 190/286 €, luz 28/45 €).

**Publicar dejó de mentir.** Un documento solo queda "Publicado" si algo llegó de
verdad al catálogo; si no entra nada, se queda en revisión. Y el resultado dice
los motivos agrupados con su arreglo, no un "omitidos: 6" mudo.

**Las condiciones ya no se aplanan.** Políticas, suplementos y fechas excluidas
tienen tablas propias en el catálogo, con tipo, importe y fechas, además del
texto que lee el colegio. Un suplemento como texto no se podía sumar al precio.

**La revisión se puede juzgar.** La matriz del documento sustituye a la lista
cuando las tarifas forman rejilla completa; cada precio abre una ventana con el
fragmento literal del que salió y su confianza; y **la máquina comprueba lo que
sabe comprobar**: que el importe esté en su texto de origen, que individual
cueste más que doble, que un régimen más completo no cueste menos, que sin campo
no salga más caro que con campo, y en actividades que se sepa si se cobra por
equipo o por persona. La persona decide solo sobre las excepciones.

**Aprobar es un gesto, no dos.** "Aprobar el hotel y sus 18 tarifas" aprueba
padre e hijas a la vez: la trampa de aprobar las tarifas y olvidar el hotel —que
dejó 42 aprobadas y 1 publicada— deja de ser posible, no es que se avise.

**El alta empieza por el archivo.** Sueltas el PDF, la app deduce nombre y
temporada del nombre del fichero, pregunta solo lo que decide el precio y un
botón encadena registrar, subir, leer y preparar la revisión.

**Pruebas: de 31 a 55.** Cubren la regla de precios, el reparto entre hoteles,
los motivos de publicación, las comprobaciones de alojamiento y de actividad, el
reparto de tarifas de actividad y que las condiciones se publiquen con estructura.

### Gotchas que costaron tiempo

- **La API no recarga sola.** Solo lo hace la parte web. Un cambio en el prompt
  no tiene efecto hasta reiniciar `npm run dev`: se leyó un documento entero con
  el esquema viejo por no hacerlo.
- **`listInventoryDocuments` selecciona campo a campo.** Al añadir columnas a
  `SourceDocument` hay que añadirlas ahí o la pantalla muestra el valor por
  defecto aunque el dato esté guardado.
- **multer entrega el nombre del fichero en latin-1**: "GENÉRICO.pdf" llegaba
  como "GENÃ‰RICO.pdf". Se recupera releyéndolo como UTF-8.
- **`.stack` es flex con `align-items: flex-start`**, así que una rejilla dentro
  se encoge a su contenido y cae todo en una columna.
- Los Excel del importador de muestra apuntan a rutas del Mac anterior: **el
  catálogo de muestra no se puede regenerar aquí**. Y sus 33 alojamientos
  sostienen las 29 opciones de las 10 propuestas de prueba (borrado en cascada),
  así que borrarlo dejaría esas propuestas vacías.

### Lo que queda

1. **Enseñar el consumo de IA**: ya se guardan tokens y modelo por documento,
   pero no se ven en ninguna pantalla ni hay total.
2. **Unificar los dos botones de publicar**: "Simular publicación" y "Revisar y
   publicar" hacen casi lo mismo; sobra uno.
3. **Decisión de negocio**: ahora que los suplementos tienen importe, ¿se suman
   solos al cotizar o solo se muestran? (Miniestadi, 6 €/pax/noche, 40 alumnos y
   5 noches = 1.200 €.)
4. **De Javier**: los precios (dijo hoy o miércoles) y confirmar los nombres del
   servidor de correo — los que mandó son de una plantilla genérica; los reales,
   según su DNS, son `imap.oraviatravel.com` y `smtp.oraviatravel.com`, con los
   puertos 993 y 587 que sí venían bien en su captura.

---

> **Commits de esta tanda (más reciente arriba):**
> - `e71c7e3` Nueva solicitud como acción fija en el topbar + precios del 8% en la propuesta
> - `85d19b4` Sistema visual Oravia + `PRODUCT.md` / `DESIGN.md` / `comunicaciones/`
> - `da3dcef` Cambios del cliente sobre un viaje ya propuesto (versión nueva, no edición)
> - `1028a73` La nueva solicitud pasa a ser un lienzo; el inicio, mesa de propuestas
> - `2af6cde` Envío de propuestas: documento, correo y página para el colegio
> - `c66c8b4` Rebrand a Oravia, roles por departamento y regla del 8%
>
> _Anteriores (17/06):_ `db2ec9a` workspace Confirmar + Calendario · `7f84425` popup 5 pasos +
> arreglos CRM · `a652ef9` Mi cuenta · `85d5488` Sidebar v2 + router propio · `c642cc4` tests 21→31.
>
> **Estado:** `tsc` limpio, **69/69 tests**, build de producción OK. Los flujos **Nuevo** y
> **Existente** se validaron E2E contra Zoho real en junio; **lo de esta tanda NO se ha validado en
> vivo contra Zoho** más allá de la lectura de tratos.
>
> **⚠️ OPERATIVO — Zoho tras el proxy TLS:** el backend solo alcanza Zoho si Node tiene el bundle de
> CA. `npm run dev` a secas arranca SIN él → `fetch failed`. Arrancar con
> `NODE_OPTIONS=--use-system-ca npm run dev` (Node 24) o `NODE_EXTRA_CA_CERTS=...`. Sigue pendiente
> meterlo en el script `dev`.
>
> **⚠️ El API no recarga solo:** `tsx` no vigila cambios del servidor. Si tocas `server/*`, hay que
> reiniciar `npm run dev` o los endpoints nuevos devuelven 404.
>
> **Pendientes principales:** tests del envío y de los cambios del cliente (los del cierre ya están);
> el **neto a la vista** al cotizar y el **proveedor en las actividades**; que **el cobro del
> depósito** avance la fase. Las 555 tarifas y las 264 actividades sin precio son **catálogo de
> muestra nuestro**: se tiran, no se sanean. Bloqueado por el cliente: **la clave de los buzones** (el
> envío está en modo simulación) y **Azure** (la página del colegio no puede usarse). Detalle y orden
> en `PROXIMOS-PASOS.md`.

## Sesión 2026-08-09/10 — Envío de propuestas, lienzo, mesa y sistema visual

La tanda más grande desde el arranque. Cierra tres de las once peticiones de junio y cambia la
estructura de la app. Nada de esto estaba en la propuesta firmada (las 35 h pendientes eran precios,
encaje con Zoho, despliegue y formación): es ampliación de alcance, pendiente de aprobar con Raúl.

### El hueco que se cierra: la app no podía enviar

Se buscó `nodemailer`, `smtp`, `pdf` en todo el servidor: no existía nada. La app fabricaba las tres
opciones, las guardaba y creaba el trato… y ahí se paraba. **El presupuesto salía copiado a mano**,
que es lo que Javier describió en junio (*"esto es lo que tendríais que copiar y enviarlo"*).

**Piezas nuevas (backend):**
- `server/mailConfig.ts` — un buzón por departamento. **Sin credenciales no falla**: la entrega queda
  `SIMULATED` con su PDF generado. Encenderlo es rellenar cuatro líneas del `.env`.
- `server/proposalPdf.ts` — documento con la marca del departamento, dibujado con `pdfkit` (sin
  navegador, para que funcione igual en local y en App Service).
- `server/proposalDelivery.ts` — numera (`ORV-2026-0184`), prepara, envía, registra visitas y elección,
  y calcula el vencimiento del depósito (40 días desde la aceptación).
- Modelo `ProposalDelivery` en Prisma: **una propuesta puede tener varias entregas**. Es lo que
  permite reenviar una versión corregida sin pisar la que ya salió.

**Decisión que conviene no revertir:** *preparar* y *enviar* son dos gestos distintos. Preparar genera
documento y referencia sin que salga nada; enviar es lo único que lo pone en el buzón del colegio. El
panel de revisión de la app depende de esa separación.

**Por qué el buzón del departamento y no un servicio de correo:** Zoho solo vincula a la oportunidad
los correos que pasan por la cuenta que tiene sincronizada por IMAP (se lo confirmó su soporte a
Javier). Si el correo sale de otro sitio, desaparece del historial del trato.

**Lo que NO arregla, y hay que saberlo:** el "mezcleje" de correos. Si un colegio tiene tres
oportunidades abiertas, Zoho sigue sin saber a cuál colgar la respuesta. Por eso la **referencia va en
el asunto**: aunque Zoho lo cuelgue mal, la app sabe de qué viaje se habla. El arreglo de raíz es una
dirección de correo por expediente (`groups+ORV-2026-0184@…`), pendiente y bloqueado por Azure.

### La nueva solicitud, de asistente a lienzo

**Se borró `PlanRequestModal.tsx` (2.043 líneas).** Vivía en una ventana emergente que se cerraba al
pulsar fuera y **se reiniciaba entera**: diez minutos de trabajo se perdían de un clic, sin aviso.
Además convivía con la página *Nuevo registro* del menú, que hacía lo mismo peor.

`src/components/request/RequestCanvas.tsx` lo sustituye. Ruta propia `/solicitudes/nueva`.

- **Los tres hitos de arriba informan, no mandan.** Se rellenan solos del estado; pulsarlos no navega.
  Solo el envío espera a que no falte un dato, y el hito dice cuál. Nunca sale un error después de
  pulsar: el motivo está antes.
- **Guarda solo** (`draft.ts`, en el navegador, con caducidad de una semana). Al volver ofrece
  recuperar; no se aplica a la fuerza. **No cubre cambiar de ordenador**: eso pediría guardarlo en BD.
- **Una opción = un hotel + su programa.** El programa se elige una vez y luego **varía por opción**
  (lo pidió el cliente). El modelo ya lo soportaba con `activitiesByOption`: era la pantalla la que
  lo simplificaba a una lista común.
- **Panel de revisión antes de enviar**: a quién va, qué recibirá con el programa de cada opción, qué
  se queda registrado, el asunto del correo y el documento real. Con salida "Guardar sin enviar".

**Gotcha resuelto:** `parseTripRequest` validaba de paso el alta completa del cliente, así que exigía
email y nombre **antes de dejar leer el mensaje**. Se separó en `readTripMessage(texto)`, que solo lee.
El asistente antiguo seguía validando igual, pero ya no existe.

### La pantalla de inicio: mesa de propuestas

`src/components/home/ProposalDesk.tsx` sustituye a `HomeLanding.tsx` (borrado), que era una portada
con dos tarjetones explicando los botones y **dos paneles vacíos** (`—` y "Sin actividad reciente").

La unidad es **la propuesta**, no el trato: qué se mandó, si la han abierto, qué opción eligieron y
cuánto queda para el depósito. Zoho no puede saber eso porque el trato no guarda qué tres opciones
salieron. Se ordena por urgencia real, y **cada fila dice qué toca hacer** (*Enviar propuesta*,
*Hacer seguimiento*, *Reclamar depósito*) en vez de un "Abrir" genérico; al pulsar abre **Viajes ya
filtrado por ese viaje** (`/viajes?buscar=…`).

### Cambios del cliente

`server/proposalChanges.ts` + `src/components/home/ChangePanel.tsx`. El caso de junio: *"en vez de 48
seremos 46"*. Se pega el mensaje, se ve qué cambiaría (campos y efecto en el precio de cada opción) y
solo entonces se aplica. **Aplicar crea una versión nueva**, no edita: el colegio tiene un PDF con
unos precios y cambiárselos por debajo dejaría dos verdades con la misma referencia.

**Reparto:** el mensaje se interpreta en el navegador (allí vive el lector en español) y al servidor
solo van los datos entendidos. Importar el lector desde `server/` arrastraba `apiClient` y su
dependencia de `window`.

**Bug que costó encontrar:** `totalPvpText` guarda el **total del grupo** (unitario × alumnos ×
noches), no el precio por alumno. El primer recálculo comparaba magnitudes distintas y daba
disparates (`4.860 € → 108 €`). Si tocas precios, comprueba siempre contra qué comparas.

### Identidad y sistema visual

Paleta muestreada del PNG del logo del cliente: azul `#132E5D`, ámbar `#FCBB37`. Se retiró la anterior
(azul-petróleo + verde) de toda la app.

**Fallo silencioso que apareció al hacerlo:** `--accent-050` se usaba **veinte veces sin estar
definido**, así que caía en su valor de reserva… que era el verde antiguo. Todo lo seleccionado en
Viajes, Tarifas y Usuarios se pintaba en verde dentro de una app azul. Si añades un token, defínelo
en `:root`: los valores de reserva esconden estos fallos durante meses.

**Regla dura:** el ámbar puro **no vale como color de texto** sobre blanco (no llega a contraste). Como
fondo o indicador, sí; como letra, `--highlight-ink`.

Se activó **`noUnusedLocals`** en `tsconfig.app.json`. No es cosmético: fue lo que dio el inventario
exacto del código muerto, y evita que vuelva a acumularse en silencio. `App.tsx` pasó de 1.225 a 328
líneas.

### Rutas nuevas (las viejas redirigen)

`/propuestas` · `/solicitudes/nueva` · `/viajes` (+`/viajes/calendario`) · `/tarifas/documentos` ·
`/ajustes/{usuarios,mi-cuenta,actividad}`. `redirectFor()` en `router.ts` mantiene vivas las antiguas
(`/confirmar`, `/inventario`, `/admin/*`, `/auditoria`, `/nuevo-registro`) porque alguien las tendrá
en favoritos.

### Datos que NO están sanos (comprobado, no supuesto)

- **313 de 555 tarifas de alojamiento tienen un año imposible** (147 dicen 2001; 28 dicen 2028+).
  Solo 214 son plausibles. Es la IA confundiendo números de la tabla con el año. **Bloquea** los
  filtros por año y la desactivación automática que pidió el cliente: darían resultados falsos.
- **Las 264 tarifas de actividad siguen a 0.** Todas salen como "a consultar" y ninguna variación del
  programa mueve el precio por alumno.
- **200 tratos en el CRM** mezclando pruebas y datos reales.
- En la BD de desarrollo hay **entregas de prueba** (`ORV-2026-0001..0003`), una de ellas con la
  opción 2 aceptada a mano para probar el reloj. Borrarlas antes de enseñar nada.

### Endpoints nuevos

```
POST /api/proposals/:id/prepare-delivery     preparar (genera PDF y referencia, no envía)
POST /api/deliveries/:id/send                enviar
GET  /api/deliveries                         lista (DEPT_ADMIN solo ve su departamento)
GET  /api/deliveries/:id/pdf                 documento (con sesión; se abre desde memoria)
GET  /api/public/proposals/:token            página del colegio · SIN sesión
POST /api/public/proposals/:token/choose     elegir opción · SIN sesión
POST /api/proposals/:id/changes/preview      qué cambiaría
POST /api/proposals/:id/changes/apply        aplicar → versión nueva
```

Las dos públicas no llevan sesión a propósito: las abre el colegio desde el enlace del correo. Lo
único que las protege es que el token es largo y aleatorio, así que **ahí no puede publicarse ningún
dato personal de alumnos**.

---

# Histórico anterior (junio 2026)

> **Léelo como histórico, no como estado actual.** Describe la app tal como estaba en junio y hay
> partes que ya no aplican: los roles eran ADMIN/USER (ahora hay DEPT_ADMIN y QUOTER), existían las
> páginas *Nuevo registro* y *Existente* (retiradas), el asistente vivía en un popup (sustituido por
> el lienzo) y el menú tenía items "próximamente" (eliminados). Se conserva porque explica **por qué**
> se tomaron decisiones que siguen vigentes: el workspace de Confirmar, el parser en español, la
> importación de tarifas con IA y los caveats de Zoho.

## Sesión 2026-06-17 (cont.) — Workspace Confirmar + Calendario + sidebar enfocado

Rediseño del entorno **Confirmar solicitud**: de grid de tarjetas + popup a un **workspace
master-detalle** (dirección visual tomada de una referencia tipo CRM de tratos). **Solo frontend,
sin tocar backend.** **Build OK · 31/31 tests.** **NO verificado en vivo** (no se abrió `npm run dev`
contra Zoho real). Bocetos en `mockups/confirm-workspace.{html,png}` y `mockups/confirm-calendar.{html,png}`
(la carpeta `mockups/` está en `.gitignore`, no se versiona). Archivos tocados: `src/App.tsx`,
`src/components/confirm/ConfirmRequestsPanel.tsx` (reescrito), `src/components/Topbar.tsx`,
`src/components/sidebar/{Sidebar.tsx,sidebar.config.ts,icons.tsx}`, `src/styles.css`.

**1. Confirmar = WORKSPACE de 3 columnas (sin popup)** — `ConfirmRequestsPanel.tsx` reescrito.
- **Columna 1 (lista):** 4 KPIs reales calculados de los tratos (Por confirmar = sin opción elegida
  y no ganado/perdido · Presup. enviado · Ganadas · Cartera activa = suma de importes no cerrados) +
  buscador + filtro por fase + orden + lista de tratos **seleccionables** (badge de fase, importe,
  cuenta·contacto, "✓ Opción N").
- **Columna 2 (detalle):** cabecera (nombre, fase, importe) + **pestañas Resumen / Propuesta /
  Historial**. Resumen = meta (destino/fechas/grupo/cierre) + **opciones como tarjetas** (la elegida
  marcada) + timeline. Propuesta = la Descripción legible. Historial = eventos (creado, opción
  elegida, **notas fechadas parseadas** `[YYYY-MM-DD] …`, última modificación).
- **Columna 3 (acción, siempre visible):** tarjeta oscura con **barra de progreso del pipeline** +
  caja "Confirmar" (elegir opción 1/2/3, avanzar de fase, nota, **Guardar** → `updateZohoOpportunityApi`,
  **Abrir en Zoho**). Misma lógica de guardado que el antiguo modal; el modal `ConfirmModal` se eliminó.
- El componente recibe `view` y `onNavigate` desde `App.tsx`; la página `confirm` ya **no** se envuelve
  en `.content-grid` (el workspace gestiona su propio layout y alturas con scroll por columna).
- CSS nuevo con prefijo `.cw*` en `styles.css`. Los estilos antiguos `.cf-card/.cf-modal/...` quedan
  **muertos** (sin uso) pero se conservan `.cf__alert/.cf__empty/.cf__search/.cf-stage--*` (reutilizados).

**2. Calendario del módulo (dos lecturas)** — mismo componente, `view === "calendar"` (`<ConfirmCalendar>`).
- Conmutador **Viaje / Gestión**: **Viaje** pinta los días de estancia (parseados de `Fechas:` de la
  Descripción, formato `YYYY-MM-DD → YYYY-MM-DD`) como barras que cruzan varios días; **Gestión** pinta
  la fecha de cierre (`closingDate`) de cada oportunidad. Rejilla mensual lunes→domingo, navegación de
  meses + "Hoy", color por fase, clic en evento → selecciona el trato y vuelve al workspace.
- Ruta nueva **`/confirmar/calendario`** (cae en la página `confirm`; `App.tsx` deriva `view` del path).

**3. Barra lateral enfocada SOLO en Confirmar + resto en la tuerca de Configuración** (decisión del usuario).
- `sidebar.config.ts`: nueva opción **Calendario** (`/confirmar/calendario`, icono `calendar` nuevo en
  `icons.tsx`) en la sección Confirmar; constante `PRIMARY_SECTION_ID = "confirmar"` y helper
  `sidebarRoleFromBackend`.
- `Sidebar.tsx`: la barra lateral renderiza **solo** la sección `confirmar` (las demás se ocultan).
- `Topbar.tsx`: **nueva tuerca "Configuración"** con desplegable que lista el **resto** de secciones
  (`visibleSections` menos la principal, solo items activos con ruta), **agrupado y filtrado por rol**:
  Admin ve Inicio · Nueva solicitud · Documentos IA · Usuarios · Acciones realizadas; Usuario ve Inicio ·
  Nueva solicitud. Si no hay secciones extra para el rol, la tuerca no se pinta. La tuerca de la
  **portada (Home)** sigue navegando a Usuarios (sin cambios; esa pantalla no tiene topbar).

**Pendiente inmediato:** abrir `npm run dev` (con el CA de Zoho, ver aviso operativo) y verificar el
workspace + calendario + tuerca con tratos reales.

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

---

# Septiembre de 2026

> Tres semanas sobre el módulo documental y el principio del comercial. Todo lo de aquí abajo es
> posterior al 26/08/2026 y **manda sobre lo anterior**.

## En una línea

La lectura de tarifas se rehízo entera porque **leía mal los precios**, y al publicarlos en
producción salieron cuatro fallos más en la cadena. Hay **1.184 tarifas publicadas** y el
catálogo se cotiza bien para el cliente general; lo que no se puede cotizar hoy son las
**actividades**, y para el turoperador suizo solo se ve una parte del catálogo.

## El módulo documental, rehecho

Siete cambios, todos nacidos de un fallo medido con los documentos reales de Oravia.

**La IA no veía el documento.** Se le mandaba solo el texto extraído del PDF, que sale en el orden
interno del fichero y no en el que se ve. En una tabla eso destruye la correspondencia entre filas y
columnas: en la tarifa de grupos de PortAventura los precios llegaban intercalados con los días del
calendario. De 386 importes colocaba 128, y los del primer bloque quedaban bajo el producto de al
lado. Ahora el PDF se adjunta a la petición y el modelo lo lee viendo la página.

**Un documento denso no cabe en una respuesta.** Pidiendo los 386 precios de una vez se agotaba el
límite de longitud y el JSON quedaba a medias. La lectura va ahora en dos fases: primero el índice
—qué productos hay— y después **una lectura por producto**, mirando solo su tabla. El fichero viaja
en todas las llamadas marcado como cacheable.

**Se lee el documento que manda el proveedor, no solo PDF.** El selector ofrecía Excel, Word, CSV e
imágenes pero por detrás solo se sabía leer PDF: se subía un `.xlsx` y el documento se quedaba
muerto sin explicar nada. Ahora se leen PDF, Excel (`.xlsx/.xls/.xlsm`), CSV, texto e imágenes. Word
y ZIP siguen sin poder leerse y se han quitado del selector. El techo de texto subió de 30.000 a
900.000 caracteres: el maestro de hoteles son 731.000.

**Una hoja de cálculo no viene ordenada por producto.** El recorte por rango de filas fallaba con
los dos hoteles California, cuyas filas están en dos tramos separados (2-11 y 337-356) y solo se
veía el primero. Ahora se recorta **buscando por nombre**, y el rango queda como plan B.

**Una comprobación provocaba el fallo que debía detectar.** El prompt decía «deberían salir
exactamente N tarifas», y esa cifra se convertía en un tope: el modelo veía 30 filas y se paraba en
10. Ahora la cuenta es orientativa, y el aviso de descuadre mira en los dos sentidos: si faltan y si
sobran. Antes solo miraba si faltaban, y por eso Caribe Aquatic Park se publicó con las 32 tarifas
de Ferrari Land sin que saltara nada.

**Leer ya no depende de que el navegador aguante.** Con la petición abierta varios minutos el
navegador se rendía antes que el servidor: la pantalla daba error mientras el trabajo seguía y
terminaba bien, y al morir la petición no se llegaba a guardar los candidatos. Ahora contesta 202 al
momento, el documento queda en `ANALYZING` y la pantalla pregunta cada cinco segundos. Si el
servidor se reinicia a media lectura, al arrancar los rescata.

**Fuera la lectura duplicada.** El asistente llamaba a `ai-analyze` y después a `create-staging`,
que hace el mismo análisis. La primera no guardaba nada. Cada documento costaba el doble de tiempo y
de tokens para nada. El asistente pasó de cinco pasos a cuatro.

**Modelo y techo de salida** salen ahora de una tabla por modelo (`MODEL_OUTPUT_CEILINGS`): pedir
más de lo que admite es un 400. `AI_MODEL` vacío usa `claude-opus-5`, que es el validado. En
producción hay que ponerlo **explícito**, para que un cambio de código no cambie solo lo que corre
en el servidor del cliente. Sin probar: `claude-sonnet-5`, la mitad de precio, que desde el reparto
por producto podría bastar.

### Medido con la tarifa de grupos de PortAventura

| | Antes | Ahora |
|---|---|---|
| Tarifas extraídas | 128 de 386 | **386 de 386** |
| Reparto entre los 8 productos | corrido un bloque | **exacto** |
| Maestro de 29 hoteles | no se podía subir | **646 de 646** |

Las 646 del maestro están contrastadas una a una contra la columna `neto venta` del Excel. Los dos
únicos desajustes son medio céntimo de redondeo (239,625: el Excel muestra 239,62 y se publica
239,63, que es la regla de la app).

### Ficheros que cambiaron

- `server/aiDocumentAnalysis.ts` — el grueso: adjunto nativo, dos fases, recorte por nombre, avisos.
- `server/documentTextExtraction.ts` (nuevo) — clasifica el documento y elige cómo leerlo.
- `server/spreadsheetTextExtraction.ts` (nuevo) — vuelca las hojas conservando **el número de fila
  del Excel**, para que «mira la fila 214» sea una instrucción y no un gesto.
- `server/index.ts` — lectura en segundo plano, cola, rescate al arrancar.
- `src/services/apiClient.ts` — `esperarLecturaDeDocumento()`, sondeo cada 5 s con tope de 30 min.
- `src/components/inventory/NewDocumentDropzone.tsx` y `DocumentWorkspace.tsx` — los pasos.

## Lo que salió al publicar en producción

Publicar destapó cuatro fallos que la lectura no enseña.

**No existía `ActivityPolicy`.** Las condiciones de una actividad se plegaban dentro de
`descriptionText` como una cadena, con un aviso en el propio código que admitía que se perdía su
estructura. En PortAventura eso son **las gratuidades** (una entrada gratis por profesor cada 10
escolares) y el mínimo de 20 personas de pago: datos que cambian el precio de un presupuesto. Hay
tabla nueva y migración `20260909224750_politicas_de_actividad`.

**Se inventaba un alojamiento.** En un documento de solo actividades las condiciones generales iban
a un alojamiento fabricado con el nombre del documento. En producción eso metió al catálogo un
«hotel» llamado *PortAventura · Entradas grupos parques 2027* con cero tarifas.

**Las actividades se publicaban sin ubicación.** No se heredaba la del documento, como sí se hace
con los alojamientos. Las 386 tarifas de PortAventura quedaron con `locationMain` a null, y la
búsqueda puntúa por ubicación: sin ella la actividad es **inencontrable**.

**«Cualquier cliente» no valía para el cliente suizo.** El filtro era `!rate.clientSegment ||
rate.clientSegment === wantedSegment`, así que una tarifa guardada como `GENERIC` solo aparecía si
la búsqueda pedía `GENERIC`. El lienzo manda siempre el canal —por defecto `GENERIC`—, así que la
cotización normal nunca estuvo rota. Lo que rompía es cotizar para el **turoperador suizo**: al
pedir `SWISS_TTOO` desaparecía todo el catálogo general y solo quedaba lo pactado con ellos.

Medido en el mismo Salou, 18-22/05/2027:

| Canal | Servidor (código viejo) | Con el arreglo |
|---|---|---|
| Cliente general | 12 alojamientos | 12 |
| Turoperador suizo | **2** | 12 |

Ojo con lo que decía la primera versión de esta sección: «las 1.184 tarifas no se ofrecen al
cotizar». Es falso, y salió de probar la API a mano sin mandar `clientSegment`, que es algo que la
app no hace nunca. Comprobar por la API está bien; comprobar con un cuerpo que la app no manda, no.

`scripts/mover-condiciones-a-actividades.mjs` arregla los documentos ya publicados sin volver a
pagar una lectura de IA: recoloca las condiciones, repone la ubicación y retira el alojamiento
falso. Tiene ensayo en seco por defecto y `--aplicar` para escribir. **Pendiente de ejecutar en
producción** sobre el documento `cmtliiton0009fhkj2iy4cjkg`, y necesita el despliegue antes porque
escribe en la tabla nueva.

## Búsqueda y cotización (empezado)

**Un hotel puede estar en varias localidades.** En el maestro hay cadenas repartidas por la costa:
`4R Hotels 3* – Salou & Calafell`, `Cesar Augustus (Salou/Cambrils)`, `PortAventura World Roulette
(Vila-seca/Salou)`. La búsqueda comparaba la cadena entera, y no fallaba en la puntuación sino en un
**descarte previo**: se caían sin dejar rastro. Siete de los treinta y cinco publicados, **128
tarifas invisibles**. Ahora la localidad se parte por sus separadores y se compara cada trozo.
Buscando Salou se pasa de 8 alojamientos a 12.

**Dos hoteles no tienen localidad ninguna** —`Hotel California Garden` y `Hotel California Palace`—:
sus nombres en el Excel no la llevan y el documento se subió sin «Dónde está», que era lo correcto
con 29 sitios distintos. **Hay que editarlos a mano** y ponerles Salou. Son 60 tarifas.

**La tabla ancha tapaba el botón de aprobar.** Con muchas temporadas —el Hotel Viella tiene seis— la
matriz se hacía más ancha que la ventana y empujaba el botón fuera de la pantalla, sin forma de
llegar a él. `.mx-scroll` ya tenía `overflow-x: auto`, pero vive dentro de flex y grid, donde eso no
basta sin `min-width: 0`.

## Entorno local

Desde que la base pasó a PostgreSQL no había forma de probar nada que no fuera contra producción,
porque el arranque documentado exigía Docker.

```bash
npm run db:local -- --seed     # PostgreSQL embebido, sin Docker ni permisos de administrador
npm run dev                    # en otra terminal
```

Dos detalles que no son cosméticos:

- **El clúster se crea en UTF-8 a propósito.** `initdb` hereda la configuración regional y en un
  Windows en español lo crearía en WIN1252; producción es UTF-8, así que la base local fallaría
  justo donde producción funciona. Un «≥» en las condiciones de un hotel tumbaba la carga entera
  con `22P05`.
- **Los datos viven FUERA del proyecto**, en `%LOCALAPPDATA%\viajes-velero\pg-local`. Estaban en
  `.pg-local/` dentro del repositorio, que está en OneDrive: sincronizaba 81 MB de base viva y llegó
  a preguntar si se querían borrar 700 de sus ficheros internos. `.gitignore` no sirve de nada ahí,
  eso es cosa de git y no de OneDrive. Se puede mover con `VELERO_DB_DIR`.

`scripts/sembrar-catalogo-local.mjs` vuelca el maestro de hoteles a la base local sin pasar por la
IA, para tener datos con los que ejercitar búsqueda y cotización sin pagar lecturas. Comprueba que
`DATABASE_URL` sea localhost antes de escribir nada.

El servidor de desarrollo fija su puerto con `strictPort`: si el 5173 está ocupado **falla
diciéndolo**, en vez de irse a otro en silencio. No es opcional: `ZOHO_REDIRECT_URI` está dado de
alta apuntando a `http://localhost:5173/callback`.

**Cuidado con Zoho en local**: el `.env` local lleva las credenciales **reales de Oravia**. Cerrar
una solicitud de prueba crea un trato de verdad en su CRM.

## Estado real a 15/09/2026

> **Caducado en parte el 23/09/2026.** El despliegue automático funcionó ese día y el servidor sirve
> `a201040`. Lo demás de esta sección (actividades sin ubicación, `ESTIDIANTES 4R27 3E`) sigue
> pendiente de ejecutar en el servidor. Ver «Estado a 23/09/2026» al final.

**Catálogo en producción**: 35 alojamientos con 782 tarifas y 20 actividades con 402, de cinco
documentos. Los alojamientos se cotizan bien. Las **402 tarifas de actividad no aparecen nunca**,
porque se publicaron sin ubicacion y la busqueda descarta por ahi antes de puntuar.

**El despliegue automático no ha funcionado nunca.** `main` lleva 15 commits sin salir desde el
31/08 y producción corre código viejo. Se comprueba en un segundo: el catálogo público devuelve las
actividades **sin** la clave `policies`. Faltaba el secreto `SSH_SERVIDOR` —ya creado— y
**`SSH_CLAVE_PRIVADA` está corrupta**: el log da `Load key: error in libcrypto` y cae en
`Permission denied (publickey)`. Los otros tres secretos funcionan —llega al servidor y valida la
huella—, así que es solo esa clave. Se arregla volviendo a pegarla entera con sus saltos de línea, o
generando un par nuevo y poniendo la pública en el `authorized_keys` del servidor. Después,
*Actions → Desplegar → Re-run all jobs*.

Cuando entre desplegará los 15 commits de golpe, incluida la migración. El script de despliegue ya
ejecuta `prisma migrate deploy`.

**Sobra `ESTIDIANTES 4R27 3E`**: es un 4R Hotels 3* de una prueba antigua, con errata en el nombre y
sin temporada, y el maestro ya trae ese hotel. Está duplicado en el catálogo.

## Bloques pendientes de revisar

> **A 23/09/2026 esto ya no es así**: los bloques 2, 3, 4, 5 y 6 se trabajaron del 21 al 23. El
> estado de cada uno está en «Estado a 23/09/2026», al final. Se conserva lo de abajo tal cual.

El recorrido de la app tiene siete bloques. Solo el primero está trabajado.

**1 · Tarifas y documental — HECHO.** Queda: deduplicar los suplementos dentro de un mismo
alojamiento (el Excel repite las condiciones en cada fila y se generan cientos casi idénticos que
hay que revisar uno a uno), y las tareas de datos de más abajo.

**2 · Solicitud — SIN TOCAR.** `RequestCanvas.tsx`, 1.238 líneas, el componente más grande de la
app. Se pega el correo del colegio, la IA lo interpreta y salen destino, fechas, participantes,
edades y régimen. Nunca se ha ejecutado.

**3 · Búsqueda y cotización — EMPEZADO.** Arreglados el canal de cliente y las localidades
compuestas. Falta mirar la puntuación por ubicación y las zonas turísticas, la elección de tarifa
por edad, y el **500 de `POST /api/search/accommodations`** cuando el cuerpo no trae
`destinationText` (debería ser un 400 que diga qué falta).

**4 · Propuesta y PDF — SIN TOCAR.** `proposalPdf.ts`. Nunca se ha visto un PDF generado.

**5 · Envío y seguimiento — SIN TOCAR.** `proposalDelivery.ts`: referencia `ORV-2026-####`, página
pública, si el cliente la abrió, qué opción eligió, y el reloj de 40 días del depósito. En local el
correo sale **simulado** (sin variables `MAIL_*`), así que se puede recorrer entero sin que le
llegue nada a nadie.

**6 · Cierre al CRM — SIN TOCAR.** `zoho.ts`, 573 líneas. Con el aviso de las credenciales reales.

**7 · Usuarios, roles y auditoría — SIN TOCAR.**

Orden sugerido: terminar **3** y seguir con **4**, que van juntos y son el momento de la verdad de
todo lo anterior. Después el **2**,
y al final el **5** y el **6**.

### Tareas sueltas, por orden

1. ~~Arreglar `SSH_CLAVE_PRIVADA` y desplegar.~~ **Hecho el 23/09/2026**: el despliegue entró y el
   servidor sirve `a201040`. Qué se tocó exactamente para que entrara, por confirmar con Cristian.
2. Ejecutar `scripts/mover-condiciones-a-actividades.mjs cmtliiton0009fhkj2iy4cjkg`, primero en seco.
3. Borrar `ESTIDIANTES 4R27 3E` del catálogo.
4. Editar `Hotel California Garden` y `Hotel California Palace`: localidad Salou. Son 60 tarifas.
5. Decidir si el repositorio se mueve de la cuenta personal a la organización de Neointec.

## Ramas y pruebas

`main` está en `be63898`. Sin fusionar, en `fix/tabla-ancha-tapa-el-boton`:

```
1fe1015  Un hotel puede estar en varias localidades
62a5dee  La tabla ancha ya no empuja el boton de aprobar fuera de la pantalla
```

**75 pruebas** (`npm test`), no 31. Necesitan un PostgreSQL: toman `TEST_DATABASE_URL` o, si no,
`DATABASE_URL`, y crean su propio esquema temporal. Donde el documento diga «31/31» o «BD SQLite
temporal», está caducado.

> **A 23/09/2026**: `fix/tabla-ancha-tapa-el-boton` se fusionó el 15/09 (PR #3). `main` está en
> `4bb86e1`, igual que `origin/main`, sin ramas sin fusionar. Las pruebas son **198**.

## Estado a 23/09/2026

> Escrito el 24/09/2026 con lo hecho del 21 al 23 de septiembre. Fuentes: el git de `main` (14
> commits, de `93836c7` a `4bb86e1`), la sesión de trabajo de esos días,
> `App Oravia - 2026-09-21 - Transcripcion Fathom.md`, `PLAN-ACCION-Oravia.html`,
> `RECORRIDO-LOCAL-Oravia.html` y `correo-avance-oravia-23-09.md`. Manda sobre «Estado real a
> 15/09/2026» y sobre «Bloques pendientes de revisar».

### En una línea

El despliegue automático funcionó por primera vez el 23/09: el servidor `195.20.235.4` sirve
`a201040`, con todo lo de estos tres días menos el último commit. El presupuesto sale en tres
partes, las solicitudes de prueba se borran junto con su oportunidad de Zoho, los borradores viven
en el servidor y las actividades ya aparecen buscando por pueblo (en local; en el servidor falta
correr el script). Queda el bloque de idiomas, el subdominio, y verificar contra el servidor lo que
en local ya se vio.

### Lo que pasó, por día

**21/09.** Llegan tres correos. Javier: la edad no debe ser obligatoria, y los datos del cliente se
crean cada vez cuando deberían cogerse del CRM por el correo del contacto. Ruth, cinco puntos: cada
dirección crea el lead y duplica el contacto; poder ver los correos de cada oportunidad; idiomas
CAT, ENG y FR; no deja editar un borrador ya existente; todos los borradores deben poder editarlos
otros usuarios. El hosting, a Cristian: subdominio `presupuesto.oraviatravel.com` con registro A a
`192.20.235.4`. Se comprueba que el servidor está en `195.20.235.4`: el registro tiene un dígito
mal y no contesta.

Antes de la reunión se sube `93836c7`: la edad pasa de crítica a aviso en los tres sitios donde
bloqueaba (lectura del mensaje, validación antes de enviar, búsqueda de actividades, que devolvía
cero en vez de buscar). Y la búsqueda previa en Zoho deja de tragarse los errores: estaba en un
`.catch(() => null)`, así que un fallo de red se leía como «no existe» y se creaba otro contacto.
Además se busca también en el correo secundario, que `search?email=` no mira.

Para la formación de ese día se preparó un **manual de uso en HTML**, interactivo, con la marca de
Neointec leída del manual de identidad (imagotipo oficial de la página 24, seis colores, DM Sans
solo Regular y Bold): casillas por paso con barra de avance, sección de puntos de mejora con estado
(26 puntos: 10 funcionan, 2 listos sin desplegar, 10 pendientes, 4 decisiones), y una práctica
guiada con el correo de ejemplo de «Marta Ferrer, IES Jaume Balmes, Salou 18-22/05/2027». Se
publicó como artefacto de claude.ai. **No hay copia en la carpeta del cliente**; si hace falta el
fichero, por confirmar dónde quedó.

La **reunión con el equipo de Oravia** (11 participantes, transcripción bajada por la API de Fathom
en `App Oravia - 2026-09-21 - Transcripcion Fathom.md`) fue a resolver un fallo en directo: con una
petición real la app decía «no hay hoteles con tarifas para esas fechas». La causa era que la
petición no traía destino, solo la actividad, y el aviso no lo decía: se probaron 2026, 2027,
octubre y junio antes de caer en que faltaba el pueblo. Además el catálogo cargado es de 2027 y se
cotizaba 2026 sin que la app lo dijera. Y un correo en catalán no sacó ningún dato: hubo que
traducirlo a mano para seguir. La demo con la solicitud de prueba completa sí funcionó de punta a
punta (extracción, opciones, comparación con precio por alumno). El resumen de Fathom dice que la
solución es «hacer el destino obligatorio»; no es eso: ya lo es para buscar, lo que faltaba era
decir que faltaba, porque las peticiones reales llegan sin destino y a veces sin fechas.

Al revisar después de la reunión salió la raíz de lo que Ruth describe como «duplica el contacto»:
**la app no tenía el concepto de centro educativo**. En el CRM de Oravia la cuenta es el centro
(«CENTRE D'ESTUDIS JAUME BALMES», «Tot Turisme»); la app creaba la cuenta con el nombre de la
persona que escribe. En su Zoho de producción quedaron tres cuentas «Marta Ferrer» de la formación,
y una oportunidad «Anthony Quinatoa» en la fase «Nueva», que no existe en su embudo. Y los campos
`crmContactId` y `crmAccountId` del cliente existían pero no los escribía nadie, así que cada
solicitud volvía a buscar desde cero.

**22/09.** Dos commits. `0d67b26`, el centro educativo: `centreName` en cliente y solicitud (con
migración), se lee del propio mensaje (IES, CEIP, Colegio, Institut, Escola, Centre d'Estudis,
Fundació, Club, AMPA), campo «Centro» en el lienzo, la cuenta de Zoho se resuelve por el centro y si
no se sabe el centro **no se inventa cuenta**; tras crear el trato se guardan los dos ids de Zoho;
el nombre de la oportunidad pasa a la convención del cliente, «CENTRO AÑO» («IES JAUME BALMES
2027»). `de1434f`, el aviso de búsqueda distingue cuatro casos: sin destino, sin fechas, año sin
tarifas («No hay tarifas de 2026. El catálogo cubre 2027»), y el genérico; y se guarda la
transcripción en el repo.

Se monta el **plan de acción**: `PLAN-ACCION-Oravia.html`, generado desde `build/plan-accion/` con
el renderizador de WaveGarden (`wg-doc.mjs`, `wg.css`, `logos.json` copiados tal cual; el contenido
en `datos.mjs`; `gen.mjs` lo genera). Diez pestañas: 33 puntos con su estado (10 funcionan en el
servidor, 4 hechos sin subir, 13 pendientes, 6 decisiones de Oravia), 6 fases con su puerta de
salida, y 12 próximos pasos con quién hace cada uno. El método acordado con Anthony: rama por
bloque, se aplica y comprueba en local con datos reales, pruebas y build en verde, sube a `main`, y
**se verifica contra el servidor, no contra el panel de Actions** (el 17/09 se dio por desplegado
algo que no lo estaba por mirar un código de respuesta). Anthony pidió que el formato de WaveGarden
fuera la norma de los entregables; queda por confirmar por escrito.

Se hacen los pasos que tocaban a Neointec:

- `b6e3a5c`: **espejo del catálogo** del servidor a la base local con `scripts/espejar-catalogo.mjs`
  (34 alojamientos, 20 actividades, 402 tarifas de actividad y sus documentos; antes en local había
  cero actividades). Y el fallo de verdad de las actividades: `locationMain` guardaba el sitio
  («PortAventura Park»), no el pueblo; ocho actividades tenían el parque y doce nada, y ninguna
  aparecía buscando por localidad. Entra `Activity.locality` (migración), al publicar se toma del
  documento, la búsqueda mira localidad y si no hay, el sitio. `scripts/poner-localidad-a-actividades.mjs`
  arregla lo publicado, en seco por defecto. En local, Salou pasa de 0 a 19 actividades, Vila-seca 0
  a 19, Cambrils 0 a 11, Jaca 0 a 0. El arreglo del 10/09 no bastaba: solo rellenaba cuando la IA no
  decía nada, y en PortAventura la IA sí decía algo.
- `122c78d`: **borradores compartidos**. Modelo `RequestDraft` (migración), `server/draftsDb.ts`,
  se listan, se retoman y se comparten con el criterio de departamento; visibilidad más abierta que
  la de las propuestas a propósito (lo pidió Ruth); sin cerrojo duro, se avisa de quién lo tiene
  abierto y se puede tomar; la reserva caduca a los 30 minutos; el título se compone con centro,
  destino y fecha. El navegador guarda solo el último estado como red.
- `b887040`: los **suplementos repetidos** se agrupan al leer el documento (el Excel repite las
  condiciones en cada fila: un hotel con 36 filas proponía 36 veces el mismo suplemento). Se
  conserva el primero y se dice en cuántas filas venía; el documento lo cuenta en sus avisos.

Se deja levantado el entorno local y el **recorrido guiado**: `RECORRIDO-LOCAL-Oravia.html` (desde
`build/plan-accion/datos-local.mjs` y `gen-local.mjs`), 35 paradas con qué hacer y qué tiene que
pasar.

**23/09, madrugada.** Anthony recorre la app en local y reporta cuatro cosas: el paso 2 debe ser
dos pestañas (alojamientos, actividades) para no hacer scroll y ver que no queda nada sin asignar;
el documento no traía las actividades ni el detalle de cada alojamiento (políticas, gratuidades);
no hay botón para rehacer el documento antes de enviar; y el presupuesto debe ir en **tres
partes**: alojamientos, actividades, resumen. Commits, en orden:

- `558836d`: el PDF carga por fin las actividades (la consulta solo pedía `accommodationOptions`),
  resumen del viaje por opción con precio por alumno, y el paso 2 en dos pestañas con su cuenta
  («2 de 3», «3 elegidas»). Una actividad se cobra por persona y se multiplica por el grupo entero.
- `fc87a3f`: botón **Rehacer** junto a «Ver el documento» mientras la propuesta no esté enviada.
  Comprobado tres veces seguidas: una sola entrega, misma referencia, misma URL pública, PDF
  reescrito. Rehacer y enviar dejan de compartir el estado «Enviando…».
- `8a70311`: las actividades **nunca** llegaban al PDF porque se filtraba por `isSelected`, que
  significa «el colegio eligió esta opción», no «actividad elegida». Se copian las gratuidades a la
  opción (`freePolicyText`, migración). El nombre del centro se cortaba en la «y»: «IES Ramón y
  Cajal» quedaba en «IES Ramón» y así se creaba la cuenta en el CRM. Importes con el mismo formato
  en todo el documento (el español no agrupa los de cuatro cifras si no se le obliga). Un byte nulo
  que una edición automática coló en una regex de `server/proposalPdf.ts`.
- `68df131`: **el presupuesto en tres partes**. 1 Los alojamientos: cada opción con su desglose, las
  gratuidades en recuadro propio, y las condiciones en lista con su nombre en castellano (antes
  salía tal cual `[GRATUIDAD] texto | [CANCELACION] texto`). 2 Las actividades: el itinerario una
  sola vez, con proveedor, duración, precio por persona y el total del conjunto por persona y para
  el grupo. 3 Resumen del viaje. `/api/inventory/catalog` devuelve ya condiciones, observaciones y
  gratuidades y el espejo las copia; mientras, `scripts/completar-condiciones-del-espejo.mjs` las
  rellena en local desde el Excel real (29 de 34 hoteles).
- `26ba497`: **Borrar** en la mesa de propuestas. Se borra la solicitud entera (versiones, opciones,
  envíos, PDF del disco) **y la oportunidad de Zoho**. Primero el CRM y después la base: si Zoho
  falla no se ha tocado nada. Zoho la deja 60 días en su papelera; contacto y cuenta no se tocan.
  La regla vive en el servidor (`server/borrarSolicitud.ts`) y la pantalla la consulta antes de
  pulsar: con depósito cobrado, nadie; si ya salió al colegio o el colegio eligió opción, solo un
  ADMIN global; lo demás, quien pueda verlo. Una entrega `SIMULATED` también graba `sentAt`, así
  que la regla mira el estado y `viewCount`, no la fecha. Queda en auditoría quién borró qué.
  Pantalla en `src/components/home/BorrarSolicitudPanel.tsx`.
- `cc2ab40`: tres fallos de borradores que Anthony vio en pantalla (cinco filas iguales de la misma
  solicitud): cada recarga estrenaba una fila, una propuesta ya enviada seguía «a medias» y
  «alguien la tiene abierta» era el propio usuario. Ahora hay «Descartar» por fila y el envío cierra
  el borrador, también en `SIMULATED`.
- `a201040`: una actividad **sin tarifa** («Arbitraje», en el catálogo desde el principio y nunca
  visible) sale en el grupo «Sin precio en el catálogo» con casilla de precio por persona; sin
  precio no se añade al programa. Va aparte y sin filtrar por destino a propósito.

Se sube todo a `origin/main` y se redacta el **correo a Ruth y Javier**: `correo-avance-oravia-23-09.md`
(versión larga, 7 puntos; su punto 7 pide solo el nombre de la oportunidad). Anthony pidió después
una versión corta, «cómo vamos y qué queda», que quedó solo en el chat. **Por confirmar si se
envió alguna**. Su párrafo «todavía no está en el servidor» caducó a mediodía.

**23/09, mediodía.** El cliente avisa de que «ya han pasado a main lo subido a git». Se verifica:
`origin/main` = `a201040`, solo nuestros commits, nadie fusionó nada encima. Y el servidor: el
bundle servido contiene «Sin precio en el catálogo» (frase nacida en `a201040`),
`DELETE /api/commercial/trip-requests/noexiste` devuelve el 404 con el mensaje de
`borrarSolicitud.ts`, y `/api/commercial/drafts` da 200, así que la tabla de borradores existe.
**Es la primera vez que funciona el despliegue automático.** Qué tocó Cristian para que entrara (la
clave SSH, se supone): **por confirmar**. Se sube `4bb86e1`: `/api/health` devuelve `revision` y
`arrancadoEn`, para comparar con el sha de `main` en vez de buscar frases en el bundle. Se verá en
el servidor tras el siguiente despliegue.

Pruebas: de 135 a **198** (`npm test`). Migraciones nuevas: `20260922155801_centro_educativo_e_identidad_crm`,
`20260922230032_actividad_con_localidad`, `20260922230632_borradores_compartidos`,
`20260923003226_gratuidades_en_la_propuesta`.

### Decisiones del cliente (dadas por Anthony el 23/09)

1. **Idiomas: por IA, con un modelo barato para traducir.** El mensaje se traduce y lo lee el mismo
   analizador de patrones que ya funciona en castellano.
2. Abrir el enlace del presupuesto pasa la oportunidad a «Seguimiento al Presupuesto»: **correcto**.
   Ya funcionaba así, y solo la primera vez.
3. Condiciones de hotel en catalán: **se traducen**. Y **el presupuesto se genera en el idioma en que
   llegó la solicitud**.
4. El colegio **sí ve las gratuidades** del hotel. Ya salen.
5. **Sí se añade el precio por alumno** al PDF. Ya sale, en el resumen.
6. El nombre exacto de la oportunidad: **se le pregunta a Oravia**. Es lo único que quedó en el correo.
7. `ESTIDIANTES 4R27 3E` se borra, y lo hace Neointec; no se le pide a Oravia.
8. «Arbitraje» debe salir como opción a seleccionar, con casilla para poner el precio a mano.
   Hecho en `a201040`.

### Los siete bloques, a 23/09

1 Tarifas y documental: hecho; los suplementos repetidos ya se agrupan. 2 Solicitud: trabajado
(centro, edad, aviso, borradores, pestañas). 3 Búsqueda: trabajado (localidad de actividades,
actividades sin tarifa); queda la puntuación por ubicación y la tarifa por edad. 4 Propuesta y PDF:
trabajado, en tres partes; verificado en local, **no contra el servidor con datos reales**. 5 Envío:
rehacer y borrar hechos; el envío real sigue sin probarse (en local no hay `MAIL_*`). 6 Cierre al
CRM: cuenta por centro, ids guardados, borrado del trato; **el borrado en el Zoho real no está
verificado**. 7 Usuarios y roles: sin tocar, salvo la regla de visibilidad de borradores.

### Pendiente, por orden

1. **Verificar contra el servidor con una solicitud real**, con `PRUEBA` en el nombre del viaje: que
   el PDF salga en tres partes con condiciones y gratuidades reales, y que **Borrar** se lleve la
   oportunidad del Zoho de Oravia. La parte de Zoho del borrado no se ha probado nunca contra el CRM
   real. El único trato con solicitud local era `734060000031816007` («IES JAUME BALMES 2027»).
2. Comprobar que las cuatro migraciones entraron en producción (solo se ha visto la de borradores) y,
   tras el siguiente despliegue, que `/api/health` devuelve `revision` = sha de `main`.
3. Tareas de datos en el servidor, primero en seco y luego con `--aplicar`:
   `scripts/poner-localidad-a-actividades.mjs` (hasta que corra, las 402 tarifas de actividad
   siguen sin encontrarse por pueblo en producción), `scripts/mover-condiciones-a-actividades.mjs`
   sobre `cmtliiton0009fhkj2iy4cjkg`, y `scripts/alinear-fases-crm.mjs` (tratos antiguos en «Nueva»).
4. Limpiar catálogo y CRM: borrar `ESTIDIANTES 4R27 3E` (lo hace Neointec); localidad Salou a
   `Hotel California Garden` y `Hotel California Palace` (60 tarifas); borrar de Zoho las
   oportunidades de prueba de la formación (tres «Marta Ferrer · Salou, mayo de 2027» con sus
   cuentas, y una «Anthony Quinatoa» en «Nueva»). Las que sigan en la app se borran ya con el botón.
5. **Idiomas CAT, ENG, FR**: traducción por IA con modelo barato y después el analizador actual; PDF
   en el idioma de la solicitud; condiciones en catalán traducidas. No empezado. El SDK de Anthropic
   ya está en el proyecto con su clave. La puerta: que el correo en catalán de la reunión se lea
   entero sin traducirlo a mano.
6. Reescribir y enviar el correo a Ruth y Javier: ya está desplegado, así que sobra el párrafo del
   servidor y ya pueden usarlo. Por confirmar si salió alguna versión.
7. Ver los correos de cada oportunidad (punto 2 de Ruth): necesita el módulo de correo de Zoho, sin
   valorar. Dar una estimación antes de comprometer fecha.
8. Mover el repositorio de la cuenta personal a la organización de Neointec: sigue sin decidir.
9. `PROXIMOS-PASOS.md` sigue escrito a 10/08 y ya no refleja el estado; conviene rehacerlo.

### Bloqueos que dependen del cliente

- **La regla exacta del nombre de la oportunidad** (Oravia). Hoy «CENTRO AÑO»; los suyos llevan el
  curso («JAUME BALMES 3er ESO 2027»).
- **El registro A de `presupuesto.oraviatravel.com`** (hosting): apunta a `192.20.235.4`, debe ser
  `195.20.235.4`. Después Cristian cambia `PUBLIC_BASE_URL` y la URL de retorno de Zoho en el
  servidor, y ya se puede emitir el certificado (hoy no hay TLS). Hasta entonces el enlace que
  reciben los colegios lleva la IP.
- **Credenciales de correo (`MAIL_*`) en el servidor**: sin ellas la propuesta se genera pero el
  correo no sale. Por confirmar si ya están.
- Probar con correos reales suyos en los tres idiomas cuando el bloque esté hecho.

### Ficheros de estos tres días

- Nuevos en el repo: `server/borrarSolicitud.ts`, `server/draftsDb.ts`,
  `src/components/home/BorrarSolicitudPanel.tsx`, `scripts/espejar-catalogo.mjs`,
  `scripts/poner-localidad-a-actividades.mjs`, `scripts/completar-condiciones-del-espejo.mjs`,
  `tests/borrado.test.ts`, `App Oravia - 2026-09-21 - Transcripcion Fathom.md`.
- Los más tocados: `server/proposalPdf.ts`, `server/proposalDelivery.ts`, `server/searchDb.ts`,
  `server/zoho.ts`, `server/documentImportDb.ts`, `src/components/request/RequestCanvas.tsx`,
  `src/services/requestService.ts`, `prisma/schema.prisma`.
- En la carpeta del cliente, fuera del repo: `PLAN-ACCION-Oravia.html`, `RECORRIDO-LOCAL-Oravia.html`,
  `correo-avance-oravia-23-09.md` y `build/plan-accion/`.

Avisos que siguen valiendo: en local el `.env` lleva las credenciales reales de Oravia, así que
«Revisar y enviar» crea un trato de verdad en su CRM. El espejo local agrupa algunas tarifas de más
(el resumen del servidor no trae `tariffUnit` ni `includedService`): sirve para el recorrido, no
para comparar cifras.

---

## Estado a 25/09/2026

Un día entero en la pantalla de **nueva solicitud**, de arriba abajo. Nada de esto estaba el 24.
**366 pruebas automáticas en verde** (eran 198) y `vite build` limpio.

### La petición dejó de ser un buzón y pasó a ser un chat

Se pegaba el correo, la app leía lo que podía y lo que faltaba salía como una lista de campos
vacíos. Un campo vacío no dice qué escribir ni por qué hace falta.

- `src/domain/loQueFalta.ts` decide **qué preguntar y en qué orden**: primero lo que impide buscar
  —destino, fechas, alumnos—, después lo que afina. Una pregunta cada vez, y **cada una dice por qué
  se pregunta**. «No lo han dicho» cierra la pregunta y **no rellena el dato**: si el colegio no dijo
  el régimen, la petición se queda sin régimen y el encaje no lo comprueba.
- `src/domain/interpretarRespuesta.ts` es lo que hace que la conversación no se rompa. A «¿a qué
  destino quieren ir?» se contestó *«Seríamos 48 alumnos… hotel de 3 estrellas en pensión completa»*
  y la app **guardaba esa frase entera como destino**. Ahora la respuesta se lee con los mismos
  lectores que leen el correo, **se aprovecha todo lo que traiga** y, si no contesta, se reconoce lo
  entendido y **se insiste**. «Ni idea» o «ya te diré» ya no se guardan como un pueblo.
- **Un solo sitio donde escribir** y un botón de enviar con icono. Altura fija, con el hilo
  desplazándose solo y el compositor siempre a la vista.

### Lo entendido se valida antes de ver opciones

- `src/domain/validacionDeLaPeticion.ts`: los datos agrupados **como se leen** —el viaje, el grupo,
  lo que piden, el centro— en una ventana que se lee y se confirma, con «Modificar» editando ahí
  mismo. Distingue **«falta y hace falta»** (ámbar) de **«no lo han dicho»** (gris).
- El visto bueno **caduca**: se guarda la huella de lo validado y, si cambia algo, se vuelve a pedir.
- **La columna de opciones no enseña nada hasta confirmar.** La búsqueda corre por detrás.

### La lista de alojamientos

- `src/domain/podio.ts`: los tres que mejor encajan, ordenados por **cuántas de las cosas que pidió
  el centro cumple cada uno**, no por precio. Al podio no sube nada que incumpla algo.
- Filas compactas con la tira de `✓ / ✗ / —`. El guion **no es una cruz**: es que el documento del
  hotel no habla del tema.
- «Ver todo el detalle» ya no es un popover de 330 px: se despliega en la fila con **lo que se
  reserva y su desglose**, el encaje entero, y **las tarifas válidas para esas fechas** (el Santa
  Mónica tiene 42; para un viaje de mayo valen 6).

### Fallos de fondo que salieron por el camino

- **`src/services/requestService.ts` guardaba la PRIMERA lectura del mensaje**, no lo corregido. Todo
  lo arreglado a mano o contestado en el chat se perdía al guardar la solicitud. Se veía en el PDF:
  «para 0 alumnos» y el resumen del viaje sin sumar actividades, porque se multiplican por el grupo.
  El PDF lleva además red de seguridad: si la solicitud no trae el grupo, usa el de las opciones.
- **El contacto del CRM no se consultaba nunca**: `if (form.email)` leía el estado viejo dentro del
  manejador que lo acababa de cambiar, y en la primera lectura era cadena vacía. Ahora lo dispara un
  efecto sobre el correo y se avisa en la ventana de revisión, con sus oportunidades abiertas.
- **Las fechas con el mes delante** —«mayo de 2027, del 12 al 16»— daban dos fechas vacías. La
  lectura entera vive ahora en `src/domain/fechas.ts`, la usan el lector del mensaje y el chat.
- **El precio de la pantalla era un 8% menor que el del presupuesto** cuando el documento solo trae
  el neto: no aplicaba el margen.
- **Las solicitudes a medias eran indistinguibles**: `server/avanceDelBorrador.ts` dice por dónde se
  quedó cada una y avisa si ya tiene solicitud creada (puede haber trato en el CRM detrás).
- **Enviar no decía nada**: ahora hay ventana de resultado con tres desenlaces —enviada, preparada
  pero no salida, o fallo con reintento que no duplica— y vuelta al inicio.

### Ficheros nuevos

`src/domain/{podio,loQueFalta,fechas,validacionDeLaPeticion,interpretarRespuesta}.ts`,
`server/avanceDelBorrador.ts` y sus seis ficheros de prueba.

### Sigue pendiente

- **Nada de esto está en el servidor.** El despliegue no corre desde el 23/09.
- **Republicar los cuatro documentos**: los 34 alojamientos se publicaron antes de arreglar el
  extractor de textos, y la app **ya no guarda el fichero original**, así que hay que volver a
  subirlos. Hoy solo 2 de 34 hablan de dietas y 1 de accesibilidad.
- **Elegir tarifa** dentro de un hotel: no se puede, y antes hay que recuperar del documento qué
  distingue una de otra (el campo de habitación está vacío en las 42 del Santa Mónica).
- **El pueblo del colegio se lee como destino** si el correo no dice a dónde van: «del IES Jaume
  Balmes de Barcelona» deja «Barcelona». Devuelve cero, no una lista equivocada, pero hay que
  arreglarlo.
- `groups@oraviatravel.com` sigue sin recibir nada; SSL; los diez usuarios reales; el bloque de
  idiomas.

---

## La ficha del presupuesto, y lo que salió al mirarla · 25/09/2026

> Segunda mitad de la misma sesión, después del commit `657b07a`. Todo lo de esta
> sección está **sin commitear**. **417 pruebas en verde**, `vite build` limpio.

La ficha enseñaba dónde está el expediente y qué se ofreció, y ahí se acababa:
«estoy aquí y no sé cuál es el próximo paso que debo hacer». Al abrirla de verdad
aparecieron tres fallos de fondo que no tenían nada que ver con la ficha.

### La ficha

- **Los colores del embudo salen de su CRM.** Leídos del picklist `Stage` de
  Zoho —«Presupuesto Enviado» azul petróleo, «Pendiente de deposito» naranja,
  «Oportunidad Ganada» verde—. Se cachean una hora: es configuración, no un dato
  del trato. Si Zoho no contesta se pinta con lo nuestro; **no se inventa un
  color parecido**, porque alguien lo daría por bueno. Se busca sin tildes ni
  mayúsculas: una tilde de diferencia dejaría la fase gris sin que nadie supiera
  por qué. `server/coloresDelEmbudo.ts`.
- **«Lo siguiente»**: qué hay que hacer ahora, con su porqué y su plazo, y el
  botón que toque. Una sola cosa cada vez. Cambia según el estado real: a los 3
  días sin abrirse «puede no haber llegado»; si han escrito, eso va antes que
  cualquier seguimiento; con opción elegida, el depósito, en rojo si venció.
  Se calcula en el navegador porque «quedan 3 días» cambia a medianoche.
  `src/domain/siguientePaso.ts`.
- **«En el CRM»**: los campos de la oportunidad leídos de Zoho **con los vacíos
  incluidos**, y el resumen «15 de 16». Es la comprobación de la queja de Ruth
  —«no rellena ningún campo de la oportunidad»— sin abrir Zoho.
  `server/camposDelTrato.ts`.
- **Apuntar la opción que han aceptado.** Hasta hoy la ÚNICA vía era el botón de
  la página pública, y el correo que manda la app pide lo contrario:
  «respondiendo a este correo nos decís cuál preferís». Contestaban por correo y
  no se enteraba nadie: ni arrancaba el plazo del depósito ni se movía la fase.
  Ahora se apunta desde la ficha, con confirmación y el hotel delante, y **no
  pisa** una elección hecha desde la web.
- **Y se propone sola**: `src/domain/opcionAceptada.ts` lee la última respuesta y
  dice qué opción parece que aceptan, **con el trozo de texto en el que se ha
  fijado**. Propone, no aplica: marcarla arranca un plazo de pago y mueve la fase
  en el CRM de un cliente. Reconoce «la opción 2», «nos quedamos con la 1», «la
  segunda» y el nombre del hotel; y NO reconoce «la 2 no nos vale», «ni idea» ni
  una respuesta cortés que no elige nada.
- **Recotizar desde la ficha.** El panel de «Ha cambiado algo» estaba solo en la
  lista: si entrabas a la ficha, tenías que salir para poder cambiar algo.
- La ficha se reparte el ancho de la pantalla: estaba capada a 1.360 px.

### Tres fallos de fondo que aparecieron al mirarla

- **El importe de los tratos salía cien veces mayor.** El lector se quedaba con
  los dígitos y tiraba la coma: «5.951,94 €» → **595194**, y el depósito del 30 %
  calculado sobre eso. Había **tres copias** del lector y **dos estaban mal**.
  Ahora hay una sola, `src/domain/importe.ts`, con 12 pruebas. **Dos tratos de
  prueba de su CRM real siguen con el importe mal**: `734060000032099001` y
  `734060000032084001`. Anthony los borra.
- **La recogida del correo entrante estaba escrita y nadie la arrancaba.**
  `arrancarLaRecogida()` existía, se podía importar, y el bucle no corría nunca:
  una respuesta de un colegio no aparecía en su expediente y **no había ni un
  error que lo dijera**. Arranca ya con el servidor, detrás de `MAIL_RECOGER=1`,
  apagado por defecto porque el buzón que consulta es el real de Oravia.
- **El campo Departamento salía vacío.** Se cogía del departamento del usuario, y
  el admin es rol global y no tiene ninguno. Y ese mismo `null` elegía el **buzón
  desde el que sale el correo**, que sin departamento cae en Grupos: el correo
  salía como Grupos y el trato decía que no tenía departamento. **El mismo dato
  valía «Grupos» para una cosa y «nada» para la otra.** Ahora se pregunta en la
  ventana de revisión, relleno con el del usuario, en ámbar mientras no se elija,
  y cambiarlo invalida el visto bueno.

### El buzón: comprobado en las dos direcciones

`groups@oraviatravel.com` **envía pero no recibe**. La propuesta ORV-2026-0007
salió a las 13:10 y llegó; la respuesta de las 13:34 a esa misma dirección **no
está en ninguna de las cinco carpetas** —INBOX, Enviados, Borradores, No deseado
y Papelera, todas a cero— y **no ha rebotado**. El IMAP conecta bien: no es de
credenciales. Es del proveedor.

Las tres preguntas para ellos están en `PROXIMO-CORREO-Oravia.md`: ¿buzón real o
alias de envío?, ¿hay redirección?, ¿el MX apunta al mismo servidor que el IMAP?

### La configuración

- **`.env.servidor`** (nuevo, ignorado por git): las 40 variables del servidor,
  cada una con para qué sirve. 38 verificadas; hay que rellenar a mano
  `DATABASE_URL` y `ZOHO_REDIRECT_URI` —que además tiene que estar dada de alta
  en la consola de Zoho con ese valor exacto—.
- **`.env` local ampliado a 46 variables.** Le faltaban ocho que el código lee.
  Todas tenían valor por defecto salvo **`PUBLIC_BASE_URL`**, que vacío deja el
  correo del colegio **sin enlace a la propuesta**.
- Dos avisos escritos en los dos ficheros: **`MAIL_TEST_RECIPIENT` vacío siempre
  en el servidor** —con valor, todo el correo se desvía ahí y los colegios no
  reciben nada— y **`MAIL_RECOGER=1` en el servidor, 0 en local**.
- `NODE_EXTRA_CA_CERTS` y `__VELERO_CA_RELAUNCHED` no se escriben a mano: las
  pone `loadEnv.ts` al relanzarse con el bundle de CA.

### Ficheros nuevos de esta mitad

`src/domain/importe.ts`, `src/domain/siguientePaso.ts`,
`src/domain/opcionAceptada.ts`, `server/coloresDelEmbudo.ts`,
`server/camposDelTrato.ts` y sus cuatro ficheros de prueba.

### Pendiente al cerrar

- **Subir los 4 commits** (`git push origin main`) y **commitear esta segunda
  mitad**: 16 ficheros tocados y 10 nuevos.
- **Borrar los dos tratos de prueba** del CRM.
- **`.gitignore`**: `Tarifas 26-27 Oravia/` —los Excel y el PDF reales de
  tarifas—, las propuestas en `.docx/.pdf`, `Coste Azure/` y `Fuentes/` están
  sueltos y sin ignorar. Un `git add .` los subiría al repo.
- El proyecto vive dentro de **OneDrive de Neointec**, así que el `.env` con las
  claves de los buzones de Oravia y su `refresh_token` se sincroniza a la nube.
  No es nuevo, pero conviene decidir si se mueve fuera.

---

## Lo que contestó Javier, y lo que sabemos ahora · 28/09/2026

> Sesión con Javier y Ruth: **martes 29 a las 10:00**. Lo accionable del día está
> en `TRABAJOS-28-09.md`.

### El correo entrante: resuelto el misterio, y no era lo que creíamos

`groups@oraviatravel.com` **no es un buzón: es un grupo de Zoho Mail** con siete
miembros. `sports@oraviatravel.com` es otro, con cinco. Javier explica por qué:
*«tuvimos que hacer groups@ y sports@ como grupo porque no había forma de poner
2 correos por cuenta de zoho»*.

Eso explica **todo** lo que medimos el 25/09 y que parecía imposible:

- El MX de `oraviatravel.com` es su servidor de siempre (`217.116.0.227`), que
  **redirige** a `zoho.oraviatravel.com`, cuyo MX es **`mx.zoho.eu`** —Zoho Mail,
  centro de datos europeo, el mismo que su CRM—.
- El buzón contra el que hacíamos IMAP estaba a cero en las cinco carpetas
  porque **un grupo reparte los mensajes entre sus miembros y no guarda nada**
  en ningún buzón al que se pueda entrar con usuario y contraseña.
- Y el correo de los colegios sí entra: se ve en el grupo.

**Consecuencia**: la petición que le hicimos —«creadnos un buzón y metedlo en los
grupos»— es posible pero **consume una licencia de Zoho Mail** y él no sabe
hacerla. La alternativa buena es leer el grupo **con el mismo acceso OAuth que ya
usamos para su CRM**, sin buzones nuevos ni contraseñas. **Pendiente de
comprobar** que la API de Zoho Mail deja leer el buzón de un grupo y no solo el
de un usuario.

### El subformulario de la Oportunidad: existe, y lo usan

La Oportunidad tiene **un solo subformulario**, «Servicios Contratados»
(`Servicios_Contratados`), con 20 columnas. Y **no está vacío**: es donde vive el
desglose real del presupuesto.

Columnas que importan: `N_Presupuesto`, `Tipo_de_Servicio` (Alojamiento ·
Actividad · Transporte · Seguro), **`Servicio` → enlace a Products**,
**`Proveedor` → enlace a Vendors**, `Viajeros`, `Cantidad`, `Unidad_de_uso`
(P.Pax · P.Neto), `Precio`, `Coste`, `Fecha_Entrada`, `Fecha_Salida`, `Regimen`,
`Hora`, `Comentarios`, `Validado`. `Total_Servicio` y `T_Coste` son **fórmulas**:
las calcula Zoho, no se escriben.

**Cómo lo rellenan** (leído de sus tratos reales, GRUP LAURA 2027 es el modelo):
una línea por cada cosa facturable, separando por grupo —35 alumnos, 2 profesores
en doble, 1 profesor individual, el suplemento de camas hechas— y **las
gratuidades como línea aparte a precio 0**. `Comentarios` lleva el texto que
vende: régimen, noches, IVA y si hay gratuidades.

Es **exactamente** el desglose que ya calcula nuestro PDF. Lo que falta es
volcarlo al elegir la opción.

**El bloqueo**: `Servicio` y `Proveedor` son enlaces, así que hay que buscar el
registro y pasar su id. Y **el token no tiene permiso** sobre Products ni
Vendors: la lectura devuelve «la autenticación ha expirado», que es lo que Zoho
contesta cuando el token no alcanza. Ya están añadidos a los permisos del código
—`ZohoCRM.modules.products.READ` y `ZohoCRM.modules.vendors.READ`, en lectura—
pero **hay que reautorizar y cambiar el refresh token del `.env`**.

**Y tiene que reautorizar Javier**: la app no manda el campo Propietario, así que
Zoho pone al usuario que autorizó, y hoy las oportunidades salen con
«Propietario: Javier Vinader». Si reautoriza otra persona, cambian de dueño.

### Los canales de cliente: confirmado el modelo

Javier: *«son 2-3 clientes. Normalmente es un porcentaje como el que comentas
para PortAventura, pero **también puede ser un neto**. El año pasado te pasamos
un excel con Neto Venta y Neto Venta especial.»*

Las dos reglas, en este orden:

1. **Precio propio** para ese canal, si lo hay. Manda.
2. **Si no**, un **porcentaje sobre el PVP**.

Con eso, añadir un canal es **una fila en una tabla**, no otro Excel de tarifas.
Hoy son dos valores escritos a mano en el código (`GENERIC`, `SWISS_TTOO`) y los
42 precios del suizo son un documento entero aparte: con el tercer canal eso deja
de escalar. **Falta** el Excel de «Neto Venta / Neto Venta especial» y la lista de
los 2-3 clientes con su porcentaje o su neto.

### La forma de cobro

Confirmada: **30 % de depósito y el resto a 30 días de la llegada**. Lo que manda
la app —`Forma de Cobro = "Deposito 30%"`— es correcto.

Pero su picklist **solo admite un valor** y tiene los dos por separado
(`Deposito 30%` y `Prepago 30 días antes llegada`), así que **el segundo
vencimiento no cabe en ese campo**. Preguntar dónde quieren que viva.

### El subdominio: ya no bloquea

`presupuesto.oraviatravel.com` resuelve a **195.20.235.4**, la IP correcta, y
también en el DNS público. **El certificado se puede emitir.** Después,
`PUBLIC_BASE_URL=https://presupuesto.oraviatravel.com` en el servidor.

### Lo demás de su respuesta

- **El catálogo de actividades**: lo vuelven a subir hoy. Vigilar que la lectura
  termine, porque la vez anterior falló y se quedó en «pendiente de revisar» sin
  cargar nada.
- **Los dos tratos de prueba** con el importe mal (`734060000032099001` y
  `734060000032084001`): vía libre para borrarlos.

### Ficheros de trabajo

- `TRABAJOS-28-09.md` — lo accionable de hoy.
- `correo-respuesta-javier-28-09.md` — el correo que se le envió.
- `PROXIMO-CORREO-Oravia.md` — cerrado: sus preguntas ya están contestadas.

### Corrección de la tarde: los buzones no están en Zoho

Lo de arriba —«el buzón estaba a cero porque un grupo no guarda nada»— es cierto
pero no es la causa. Al ir a comprobar si la API de Zoho Mail deja leer un grupo
salió lo de verdad:

- **La API no lo deja.** Los únicos endpoints de mensajes de la API de grupos son
  la cola de moderación. No hay «buzón del grupo». La alternativa que le
  ofrecimos esta mañana por correo **no se puede construir** y hay que retirarla.
- **El IMAP de la app apunta a Dinahosting, no a Zoho**
  (`imap.servidor-correo.net` → 217.116.0.237). Las dos cuentas existen ahí y
  están a cero **con `uidNext=1`**: no han recibido nunca nada. El MX del dominio
  es `mx.oraviatravel.com` (Dinahosting), que reenvía todo a
  `zoho.oraviatravel.com`. Mirábamos un servidor por el que el correo no se queda.
- **Y la app envía por el SMTP de Dinahosting**, no por Zoho: pasa SPF y DMARC,
  pero no queda en el historial del trato, que era el requisito del 17/06.

Las opciones, la tabla de decisión y lo que hay que preguntarle están en
`TRABAJOS-28-09.md`, sección «El correo entrante, comprobado». El diagnóstico se
repite cuando haga falta con `node scripts/diagnostico-buzones.mjs`.
