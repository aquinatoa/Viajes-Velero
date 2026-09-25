// Renderizador de entregables Neointec · lenguaje "D".
//
// COPIA CANÓNICA: ~/.claude/skills/entregable-cliente/nd-doc.mjs
// Se copia tal cual a <cliente>/build/<entregable>/ junto con logos.json.
// Si se mejora, se mejora AQUÍ y se vuelve a copiar; nunca al revés.
//
// Sustituye a wg-doc.mjs manteniendo el vocabulario de bloques de los
// entregables anteriores (stats, tabla, nota, sec, rules, principio, ruta,
// html) y añade lo que hacía a mano la maqueta de CEEI del 8/9/2026 para que
// el cliente CONTESTE dentro del documento:
//   · pregunta      opciones excluyentes + nuestra recomendación + comentario
//   · indice        tabla de todas las preguntas con su estado (se rellena sola)
//   · flow          pasos numerados («cómo se contesta, en cuatro pasos»)
//   · pasos         tabla Qué / Quién / Cuándo con casilla (qué pasa después)
//   · respuestas    panel final: contadores, Copiar, Descargar .txt, texto
//   · obs           cuadro «¿algo que no cuadre?» al pie de un panel
//     (o render({observaciones:true}) para ponerlo en todos)
// Todo se guarda en localStorage del navegador del cliente; el documento no
// manda nada solo. El texto que copia lleva preguntas, comentarios,
// observaciones por sección y el recuento de casillas.
//
// De dónde sale el diseño: del espacio de trabajo de Diurnay
// (diurnay.neointec.com), leído de su CSS y de su DOM. Lo que se adopta:
//   · rail con doble marca: Neointec arriba, el cliente debajo
//   · píldora de estado con punto latiente
//   · navegación con icono + número, agrupada
//   · barra superior con título, subtítulo y distintivos
//   · antetítulos en versales, tarjetas con borde y sombra corta
//   · radios en escala (12 / 8 / 6 / píldora), no un valor único
//   · iconos de línea (trazados de lucide, los mismos que usa Diurnay)
//
// Lo que NO se adopta de Diurnay, a propósito:
//   · el peso 600 — el manual de identidad acota a Regular (400) y Bold (700)
//   · el blanco puro — prohibido por el manual; aquí Gris Interfaz y #FAFAF8
//   · la ausencia de tema oscuro — el manual valida el fondo Azul Código
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const LOGOS = JSON.parse(readFileSync(join(here, 'logos.json'), 'utf8'))

/* ---------- iconos ---------- */

const svg = (d, s = 17) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" `
  + `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`

export const ICONOS = {
  capas: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
  lupa: '<path d="m8 11 2 2 4-4"/><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  usuarios: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  base: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  flecha: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  bombilla: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  reloj: '<path d="M16 14v2.2l1.6 1"/><path d="M16 2v3"/><path d="M21 7.338V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2.338"/><path d="M3 9h5.859"/><path d="M8 2v3"/><circle cx="16" cy="16" r="6"/>',
  escudo: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  alerta: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  lista: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  ajustes: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
  libro: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/>',
  rayo: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
}

// Cuando el datos.mjs no dice qué icono quiere, se reparten por orden.
const POR_DEFECTO = ['capas', 'lupa', 'usuarios', 'base', 'lista', 'reloj', 'escudo', 'ajustes', 'libro', 'rayo']

/* ---------- hoja de estilo ---------- */

