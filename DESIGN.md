# Oravia · Sistema visual

> El sistema real, sacado del código en `src/styles.css`. Si añades una pantalla,
> sale de aquí. Si necesitas un valor que no está, se añade aquí primero.

## Color

Los dos colores de marca están **muestreados del logo** que envió el cliente, no
elegidos a ojo.

| Token | Valor | Para qué |
|---|---|---|
| `--brand` | `#132E5D` | Azul marino Oravia. Marca, franja lateral, cabeceras de tabla. |
| `--brand-700` | `#0B1A38` | Marino profundo. Solo fondos grandes y degradados. |
| `--accent` | `#1B3D75` | Acción: botones primarios, foco de selección. |
| `--highlight` | `#FCBB37` | Ámbar. Atención: foco de campo, plazos, lo que se pasa del tope. |
| `--highlight-ink` | `#8A5A08` | El ámbar cuando hace de **texto**. El puro no llega a contraste. |
| `--bg` | `#F2F5F9` | Lienzo. Gris sesgado al azul de marca, no neutro. |
| `--surface` | `#FFFFFF` | Tarjetas. |
| `--surface-2` | `#F5F7FA` | Paneles y barras: el segundo nivel. |

Estados: `--ok #1F7A4D` · `--warn #8A5A08` · `--danger #B23A48` · `--info #1B3D75`.

**Estrategia: restringida.** El azul manda en la acción; el ámbar solo señala lo
que reclama atención. Ninguno de los dos decora.

**Regla dura:** el ámbar puro nunca es color de texto sobre blanco (contraste
insuficiente). Como fondo o indicador, sí; como letra, `--highlight-ink`.

## Tipografía

Una familia, varios pesos. `Space Grotesk` para titulares, `IBM Plex Sans` para
todo lo demás, `IBM Plex Mono` para cifras y referencias.

Escala **fija**, no fluida: la consola se usa a distancia constante y un titular
que encoge dentro de un panel se ve peor, no mejor.

`--fs-micro 11` · `--fs-small 12.5` · `--fs-body 14` · `--fs-lead 15.5` ·
`--fs-h3 17` · `--fs-h2 20` · `--fs-h1 26`

- Etiquetas en versalitas: `--fs-micro`, peso 700, `letter-spacing .06em`.
- Cifras que se comparan en columna: `font-variant-numeric: tabular-nums`.
- Titulares: `letter-spacing` nunca por debajo de `-0.025em`.

## Espaciado

Escala de 4. Nada de valores sueltos: si hace falta 13px, es que el sitio correcto
era 12 o 16.

`--sp-1 4` · `--sp-2 8` · `--sp-3 12` · `--sp-4 16` · `--sp-5 24` · `--sp-6 32` ·
`--sp-7 48`

## Forma y profundidad

- Radios: `--radius 10px` en controles, `--radius-lg 14px` en tarjetas y paneles,
  `--radius-pill` en etiquetas. **Nunca por encima de 16px en una tarjeta.**
- Sombras **tintadas al azul de marca**: una sombra negra sobre fondo azulado se
  ve sucia. `--shadow-panel` para tarjetas, `--shadow-raised` para lo elegido,
  `--shadow-drawer` para el panel lateral.
- **Nunca borde de 1px y sombra ancha en el mismo elemento.** Una cosa o la otra.

## Capas

Con nombre, jamás un número inventado.

`--z-sticky 20` · `--z-drawer-back 40` · `--z-drawer 45` · `--z-modal 60` ·
`--z-toast 80`

## Estados

Todo lo pulsable tiene: reposo, hover, **foco visible**, activo, deshabilitado y,
si tarda, ocupado.

- Foco: anillo ámbar de 3px (`outline: 3px solid var(--highlight)`), separado 2px.
  Es el mismo en toda la app, incluido el login.
- Deshabilitado: fondo `#DCE3ED`, texto `#8494AC`. **Nunca un color de marca
  apagado**: un botón medio azul parece pulsable.
- Cargando: esqueletos con la forma del contenido final, no ruedas girando en
  medio de la pantalla.

## Movimiento

150-250 ms, curva `--ease-out`. El movimiento cuenta un cambio de estado; nunca
decora. Sin secuencias de entrada al cargar la página: se entra a trabajar.

Todo lo animado tiene su alternativa en `@media (prefers-reduced-motion: reduce)`.

## Patrones propios

- **Franja de marca** (`.cv__rail`): banda azul de 52px a la izquierda de las
  pantallas de trabajo, con el isotipo y el nombre en vertical.
- **Hitos que informan** (`.cv__track`): tres marcadores que se rellenan solos
  según el estado y nunca bloquean. Estados: pendiente, trabajando, aviso, hecho.
- **Sello de tope** (`.cv__tope`): "cabe" en verde o "+10 €" en ámbar, junto al
  precio.
- **Punto de urgencia** (`.desk__flag`): rojo, ámbar o gris. Es un punto, no un
  filete lateral de color.

## Prohibido aquí

- Filetes laterales de color como adorno en tarjetas o filas.
- Texto con degradado.
- Cristal esmerilado por defecto. Solo donde haya contenido pasando por debajo.
- Modal como primera idea: primero inline, luego panel lateral, y solo entonces
  modal.
- Etiquetas en versalitas encima de **cada** bloque. Una cosa es una etiqueta
  necesaria y otra el estribillo.
- Radios de 24px o más en tarjetas.
