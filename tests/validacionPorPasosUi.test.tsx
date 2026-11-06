/**
 * Lo que se PINTA en «Lo que hemos entendido» paso a paso (maqueta C, 06/11/2026).
 *
 * No hay captura automática de pantalla, así que esta prueba renderiza las
 * piezas con los datos reales del caso del club suizo y comprueba lo que sale:
 * el aviso con su botón, lo comprobado, lo subrayado y lo que bloquea.
 *
 * Cómo correrla:  npm run test:pasos-ui
 */
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// tsx compila el JSX «clásico» (React.createElement) fuera de Vite: se le da React.
// El JSX solo se evalúa al renderizar, después de esta línea.
(globalThis as { React?: unknown }).React = React;

import { normalizarAuditoria, valoresParaAuditar } from "../src/domain/auditoriaIa";
import { CLIENTES_ESPECIALES } from "../src/domain/documentImportTypes";
import { SECCIONES, fraseDeLaPeticion } from "../src/domain/seccionesDeValidacion";
import { bloquesParaValidar, type PeticionParaValidar } from "../src/domain/validacionDeLaPeticion";
import {
  FraseDeLaPeticion,
  MensajesMarcados,
  PasoDeValidacion,
  type FilaDelPaso,
} from "../src/components/request/ValidacionPorPasos";

let pasadas = 0;
let fallidas = 0;

function prueba(nombre: string, cuerpo: () => void) {
  try {
    cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.log(`  FALLA  ${nombre}`);
    console.log(`         ${error instanceof Error ? error.message : String(error)}`);
  }
}

const CLIENTE =
  "Dear Pablo,\n\ngot a new request from FC Weinfelden-Bürglen\n\n12.03.-16.03.2027\n\n24 pax\n\nNatural Grass\n\nBungalows\n\nMSH: Mediterranean Sports Hub";
const CHAT = "de los 24 pasajeros somos 20 alumnos y 4 profesores. \n\nSoy Anthony Quinatoa, aquinatoa@neointec.com";
const TEXTOS = [
  { texto: CLIENTE, origen: "colegio" as const },
  { texto: CHAT, origen: "chat" as const },
];

const PETICION: PeticionParaValidar = {
  destinationText: "Cambrils",
  dateFrom: "2027-03-12",
  dateTo: "2027-03-16",
  participants: 20,
  teachers: 4,
  ageRangeText: "",
  regimeRequested: "de los 24 pasajeros somos 20 alumnos y 4 profesores. Soy Anthony Quinatoa,",
  categoryRequested: "",
  topePorAlumno: null,
  requisitos: ["Natural Grass", "Bungalows", "Césped natural"],
  centreName: "FC Weinfelden-Bürglen",
  email: "aquinatoa@neointec.com",
  firstName: "Anthony",
  lastName: "Quinatoa",
  opportunityName: "FC WEINFELDEN-BÜRGLEN 2027",
  canal: "SWISS_TTOO",
  departamento: "SPORTS",
};

const VALORES = valoresParaAuditar(PETICION, CLIENTES_ESPECIALES);
const BRUTO = {
  campos: {
    destino: { estado: "correcto", cita: "MSH: Mediterranean Sports Hub" },
    fechas: { estado: "correcto", cita: "12.03.-16.03.2027" },
    alumnos: { estado: "correcto", cita: "20 alumnos" },
    profesores: { estado: "correcto", cita: "4 profesores" },
    edades: { estado: "correcto" },
    regimen: { estado: "no_cuadra", cita: "de los 24 pasajeros somos 20 alumnos y 4 profesores", valorCorrecto: "", motivo: "Es una frase del chat, no un régimen." },
    categoria: { estado: "correcto" },
    presupuesto: { estado: "correcto" },
    requisitos: { estado: "no_cuadra", cita: "Natural Grass", valorCorrecto: "Natural Grass · Bungalows", motivo: "«Césped natural» repite «Natural Grass»." },
    cotizamosPara: { estado: "correcto", cita: "Destination Travelclub" },
    departamento: { estado: "correcto", cita: "FC Weinfelden-Bürglen" },
  },
};
const AUDITORIA = normalizarAuditoria(BRUTO, [CLIENTE, CHAT, "Destination Travelclub"], VALORES, CLIENTES_ESPECIALES.map((c) => c.codigo));

const FILAS = new Map(bloquesParaValidar(PETICION, CLIENTES_ESPECIALES).flatMap((b) => b.filas).map((f) => [f.que, f] as const));
const seccion = (id: string) => SECCIONES.find((s) => s.id === id)!;

