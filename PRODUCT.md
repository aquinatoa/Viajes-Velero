# Oravia · Consola de operaciones

> Qué es esto y para quién, en una página. Si algo de aquí deja de ser cierto,
> se corrige aquí primero y en el código después.

**Registro:** producto. El diseño sirve a la tarea, no es la tarea.

## Qué hace

Convierte el mensaje de un colegio en una propuesta con tres opciones y la manda.
El circuito completo: llega un correo → la app lo entiende en español → busca
hoteles con tarifa real → se montan hasta tres opciones (hotel + programa) → se
crea el trato en Zoho → sale la propuesta con su documento → se persigue el
depósito.

Lo que **no** es: un CRM. Zoho ya lo es, y compite mejor. Esta app es la fábrica
de propuestas; Zoho es el archivo y la caja.

## Quién la usa

| Quién | Cuántos | Qué hace aquí |
|---|---|---|
| Cotizador (`groups@`, `sports@`) | 2 cuentas compartidas | Crea solicitudes y manda propuestas. No configura nada. |
| Administrador de departamento | 2 (Groups, Sports) | Lo anterior, más las tarifas de su marca. |
| Administrador global | 2 | Todo, incluidos usuarios y auditoría. |

Son **6-10 personas** que entran muchas veces al día desde un portátil, en una
oficina, con luz normal. No es público general y no se usa desde el móvil salvo
excepción. Eso manda en el diseño: **densidad antes que espectáculo**, y la
herramienta debe desaparecer dentro de la tarea.

Detalle que condiciona todo: `groups@` y `sports@` son **cuentas compartidas**,
no personales. Fue obligado — Zoho solo vincula a la oportunidad los correos que
pasan por la cuenta que tiene sincronizada. Por eso "cada uno ve lo suyo" se
resuelve con departamento y gestor, nunca con la cuenta.

## Las tres pantallas

1. **Oportunidades** (inicio) · cada viaje presentado, de la solicitud al cobro: qué
   he mandado, qué espera y en qué fase está. Lista y calendario. Es la misma
   operativa que el CRM, con nuestras reglas y nuestro diseño.
2. **Nueva solicitud** (el lienzo) · del mensaje del cliente a la propuesta enviada.
3. **Tarifas** · con qué precios puedo cotizar.

(Hasta el 05/11/2026 eran «Propuestas» y «Viajes», dos pantallas sobre lo mismo
y con datos distintos. Se unifican en Oportunidades.)

Más **Ajustes**, en el menú de usuario.

## El idioma

Fijado. No se usan sinónimos según la pantalla.

| Palabra | Significa |
|---|---|
| Solicitud | Lo que pide el cliente, tal como llega |
| Oportunidad | El viaje que se ha presentado, desde que se pide hasta que se cobra. Es la misma que la del CRM y se gestiona igual: fase, notas, opción aceptada, depósito |
| Propuesta | Las opciones que le mandamos, con su referencia (ORV-2026-0184). Vive dentro de una oportunidad y puede tener varias versiones |
| Fase | El punto del embudo en que está la oportunidad. La mueven los hechos (enviada, vista, aceptada) y también una persona, adelante o atrás; todo cambio deja constancia |
| Tarifas | Los precios de hoteles y actividades |
| Opción | Un hotel más su programa de actividades |

Una oportunidad puede haber nacido en la app o directamente en Zoho. Se muestran
juntas y se gestionan desde la app; la ficha dice cuál es su origen y no deja
huecos mudos donde falte información.

Prohibido en la interfaz: *normalizar*, *registro*, *inventario documental*.
Son palabras nuestras, no suyas. («Viaje» ya no es una sección: queda para los
datos del viaje dentro de la oportunidad.)

## Reglas de producto que el diseño debe respetar

- **Informar, no bloquear.** Lo que falta se señala; solo el envío espera a que
  no falte nada, y siempre dice por qué.
- **Preparar y enviar son dos gestos.** Nada llega al colegio sin que alguien lo
  haya revisado.
- **El ámbar avisa, no prohíbe.** Que una opción se pase del presupuesto es
  información para quien cotiza, no una prohibición.
- **Nada de datos de alumnos fuera de la app.** Ni en la página pública ni en el
  documento.
- **La app escribe, Zoho archiva.** Un solo sentido, para que no haya dos
  verdades. Una acción, una vía: la opción aceptada, por ejemplo, se apunta de
  una sola manera, que arranca el plazo del depósito y avisa al CRM.
- **La oportunidad es una gestión viva.** El cliente la mueve a su ritmo y
  nosotros también, adelante y atrás. Todo cambio de fase queda con quién, cuándo,
  de qué a qué y por qué.

## Estado

En construcción sobre una app ya validada extremo a extremo. Vive en local; el
servidor de Azure está pendiente de decisiones del cliente, y eso bloquea la
página donde el colegio elige y el correo entrante.