const CSS = `
:root{
  /* Gama corporativa del manual de identidad (v1.0, marzo 2023) */
  --servidor:#305973; --flujo:#326773; --cloud:#9CCED9;
  --codigo:#272F40; --interfaz:#F2F2F2; --canvas:#F2EBDA;

  --bg:#F2F2F2; --card:#FAFAF8; --card-2:#F7F7F5;
  --line:#D9E0E2; --line-soft:#E6EBEC;
  --ink:#272F40; --ink-2:#4A5560; --ink-3:#66737C;
  --accent:#305973; --accent-soft:#DDECEF;
  --crit:#B64A46; --crit-soft:#F6E5E4;
  --warn:#B7791F; --warn-soft:#F7EEDC;
  --ok:#2F6B58;   --ok-soft:#DEEAE6;
  --dead:#66737C; --dead-soft:#E4EAEC;

  --r-lg:12px; --r-md:8px; --r-sm:6px; --r-pill:999px;
  --sombra:0 1px 3px rgba(39,47,64,.10), 0 1px 2px -1px rgba(39,47,64,.10);
  --sombra-corta:0 1px 2px rgba(39,47,64,.07);
  --f:"DM Sans","Segoe UI",Helvetica,Arial,sans-serif;
  --f-mono:"DM Mono",ui-monospace,Consolas,monospace;
}
/* Tema oscuro: el manual lo valida (fondo Azul Codigo, titulos en Azul Cloud),
   pero NO se activa solo. El diseno aprobado es el claro, y un documento que
   cambia de aspecto segun el ordenador de quien lo abre no se puede enseñar a
   un cliente. Se enciende a mano con <html data-theme="dark">. */
:root[data-theme="dark"]{
  --bg:#1E2531; --card:#272F40; --card-2:#2E3749;
  --line:#3A4558; --line-soft:#333C4D;
  --ink:#F2F2F2; --ink-2:#C3D0D8; --ink-3:#95A0AF;
  --accent:#9CCED9; --accent-soft:#2A3B4A;
  --crit:#DB9494; --crit-soft:#4A3434;
  --warn:#D9BE87; --warn-soft:#4A422E;
  --ok:#7FC0A8;   --ok-soft:#2A4A40;
  --dead:#95A0AF; --dead-soft:#3A4558;
}

*{box-sizing:border-box;}
/* IMPRESCINDIBLE y facil de olvidar: .panel lleva display:flex, que pisa el
   atributo hidden. Sin esta linea los paneles no se ocultan nunca y las
   pestanas del rail no hacen nada. */
[hidden]{display:none !important;}

body{margin:0;background:var(--bg);color:var(--ink);font:400 14px/1.55 var(--f);
  -webkit-font-smoothing:antialiased;}

/* ---------- barras de desplazamiento ---------- */
/* Firefox */
html{scrollbar-width:thin;scrollbar-color:#BFCACE var(--bg);}
.rail{scrollbar-width:thin;scrollbar-color:#46536A var(--codigo);}
/* Chrome, Edge, Safari: pulgar redondeado, separado del borde por un margen
   del propio color del fondo, que es lo que le da el aire. */
::-webkit-scrollbar{width:12px;height:12px;}
::-webkit-scrollbar-track{background:var(--bg);}
::-webkit-scrollbar-thumb{background:#C6D0D4;border:3px solid var(--bg);
  border-radius:var(--r-pill);min-height:38px;}
::-webkit-scrollbar-thumb:hover{background:#A9B7BD;}
::-webkit-scrollbar-corner{background:var(--bg);}
.rail::-webkit-scrollbar-track{background:var(--codigo);}
.rail::-webkit-scrollbar-thumb{background:#46536A;border-color:var(--codigo);}
.rail::-webkit-scrollbar-thumb:hover{background:#5C6B85;}
:root[data-theme="dark"] ::-webkit-scrollbar-thumb{background:#46536A;}
:root[data-theme="dark"] ::-webkit-scrollbar-thumb:hover{background:#5C6B85;}
/* El scroll horizontal de las tablas vive dentro de una tarjeta clara */
.tw .scroll{scrollbar-width:thin;scrollbar-color:#C6D0D4 var(--card);}
.tw .scroll::-webkit-scrollbar{height:10px;}
.tw .scroll::-webkit-scrollbar-track{background:var(--card);}
.tw .scroll::-webkit-scrollbar-thumb{background:#C6D0D4;border:3px solid var(--card);}
h1,h2,h3,h4{margin:0;font-weight:700;letter-spacing:-.015em;line-height:1.2;}
p{margin:0;}
a{color:var(--accent);}
.shell{display:grid;grid-template-columns:270px 1fr;min-height:100vh;}

/* ---------- rail ---------- */
.rail{background:var(--codigo);color:var(--interfaz);display:flex;flex-direction:column;
  position:sticky;top:0;height:100vh;overflow-y:auto;}
.marca{padding:20px 18px 16px;border-bottom:1px solid rgba(242,242,242,.10);}
.marca img{height:26px;width:auto;display:block;}
.marca .logo-dark{display:none;}
.cliente{margin-top:16px;display:flex;flex-direction:column;gap:3px;}
.cliente .fila{display:flex;align-items:center;gap:8px;}
.cliente .sigla{width:22px;height:22px;border-radius:var(--r-sm);background:var(--cloud);
  color:var(--codigo);display:grid;place-items:center;font-weight:700;font-size:10.5px;flex:0 0 auto;}
.cliente strong{font-size:14.5px;letter-spacing:.01em;}
.cliente .sub{font-size:11.5px;color:#9FB0BC;}

.estado{display:flex;align-items:center;gap:8px;margin:14px 18px 4px;padding:7px 11px;
  background:rgba(156,206,217,.10);border:1px solid rgba(156,206,217,.22);
  border-radius:var(--r-pill);font-size:11.5px;color:var(--cloud);}
.pulso{width:7px;height:7px;border-radius:50%;background:var(--cloud);flex:0 0 auto;
  animation:latido 2s infinite;}
.estado.alerta{background:rgba(182,74,70,.13);border-color:rgba(182,74,70,.3);color:#E9AEAC;}
.estado.alerta .pulso{background:#DB9494;}
@keyframes latido{0%{box-shadow:0 0 0 0 rgba(156,206,217,.5);}70%{box-shadow:0 0 0 7px rgba(156,206,217,0);}100%{box-shadow:0 0 0 0 rgba(156,206,217,0);}}
@media (prefers-reduced-motion:reduce){ .pulso{animation:none;} }

.nav{padding:10px 12px;display:flex;flex-direction:column;gap:2px;flex:1;}
.nav .grupo{margin-top:9px;padding:0 11px 5px;font-size:9.5px;letter-spacing:.13em;
  text-transform:uppercase;color:#7B8B98;}
.nav .grupo:first-child{margin-top:0;}
.nav button{display:flex;align-items:center;gap:10px;width:100%;padding:9px 11px;
  background:none;border:0;border-radius:var(--r-md);color:#C3D0D8;font:400 13.5px/1.25 var(--f);
  cursor:pointer;text-align:left;transition:background .12s,color .12s;}
.nav button:hover{background:rgba(242,242,242,.06);color:var(--interfaz);}
.nav button[aria-selected="true"]{background:var(--servidor);color:var(--interfaz);font-weight:700;}
.nav button[aria-selected="true"] .n{color:var(--cloud);}
.nav .n{font-family:var(--f-mono);font-size:10.5px;color:#7B8B98;min-width:17px;}
.nav .txt{flex:1;}
.nav svg{flex:0 0 auto;opacity:.85;}

.rail-pie{padding:13px 18px;border-top:1px solid rgba(242,242,242,.10);color:#9FB0BC;
  display:flex;flex-direction:column;gap:9px;font-size:11px;}
.prog{display:flex;flex-direction:column;gap:3px;}
.prog .pk{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:#7B8B98;}
.prog .pv{font-family:var(--f-mono);font-size:15px;font-weight:700;color:var(--cloud);}
.prog .pt{height:4px;background:rgba(242,242,242,.12);border-radius:var(--r-pill);overflow:hidden;}
.prog .pf{height:100%;background:var(--cloud);width:0;transition:width .2s;}
.fuentes{display:flex;align-items:flex-start;gap:9px;}
.fuentes strong{display:block;font-size:11.5px;color:var(--interfaz);}
.fuentes code{font-family:var(--f-mono);font-size:10px;color:#9FB0BC;display:block;}

/* ---------- barra superior ---------- */
.topbar{display:flex;align-items:center;gap:12px;padding:12px 32px;background:var(--card);
  border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5;flex-wrap:wrap;}
.topbar .tt{flex:1;min-width:220px;display:flex;flex-direction:column;}
.topbar .tt span{font-size:13.5px;font-weight:700;}
.topbar .tt small{font-size:11.5px;color:var(--ink-3);}
.dist{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:var(--r-pill);
  border:1px solid var(--line);font-size:11.5px;color:var(--ink-2);background:var(--bg);white-space:nowrap;}

/* ---------- contenido ---------- */
main{min-width:0;}
.wrap{padding:24px 32px 56px;max-width:1560px;margin:0 auto;width:100%;}
.hero{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);
  padding:25px 27px;box-shadow:var(--sombra-corta);margin-bottom:22px;}
.hero-marca{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.hero-marca .sigla{width:26px;height:26px;border-radius:var(--r-sm);background:var(--codigo);
  color:var(--cloud);display:grid;place-items:center;font-weight:700;font-size:11px;flex:0 0 auto;}
.hero-marca>span:last-child{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3);}
.eti{display:inline-block;padding:3px 10px;border-radius:var(--r-pill);background:var(--accent);
  color:#F2F2F2;font-size:11.5px;font-weight:700;margin-bottom:11px;}
.tags{display:flex;flex-wrap:wrap;gap:7px;margin-top:15px;}
.tags span{padding:3px 9px;border-radius:var(--r-sm);background:var(--accent-soft);
  color:var(--accent);font-size:10.5px;letter-spacing:.07em;font-weight:700;}
.hero h1{font-size:26px;margin:0 0 10px;}
.hero .lede{font-size:14.5px;color:var(--ink-2);max-width:78ch;}
.hechos{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:13px;
  margin-top:19px;padding-top:18px;border-top:1px solid var(--line-soft);}
.hechos article{display:flex;align-items:center;gap:11px;}
.hechos .ic{width:34px;height:34px;border-radius:var(--r-md);display:grid;place-items:center;
  background:var(--accent-soft);color:var(--accent);flex:0 0 auto;}
.hechos strong{display:block;font-size:14.5px;line-height:1.25;}
.hechos span{font-size:11.5px;color:var(--ink-3);}

.panel{display:flex;flex-direction:column;gap:18px;}
.panel-head h2{font-size:21px;margin-bottom:7px;}
.panel-head p{font-size:14px;color:var(--ink-2);max-width:82ch;}

/* stats */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;}
.stat{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);
  padding:18px 20px;box-shadow:var(--sombra-corta);display:flex;flex-direction:column;gap:3px;}
.stat .v{font-family:var(--f-mono);font-size:25px;font-weight:700;color:var(--accent);
  font-variant-numeric:tabular-nums;line-height:1.1;}
.stat .k{font-size:12.5px;font-weight:700;}
.stat .h{font-size:11.5px;color:var(--ink-3);}

/* secciones */
.sec-head{padding-top:4px;}
.sec-head h3{font-size:16.5px;}
.sec-head .sec-note{font-size:13px;color:var(--ink-3);margin-top:4px;}

/* notas */
.nota{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--accent);
  border-radius:var(--r-lg);padding:17px 19px;box-shadow:var(--sombra-corta);
  display:flex;flex-direction:column;gap:8px;}
.nota.q{border-left-color:var(--accent);}
.nota.ok{border-left-color:var(--ok);}
.nota.no{border-left-color:var(--crit);}
.nota .nt{display:flex;align-items:center;gap:7px;font-size:10.5px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--ink-3);}
.nota.no .nt{color:var(--crit);}
.nota.ok .nt{color:var(--ok);}
.nota p{font-size:13.5px;color:var(--ink-2);max-width:98ch;}
.nota p b{color:var(--ink);}

/* reglas */
.rules{display:flex;flex-direction:column;gap:10px;}
.rule{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);
  padding:14px 17px;box-shadow:var(--sombra-corta);display:flex;gap:11px;align-items:flex-start;}
.rule .ic{color:var(--ok);flex:0 0 auto;margin-top:1px;}
.rule.no .ic{color:var(--crit);}
.rule .rt{display:block;font-size:13.5px;font-weight:700;}
.rule .rd{display:block;font-size:13px;color:var(--ink-2);margin-top:2px;max-width:104ch;}

/* tablas */
.tw{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);
  overflow:hidden;box-shadow:var(--sombra-corta);}
.tw .scroll{overflow-x:auto;}
table{width:100%;border-collapse:collapse;font-size:13px;}
caption{text-align:left;padding:15px 20px 11px;font-size:10.5px;letter-spacing:.12em;
  text-transform:uppercase;color:var(--ink-3);}
th{text-align:left;padding:9px 20px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--ink-3);font-weight:400;background:var(--card-2);border-bottom:1px solid var(--line);
  position:sticky;top:0;white-space:nowrap;}
td{padding:11px 20px;border-bottom:1px solid var(--line-soft);color:var(--ink-2);vertical-align:top;}
tr:last-child td{border-bottom:0;}
td.strong{color:var(--ink);font-weight:700;}
th.tick,td.tick{width:38px;padding-right:0;}
input[type=checkbox]{width:15px;height:15px;accent-color:var(--ok);cursor:pointer;margin:2px 0 0;}
tr.hecha td:not(.tick){color:var(--ink-3);}
tr.hecha td.strong{text-decoration:line-through;}

/* pastillas: .chip es el nombre que ya usan los datos.mjs de wg-doc */
.chip,.pastilla{display:inline-block;padding:2px 9px;border-radius:var(--r-pill);
  font-size:11.5px;font-weight:700;background:var(--dead-soft);color:var(--dead);white-space:nowrap;}
.chip.ok,.pastilla.bien{background:var(--ok-soft);color:var(--ok);}
.chip.no,.pastilla.mal{background:var(--crit-soft);color:var(--crit);}
.chip.warn,.pastilla.medio{background:var(--warn-soft);color:var(--warn);}
.mono{font-family:var(--f-mono);font-variant-numeric:tabular-nums;}
code{font-family:var(--f-mono);font-size:11.5px;background:var(--card-2);padding:1px 5px;
  border-radius:var(--r-sm);color:var(--ink-2);}
pre{background:var(--codigo);color:var(--interfaz);padding:15px 17px;border-radius:var(--r-lg);
  overflow-x:auto;font-family:var(--f-mono);font-size:12px;line-height:1.5;margin:0;}
pre code{background:none;color:inherit;padding:0;}

/* cierre destacado */
.principio{display:flex;gap:14px;padding:19px 22px;border-radius:var(--r-lg);
  background:var(--codigo);color:var(--interfaz);}
.principio svg{color:var(--cloud);flex:0 0 auto;margin-top:2px;}
.principio .pk{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--cloud);}
.principio strong{display:block;margin-top:6px;font-size:15px;line-height:1.45;font-weight:400;}

.ruta{display:flex;align-items:center;gap:11px;flex-wrap:wrap;padding:14px 16px;
  background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);}
.ruta b{font-size:11.5px;letter-spacing:.07em;color:var(--accent);}
.ruta svg{color:var(--ink-3);}

/* ---------- el cliente contesta: preguntas, comentarios, respuestas ---------- */
.pregunta{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);
  box-shadow:var(--sombra-corta);overflow:hidden;}
.pregunta .ph{display:flex;align-items:flex-start;gap:12px;padding:17px 20px 0;}
.pregunta .ph .pn{font-family:var(--f-mono);font-size:12px;color:var(--cloud);background:var(--codigo);
  border-radius:var(--r-sm);padding:3px 8px;flex:0 0 auto;margin-top:1px;}
.pregunta .ph h3{font-size:16px;flex:1;}
.pregunta .pc{padding:12px 20px 14px;font-size:13.5px;color:var(--ink-2);max-width:98ch;}
.pregunta .pc p{margin-top:7px;}
.pregunta .pc b{color:var(--ink);}
.opts{border-top:1px solid var(--line);}
.opt{display:grid;grid-template-columns:22px 1fr;gap:12px;padding:12px 20px;
  border-bottom:1px solid var(--line-soft);align-items:start;cursor:pointer;
  transition:background .12s;}
.opt:hover{background:var(--card-2);}
.opt.rec{background:var(--ok-soft);}
.opt.rec:hover{background:var(--ok-soft);}
.opt input[type=radio]{width:15px;height:15px;accent-color:var(--accent);cursor:pointer;margin:2px 0 0;}
.opt .ot{font-size:13px;color:var(--ink-2);}
.opt .ot b{color:var(--ink);}
.opt .ot .ok-l{font-family:var(--f-mono);color:var(--accent);margin-right:4px;}
.opt.otra .ot{color:var(--ink-3);}
.chip.rec{background:var(--ok-soft);color:var(--ok);}
.chip.empty{background:var(--dead-soft);color:var(--dead);font-weight:400;}
.chip.warn{background:var(--warn-soft);color:var(--warn);}
.pregunta .cmt{margin:12px 20px 18px;width:calc(100% - 40px);}
textarea.cmt{width:100%;font-family:var(--f);font-size:13px;line-height:1.5;color:var(--ink);
  background:var(--card);border:1px solid var(--line);border-radius:var(--r-md);padding:10px 12px;
  resize:vertical;display:block;}
textarea.cmt::placeholder{color:var(--ink-3);}
textarea.cmt:focus{outline:2px solid var(--cloud);outline-offset:1px;border-color:var(--accent);}
textarea.cmt.lleno{border-color:var(--accent);}
.obs{background:var(--card);border:1px dashed var(--line);border-radius:var(--r-lg);padding:15px 19px;}
.obs .sec-head{padding-top:0;margin-bottom:9px;}
.obs .sec-head h3{font-size:14.5px;}
.obs textarea.cmt{background:var(--bg);}

/* pasos numerados («cómo se contesta») */
.flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:13px;}
.step{background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);
  padding:16px 18px;box-shadow:var(--sombra-corta);display:flex;gap:12px;align-items:flex-start;}
.step .sn{font-family:var(--f-mono);font-size:12px;font-weight:700;color:var(--cloud);background:var(--codigo);
  border-radius:var(--r-sm);padding:3px 7px;flex:0 0 auto;}
.step .sa{display:block;font-size:13.5px;font-weight:700;}
.step .sm{display:block;font-size:12.5px;color:var(--ink-2);margin-top:3px;}
.step .sw{display:inline-block;margin-top:8px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;
  color:var(--accent);}

/* panel «vuestras respuestas» */
.btnrow{display:flex;flex-wrap:wrap;gap:9px;}
.btn{font:700 13px/1 var(--f);padding:10px 16px;border-radius:var(--r-md);cursor:pointer;
  border:1px solid var(--line);background:var(--card);color:var(--ink);transition:background .12s,color .12s;}
.btn:hover{background:var(--card-2);}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--interfaz);}
.btn.primary:hover{background:var(--flujo);}
.btn.ghost{background:none;color:var(--ink-3);}
.btn.hecho{background:var(--ok);border-color:var(--ok);color:var(--interfaz);}
textarea.out{width:100%;font-family:var(--f-mono);font-size:12px;line-height:1.5;color:var(--ink);
  background:var(--card);border:1px solid var(--line);border-radius:var(--r-lg);padding:14px 16px;
  resize:vertical;display:block;min-height:280px;}
textarea.out:focus{outline:2px solid var(--cloud);outline-offset:1px;}
@media print{ .opts,.cmt,.obs,.btnrow,textarea.out{display:none !important;} }

/* ---------- modo embebido (?embed=1) ----------
   Dentro de CRM Studio el rail del documento sobra: ya hay uno. Se oculta y sus
   secciones pasan a una barra de pestañas horizontal encima del contenido. Un
   rail (el de la app) y una barra (la del documento): cada nivel hace un
   trabajo y no compiten. */
[data-embed="1"] .rail,
[data-embed="1"] .topbar{display:none !important;}
[data-embed="1"] .shell{grid-template-columns:1fr;min-height:0;}
[data-embed="1"] body{background:transparent;}
[data-embed="1"] .wrap{padding:0 0 32px;max-width:none;}
[data-embed="1"] .hero{border-radius:var(--r-lg);}

/* El .nav se MUEVE aquí con JS: son los mismos botones, así que no hay dos
   navegaciones que mantener sincronizadas. */
.nav.horizontal{position:sticky;top:0;z-index:4;display:flex;flex-direction:row;flex-wrap:wrap;
  gap:3px;padding:8px;margin:0 0 18px;background:var(--card);border:1px solid var(--line);
  border-radius:var(--r-lg);box-shadow:var(--sombra-corta);}
.nav.horizontal .grupo{width:100%;padding:3px 6px 5px;color:var(--ink-3);}
.nav.horizontal button{width:auto;padding:7px 12px;color:var(--ink-2);}
.nav.horizontal button:hover{background:var(--accent-soft);color:var(--ink);}
.nav.horizontal button[aria-selected="true"]{background:var(--accent);color:var(--interfaz);}
.nav.horizontal button[aria-selected="true"] .n{color:var(--cloud);}
.nav.horizontal .n{color:var(--ink-3);}
.nav.horizontal .txt{flex:0 0 auto;}
/* Cuando se embebe un solo entregable, su grupo ya lo dice el rail de la app */
.nav.horizontal.un-grupo .grupo{display:none;}

/* ?solo=<id> — un único panel, sin portada ni navegación: el documento deja de
   comportarse como documento y pasa a ser contenido de quien lo embebe. */
[data-solo="1"] .nav,
[data-solo="1"] .hero{display:none !important;}
[data-solo="1"] .wrap{padding:0 0 24px;}

@media (max-width:980px){
  .shell{grid-template-columns:1fr;}
  .rail{position:static;height:auto;}
  .wrap{padding:18px;}
  .hero{padding:20px;}
}
@media print{
  .rail,.topbar{display:none;}
  .shell{grid-template-columns:1fr;}
  .panel[hidden]{display:flex !important;}
  .wrap{padding:0;max-width:none;}
  .hero,.stat,.nota,.rule,.tw,.principio{break-inside:avoid;box-shadow:none;}
}
`