function filasDe(id: string): FilaDelPaso[] {
  return seccion(id).filas.map((que) => {
    const fila = FILAS.get(que)!;
    const clave = VALORES.find((v) => v.que === que)?.clave ?? null;
    return { fila, clave, v: clave ? (AUDITORIA.veredictos[clave] ?? null) : null, cambiado: false, dejado: false };
  });
}

const NADA = () => undefined;
function paso(id: string, sobre: Partial<Parameters<typeof PasoDeValidacion>[0]> = {}) {
  return renderToStaticMarkup(
    <PasoDeValidacion
      seccion={seccion(id)}
      filas={filasDe(id)}
      confirmado={false}
      resumen=""
      falta={[]}
      pendientes={0}
      comprobando={false}
      revisadoPorIa
      foco={null}
      onFoco={NADA}
      clientes={CLIENTES_ESPECIALES}
      onAplicar={NADA}
      onDejar={NADA}
      onConfirmar={NADA}
      onCambiar={NADA}
      {...sobre}
    />,
  );
}

console.log("\nUn paso con avisos (lo de tu captura)");

prueba("«Lo que piden» enseña el régimen y los requisitos como avisos, con sus botones y su frase", () => {
  const h = paso("piden", { pendientes: 2 });
  assert.match(h, /Régimen/);
  assert.match(h, /Es una frase del chat, no un régimen/);
  assert.match(h, /Quitar este dato/);
  assert.match(h, /Usar «Natural Grass · Bungalows»/);
  assert.match(h, /Dejarlo como está/);
  assert.match(h, /El texto dice: «de los 24 pasajeros somos 20 alumnos y 4 profesores»/, "la frase, al pasar el ratón");
});

prueba("con avisos sin resolver el botón de confirmar está desactivado y dice por qué", () => {
  const h = paso("piden", { pendientes: 2 });
  assert.match(h, /<button[^>]*disabled=""[^>]*>Confirmar<\/button>/);
  assert.match(h, /2 avisos sin resolver/);
});

prueba("un paso limpio se puede confirmar, y lo comprobado lleva su ✓", () => {
  const h = paso("viaje");
  assert.doesNotMatch(h, /disabled=""/);
  assert.match(h, />Confirmar<\/button>/);
  assert.match(h, /<i>✓<\/i><small>Destino<\/small> <span>Cambrils<\/span>/, "el dato, en una línea, con su ✓");
  assert.match(h, /<small>Fechas<\/small> <span>2027-03-12 → 2027-03-16<\/span>/);
});

prueba("lo calculado por la app lo dice, y lo que no dijeron se lista aparte sin alarma", () => {
  assert.match(paso("viaje", { detalleAbierto: true }), /Noches[\s\S]*lo calcula la app/);
  assert.match(paso("grupo", { detalleAbierto: true }), /No lo han dicho: Edades/);
});

prueba("si falta lo que hace falta, no se puede confirmar y se dice qué", () => {
  const h = paso("tarifas", { falta: ["Departamento"] });
  assert.match(h, /disabled=""/);
  assert.match(h, /Falta: Departamento/);
});

prueba("sin IA, el botón dice que lo ha revisado quien cotiza, y avisa de que nadie lo ha comprobado", () => {
  const h = paso("viaje", { revisadoPorIa: false });
  assert.match(h, /He revisado esto/);
  assert.match(h, /sin comprobar/);
});

prueba("mientras la IA piensa se dice, y se puede confirmar igualmente", () => {
  const h = paso("viaje", { comprobando: true, revisadoPorIa: false });
  assert.match(h, /La IA lo está comprobando/);
  assert.doesNotMatch(h, /disabled=""/);
});

prueba("un paso confirmado se pliega en una línea con «Cambiar»", () => {
  const h = paso("viaje", { confirmado: true, resumen: "Cambrils · 2027-03-12 → 2027-03-16" });
  assert.match(h, /Cambrils · 2027-03-12 → 2027-03-16/);
  assert.match(h, /Cambiar/);
  assert.doesNotMatch(h, />Confirmar<\/button>/);
  assert.doesNotMatch(h, /cv__vcchip/, "plegado: una línea, sin chips");
});

prueba("un aviso que se ha «dejado como está» ya no sale como tarjeta, pero queda marcado", () => {
  const filas = filasDe("piden").map((f) => (f.clave === "regimen" ? { ...f, dejado: true } : f));
  const h = renderToStaticMarkup(
    <PasoDeValidacion
      seccion={seccion("piden")} filas={filas} confirmado={false} resumen="" falta={[]} pendientes={1} comprobando={false} revisadoPorIa
      foco={null} onFoco={NADA} clientes={CLIENTES_ESPECIALES} onAplicar={NADA} onDejar={NADA} onConfirmar={NADA} onCambiar={NADA}
    />,
  );
  assert.doesNotMatch(h, /Quitar este dato/);
  assert.match(h, /cv__vcchip is-aviso is-dejado|cv__vcchip is-dejado/);
  assert.match(h, /Lo has dejado como está/);
});

