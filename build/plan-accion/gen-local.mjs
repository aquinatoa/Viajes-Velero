// Genera el recorrido guiado en local de la consola de Oravia.
// Diseño: lenguaje D (nd-doc.mjs), el mismo de la auditoría de Exotec.
// Uso: node gen.mjs   →  ../../RECORRIDO-LOCAL-Oravia.html
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { META, PANELS } from './datos-local.mjs'
import { render } from './nd-doc.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(here, '..', '..', 'RECORRIDO-LOCAL-Oravia.html')

const { html, casillas, paneles } = render({
  meta: META,
  panels: PANELS,
  titulo: 'Recorrido local · Consola Oravia',
  claveTab: 'oravia-local-tab',
  claveEstado: 'oravia-local',
  progLabel: 'paradas comprobadas',
})

writeFileSync(SALIDA, html, 'utf8')
console.log('Escrito:', SALIDA)
console.log('Paneles:', paneles, '| casillas:', casillas, '| tamaño:', (html.length / 1024).toFixed(0) + ' KB')

// Y una copia lista para publicar como artefacto, que se envuelve sola en su
// propio <html>. Se le quita el armazón y se deja el <title>, las fuentes, el
// <style> y el cuerpo: el mismo documento, sin duplicar la cabecera.
const cabeza = html.slice(html.indexOf('<title>'), html.indexOf('</head>'))
const cuerpo = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'))
writeFileSync(join(here, 'local-artefacto.html'), cabeza + cuerpo, 'utf8')
console.log('Artefacto:', join(here, 'local-artefacto.html'))