/* ---------- render ---------- */

export function render({ meta, panels, titulo, claveTab, claveEstado, progLabel = 'Progreso', extra = {},
                         observaciones = false }) {
  let nCk = 0
  const ck = (id) => { nCk++; return `<td class="tick"><input type="checkbox" id="k-${id}"></td>` }
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const plano = (h) => String(h ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

  // Las preguntas se van apuntando según se renderizan: el índice, el panel de
  // respuestas y el script del documento las necesitan todas juntas.
  const QS = []
  let hayRespuestas = false
  let critLabel = 'bloquea', noCritLabel = 'puede esperar'

  const stats = (items) => `<div class="stats">${items.map(s =>
    `<div class="stat"><span class="v">${s.v}</span><span class="k">${s.k}</span><span class="h">${s.h}</span></div>`
  ).join('')}</div>`

  const tabla = ({ cap, cols, rows, tick }) => {
    const head = (tick ? '<th class="tick"></th>' : '') + cols.map(c => `<th>${c.h}</th>`).join('')
    const body = rows.map((r, i) => {
      const tds = r.map((v, j) => `<td${j === 0 ? ' class="strong"' : ''}>${v}</td>`).join('')
      return `<tr>${tick ? ck(tick + '-' + i) : ''}${tds}</tr>`
    }).join('\n')
    return `<div class="tw">${cap ? `<div class="scroll"><table><caption>${cap}</caption>` : '<div class="scroll"><table>'}
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody></table></div></div>`
  }

  const nota = ({ tone, kicker, p }) => {
    const cls = tone === 'q' ? ' q' : tone === 'ok' ? ' ok' : tone === 'no' ? ' no' : ''
    const ic = tone === 'no' ? ICONOS.alerta : tone === 'ok' ? ICONOS.check : ICONOS.bombilla
    return `<div class="nota${cls}"><span class="nt">${svg(ic, 14)}${kicker}</span>`
      + `${p.map(x => `<p>${x}</p>`).join('')}</div>`
  }

  const sec = ({ h3, note }) =>
    `<div class="sec-head"><h3>${h3}</h3>${note ? `<p class="sec-note">${note}</p>` : ''}</div>`

  const rules = (items) => `<div class="rules">${items.map(r =>
    `<div class="rule${r.no ? ' no' : ''}"><span class="ic">${svg(r.no ? ICONOS.alerta : ICONOS.check, 16)}</span>`
    + `<span><span class="rt">${r.t}</span><span class="rd">${r.d}</span></span></div>`
  ).join('')}</div>`

  const principio = ({ kicker, texto }) =>
    `<div class="principio">${svg(ICONOS.bombilla, 21)}<div><span class="pk">${kicker}</span><strong>${texto}</strong></div></div>`

  const ruta = (pasos) => `<div class="ruta">${pasos.map((p, i) =>
    `<b>${p}</b>${i < pasos.length - 1 ? svg(ICONOS.flecha, 16) : ''}`).join('')}</div>`

  /* --- lo que contesta el cliente --- */

  // Cuadro de texto libre. id → textarea#cmt-<id>; label es cómo sale en el texto copiado.
  const cmt = ({ id, label, rows = 2, placeholder = 'Matices, condiciones, o vuestra propia respuesta…' }) =>
    `<textarea class="cmt" id="cmt-${id}" data-lbl="${esc(label)}" rows="${rows}" placeholder="${esc(placeholder)}"></textarea>`

  // { n, crit, h, cuerpo:[html…], ops:[{k,t,rec}] | ['<b>A ·</b> …'], rec:'A', otra:true, comentario:true }
  const pregunta = (b) => {
    const n = b.n ?? (QS.length + 1)
    const ops = b.ops.map((o, i) => {
      if (typeof o === 'string') {
        // Admite el formato de CEEI: '<b>A · Título.</b> Explicación' o '<b>A ·</b> Explicación'.
        // La letra se quita del texto porque la pinta el propio bloque.
        const k = (o.match(/<b>\s*([A-Z])\s*[·.)-]/) || [])[1] || String.fromCharCode(65 + i)
        const t = o.replace(/<b>\s*[A-Z]\s*[·.)-]\s*/, '<b>').replace(/^<b>\s*<\/b>\s*/, '')
        return { k, t, rec: k === b.rec }
      }
      return { k: o.k || String.fromCharCode(65 + i), t: o.t, rec: o.rec || o.k === b.rec }
    })
    QS.push({ n, crit: !!b.crit, t: plano(b.h), ops: ops.map(o => ({ k: o.k, t: plano(o.t).slice(0, 200) })) })
    const chip = b.crit ? `<span class="chip no">${b.critLabel || critLabel}</span>`
                        : `<span class="chip">${b.noCritLabel || noCritLabel}</span>`
    const cuerpo = Array.isArray(b.cuerpo) ? b.cuerpo.map(x => `<p>${x}</p>`).join('') : (b.cuerpo || '')
    const opciones = ops.map(o =>
      `<label class="opt${o.rec ? ' rec' : ''}"><input type="radio" name="q${n}" value="${o.k}" data-lbl="${esc(plano(o.t).slice(0, 200))}">`
      + `<div class="ot"><span class="ok-l">${o.k}</span>${o.t}${o.rec ? ' <span class="chip rec">nuestra recomendación</span>' : ''}</div></label>`
    ).join('')
    const otra = b.otra === false ? '' :
      `<label class="opt otra"><input type="radio" name="q${n}" value="—" data-lbl="Ninguna de las anteriores">`
      + `<div class="ot"><b>Ninguna de estas.</b> Lo explicamos aquí debajo.</div></label>`
    const com = b.comentario === false ? '' : cmt({ id: `q${n}`, label: `Pregunta ${n}`, rows: 2, placeholder: b.placeholder })
    return `<section class="pregunta" id="q${n}">
  <div class="ph"><span class="pn">${n}</span><h3>${b.h}</h3>${chip}</div>
  <div class="pc">${cuerpo}</div>
  <div class="opts">${opciones}${otra}</div>
  ${com}
</section>`
  }

  // Tabla de todas las preguntas con su estado. Se rellena al final, cuando ya
  // se han renderizado todas (puede ir antes que ellas en el mismo panel).
  const indice = (b) => `<!--ND-INDICE${b.solo ? ':' + b.solo : ''}-->`
  const pintaIndice = (solo) => {
    const lista = solo === 'crit' ? QS.filter(q => q.crit) : QS
    const orden = [...lista].sort((a, b) => (b.crit - a.crit) || (a.n - b.n))
    return tabla({ cols: [{ h: 'Nº' }, { h: 'Pregunta' }, { h: 'Urgencia' }, { h: 'Vuestra respuesta' }],
      rows: orden.map(q => [
        `<span class="mono">${q.n}</span>`,
        `<a href="#q${q.n}" data-goto="q${q.n}">${esc(q.t)}</a>`,
        q.crit ? `<span class="chip no">${critLabel}</span>` : `<span class="chip">${noCritLabel}</span>`,
        `<span id="ix-q${q.n}"><span class="chip empty">pendiente</span></span>`]) })
      .replace(/<td class="strong">/g, '<td>')
  }

  // Pasos numerados: [{t, d, donde}]
  const flow = (pasos) => `<div class="flow">${pasos.map((p, i) =>
    `<div class="step"><span class="sn">${String(i + 1).padStart(2, '0')}</span><div>`
    + `<span class="sa">${p.t}</span><span class="sm">${p.d}</span>${p.donde ? `<span class="sw">${p.donde}</span>` : ''}</div></div>`
  ).join('')}</div>`

  // Qué pasa después: [{que, d, quien, cuando}] → tabla con casilla
  const pasos = (b) => tabla({ cap: b.cap, tick: b.tick || 'paso',
    cols: [{ h: 'Qué' }, { h: 'Quién' }, { h: b.colCuando || 'Cuándo' }],
    rows: b.items.map((p, i) => [
      `<span class="mono">${String(i + 1).padStart(2, '0')}</span>&nbsp; ${p.que}${p.d ? `<div style="font-weight:400;color:var(--ink-2);margin-top:3px">${p.d}</div>` : ''}`,
      p.quien, p.cuando || '—']) })

  // «¿Algo que no cuadre en esta sección?» — id del panel, label para el texto copiado
  const obs = (b) => `<div class="obs">
  <div class="sec-head"><h3>${b.h3 || '¿Algo que no cuadre en esta sección?'}</h3><p class="sec-note">${b.note || 'Se guarda solo y aparece en «Vuestras respuestas».'}</p></div>
  ${cmt({ id: `p-${b.id}`, label: b.label, rows: b.rows || 3, placeholder: b.placeholder || `Lo que haya que cambiar, quitar o añadir en «${plano(b.label)}»…` })}
</div>`

  // Panel final. { correos:['a@…'], cabecera:'RESPUESTAS DE X · Y', firma:'…', nota:[…] }
  const respuestas = (b) => {
    hayRespuestas = true
    const correos = (b.correos || []).map(c => `<b>${c}</b>`).join(' y ')
    return `<div class="stats">
  <div class="stat"><span class="v" id="r-q">0</span><span class="k">preguntas contestadas</span><span class="h">de <span id="r-qt">0</span></span></div>
  <div class="stat"><span class="v" id="r-crit">0</span><span class="k">de las que ${b.critK || 'bloquean'}</span><span class="h">de <span id="r-critt">0</span> · son las que nos dejan arrancar</span></div>
  <div class="stat"><span class="v" id="r-cmt">0</span><span class="k">comentarios escritos</span><span class="h">en preguntas y secciones</span></div>
  <div class="stat"><span class="v" id="r-ck">0</span><span class="k">puntos revisados</span><span class="h">casillas marcadas de <span id="r-ckt">0</span></span></div>
</div>
<div class="sec-head"><h3>Mandárnoslo</h3><p class="sec-note">Cualquiera de las dos vale.</p></div>
<div class="btnrow">
  <button type="button" class="btn primary" id="b-copy">Copiar todo al portapapeles</button>
  <button type="button" class="btn" id="b-dl">Descargar como fichero .txt</button>
  <button type="button" class="btn ghost" id="b-clear">Borrar todo y empezar de cero</button>
</div>
${nota({ tone: 'q', kicker: 'cómo llega hasta nosotros', p: b.nota || [
  `Este documento no manda nada solo: lo que marcáis <b>se queda en vuestro navegador</b>, en este ordenador. `
  + `Pulsad <b>Copiar</b> y pegadlo en un correo${correos ? ' a ' + correos : ''}, o descargad el fichero y adjuntadlo. `
  + `Si lo abrís en otro ordenador, empezaréis de cero: mejor que lo rellene una sola persona.`] })}
<div class="sec-head"><h3>Lo que lleváis contestado</h3></div>
<div class="tw"><div class="scroll"><table><thead><tr><th>Nº</th><th>Pregunta</th><th>Respuesta</th><th>Vuestro comentario</th></tr></thead>
<tbody id="r-tabla"></tbody></table></div></div>
<div class="sec-head"><h3>El texto que se copia</h3><p class="sec-note">Se rehace solo. Podéis retocarlo aquí antes de copiarlo.</p></div>
<textarea id="r-out" class="out" rows="20" spellcheck="false" data-cab="${esc(b.cabecera || `RESPUESTAS DE ${meta.cliente.toUpperCase()} · ${meta.sub.toUpperCase()}`)}" data-firma="${esc(b.firma || `Enviado desde «${meta.titulo}» · Neointec × ${meta.cliente}`)}"></textarea>`
  }

  function bloque(b) {
    if (extra[b.t]) return extra[b.t](b, { tabla, stats, nota, sec, rules, svg, ICONOS, pregunta, cmt, obs, flow, pasos, esc })
    switch (b.t) {
      case 'stats': return stats(b.items)
      case 'tabla': return tabla(b)
      case 'nota': return nota(b)
      case 'sec': return sec(b)
      case 'rules': return rules(b.items)
      case 'principio': return principio(b)
      case 'ruta': return ruta(b.pasos)
      case 'html': return b.html
      case 'pregunta': return pregunta(b)
      case 'indice': return indice(b)
      case 'flow': return flow(b.pasos)
      case 'pasos': return pasos(b)
      case 'obs': return obs(b)
      case 'cmt': return cmt(b)
      case 'respuestas': return respuestas(b)
      default: throw new Error('bloque desconocido: ' + b.t)
    }
  }

  /* --- paneles y navegación --- */
  const conObs = (p) => {
    if (p.obs === false) return false
    if (p.obs) return true
    if (!observaciones) return false
    return !p.blocks.some(b => b.t === 'respuestas' || b.t === 'obs')
  }
  let panelsHtml = panels.map((p, i) => `<div class="panel" id="p-${p.id}" role="tabpanel" aria-labelledby="t-${p.id}"${i ? ' hidden' : ''}>
  <div class="panel-head"><h2>${p.h2}</h2><p>${p.lede}</p></div>
  ${p.blocks.map(bloque).join('\n  ')}
  ${conObs(p) ? obs({ id: p.id, label: p.label, placeholder: typeof p.obs === 'string' ? p.obs : undefined }) : ''}
</div>`).join('\n\n')
  panelsHtml = panelsHtml.replace(/<!--ND-INDICE(?::(\w+))?-->/g, (_, solo) => pintaIndice(solo))

  const grupos = []
  for (const p of panels) {
    const g = grupos.find(x => x.name === p.grupo)
    if (g) g.items.push(p); else grupos.push({ name: p.grupo, items: [p] })
  }
  let num = 0
  const nav = grupos.map(g => `<span class="grupo">${g.name}</span>` + g.items.map(p => {
    const icono = ICONOS[p.icono] || ICONOS[POR_DEFECTO[num % POR_DEFECTO.length]]
    num++
    return `<button role="tab" id="t-${p.id}" aria-controls="p-${p.id}" aria-selected="${num === 1 ? 'true' : 'false'}">`
      + `<span class="n">${String(num).padStart(2, '0')}</span>${svg(icono, 16)}<span class="txt">${p.label}</span></button>`
  }).join('')).join('')

  const sigla = (meta.sigla || meta.cliente.replace(/[^A-Za-zÁÉÍÓÚÑ]/g, '').slice(0, 2)).toUpperCase()
  const est = meta.estado
  const hechos = (meta.hechos || []).map(h =>
    `<article><span class="ic">${svg(ICONOS[h.icono] || ICONOS.capas, 18)}</span>`
    + `<div><strong>${h.v}</strong><span>${h.k}</span></div></article>`).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,700;1,9..40,400&family=DM+Mono:wght@400&display=swap">
