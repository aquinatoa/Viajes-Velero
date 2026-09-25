// Ejecuta el JS del entregable contra un DOM de mentira y contesta como un cliente.
// No sustituye a abrirlo en el navegador, pero pilla lo que no se ve: un script que
// no arranca (y entonces NADA funciona: ni pestañas, ni casillas, ni Copiar).
// Uso: node simula.mjs <ruta-del-html>
import fs from 'node:fs'
import vm from 'node:vm'

const RUTA = process.argv[2]
if (!RUTA) { console.error('Uso: node simula.mjs <ruta-del-html>'); process.exit(2) }
const H = fs.readFileSync(RUTA, 'utf8')
const scripts = [...H.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])

const attrsDe = (tag) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]))

class El {
  constructor(tag, attrs = {}) {
    this.tag = tag; this.attrs = attrs; this.value = ''; this.checked = false
    this.textContent = ''; this.innerHTML = ''; this.hidden = false; this.href = ''
    this.style = {}; this.dataset = {}; this.children = []; this.listeners = {}
    this.id = attrs.id || ''; this.name = attrs.name || ''
    this.classList = { _s: new Set((attrs.class || '').split(' ').filter(Boolean)),
      add(...c) { c.forEach(x => this._s.add(x)) }, remove(...c) { c.forEach(x => this._s.delete(x)) },
      toggle(c, v) { v ? this._s.add(c) : this._s.delete(c) }, contains(c) { return this._s.has(c) } }
  }
  getAttribute(k) { return this.attrs[k] ?? null }
  setAttribute(k, v) { this.attrs[k] = v }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f) }
  fire(t) { (this.listeners[t] || []).forEach(f => f.call(this, { preventDefault() {}, target: this, key: '' })) }
  focus() { doc.activeElement = this }
  select() {} scrollIntoView() {} closest() { return null } insertBefore() {} appendChild() {} remove() {}
  click() { this.fire('click') }
}

const els = []
const add = (tag, attrs) => { const e = new El(tag, attrs); els.push(e); return e }
for (const m of H.matchAll(/<input [^>]*type="checkbox"[^>]*>/g)) add('input', attrsDe(m[0]))
for (const m of H.matchAll(/<input [^>]*type="radio"[^>]*>/g)) { const a = attrsDe(m[0]); const e = add('input', a); e.value = a.value }
for (const m of H.matchAll(/<textarea [^>]*>/g)) add('textarea', attrsDe(m[0]))
for (const m of H.matchAll(/<button [^>]*>/g)) add('button', attrsDe(m[0]))
for (const m of H.matchAll(/<div class="panel" id="([^"]+)"/g)) add('div', { id: m[1], class: 'panel' })
for (const m of H.matchAll(/<span id="(ix-q\d+)"/g)) add('span', { id: m[1] })
for (const id of ['cn', 'cf', 'r-q', 'r-qt', 'r-crit', 'r-critt', 'r-cmt', 'r-ck', 'r-ckt', 'r-tabla'])
  if (!els.some(e => e.id === id)) add('span', { id })
const nav = add('nav', { class: 'nav' }), wrap = add('div', { class: 'wrap' })

