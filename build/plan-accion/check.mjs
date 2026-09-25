// Red de seguridad: comprueba que TODO lo que hay en la fuente aparece en el HTML.
// El cliente valida lo que ve; lo que no está, no se valida. Adaptar las tres
// listas de abajo a la fuente real del entregable (campos del CRM, columnas de
// los Excel, preguntas…). Si sale «ausentes: 0» en todas, el documento está completo.
// Uso: node check.mjs <ruta-del-html>
import fs from 'node:fs'
import { PANELS } from './datos.mjs'

const RUTA = process.argv[2]
if (!RUTA) { console.error('Uso: node check.mjs <ruta-del-html>'); process.exit(2) }
const H = fs.readFileSync(RUTA, 'utf8')

// Trocea el HTML por paneles para poder buscar dentro del panel que toca.
const marcas = [...H.matchAll(/<div class="panel" id="p-([^"]+)"/g)]
const panel = {}
marcas.forEach((m, i) => { panel[m[1]] = H.slice(m.index, i + 1 < marcas.length ? marcas[i + 1].index : H.length) })

let fallos = 0
function cubre(nombre, idPanel, elementos, busca = x => `>${x}<`) {
  const sec = panel[idPanel] || ''
  if (!sec) { console.log(`✗ FALTA EL PANEL «${idPanel}» (${nombre})`); fallos++; return }
  const ausentes = elementos.filter(x => !sec.includes(busca(x)))
  console.log(`${ausentes.length ? '✗' : '✓'} ${nombre}: ${elementos.length} | ausentes: ${ausentes.length}`)
  ausentes.forEach(x => console.log('    -', x))
  fallos += ausentes.length
}

/* ---------- adaptar a la fuente real ----------
   Ejemplo con un volcado del CRM:
   const FIELDS = JSON.parse(fs.readFileSync('fields.json', 'utf8'))
   for (const m of ['Leads', 'Contacts']) cubre(`campos de ${m}`, 'm' + m, FIELDS[m].map(f => f.api_name))
   Ejemplo con columnas de un Excel:
   cubre('columnas del fichero X', 'ficheros', COLUMNAS.map(c => c.replace(/&/g, '&amp;')))
*/

// Las preguntas siempre: cada {t:'pregunta'} de datos.mjs debe estar en su panel.
for (const p of PANELS) {
  const qs = p.blocks.filter(b => b.t === 'pregunta')
  if (qs.length) cubre(`preguntas de «${p.label}»`, p.id, qs.map(q => `id="q${q.n}"`), x => x)
}

console.log(`paneles: ${marcas.length} → ${marcas.map(m => m[1]).join(' · ')}`)
console.log(fallos ? `\n✗ faltan ${fallos} elementos` : '\n✓ cobertura completa')
process.exit(fallos ? 1 : 0)