<style>${CSS}</style>
</head>
<body>

<div class="shell">
  <aside class="rail">
    <div class="marca">
      <img class="logo-light" src="${LOGOS.dark}" alt="Neointec">
      <div class="cliente">
        <span class="fila"><span class="sigla">${sigla}</span><strong>${meta.cliente}</strong></span>
        <span class="sub">${meta.sub}</span>
      </div>
    </div>
${est ? `    <div class="estado${est.tono === 'alerta' ? ' alerta' : ''}"><span class="pulso"></span> ${est.texto}</div>` : ''}
    <nav class="nav" role="tablist" aria-label="Secciones">${nav}</nav>
    <div class="rail-pie">
      <div class="prog">
        <span class="pk">${progLabel}</span>
        <span class="pv"><span id="cn">0</span> / ${nCk}</span>
        <span class="pt"><span class="pf" id="cf"></span></span>
      </div>
      <div class="fuentes">${svg(ICONOS.base, 15)}<div><strong>Leído de</strong>
        ${meta.pie.map(c => `<code>${c}</code>`).join('\n        ')}</div></div>
    </div>
  </aside>

  <main>
    <header class="topbar">
      <div class="tt">
        <span>${meta.cliente.toUpperCase()} — ${meta.sub}</span>
        <small>Consultoría Neointec · ${meta.kicker}</small>
      </div>
      ${meta.fuentes.map(f => `<span class="dist">${svg(ICONOS.check, 13)} <b>${f.b}</b>&nbsp;${f.s}</span>`).join('\n      ')}
    </header>

    <div class="wrap">
      <div class="hero">
        <div class="hero-marca"><span class="sigla">${sigla}</span><span>${meta.kicker}</span></div>
        ${meta.version ? `<span class="eti">${meta.version}</span>` : ''}
        <h1>${meta.titulo}</h1>
        <p class="lede">${meta.lede}</p>
        ${(meta.tags || []).length ? `<div class="tags">${meta.tags.map(t => `<span>${t}</span>`).join('')}</div>` : ''}
        ${hechos ? `<div class="hechos">${hechos}</div>` : ''}
      </div>