const doc = {
  activeElement: null, documentElement: { dataset: {} }, body: { appendChild() {} },
  querySelectorAll(sel) {
    if (sel === '[role="tab"]') return els.filter(e => e.attrs.role === 'tab')
    if (sel === 'input[type=checkbox]') return els.filter(e => e.attrs.type === 'checkbox')
    if (sel === 'input[type=radio]') return els.filter(e => e.attrs.type === 'radio')
    if (sel === 'textarea.cmt') return els.filter(e => e.classList.contains('cmt'))
    const mm = sel.match(/^input\[name="(.+)"\]:checked$/)
    if (mm) return els.filter(e => e.attrs.type === 'radio' && e.name === mm[1] && e.checked)
    return []
  },
  querySelector(sel) { if (sel === '.nav') return nav; if (sel === '.wrap') return wrap; return this.querySelectorAll(sel)[0] || null },
  getElementById(id) { return els.find(e => e.id === id) || null },
  addEventListener() {}, createElement(t) { return new El(t) },
}
const store = new Map()
const ctx = {
  document: doc, console, URLSearchParams,
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  window: { scrollTo() {}, addEventListener() {} }, navigator: {}, location: { search: '', reload() {} }, confirm: () => false,
  setTimeout: () => 0, Blob: class {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  Date, JSON, Object, Array, String, Number, Math, RegExp, Error, parseInt,
}
ctx.globalThis = ctx
vm.createContext(ctx)

try {
  for (const src of scripts) vm.runInContext(src, ctx, { timeout: 5000 })
  console.log('✓ el script del documento se ejecuta sin error')
} catch (e) { console.log('✗ REVIENTA:', e.message); process.exit(1) }

// --- contestar como un cliente ---
const radios = doc.querySelectorAll('input[type=radio]')
const nombres = [...new Set(radios.map(r => r.name))]
let fallos = 0
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fallos++ }

if (nombres.length) {
  // primera pregunta: la opción recomendada (o la primera); segunda: «ninguna»
  const q1 = radios.filter(r => r.name === nombres[0])
  const rec = q1.find(r => H.includes(`class="opt rec"><input type="radio" name="${r.name}" value="${r.value}"`)) || q1[0]
  rec.checked = true; rec.fire('change')
  if (nombres[1]) { const otra = radios.find(r => r.name === nombres[1] && r.value === '—'); if (otra) { otra.checked = true; otra.fire('change') } }
  const c = doc.getElementById('cmt-' + nombres[0]); if (c) { c.value = 'Comentario de prueba.\nSegunda línea.'; c.fire('input') }
}
const obs = els.find(e => e.tag === 'textarea' && e.id.startsWith('cmt-p-'))
if (obs) { obs.value = 'Observación de sección de prueba.'; obs.fire('input') }
const checks = doc.querySelectorAll('input[type=checkbox]')
checks.slice(0, 3).forEach(b => { b.checked = true; b.fire('change') })

console.log(`\n--- ${nombres.length} preguntas · ${checks.length} casillas · ${els.filter(e => e.tag === 'textarea' && e.classList.contains('cmt')).length} cuadros de texto ---`)
console.log('  contador de casillas:', doc.getElementById('cn').textContent, '| r-q:', doc.getElementById('r-q').textContent,
  '| r-crit:', doc.getElementById('r-crit').textContent, '| r-cmt:', doc.getElementById('r-cmt').textContent)

const out = doc.getElementById('r-out')
if (out) {
  const t = out.value
  console.log('\n--- primeras 25 líneas del texto que se copia ---')
  console.log(t.split('\n').slice(0, 25).map(l => '  │ ' + l).join('\n'))
  console.log('\n--- comprobaciones ---')
  ok(t.includes('\n'), 'saltos de línea reales (si no, los \\n del template literal se han comido)')
  ok(!nombres.length || t.includes('opción'), 'la respuesta marcada aparece')
  ok(!nombres[1] || t.includes('ninguna de las propuestas'), '«ninguna de estas» aparece como tal')
  ok(!nombres.length || t.includes('Comentario de prueba'), 'el comentario de la pregunta aparece')
  ok(!obs || t.includes('Observación de sección de prueba'), 'la observación de sección aparece')
  ok(!checks.length || t.includes('3 de ' + checks.length), 'el recuento de casillas es correcto')
  ok(!t.includes('undefined') && !t.includes('null'), 'sin undefined ni null en el texto')
} else {
  console.log('\n(no hay panel de respuestas: solo casillas)')
  ok(String(doc.getElementById('cn').textContent) === String(Math.min(3, checks.length)), 'el contador de casillas cuenta bien')
}
console.log(fallos ? `\n✗ ${fallos} comprobaciones fallan` : '\n✓ todo en orden')
process.exit(fallos ? 1 : 0)
