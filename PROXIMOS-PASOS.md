# Próximos pasos · Oravia

> Escrito el 10/08/2026, al cerrar la sesión. Contrastado con el código y con
> la base de datos, no con lo que creíamos recordar.

## Dónde queda hoy

Seis commits en `feat/documental-review-workspace`, **sin subir a GitHub**.
`tsc` limpio, 31/31 tests, compila para producción.

Lo que la app ya hace y antes no:

- Rebrand a Oravia y roles por departamento (ADMIN / DEPT_ADMIN / QUOTER).
- **Envía la propuesta**: documento con la marca, correo desde el buzón del
  departamento, referencia visible (ORV-2026-0184) y registro de qué salió.
- **Nueva solicitud como lienzo**: pantalla propia, guarda solo, programa de
  actividades personalizable por opción, revisión antes de enviar.
- **Mesa de propuestas** como inicio, con el reloj de los 40 días.
- **Cambios del cliente**: pegar el mensaje, ver qué cambia, aplicar creando
  versión nueva.
- Página donde el colegio elige su opción (construida, sin poder usarse).

---

## Lo que pidió el cliente en junio, contra lo que hay

| Lo que pidió Javier | Estado real |
|---|---|
| Renombrar "Documentos IA" a Tarifas y Catálogo | **Hecho** |
| Botón de enviar presupuesto y correo automático | **Hecho**, esperando la clave del buzón |
| Depósito del 30 % con cuenta atrás de 40 días | **Hecho** el reloj; falta que el paso a "Ganada" lo dispare el cobro |
| Editar una solicitud ya enviada | **Hecho** como "Ha cambiado algo", con versión nueva |
| Campo Departamento que enrute | **A medias**: el departamento existe y filtra la visibilidad; no enruta todavía las tarifas ni al gestor |
| Precio neto (PVP menos comisión) | **A medias**: la regla del 8 % está en el cálculo, pero el neto no se ve en pantalla |
| Proveedor en las actividades | **A medias**: el dato se guarda y se ve en el catálogo, no al cotizar |
| Filtros por año y tarifas pendientes | **No** |
| Auto-desactivar tarifas viejas | **No** |
| Sincronizar catálogo con Alojamientos de Zoho | **No** |
| Autorrellenar campos al ganar la oportunidad | **No** |

De once peticiones: cuatro cerradas, tres a medias, cuatro sin empezar.

---

## Tres cosas que hay que saber antes de planificar

> ⚠️ **Reescrito el 10/08 contra la base de datos.** Lo que decía esta sección
> —«la IA se inventa el año»— **era falso**, y el catálogo cargado es **de
> muestra, nuestro**: el cliente sube ficheros nuevos cuando la app esté en pie.

**1. La IA no se inventa el año. El importador de Excel sí.** Las 313 tarifas con
año imposible y las 264 actividades sin precio vienen **todas** del importador CLI
(`prisma:import-rates`), que es andamiaje de desarrollo. Comprobado por
`sourceDocumentId`: 554 de 555 tarifas de alojamiento y 264 de 264 de actividad
entraron por ahí, ninguna por la IA.

La IA ha procesado tres PDFs reales del cliente y produjo **46 tarifas, las 46
correctas**: año 2026, precio y moneda completos, cero años inventados. El
extractor **no necesita arreglo**. Sale de la lista.

**2. Lo que sí falla: el catálogo no recibe lo aprobado.** De esas 46 tarifas,
**42 quedaron aprobadas y solo 1 llegó al catálogo**. Y el PDF del que la IA no
sacó ninguna tarifa **quedó marcado como PUBLICADO igual**.

| Documento | Estado | Aprobadas | En catálogo |
|---|---|---|---|
| 4R 3 estrellas | PUBLISHED | 0 | 0 |
| 4R 4 estrellas | PUBLISHED | **40** | **0** |
| Albergue Jaca | PUBLISHED | 2 | 1 |

