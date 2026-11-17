/**
 * Las actividades cuando el cliente cambia el grupo («en vez de 48, seremos 46»):
 * las entradas siguen al grupo nuevo, y lo repartido a mano no se toca (17/11/2026).
 *
 * Cómo correrla:  npm run test:actividades-cambio
 *
 * No necesita base de datos ni servidor.
 */
import assert from "node:assert/strict";

import { AVISO_REPARTO_A_MANO, actividadConElGrupoNuevo, lineasConElGrupoNuevo } from "../src/domain/actividadesAlCambiarElGrupo";
import { alojamientoConElGrupoNuevo } from "../src/domain/alojamientoAlCambiarElGrupo";
import type { GratuidadDeProfesores } from "../src/domain/gratuidadDeActividad";
import type { LineaDeActividad } from "../src/domain/lineasDeActividad";

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

const joven = (cantidad: number): LineaDeActividad => ({ rateId: "joven", etiqueta: "Joven (12-17) · Entrada · Periodo D", precio: 12, cantidad });
const adulto = (cantidad: number): LineaDeActividad => ({ rateId: "adulto", etiqueta: "Adulto (18-59) · Entrada · Periodo D", precio: 15, cantidad });
const gratis = (cantidad: number, de = "adulto"): LineaDeActividad => ({ rateId: `${de}#gratis`, etiqueta: "Adulto (18-59) · Entrada · Periodo D · gratuidad", precio: 0, cantidad });
const TARIFAS = {
  joven: { rateUnit: "PER_PAX", ageLabel: "Joven (12-17) · Entrada · Periodo D", salePvpAmount: 12 },
  adulto: { rateUnit: "PER_PAX", ageLabel: "Adulto (18-59) · Entrada · Periodo D", salePvpAmount: 15 },
  campo: { rateUnit: "PER_HOUR", ageLabel: "Campo de fútbol 11", salePvpAmount: 190 },
  kayak: { rateUnit: "PER_GROUP", maxPax: 8, ageLabel: "Kayak · grupo de 8", salePvpAmount: 96 },
};
const UNO_CADA_DIEZ: GratuidadDeProfesores = { tipo: "porCada", gratis: 1, cada: 10, texto: "1 profesor gratis por cada 10 alumnos de pago" };
const cantidades = (lineas: LineaDeActividad[]) => lineas.map((l) => `${l.rateId}×${l.cantidad}`).join(" ");

console.log("\nLas líneas con el grupo nuevo");

prueba("si el grupo no cambia, las líneas son las mismas", () => {
  const lineas = [joven(48), adulto(4)];
  const r = lineasConElGrupoNuevo(lineas, { alumnos: 48, profesores: 4 }, { alumnos: 48, profesores: 4 }, TARIFAS);
  assert.equal(r.lineas, lineas);
  assert.equal(r.aviso, null);
});

prueba("«en vez de 48, seremos 46»: las entradas de los alumnos bajan a 46 y las de los profesores no se mueven", () => {
  const r = lineasConElGrupoNuevo([joven(48), adulto(4)], { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 4 }, TARIFAS);
  assert.equal(cantidades(r.lineas), "joven×46 adulto×4");
  assert.equal(r.aviso, null);
});

prueba("una sola tarifa para todos: alumnos y profesores de pago van juntos", () => {
  const r = lineasConElGrupoNuevo([joven(52)], { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 5 }, TARIFAS);
  assert.equal(cantidades(r.lineas), "joven×51");
});

prueba("la gratuidad sigue su regla: con 55 alumnos, 5 gratis; con 46, 4 gratis y el quinto profesor paga", () => {
  const r = lineasConElGrupoNuevo([joven(55), gratis(5)], { alumnos: 55, profesores: 5 }, { alumnos: 46, profesores: 5 }, TARIFAS, UNO_CADA_DIEZ);
  assert.equal(cantidades(r.lineas), "joven×46 adulto#gratis×4 adulto×1");
  assert.equal(r.lineas.find((l) => l.rateId === "adulto")?.precio, 15);
  assert.equal(r.aviso, null);
});

prueba("si sube el grupo y la regla da más gratuidades, dejan de pagar", () => {
  const r = lineasConElGrupoNuevo([joven(46), adulto(1), gratis(4)], { alumnos: 46, profesores: 5 }, { alumnos: 50, profesores: 5 }, TARIFAS, UNO_CADA_DIEZ);
  assert.equal(cantidades(r.lineas), "joven×50 adulto#gratis×5");
});

prueba("la regla puede abrir una gratuidad que antes no había", () => {
  const r = lineasConElGrupoNuevo([joven(9), adulto(1)], { alumnos: 9, profesores: 1 }, { alumnos: 12, profesores: 1 }, TARIFAS, UNO_CADA_DIEZ);
  assert.equal(cantidades(r.lineas), "joven×12 adulto#gratis×1");
});

