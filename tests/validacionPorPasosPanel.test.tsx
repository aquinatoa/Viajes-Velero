/**
 * La ventana ENTERA de «Lo que hemos entendido» paso a paso (maqueta C, 06/11/2026).
 *
 * Se renderiza `PanelEntendido` con los datos del club suizo en distintos
 * estados y se comprueba lo que decide quien puede avanzar: qué bloquea el botón
 * «Ver alojamientos y actividades», cuándo sale «Confirmar los que están bien» y
 * qué pasa cuando la IA no responde. Las piezas sueltas se prueban en
 * `validacionPorPasosUi.test.tsx`.
 *
 * Cómo correrla:  npm run test:pasos-panel
 */
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: unknown }).React = React;

import { PanelEntendido } from "../src/components/request/RequestCanvas";
import { AUDITORIA_VACIA, type EstadoDeLaAuditoria } from "../src/components/request/ValidacionPorPasos";
import { normalizarAuditoria, valoresParaAuditar } from "../src/domain/auditoriaIa";
import { CLIENTES_ESPECIALES } from "../src/domain/documentImportTypes";
import { SECCIONES, firmaDeSeccion, valoresDeSeccion, type Confirmaciones, type SeccionId } from "../src/domain/seccionesDeValidacion";
import type { PeticionParaValidar } from "../src/domain/validacionDeLaPeticion";
import { readTripMessage } from "../src/services/requestService";

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
const TTOO = "Destination Travelclub";
const TEXTOS = [
  { texto: CLIENTE, origen: "colegio" as const },
  { texto: CHAT, origen: "chat" as const },
  { texto: TTOO, origen: "colegio" as const },
];

const ENTENDIDO = {
  ...readTripMessage("").normalized,
  destinationText: "Cambrils",
  dateFrom: "2027-03-12",
  dateTo: "2027-03-16",
  participants: 20,
  teachers: 4,
  regimeRequested: "de los 24 pasajeros somos 20 alumnos y 4 profesores. Soy Anthony Quinatoa,",
};
const FORM = {
  firstName: "Anthony",
  lastName: "Quinatoa",
  email: "aquinatoa@neointec.com",
  centreName: "FC Weinfelden-Bürglen",
  opportunityName: "FC WEINFELDEN-BÜRGLEN 2027",
};
const REQUISITOS = ["Natural Grass", "Bungalows", "Césped natural"];

const DATOS: PeticionParaValidar = {
  ...ENTENDIDO,
  topePorAlumno: null,
  requisitos: REQUISITOS,
  ...FORM,
  canal: "SWISS_TTOO",
  departamento: "SPORTS",
};
const VALORES = valoresParaAuditar(DATOS, CLIENTES_ESPECIALES);
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
    centro: { estado: "correcto", cita: "FC Weinfelden-Bürglen" },
    contacto: { estado: "correcto", cita: "Soy Anthony Quinatoa" },
    cotizamosPara: { estado: "correcto", cita: "Destination Travelclub" },
    departamento: { estado: "correcto", cita: "FC Weinfelden-Bürglen" },
  },
};

function auditoriaListas(): Record<SeccionId, EstadoDeLaAuditoria> {
  const codigos = CLIENTES_ESPECIALES.map((c) => c.codigo);
  return Object.fromEntries(
    SECCIONES.map((s) => {
      const valores = valoresDeSeccion(s.id, VALORES);
      return [s.id, { fase: "lista", resultado: normalizarAuditoria(BRUTO, [CLIENTE, CHAT, TTOO], valores, codigos), valores, motivo: null } as EstadoDeLaAuditoria];
    }),
  ) as Record<SeccionId, EstadoDeLaAuditoria>;
}
function auditoriaTodas(fase: EstadoDeLaAuditoria["fase"], motivo: string | null = null): Record<SeccionId, EstadoDeLaAuditoria> {
  return Object.fromEntries(SECCIONES.map((s) => [s.id, { ...AUDITORIA_VACIA, fase, motivo }])) as Record<SeccionId, EstadoDeLaAuditoria>;
}