console.log("\nEl mensaje subrayado, la frase y los pasos");

prueba("el mensaje original se pinta entero y lo usado va subrayado; lo que no cuadra, en aviso", () => {
  const marcas = [
    { clave: "destino", cita: "MSH: Mediterranean Sports Hub", aviso: false },
    { clave: "regimen", cita: "de los 24 pasajeros somos 20 alumnos y 4 profesores", aviso: true },
  ];
  const h = renderToStaticMarkup(<MensajesMarcados textos={TEXTOS} marcas={marcas} foco={null} onFoco={NADA} />);
  assert.match(h, /<mark class="cv__vcmark">MSH: Mediterranean Sports Hub<\/mark>/);
  assert.match(h, /<mark class="cv__vcmark is-aviso">de los 24 pasajeros somos 20 alumnos y 4 profesores<\/mark>/);
  assert.match(h, /El cliente/);
  assert.match(h, /Tú, en el chat/);
  assert.match(h, /Dear Pablo/);
});

prueba("el mensaje se pinta compacto: sin una línea en blanco entre cada frase", () => {
  const h = renderToStaticMarkup(<MensajesMarcados textos={[TEXTOS[0]]} marcas={[]} foco={null} onFoco={NADA} />);
  assert.doesNotMatch(h, /\n\n/);
  assert.match(h, /Dear Pablo,\ngot a new request/);
});

prueba("al pasar el ratón por un dato, su frase se enciende", () => {
  const marcas = [{ clave: "destino", cita: "MSH: Mediterranean Sports Hub", aviso: false }];
  const h = renderToStaticMarkup(<MensajesMarcados textos={TEXTOS} marcas={marcas} foco="destino" onFoco={NADA} />);
  assert.match(h, /cv__vcmark is-foco/);
});

prueba("la frase pone en negrita solo los datos", () => {
  const h = renderToStaticMarkup(<FraseDeLaPeticion frase={fraseDeLaPeticion(PETICION, CLIENTES_ESPECIALES)} />);
  assert.match(h, /<b>FC Weinfelden-Bürglen<\/b>/);
  assert.match(h, /<b>Cambrils<\/b>/);
  assert.match(h, /<b>20 alumnos y 4 profesores<\/b>/);
});

prueba("la frase lleva en su esquina lo que hace la IA, sin un bloque aparte", () => {
  const h = renderToStaticMarkup(
    <FraseDeLaPeticion frase={fraseDeLaPeticion(PETICION, CLIENTES_ESPECIALES)} ia={{ tono: "ok", texto: "✓ La IA ha comprobado 12 datos" }} />,
  );
  assert.match(h, /cv__vcia is-ok[^>]*>✓ La IA ha comprobado 12 datos/);
});

console.log("\nCompacto: poco que leer y poco scroll");

prueba("un paso sin avisos es UNA línea: chips y botón, sin notas ni filas desplegadas", () => {
  const h = paso("viaje");
  assert.doesNotMatch(h, /cv__vcdetalle/);
  assert.doesNotMatch(h, /Filtra la comarca entera/, "las notas van detrás del chevron");
  assert.doesNotMatch(h, /cv__vccard/);
  assert.match(h, /aria-expanded="false"/);
});

prueba("el chevron abre el detalle, con las notas y la frase que respalda cada dato", () => {
  const h = paso("viaje", { detalleAbierto: true });
  assert.match(h, /cv__vcdetalle/);
  assert.match(h, /Filtra la comarca entera/);
  assert.match(h, /comprobado con «MSH: Mediterranean Sports Hub»/);
  assert.match(h, /aria-expanded="true"/);
});

prueba("lo que se despliega solo es lo que pide una decisión: las tarjetas de aviso, sin el detalle", () => {
  const h = paso("piden", { pendientes: 2 });
  assert.equal((h.match(/cv__vccard"/g) ?? []).length, 2);
  assert.doesNotMatch(h, /cv__vcdetalle/);
});

prueba("el chip de un dato que no cuadra va en ámbar y el de un dato bien comprobado, con ✓", () => {
  const h = paso("piden", { pendientes: 2 });
  assert.match(h, /cv__vcchip is-aviso"[^>]*><i>!<\/i><small>Régimen<\/small>/);
  assert.match(h, /<small>Requisitos<\/small>/, "etiqueta corta");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