prueba("si quien cotizó no seguía la regla, se respeta lo que puso", () => {
  // La regla daría 5 gratis y puso 2: se quedan 2.
  const r = lineasConElGrupoNuevo([joven(55), adulto(3), gratis(2)], { alumnos: 55, profesores: 5 }, { alumnos: 60, profesores: 5 }, TARIFAS, UNO_CADA_DIEZ);
  assert.equal(cantidades(r.lineas), "joven×60 adulto×3 adulto#gratis×2");
});

prueba("sin regla conocida, la gratuidad se queda como estaba, sin pasarse de los profesores que van", () => {
  const r = lineasConElGrupoNuevo([joven(40), gratis(4, "joven")], { alumnos: 40, profesores: 4 }, { alumnos: 40, profesores: 3 }, TARIFAS, null);
  assert.equal(cantidades(r.lineas), "joven×40 joven#gratis×3");
});

prueba("un profesor que pasa a pagar sin tarifa de adulto conocida se suma a la de los alumnos, y se avisa", () => {
  const r = lineasConElGrupoNuevo([joven(40)], { alumnos: 40, profesores: 0 }, { alumnos: 40, profesores: 2 }, TARIFAS);
  assert.equal(cantidades(r.lineas), "joven×42");
  assert.match(r.aviso ?? "", /2 profesores pasan a pagar/);
});

prueba("lo que se cobra por hora o por servicio no depende del grupo", () => {
  const campo: LineaDeActividad = { rateId: "campo", etiqueta: "Campo de fútbol 11", precio: 190, cantidad: 1 };
  const r = lineasConElGrupoNuevo([campo], { alumnos: 40, profesores: 6 }, { alumnos: 30, profesores: 4 }, TARIFAS);
  assert.equal(cantidades(r.lineas), "campo×1");
  assert.equal(r.aviso, null);
});

prueba("por grupo de 8 personas: los grupos que hagan falta", () => {
  const kayak: LineaDeActividad = { rateId: "kayak", etiqueta: "Kayak · grupo de 8", precio: 96, cantidad: 6 };
  const r = lineasConElGrupoNuevo([kayak], { alumnos: 44, profesores: 4 }, { alumnos: 36, profesores: 4 }, TARIFAS);
  assert.equal(cantidades(r.lineas), "kayak×5");
});

prueba("el descuento en euros es por alumno: tantos como alumnos", () => {
  const descuento: LineaDeActividad = { rateId: "#descuento", etiqueta: "descuento por alumno", precio: -2, cantidad: 48 };
  const r = lineasConElGrupoNuevo([joven(48), adulto(4), descuento], { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 4 }, TARIFAS);
  assert.equal(cantidades(r.lineas), "joven×46 adulto×4 #descuento×46");
});

prueba("repartidas a mano (no cuadran con el grupo de antes): no se tocan y se avisa", () => {
  const lineas = [joven(20), adulto(2)]; // solo iba la mitad
  const r = lineasConElGrupoNuevo(lineas, { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 4 }, TARIFAS);
  assert.equal(r.lineas, lineas);
  assert.equal(r.aviso, AVISO_REPARTO_A_MANO);
});

prueba("tres tarifas por persona (dos tramos de edad): no se adivina, se avisa", () => {
  const nino: LineaDeActividad = { rateId: "nino", etiqueta: "Infantil (4-11)", precio: 9, cantidad: 10 };
  const lineas = [joven(38), nino, adulto(4)];
  const r = lineasConElGrupoNuevo(lineas, { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 4 }, TARIFAS);
  assert.equal(r.lineas, lineas);
  assert.equal(r.aviso, AVISO_REPARTO_A_MANO);
});

prueba("una línea que se queda en cero desaparece", () => {
  const r = lineasConElGrupoNuevo([joven(48), adulto(4)], { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 0 }, TARIFAS);
  assert.equal(cantidades(r.lineas), "joven×46");
});

console.log("\nLa actividad entera");

prueba("con líneas: total, por alumno y líneas nuevas para guardar", () => {
  const actividad = { activityNameSnapshot: "1 día Ferrari Land", linesJson: JSON.stringify([joven(48), adulto(4)]), amountTotal: 636, pvpSnapshot: "13,25 €" };
  const r = actividadConElGrupoNuevo(actividad, { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 4 }, TARIFAS);
  assert.equal(r.cambia, true);
  assert.equal(r.totalAntes, 636);
  assert.equal(r.totalAhora, 46 * 12 + 4 * 15);
  assert.equal(r.amountTotal, 612);
  assert.equal(r.porAlumno, 13.3); // 612 / 46
  assert.equal(cantidades(r.lineas ?? []), "joven×46 adulto×4");
});

prueba("sin líneas se cobra por persona: no hay nada que guardar, pero el total sigue al grupo", () => {
  const actividad = { activityNameSnapshot: "Paintball", pvpSnapshot: "20,00 €", linesJson: null, amountTotal: null };
  const r = actividadConElGrupoNuevo(actividad, { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 4 });
  assert.equal(r.cambia, false);
  assert.equal(r.lineas, null);
  assert.equal(r.totalAntes, 1040);
  assert.equal(r.totalAhora, 1000);
});