${panelsHtml}
    </div>
  </main>
</div>

<script>
(function(){
  // --- modo embebido: ?embed=1 [&grupo=<nombre>] ---
  // Se resuelve antes de tocar las pestañas para que el filtro de grupo ya esté
  // aplicado cuando se decida cuál queda seleccionada.
  // --- parámetros de la URL: ?embed=1  ?grupo=<nombre>  ?solo=<panel> ---
  // Los tres son independientes: se puede filtrar por entregable con el rail
  // puesto (modo foco) o sin él (dentro de la app).
  var q = new URLSearchParams(location.search);
  var nav = document.querySelector('.nav');
  var wrap = document.querySelector('.wrap');

  if (q.get('embed') === '1') {
    document.documentElement.dataset.embed = '1';
    if (nav && wrap) {
      nav.classList.add('horizontal');
      wrap.insertBefore(nav, wrap.firstChild);   // los MISMOS botones, movidos
    }
  }

  var g = q.get('grupo');
  if (g && nav) {
    // Deja solo un entregable: sus botones y, por tanto, sus paneles.
    var dentro = false;
    Array.prototype.slice.call(nav.children).forEach(function(el){
      if (el.classList.contains('grupo')) {
        dentro = el.textContent.trim() === g;
        el.hidden = document.documentElement.dataset.embed === '1';
      } else if (el.tagName === 'BUTTON') {
        el.hidden = !dentro;
      }
    });
    nav.classList.add('un-grupo');
  }

  var solo = q.get('solo');
  if (solo) {
    document.documentElement.dataset.solo = '1';
    // La navegación sigue en el DOM con sus manejadores; solo queda oculta.
    var uno = document.getElementById('t-' + solo);
    if (uno) Array.prototype.slice.call(document.querySelectorAll('[role="tab"]')).forEach(function(t){
      var on = t === uno;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      var pa = document.getElementById(t.getAttribute('aria-controls'));
      if (pa) pa.hidden = !on;
    });
  }

  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  var TKEY = '${claveTab}';
  function show(id, store){
    tabs.forEach(function(t){
      var on = t.id === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    if (store) { try { localStorage.setItem(TKEY, id); } catch (e) {} }
  }
  tabs.forEach(function(t, i){
    t.addEventListener('click', function(){ show(t.id, true); window.scrollTo({top:0}); });
    t.addEventListener('keydown', function(e){
      var d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1
            : e.key === 'ArrowUp'   || e.key === 'ArrowLeft'  ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      var nx = tabs[(i + d + tabs.length) % tabs.length];
      nx.focus(); show(nx.id, true); window.scrollTo({top:0});
    });
  });
  var saved = null;
  try { saved = localStorage.getItem(TKEY); } catch (e) {}
  var guardada = saved && document.getElementById(saved);
  if (solo) { /* manda la URL */ }
  else if (guardada && !guardada.hidden) show(saved, false);
  else { var pri = tabs.filter(function(t){ return !t.hidden })[0]; if (pri) show(pri.id, false); }

  var KEY = '${claveEstado}';
  var st = {};
  try { st = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  function guarda(){ try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  var checks = Array.prototype.slice.call(document.querySelectorAll('input[type=checkbox]'));
  var cn = document.getElementById('cn'), cf = document.getElementById('cf');
  function pinta(){
    var n = 0;
    checks.forEach(function(b){
      var fila = b.closest('tr');
      if (fila) fila.classList.toggle('hecha', b.checked);
      if (b.checked) n++;
    });
    if (cn) cn.textContent = n;
    if (cf) cf.style.width = checks.length ? (n / checks.length * 100) + '%' : '0';
  }
  checks.forEach(function(b){
    if (st[b.id]) b.checked = true;
    b.addEventListener('change', function(){ st[b.id] = b.checked; guarda(); pinta(); });
  });

  // ---------- lo que contesta el cliente ----------
  var QS = ${JSON.stringify(QS)};
  var radios = Array.prototype.slice.call(document.querySelectorAll('input[type=radio]'));
  var textos = Array.prototype.slice.call(document.querySelectorAll('textarea.cmt'));
  radios.forEach(function(r){
    if (st['rd:' + r.name] === r.value) r.checked = true;
    r.addEventListener('change', function(){ st['rd:' + r.name] = r.value; guarda(); pinta(); });
  });
  textos.forEach(function(t){
    if (st['tx:' + t.id]) { t.value = st['tx:' + t.id]; t.classList.add('lleno'); }
    t.addEventListener('input', function(){
      st['tx:' + t.id] = t.value;
      t.classList.toggle('lleno', !!t.value.trim());
      guarda(); pinta();
    });
  });
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[data-goto]') : null;
    if (!a) return;
    e.preventDefault();
    var el = document.getElementById(a.getAttribute('data-goto'));
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function opcion(n){
    var el = document.querySelector('input[name="q' + n + '"]:checked');
    return el ? { k: el.value, t: el.getAttribute('data-lbl') || '' } : null;
  }
  function comentario(id){ return (st['tx:cmt-' + id] || '').trim(); }
  var out = document.getElementById('r-out');
  var RAYA = '============================================================';
  function texto(){
    var L = [];
    var hechas = QS.filter(function(q){ return !!opcion(q.n); });
    var crit = QS.filter(function(q){ return q.crit; });
    var critH = crit.filter(function(q){ return !!opcion(q.n); });
    L.push(out ? out.getAttribute('data-cab') : 'RESPUESTAS');
    L.push('Enviado el ' + new Date().toLocaleString('es-ES'));
    if (QS.length) L.push(hechas.length + ' de ' + QS.length + ' preguntas contestadas'
      + (crit.length ? ' · ' + critH.length + ' de ' + crit.length + ' de las que bloquean' : ''));
    if (QS.length) {
      L.push(''); L.push(RAYA); L.push('LAS PREGUNTAS'); L.push(RAYA);
      QS.forEach(function(q){
        var o = opcion(q.n), c = comentario('q' + q.n);
        L.push('');
        L.push(q.n + ' · ' + q.t + (q.crit ? '   [BLOQUEA]' : ''));
        L.push('   Respuesta: ' + (o ? (o.k === '\\u2014' ? 'ninguna de las propuestas' : 'opción ' + o.k + ' — ' + o.t) : 'SIN CONTESTAR'));
        if (c) L.push('   Comentario: ' + c.replace(/\\n/g, '\\n               '));
      });
    }
    var obs = textos.filter(function(t){ return t.id.indexOf('cmt-q') !== 0 && (t.value || '').trim(); });
    L.push(''); L.push(RAYA); L.push('OBSERVACIONES POR SECCIÓN'); L.push(RAYA);
    if (!obs.length) L.push('(ninguna)');
    obs.forEach(function(t){
      L.push('');
      L.push('· ' + t.getAttribute('data-lbl'));
      L.push('   ' + t.value.trim().replace(/\\n/g, '\\n   '));
    });
    if (checks.length) {
      var n = checks.filter(function(b){ return b.checked; }).length;
      L.push(''); L.push(RAYA); L.push('REVISIÓN DEL DETALLE'); L.push(RAYA);
      L.push(n + ' de ' + checks.length + ' puntos marcados como revisados y conformes.');
    }
    L.push('');
    L.push('-- ' + (out ? out.getAttribute('data-firma') : 'Neointec') + ' --');
    return L.join('\\n');
  }
  function set(id, v){ var e = document.getElementById(id); if (e) e.textContent = v; }
  function pintaRespuestas(){
    var hechas = QS.filter(function(q){ return !!opcion(q.n); }).length;
    var crit = QS.filter(function(q){ return q.crit; });
    var critH = crit.filter(function(q){ return !!opcion(q.n); }).length;
    var nck = checks.filter(function(b){ return b.checked; }).length;
    var ncm = textos.filter(function(t){ return (t.value || '').trim(); }).length;
    set('r-q', hechas); set('r-qt', QS.length); set('r-crit', critH); set('r-critt', crit.length);
    set('r-cmt', ncm); set('r-ck', nck); set('r-ckt', checks.length);
    QS.forEach(function(q){
      var c = document.getElementById('ix-q' + q.n); if (!c) return;
      var o = opcion(q.n);
      c.innerHTML = o ? '<span class="chip rec">' + (o.k === '\\u2014' ? 'otra' : o.k) + '</span>'
                      : '<span class="chip empty">pendiente</span>';
    });
    var tabla = document.getElementById('r-tabla');
    if (tabla) tabla.innerHTML = QS.map(function(q){
      var o = opcion(q.n), c = comentario('q' + q.n);
      return '<tr><td class="mono">' + q.n + '</td><td class="strong">' + q.t
        + (q.crit ? ' <span class="chip no">bloquea</span>' : '') + '</td><td>'
        + (o ? '<span class="chip rec">' + (o.k === '\\u2014' ? 'ninguna' : o.k) + '</span> ' + o.t.replace(/</g, '&lt;')
             : '<span class="chip empty">sin contestar</span>')
        + '</td><td>' + (c ? c.replace(/</g, '&lt;') : '<span style="color:var(--ink-3)">—</span>') + '</td></tr>';
    }).join('');
    if (out && document.activeElement !== out) out.value = texto();
  }
  var pintaBase = pinta;
  pinta = function(){ pintaBase(); pintaRespuestas(); };

  function flash(b, t){
    var prev = b.textContent;
    b.textContent = t; b.classList.add('hecho');
    setTimeout(function(){ b.textContent = prev; b.classList.remove('hecho'); }, 2200);
  }
  var bc = document.getElementById('b-copy');
  if (bc) bc.addEventListener('click', function(){
    out.value = out.value || texto();
    var ok = false;
    // En file:// no hay navigator.clipboard (no es contexto seguro): execCommand primero.
    try { out.focus(); out.select(); ok = document.execCommand('copy'); } catch (e) {}
    if (!ok && navigator.clipboard) {
      navigator.clipboard.writeText(out.value).then(function(){ flash(bc, '✓ Copiado'); },
        function(){ flash(bc, 'Copiadlo del cuadro de abajo'); });
      return;
    }
    flash(bc, ok ? '✓ Copiado' : 'Copiadlo del cuadro de abajo');
  });
  var bd = document.getElementById('b-dl');
  if (bd) bd.addEventListener('click', function(){
    var blob = new Blob([out.value || texto()], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'respuestas-' + new Date().toISOString().slice(0, 10) + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
    flash(bd, '✓ Descargado');
  });
  var bx = document.getElementById('b-clear');
  if (bx) bx.addEventListener('click', function(){
    if (!confirm('Se borra todo lo marcado y escrito en este documento. ¿Seguimos?')) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  });

  pinta();
})();
</script>
</body>
</html>
`

  return { html, casillas: nCk, paneles: panels.length, preguntas: QS.length, respuestas: hayRespuestas }
}
