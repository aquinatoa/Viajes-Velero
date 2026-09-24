// Genera el plan de acción de la consola de Oravia.
// Diseño: lenguaje D (nd-doc.mjs), el mismo de la auditoría de Exotec.
// Uso: node gen.mjs   →  ../../PLAN-ACCION-Oravia.html
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { META, PANELS } from './datos.mjs'
import { render } from './nd-doc.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(here, '..', '..', 'PLAN-ACCION-Oravia.html')

const { html, casillas, paneles } = render({
  meta: META,
  panels: PANELS,
  titulo: 'Plan de acción · Consola Oravia',
  claveTab: 'oravia-plan-tab',
  claveEstado: 'oravia-plan',
  progLabel: 'tareas hechas',
})

writeFileSync(SALIDA, html, 'utf8')
console.log('Escrito:', SALIDA)
console.log('Paneles:', paneles, '| casillas:', casillas, '| tamaño:', (html.length / 1024).toFixed(0) + ' KB')

// Y una copia lista para publicar como artefacto, que se envuelve sola en su
// propio <html>. Se le quita el armazón y se deja el <title>, las fuentes, el
// <style> y el cuerpo: el mismo documento, sin duplicar la cabecera.
const cabeza = html.slice(html.indexOf('<title>'), html.indexOf('</head>'))
const cuerpo = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'))
writeFileSync(join(here, 'plan-artefacto.html'), cabeza + cuerpo, 'utf8')
console.log('Artefacto:', join(here, 'plan-artefacto.html'))