Hay **tres caminos en el código que fallan en silencio**, y cualquiera de ellos
produce este estado:

- Si el alojamiento padre no está aprobado, se descartan todas sus tarifas
  aprobadas y solo se deja un aviso (`documentImportDb.ts:948`).
- **Publicar es de una sola vez**: aprobar después de haber publicado no publica
  nada, y no hay forma de volver a intentarlo.
- Un documento del que no sale ninguna tarifa **se marca PUBLICADO igual**.

No se puede reconstruir cuál de los tres ocurrió: las tablas de staging no guardan
fecha de revisión y esta base tiene historial manual. Da igual — los tres hay que
cerrarlos.

**Por qué es lo más urgente:** el día que arranque, el cliente sube sus ficheros,
revisa, aprueba, pulsa publicar, ve «publicado» y el catálogo se queda vacío. El
cotizador abre la app y no encuentra hoteles. Es el fallo más caro posible en una
puesta en marcha, y es exactamente el que tenemos hoy sin saberlo.

**3. El CRM tiene 200 tratos** mezclando pruebas nuestras y datos reales. Este sí
sigue en pie. Antes de enseñar nada a Javier conviene separarlos.

---

## Los próximos pasos, en orden

### Bloque 1 · Cerrar lo que ya está a medias (1-2 semanas)

1. **Actualizar el handoff**, congelado desde el 17 de junio. Sin él, nadie
   puede continuar este trabajo: ni otra persona ni tú dentro de un mes.
2. **Tests de lo nuevo**: envío, documento, borrador del lienzo y cambios del
   cliente. Los 31 que pasan son todos de antes, y el fallo del total contra el
   precio por alumno se pilló mirando números a mano.
3. **Reintentar el cierre del lienzo**: hoy crea cliente, solicitud, propuesta,
   trato y documento en cadena; si falla a mitad, el trato queda creado y
   repetir lo duplica.

### Bloque 2 · Lo que el cliente pidió y falta (2-3 semanas)

4. **Arreglar el extractor** (que deje de inventarse el año y que sepa leer
   precios de actividad) y solo entonces: filtros por año y desactivación
   automática de las viejas. Las filas de muestra no se sanean: se tiran.
5. **El neto a la vista** al cotizar, y **el proveedor en las actividades**.
6. **Que el cobro del depósito avance la fase** en vez de hacerlo a mano.
7. **Autorrellenar los campos al ganar**.

### Bloque 3 · Cuando haya servidor (Azure)

8. **Encender la página del colegio**: ya está construida y probada en local.
9. **Una dirección de correo por viaje**, que cierra de raíz el problema de los
   correos mezclados. Es la mejora que más agradecerá Javier.
10. **Sincronizar el catálogo con Alojamientos de Zoho**.

### Bloque 4 · Etapa 2, se vende aparte

11. El portal del colegio: cambiar plazas, subir listados, ver pagos.

---

## Lo que hay que pedir o decidir

**A Javier** (sigue sin enviarse la nota de [comunicaciones/](comunicaciones/)):
la clave de los buzones, el dominio definitivo, si el correo admite direcciones
por expediente, y las cinco decisiones de Azure.

**Y dos preguntas que abrimos y siguen abiertas:**

- ¿Pueden verse los márgenes con cuentas compartidas? Un cotizador viendo el
  beneficio de la casa es decisión suya, no nuestra.
- ¿Qué pasa cuando el cliente cambia algo **después** de pagar el depósito? Hoy
  el cambio genera versión nueva sin mirar si ya había dinero de por medio.

**A Raúl:** nada de lo de esta sesión estaba en la propuesta firmada. Las 35 h
pendientes eran precios, encaje con Zoho, despliegue y formación.

---

## Antes de nada, mañana

**Subir los commits.** Seis commits viven solo en el portátil. `git push` y
dejan de depender de que no se estropee.