prueba("repartida a mano: no cambia nada y el aviso llega", () => {
  const actividad = { activityNameSnapshot: "Kayak", linesJson: JSON.stringify([joven(20)]), amountTotal: 240, pvpSnapshot: "5,00 €" };
  const r = actividadConElGrupoNuevo(actividad, { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 4 }, TARIFAS);
  assert.equal(r.cambia, false);
  assert.equal(r.totalAhora, 240);
  assert.equal(r.aviso, AVISO_REPARTO_A_MANO);
});

prueba("«A consultar» no tiene total, ni antes ni después", () => {
  const r = actividadConElGrupoNuevo({ activityNameSnapshot: "Vela", pvpSnapshot: "A consultar" }, { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 4 });
  assert.equal(r.totalAntes, null);
  assert.equal(r.totalAhora, null);
});

console.log("\nEl alojamiento que no está en el catálogo");

const PLANAS = "43,13 € x 48 alumnos + 43,13 € x 4 profesores (sin tarifa individual: mismo precio), por noche x 4 noches";

prueba("solo cambia el grupo: la misma cuenta con los mismos precios por persona y noche", () => {
  const r = alojamientoConElGrupoNuevo(PLANAS, 8971.04, { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 4 });
  assert.equal(r?.total, 8626);
  assert.equal(r?.desglose, "43,13 € x 46 alumnos + 43,13 € x 4 profesores (sin tarifa individual: mismo precio), por noche x 4 noches");
  assert.equal(r?.porAlumno, 187.52);
});

prueba("cambian también los profesores", () => {
  const r = alojamientoConElGrupoNuevo(PLANAS, 8971.04, { alumnos: 48, profesores: 4 }, { alumnos: 48, profesores: 5 });
  assert.equal(r?.total, 9143.56);
  assert.match(r?.desglose ?? "", /x 48 alumnos \+ 43,13 € x 5 profesores/);
});

prueba("dos tramos de pensión y un chófer: el chófer no cambia", () => {
  const texto =
    "MP: 30,00 € x 20 alumnos + 40,00 € x 2 profesores (uso individual) + 40,00 € x 1 chófer (individual), por noche x 2 noches · PC: 35,00 € x 20 alumnos + 45,00 € x 2 profesores (uso individual) + 40,00 € x 1 chófer (individual), por noche x 1 noche";
  const antes = (30 * 20 + 40 * 2 + 40) * 2 + (35 * 20 + 45 * 2 + 40);
  const r = alojamientoConElGrupoNuevo(texto, antes, { alumnos: 20, profesores: 2 }, { alumnos: 18, profesores: 2 });
  assert.equal(r?.total, (30 * 18 + 40 * 2 + 40) * 2 + (35 * 18 + 45 * 2 + 40));
  assert.match(r?.desglose ?? "", /^MP: 30,00 € x 18 alumnos .* · PC: 35,00 € x 18 alumnos /);
  assert.match(r?.desglose ?? "", /x 1 chófer/);
});

prueba("si la cuenta leída no da el total de la propuesta, no se inventa nada", () => {
  assert.equal(alojamientoConElGrupoNuevo(PLANAS, 9500, { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 4 }), null);
});

prueba("si el grupo del desglose no es el de la solicitud, tampoco", () => {
  assert.equal(alojamientoConElGrupoNuevo(PLANAS, 8971.04, { alumnos: 50, profesores: 4 }, { alumnos: 46, profesores: 4 }), null);
});

prueba("bloques de alumnos o varios grupos de profesores: al cotizador", () => {
  const bloques = "40,00 € x 30 alumnos + 50,00 € x 10 alumnos (doble, PC), por noche x 2 noches";
  assert.equal(alojamientoConElGrupoNuevo(bloques, (40 * 30 + 50 * 10) * 2, { alumnos: 40, profesores: 0 }, { alumnos: 38, profesores: 0 }), null);
  const dosGrupos = "40,00 € x 30 alumnos + 60,00 € x 2 profesores (uso individual) + 0,00 € x 1 profesores (gratuidad), por noche x 2 noches";
  assert.equal(alojamientoConElGrupoNuevo(dosGrupos, (40 * 30 + 60 * 2) * 2, { alumnos: 30, profesores: 3 }, { alumnos: 28, profesores: 3 }), null);
});

prueba("profesores que no están en el desglose: si cambian, no se puede; si no cambian, sí", () => {
  const texto = "40,00 € x 30 alumnos, por noche x 2 noches";
  assert.equal(alojamientoConElGrupoNuevo(texto, 2400, { alumnos: 30, profesores: 3 }, { alumnos: 30, profesores: 4 }), null);
  assert.equal(alojamientoConElGrupoNuevo(texto, 2400, { alumnos: 30, profesores: 3 }, { alumnos: 28, profesores: 3 })?.total, 2240);
});

prueba("sin desglose o sin total no hay cuenta", () => {
  assert.equal(alojamientoConElGrupoNuevo(null, 100, { alumnos: 1, profesores: 0 }, { alumnos: 2, profesores: 0 }), null);
  assert.equal(alojamientoConElGrupoNuevo(PLANAS, null, { alumnos: 48, profesores: 4 }, { alumnos: 46, profesores: 4 }), null);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