const NADA = () => undefined;
function panel(sobre: { auditoria?: Record<SeccionId, EstadoDeLaAuditoria>; confirmaciones?: Confirmaciones; dejados?: string[]; datos?: Partial<PeticionParaValidar> } = {}) {
  const d = { ...DATOS, ...sobre.datos };
  return renderToStaticMarkup(
    <PanelEntendido
      entendido={{ ...ENTENDIDO, regimeRequested: d.regimeRequested ?? "", dateTo: d.dateTo ?? "" }}
      setEntendido={NADA}
      form={FORM as never}
      setForm={NADA}
      tope={null}
      setTope={NADA}
      requisitos={d.requisitos ?? []}
      setRequisitos={NADA}
      canal={d.canal ?? "GENERIC"}
      setCanal={NADA}
      departamento={(d.departamento as "GROUPS" | "SPORTS" | "") ?? ""}
      setDepartamento={NADA}
      contactoCrm={null}
      previas={null}
      textos={TEXTOS}
      auditoria={sobre.auditoria ?? auditoriaListas()}
      onAuditar={NADA}
      onAplicar={NADA}
      dejados={sobre.dejados ?? []}
      onDejar={NADA}
      confirmaciones={sobre.confirmaciones ?? {}}
      onConfirmar={NADA}
      onDesconfirmar={NADA}
      onVer={NADA}
      onCerrar={NADA}
    />,
  );
}
const confirmar = (ids: SeccionId[], datos: PeticionParaValidar = DATOS): Confirmaciones =>
  Object.fromEntries(ids.map((id) => [id, firmaDeSeccion(id, datos)]));

const BOTON_VER_DESACTIVADO = /<button[^>]*disabled=""[^>]*>Ver alojamientos y actividades<\/button>/;

console.log("\nQué bloquea el botón «Ver alojamientos y actividades»");

prueba("al abrir, sin confirmar nada: el botón está desactivado y el pie dice qué falta", () => {
  const h = panel();
  assert.match(h, BOTON_VER_DESACTIVADO);
  assert.match(h, /Falta confirmar: El viaje, El grupo, Lo que piden, Qué tarifas se aplican/);
});

prueba("con tres pasos confirmados y uno sin confirmar, sigue desactivado y dice cuál", () => {
  const h = panel({ confirmaciones: confirmar(["viaje", "grupo", "tarifas"]) });
  assert.match(h, BOTON_VER_DESACTIVADO);
  assert.match(h, /Falta confirmar: Lo que piden</);
});

prueba("con los cuatro confirmados se activa; «Centro y contacto» no hace falta", () => {
  const h = panel({ confirmaciones: confirmar(["viaje", "grupo", "piden", "tarifas"]) });
  assert.doesNotMatch(h, BOTON_VER_DESACTIVADO);
  assert.match(h, /Todo confirmado/);
  assert.match(h, /Ver alojamientos y actividades/);
});

prueba("si después de confirmar cambia un dato, solo ese paso vuelve a pedirse", () => {
  const confirmadas = confirmar(["viaje", "grupo", "piden", "tarifas"]);
  const h = panel({ confirmaciones: confirmadas, datos: { dateTo: "2027-03-17" } });
  assert.match(h, BOTON_VER_DESACTIVADO);
  assert.match(h, /Falta confirmar: El viaje</);
});

console.log("\n«Confirmar los que están bien»");

prueba("con la IA hecha: el viaje, el grupo y las tarifas están limpios (3), y «Lo que piden» tiene avisos", () => {
  const h = panel();
  assert.match(h, /Confirmar los 3 que están bien/);
  assert.match(h, /2 avisos sin resolver/);
  assert.match(h, /Quitar este dato/);
  assert.match(h, /Usar «Natural Grass · Bungalows»/);
});

prueba("resolver los avisos (dejarlos como están) libera el paso: todo está limpio", () => {
  const dejados = [
    "regimen::de los 24 pasajeros somos 20 alumnos y 4 profesores. Soy Anthony Quinatoa,::",
    "requisitos::Natural Grass · Bungalows · Césped natural::",
  ];
  const h = panel({ dejados });
  assert.doesNotMatch(h, /avisos sin resolver/);
  assert.doesNotMatch(h, /que están bien/, "ya están todos limpios: basta con «Aprobar todo»");
});

prueba("un paso al que le falta el departamento no se confirma", () => {
  const h = panel({ datos: { departamento: "" } });
  assert.match(h, /Falta: Departamento/);
  assert.match(h, /Confirmar los 2 que están bien/, "el viaje y el grupo sí; las tarifas no");
});


console.log("\n«Aprobar todo»");

prueba("al abrir, con la IA hecha, sale «Aprobar todo» y dice que deja los avisos como están", () => {
  const h = panel();
  assert.match(h, /data-aprobar-todo/);
  assert.match(h, /Aprobar todo y dejar 2 avisos como están/);
});

prueba("sin avisos, el botón dice solo «Aprobar todo» y ya no ofrece «los que están bien»", () => {
  const dejados = [
    "regimen::de los 24 pasajeros somos 20 alumnos y 4 profesores. Soy Anthony Quinatoa,::",
    "requisitos::Natural Grass · Bungalows · Césped natural::",
  ];
  const h = panel({ dejados });
  assert.match(h, />Aprobar todo<\/button>/);
  assert.doesNotMatch(h, /que están bien/);
});

prueba("con la IA sin responder también se puede aprobar todo (cada paso, mirado a mano)", () => {
  const h = panel({ auditoria: auditoriaTodas("error", "sin respuesta") });
  assert.match(h, />Aprobar todo<\/button>/);
});

