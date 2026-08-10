# Lo que necesitamos de Javier

> Preparado el 09/08. **Reducido el 10/08** a lo que de verdad tiene que hacer él.
> Fuera del correo, por decisión de Anthony:
> - Las cinco de Azure y las dos de negocio → **ya tenemos respuesta de su lado**.
> - El visto bueno al presupuesto → **se le enseña en llamada, con la app ya en Azure**.
> - La dirección por expediente (`groups+ref@`) → pospuesta: sin nuestro propio lector
>   de buzón no arregla nada, porque Zoho engancha por remitente, no por destinatario.
> - Las actividades sin precio → **no se le dice**: el catálogo cargado es de muestra,
>   nuestro, para trabajar. El suyo llega con ficheros nuevos cuando la app esté en pie.
>
> Parte 1 = correo listo para enviar. Parte 2 = notas internas, no se envían.

---

## Parte 1 · Correo para enviar tal cual

**Asunto:** Lo de los precios, y dos cosas que necesito

Hola Javier,

Te contesto a lo que preguntabas de los precios, y al final te pido dos cosas.

**Los precios**

Pásanoslo todo en un mismo documento, y con el coste nos basta. La aplicación calcula
sola el precio de venta sumándole el 8%, y el comercial puede subirlo o bajarlo a mano en
cada presupuesto.

Si algún hotel o actividad no lleva ese 8%, ponle su precio de venta en una columna al
lado. Cuando esa columna tiene precio, la aplicación usa ese y no calcula nada.

Lo bueno de hacerlo así es que el día que cambiéis el margen, se cambia en la aplicación y
ya está. No hay que volver a subir ningún documento.

**Dos cosas que necesito**

1. **Los datos de envío de los buzones groups@ y sports@**, para que la aplicación pueda
   mandar los presupuestos desde vuestro correo de siempre. Necesito el usuario y la
   contraseña de cada buzón, y que quien os lleve el correo me confirme el servidor de
   salida y el puerto. Si vuestro panel permite generar una clave aparte solo para enviar,
   mejor todavía: así no circula la contraseña real y podéis anularla cuando queráis.

2. **Confirmarme el dominio.** Veo que `oraviatravel.com` ya está funcionando y con correo
   montado, así que doy por hecho que es el bueno. Dime si es así, si ya tenéis creados ahí
   los buzones groups@ y sports@, y si los de viajesvelero.com van a seguir activos un
   tiempo o hay fecha de corte.

Aprovecho también para poner en copia a mi compañero **Mateo**, que se encargará de montar
la aplicación en el servidor. Él te escribirá en un próximo mensaje con las consultas que
necesite para poder hacerlo.

Un saludo,
Anthony

---

## Parte 2 · Detalle interno (no enviar)

### Las respuestas de precios, verificadas contra el código

`server/pricing.ts` → `deriveSalePrice(cost, explicitPvp, markup = 8)`:

- Si el documento trae **PVP explícito y > 0**, ese prevalece (permite márgenes distintos
  del 8% por producto). → De ahí la «columna de venta al lado» que se le propone.
- Si no, **venta = coste × 1,08** redondeado a 2 decimales.
- Si no hay ni coste ni PVP, devuelve `null` y la tarifa se omite aguas arriba. **Nunca se
  inventa un precio.**

Es la «Opción A» acordada con él el 15/07. Lo que se le dice es exactamente lo que hace el
código, no una intención.

### El correo NO está en Zoho Mail — verificado por DNS el 10/08/2026

El borrador anterior le mandaba generar una «contraseña de aplicación de Zoho Mail». Es
falso, y venía arrastrado sin comprobar. Lo que dice el DNS:

| Comprobación | `viajesvelero.com` | `oraviatravel.com` |
|---|---|---|
| MX | `mx.viajesvelero.com` → 217.116.0.227 | `mx.oraviatravel.com` → **217.116.0.227** |
| SMTP | `smtp.viajesvelero.com` → .228 | `smtp.oraviatravel.com` → **.228** |
| Webmail | `webmail.viajesvelero.com` → .245 | `webmail.oraviatravel.com` → **.245** |
| SPF | `include:one.zoho.eu` + `include:spf.dominioabsoluto.net` | `redirect=spf.dominioabsoluto.net` |

Conclusiones:

- **Los buzones viven en su hosting** (Dominio Absoluto), no en Zoho Mail ni Google ni
  Microsoft. Zoho aparece en el SPF porque el CRM está autorizado a enviar en nombre del
  dominio — no es dónde están los buzones.
- **`oraviatravel.com` ya existe y ya tiene el correo montado, en el mismo servidor exacto.**
  El dominio que usábamos «de ejemplo» es el bueno y está operativo. Por eso la petición 2
  es una confirmación, no una pregunta.
- ⚠️ **`.env.example:66` tiene `MAIL_HOST="smtp.zoho.eu"` y está mal.** Debe ser
  `smtp.oraviatravel.com`. Pendiente de corregir.

### El catálogo cargado es de muestra

Los alojamientos y actividades que hay en la base son **nuestros, para trabajar**. Cuando la
app esté en pie, el cliente sube ficheros **nuevos y distintos**. De ahí que:

- **No se le avisa de las actividades sin precio ni de los años raros de las tarifas**: son
  defectos de datos de prueba, no problemas suyos.
- Que producción arranque con la base vacía **es lo correcto**, no un inconveniente: evita
  que los datos de muestra contaminen el entorno real.
- Lo que **sí** sigue importando es la **calidad del extractor**: el fallo que confunde
  números de la tabla con el año se repetirá con los ficheros nuevos. Se arregla en el
  extractor, no en las filas actuales.

### Por qué cada petición

| # | Petición | Desbloquea | Si no llega |
|---|---|---|---|
| 1 | Credenciales SMTP de los buzones | Envío real de la propuesta | El despliegue **no** se bloquea: sube sin correo y se enciende después |
| 2 | Confirmación del dominio | Alta de los usuarios reales y el remitente | Seguimos suponiendo `oraviatravel.com`, que el DNS ya respalda |

### Lo que se le enseña en llamada, con la app ya en Azure

- El presupuesto tal y como le llega al colegio (y si prefiere la plantilla de Alberto).
- La página donde el colegio elige su opción.
