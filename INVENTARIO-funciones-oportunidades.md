# Inventario de funciones · Propuestas + Viajes → Oportunidades

Fecha: 05/11/2026. Hecho leyendo el código (working tree de la rama `correo-por-oportunidad`), sin arrancar la app.
Criterio de aceptación: **ninguna fila de esta tabla puede quedar sin destino** en la pantalla única.
El correo (CorreoPanel, CorreosSueltosPanel) queda fuera de este cambio: se conservan tal cual y se adaptan después.

Leyenda de origen: **P** = Propuestas (ProposalDesk + FichaPropuesta) · **V** = Viajes (ConfirmRequestsPanel).

## Lista y cabecera

| # | Función | Origen | Destino en Oportunidades |
|---|---|---|---|
| 1 | Una fila por viaje, última versión (`ultimaDeCadaViaje`) | P | Se mantiene; la fila une entrega + trato |
| 2 | Orden por urgencia (fallos, depósito que vence, lo que lleva esperando) | P | Orden por defecto «Lo que corre prisa» |
| 3 | Orden por recientes / cierre próximo / importe | V | Se mantiene como opciones de orden |
| 4 | Cuatro carriles con contador (Sin enviar, Esperando, Aceptadas sin depósito, Cerradas) | P | Filtros de la cabecera + «Sin propuesta de la app» |
| 5 | KPI: sin confirmar, enviadas, ganadas + importe ganado, importe en curso y nº de abiertos | V | Se conservan (importes por periodo los usa Javier) |
| 6 | Rango de llegadas (guardado en el navegador, botón «año que viene») | V | Se mantiene |
| 7 | Filtro de departamento (solo para quien no tiene uno) | V | Se mantiene |
| 8 | Búsqueda por nombre, cuenta o contacto (y `?buscar=` desde otra pantalla) | V | Se mantiene; el salto desde otras pantallas pasa a ser por id |
| 9 | Filtro por fase del CRM | V | Se mantiene |
| 10 | Nombre de fila: viaje · destino, o centro · destino | P | Se mantiene (`tripTitleOf`) |
| 11 | Frase de estado («Abierta 2 veces, sin respuesta», «Quedan 12 días…») | P | Se mantiene en la fila |
| 12 | Anillo del depósito (40 días) | P | Se mantiene |
| 13 | Etiqueta de departamento (Sports/Groups) | P | Se mantiene |
| 14 | Etiqueta de fase con tono y chip de opción elegida | V | Se mantiene |
| 15 | Botón de acción por fila (Enviar propuesta / Reintentar envío / Hacer seguimiento / Reclamar depósito / Ver el viaje) | P | Pasa al panel de «Lo siguiente» |
| 16 | Actualizar | V | Se mantiene |
| 17 | Aviso tras borrar | P | Se mantiene |
| 18 | Tratos solo-Zoho (hechos a mano, Agencia, Congresos, OTRO) | V | Entran; la app los «adopta» al abrirlos |

## Detalle (ficha)

| # | Función | Origen | Destino |
|---|---|---|---|
| 19 | Cabecera: nombre del grupo, referencia ORV, centro | P | Cabecera del detalle |
| 20 | Cambiar nombre (app + oportunidad del CRM) | P | Acción del detalle |
| 21 | Datos: destino, fechas, participantes, profesores, contacto | P/V | Bloque de datos único |
| 22 | Embudo con fechas y color de fase del CRM | P | Detalle |
| 23 | Barra de progreso del pipeline | V | Se sustituye por el embudo (misma información) |
| 24 | Las 3 opciones con desglose, gratuidades y actividades | P | Detalle. En las solo-Zoho: texto de «Opciones de Presupuesto» |
| 25 | Opción elegida marcada | P/V | Detalle |
| 26 | Aviso del depósito vencido / días que quedan | P | Detalle |
| 27 | «Lo siguiente» (siguiente paso calculado) | P | Panel derecho |
| 28 | Campos del CRM rellenos y vacíos («12 de 15») | P | Panel derecho |
| 29 | Abrir en Zoho | P/V | Se mantiene |
| 30 | Ver el documento (PDF) | P | Acción del detalle |
| 31 | Resumen / Propuesta (texto crudo) / Historial | V | Pestañas del detalle; el Historial gana constancia de cambios |
| 32 | Actividad reciente (notas fechadas del trato) | V | Historial |

## Acciones

| # | Función | Origen | Destino |
|---|---|---|---|
| 33 | Enviar propuesta | P | «Lo siguiente» |
| 34 | Reintentar envío fallido | P | «Lo siguiente» |
| 35 | «Ha cambiado algo» (ChangePanel: recotizar y crear versión nueva) | P | Acción del detalle |
| 36 | Rehacer la propuesta (abre el lienzo con borrador) | P | Acción del detalle |
| 37 | Apuntar la opción aceptada con sugerencia por correo | P | Panel derecho. **Vía única** (`marcarOpcionElegida`) |
| 38 | Elegir opción desde Viajes (solo texto en la Descripción) | V | Se retira para oportunidades de la app; en solo-Zoho pasa por la misma vía única |
| 39 | Avanzar de fase (selector libre) | V | **Selector libre, adelante y atrás, con constancia** + atajos (cobrado, perdida, lista de espera, reabrir) |
| 40 | Añadir nota fechada al trato | V | Se mantiene |
| 41 | Borrar solicitud (con aviso de lo que arrastra) | P | Acción del detalle |

## Calendario

| # | Función | Origen | Destino |
|---|---|---|---|
| 42 | Calendario mensual, navegación y «Hoy» | V | `/oportunidades/calendario` |
| 43 | Lectura «Viaje» (estancia) y «Gestión» (cierre) | V | Se mantiene |
| 44 | Barras de estancia con inicio/medio/fin | V | Se mantiene |
| 45 | Día abierto con todos sus grupos | V | Se mantiene |
| 46 | «Revisar fechas» (salida anterior a llegada, estancias de meses) | V | Se mantiene |
| 47 | Clic en un evento → abre la oportunidad | V | Abre el detalle por id |

## Fuera de este cambio (se conservan sin tocar)

| # | Función | Origen |
|---|---|---|
| 48 | Conversación con el colegio y proveedores (CorreoPanel) | P |
| 49 | Correos sin asignar con sugerencias (CorreosSueltosPanel) | P |

Para las solo-Zoho, el botón de conversación no aparece hasta adaptar el correo.

## Cosas nuevas que no existían

- Constancia de cada cambio de fase (quién, cuándo, de→a, motivo) en Historial, auditoría y nota en Zoho.
- Registro de la app por oportunidad, enlazado por `crmDealId`.
- Los movimientos automáticos (el colegio abrió, eligió) rotulados en el Historial.