prueba("un paso al que le falta un dato obligatorio no se aprueba: el pie lo sigue pidiendo", () => {
  const h = panel({ datos: { departamento: "" }, auditoria: auditoriaTodas("error", "sin respuesta") });
  assert.match(h, /data-aprobar-todo/);
  assert.match(h, /Falta confirmar:[^<]*Qué tarifas se aplican/);
  assert.match(h, /Falta: Departamento/);
});

prueba("con todo confirmado no hay «Aprobar todo»", () => {
  const h = panel({ confirmaciones: confirmar(["viaje", "grupo", "piden", "tarifas", "contacto"]) });
  assert.doesNotMatch(h, /data-aprobar-todo/);
});

console.log("\nCuando la IA no responde");

prueba("sin IA no hay «confirmar los que están bien»: cada paso se confirma a mano, y se dice", () => {
  const h = panel({ auditoria: auditoriaTodas("error", "sin respuesta") });
  assert.doesNotMatch(h, /que están bien/);
  assert.match(h, /La IA no ha respondido: sin comprobar/);
  assert.match(h, /sin respuesta/);
  assert.match(h, /He revisado esto/);
  assert.doesNotMatch(h, /Quitar este dato/);
});

prueba("con la IA apagada se dice que no está activada", () => {
  const h = panel({ auditoria: auditoriaTodas("apagada") });
  assert.match(h, /La IA no está activada/);
  assert.doesNotMatch(h, /que están bien/);
});

prueba("mientras la IA piensa se dice y todavía no se ofrece confirmar de golpe", () => {
  const h = panel({ auditoria: auditoriaTodas("cargando") });
  assert.match(h, /La IA está comprobando…/);
  assert.doesNotMatch(h, /que están bien/);
});

console.log("\nLo que se ve");

prueba("la frase, los pasos y el mensaje subrayado están", () => {
  const h = panel();
  assert.match(h, /<b>FC Weinfelden-Bürglen<\/b>/);
  assert.match(h, /pide <\/span><b>Cambrils<\/b>/);
  assert.doesNotMatch(h, /cv__vcpasos/, "los pasos ya son la barra: no hay una aparte");
  assert.match(h, /<mark class="cv__vcmark">MSH: Mediterranean Sports Hub<\/mark>/);
  assert.match(h, /<mark class="cv__vcmark is-aviso">Natural Grass<\/mark>/, "lo que no cuadra va en aviso");
});

prueba("«Centro y contacto» no es un paso numerado y dice que se confirma al enviar", () => {
  const h = panel();
  assert.match(h, /Centro y contacto<small> · al enviar<\/small>/);
  assert.match(h, /title="se confirma al enviar"/);
});

prueba("el panel de la izquierda es solo el mensaje del cliente: lo del chat no está", () => {
  const h = panel();
  assert.match(h, /El mensaje del cliente, con lo que se ha usado subrayado/);
  assert.match(h, /Dear Pablo/);
  assert.doesNotMatch(h, /Tú, en el chat/);
  assert.doesNotMatch(h, /cv__vcquien is-tu/);
  const izquierda = h.split("<aside")[1].split("</aside>")[0];
  assert.doesNotMatch(izquierda, /Soy Anthony Quinatoa/, "el texto del chat no se enseña a la izquierda");
  assert.doesNotMatch(izquierda, /de los 24 pasajeros/);
});

prueba("poco scroll: por defecto no se despliega ningún detalle, solo los avisos que hay que decidir", () => {
  const h = panel();
  assert.doesNotMatch(h, /cv__vcdetalle/);
  assert.doesNotMatch(h, /Filtra la comarca entera/);
  assert.equal((h.match(/cv__vccard"/g) ?? []).length, 2, "solo los dos avisos");
  assert.equal((h.match(/<section class="cv__vcsec/g) ?? []).length, 5, "cinco pasos, cada uno una línea");
});

prueba("la IA va en la esquina de la frase, no en un bloque aparte", () => {
  const h = panel();
  assert.match(h, /cv__vcia is-ok[^>]*>✓ La IA ha comprobado \d+ datos/);
  assert.doesNotMatch(h, /cv__vcestado/);
});

prueba("los datos de cada paso se ven como chips, sin abrir nada", () => {
  const h = panel();
  assert.match(h, /<small>Destino<\/small> <span>Cambrils<\/span>/);
  assert.match(h, /<small>Alumnos<\/small> <span>20<\/span>/);
  assert.match(h, /<small>Departamento<\/small> <span>Turismo Deportivo<\/span>/);
});

prueba("el contacto que no está en el CRM se dice arriba", () => {
  assert.match(panel(), /aquinatoa@neointec\.com<\/b> no está en el CRM/);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
