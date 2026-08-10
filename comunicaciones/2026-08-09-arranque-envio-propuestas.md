# Lo que necesitamos de Javier

> Preparado el 09/08/2026. Cuatro peticiones, ordenadas por lo que desbloquean.
> La primera parte es el correo listo para enviar; debajo está el detalle técnico
> por si pregunta el porqué o se lo pasa a su informático.

---

## Parte 1 · Correo para enviar tal cual

**Asunto:** Cuatro cosas que necesitamos para arrancar el envío de propuestas

Hola Javier,

Estamos preparando lo que hablamos en junio: que la propuesta con las tres opciones
salga directamente desde la aplicación, sin copiar y pegar, y que los correos dejen de
mezclarse entre oportunidades. Para poder encenderlo necesitamos cuatro cosas de vuestro
lado. Las tres primeras son rápidas; la cuarta es la que lleva más tiempo parada.

**1. Una clave de aplicación para los buzones `groups@` y `sports@`**

Es lo que permite que la aplicación envíe el correo desde vuestro buzón, para que la
respuesta del colegio llegue donde siempre y Zoho lo vea. No es la contraseña normal de
la cuenta: es una clave aparte que se genera desde Zoho Mail, se puede revocar cuando
queráis y solo sirve para enviar.

Se saca en: Zoho Mail → Configuración → Seguridad → Contraseñas de aplicación → Generar.
Nos hace falta una por cada buzón. Tarda un par de minutos.

**2. El dominio definitivo de Oravia**

Ahora mismo todo lo que hemos preparado usa `@oraviatravel.com` como ejemplo. Antes de
crear los usuarios reales necesitamos saber cuál es el bueno, y si los correos
`@viajesvelero.com` van a seguir funcionando durante la transición o hay fecha de corte.

**3. Confirmar si vuestro correo admite direcciones por expediente**

Esto es lo que resuelve de raíz el problema de los correos mezclados. La idea es que cada
propuesta lleve su propia dirección de respuesta, del estilo:

    groups+ORV-2026-0184@oraviatravel.com

El colegio responde como siempre, sin notar nada, pero nosotros sabemos con total
certeza a qué viaje pertenece cada correo, sin que Zoho tenga que adivinarlo. Necesitamos
que nos confirméis (o que lo preguntéis a vuestro soporte de Zoho) si vuestro plan de
correo admite direcciones con el signo `+`, o bien un buzón que recoja todo lo que no
coincida con una cuenta existente. Si la respuesta es que no, tenemos una alternativa que
funciona casi igual de bien, pero preferimos saberlo antes.

**4. Las decisiones del servidor**

Esta es la importante, y lleva parada desde el 21 de julio. Ya no bloquea solo "poner la
aplicación en producción": bloquea también la página donde el colegio elige su opción y
todo lo relacionado con el correo entrante. Son cinco decisiones:

- ¿La suscripción de Azure va a nombre de Oravia o la gestionamos nosotros con una cuota mensual?
- ¿Arrancamos con el tamaño básico que recomendamos y escalamos si hace falta?
- ¿Acceso con el usuario y contraseña que ya tiene la aplicación, o con cuentas de Microsoft?
- ¿Qué dominio usamos para entrar y desde qué oficinas se va a conectar?
- ¿Cuántos días de copias de seguridad queréis conservar?

Te pasamos ya la ficha técnica que preparamos para tu informático, con los tamaños y el
detalle de lo que hay que contratar.

Con lo primero podemos empezar a trabajar esta misma semana. Cualquier duda me dices y lo
vemos por teléfono.

Un saludo,
Anthony

---

## Parte 2 · Detalle interno (no enviar)

### Por qué cada petición

| Petición | Desbloquea | Si no llega |
|---|---|---|
| Clave de aplicación de los buzones | Envío de la propuesta desde la app (fase 2) | Se construye igual y queda en modo simulación: el correo se genera y se guarda, pero no sale |
| Dominio definitivo | Alta de los usuarios reales y el remitente de los correos | Seguimos con el ejemplo; cambiar el correo de un usuario después no borra sus cotizaciones |
| Direcciones por expediente | Correo entrante colgado del viaje correcto (fase 6) | Alternativa: un buzón por departamento y la referencia en el asunto |
| Decisiones de Azure | Fases 4, 5, 6 y 7 | Cuatro de las siete fases se quedan sin fecha |

### Cómo se genera la clave de aplicación en Zoho Mail

Zoho Mail → icono de perfil → **Mi cuenta** → **Seguridad** → **Contraseñas de aplicación** →
*Generar nueva contraseña* → nombre descriptivo (por ejemplo, "App Oravia") → copiar la
clave. Solo se muestra una vez. Se puede revocar en cualquier momento sin afectar al
acceso normal del buzón.

Datos que necesitamos junto con la clave:

- Dirección completa del buzón (`groups@…` y `sports@…`)
- Servidor de salida y puerto (normalmente `smtp.zoho.eu`, puerto 465)
- Si el buzón está en la región europea de Zoho (creemos que sí, porque el CRM lo está)

### Documentos que le acompañan

- `Coste Azure/INFO-DESPLIEGUE-Azure-para-Sistemas.pdf` — la ficha para su técnico.
- `Alojamiento-Azure-ViajesVelero.html` — el documento de cliente sobre el alojamiento.

### Lo que NO se le pide todavía

- **El pixel de seguimiento del correo.** Deja de hacer falta si sale adelante la página
  de la propuesta: se sabe si la abrió porque entra en la página, no espiando el correo.
- **La plantilla de presupuesto de Alberto.** La reproduciremos, pero primero conviene ver
  cómo queda nuestro PDF; si el suyo gusta más, lo copiamos.
