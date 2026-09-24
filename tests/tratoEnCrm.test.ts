/**
 * Qué se escribe en la oportunidad del CRM.
 *
 * Lo reportó Ruth el 24/09/2026: «la info que se traspasa a Zoho desde la app a
 * la oportunidad no es correcta. No rellena ningún campo de la oportunidad como
 * fecha entrada y salida, número de pasajeros, subformulario con los servicios
 * detallados, importe depósito, tipo de pago y forma de cobro. Lo pone todo en
 * la descripción.»
 *
 * Tenía razón: los campos existen en su CRM desde siempre —los rellenan a mano
 * en casi todos sus tratos— y nosotros mandábamos solo el nombre, la fase, el
 * contacto, la cuenta, el importe y un texto largo.
 *
 * Esto es lo que impide que vuelva a pasar sin que nadie lo note: se comprueba
 * el registro que se le manda a Zoho, sin hablar con Zoho.
 *
 * Cómo correrla:  npm run test:crm-trato
 */
import assert from "node:assert/strict";

import { construirTratoParaElCrm, type PayloadDeOportunidad } from "../server/zoho";

let pasadas = 0;
let fallidas = 0;

function prueba(nombre: string, cuerpo: () => void) {
  try {
    cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.error(`  FALLA  ${nombre}`);
    console.error(`        ${(error as Error).message.split("\n")[0]}`);
  }
}

/** Un viaje como los que de verdad cotiza Oravia. */
function payload(cambios: Record<string, unknown> = {}): PayloadDeOportunidad {
  return {
    contact: {
      email: "ampa@iesjaumebalmes.cat",
      first_name: "Marta",
      last_name: "Ferrer",
      full_name: "Marta Ferrer",
    },
    account: { name: "CENTRE D'ESTUDIS JAUME BALMES" },
    opportunity: {
      opportunity_name: "IES JAUME BALMES 2027",
      destination: "Salou",
      date_from: "2027-05-18",
      date_to: "2027-05-22",
      participants: 55,
      teachers: 5,
      amount: 13802.4,
      language: "es",
      age_range_text: "15-17 años",
      department: "GROUPS",
      contact_name: "Marta Ferrer",
      description: "Tres opciones de alojamiento y dos actividades.",
      ...cambios,
    },
    proposalOptions: [],
  } as PayloadDeOportunidad;
}

const vinculos = { dealName: "IES JAUME BALMES 2027", contactId: "C1", accountId: "A1" };

console.log("\nLos campos del viaje, que antes iban todos a la descripción");

prueba("las fechas de entrada y de salida van a sus campos", () => {
  const trato = construirTratoParaElCrm(payload(), vinculos);
  assert.equal(trato.Fecha_llegada_actividad, "2027-05-18");
  assert.equal(trato.Fecha_salida_actividad, "2027-05-22");
});

prueba("y la fecha de cierre sigue siendo la de salida", () => {
  // Es lo que ya hacía y lo que ellos esperan en su embudo.
  const trato = construirTratoParaElCrm(payload(), vinculos);
  assert.equal(trato.Closing_Date, "2027-05-22");
});

prueba("los pasajeros y los profesores van separados", () => {
  const trato = construirTratoParaElCrm(payload(), vinculos);
  assert.equal(trato.N_mero_de_personas, 55);
  assert.equal(trato.Profesor_entrenador, 5);
});

prueba("la edad de los participantes también", () => {
  const trato = construirTratoParaElCrm(payload(), vinculos);
  assert.equal(trato.Edad_participantes, "15-17 años");
});

prueba("y el responsable del grupo", () => {
  const trato = construirTratoParaElCrm(payload(), vinculos);
  assert.equal(trato.Contacto_grupo, "Marta Ferrer");
});

console.log("\nEl departamento, con SU nombre");

prueba("Groups es «Grupos»", () => {
  const trato = construirTratoParaElCrm(payload({ department: "GROUPS" }), vinculos);
  assert.equal(trato.Departamento, "Grupos");
});

prueba("Sports es «Turismo Deportivo»", () => {
  // 427 de sus 1.000 tratos llevan ese valor exacto. Inventarse «Sports» o
  // «Deportivo» deja el campo vacío o el trato rechazado.
  const trato = construirTratoParaElCrm(payload({ department: "SPORTS" }), vinculos);
  assert.equal(trato.Departamento, "Turismo Deportivo");
});

prueba("sin departamento no se inventa ninguno", () => {
  const trato = construirTratoParaElCrm(payload({ department: null }), vinculos);
  assert.equal(trato.Departamento, undefined);
});

console.log("\nEl idioma, con los tres valores que su lista admite");

prueba("«es» y «Español» son lo mismo", () => {
  // La lectura del mensaje devuelve unas veces el código y otras el nombre.
  for (const valor of ["es", "Español", "castellano", "ES"]) {
    const trato = construirTratoParaElCrm(payload({ language: valor }), vinculos);
    assert.equal(trato.Idioma, "Español", `con «${valor}»`);
  }
});

prueba("inglés y francés, igual", () => {
  assert.equal(construirTratoParaElCrm(payload({ language: "en" }), vinculos).Idioma, "Inglés");
  assert.equal(construirTratoParaElCrm(payload({ language: "fr" }), vinculos).Idioma, "Francés");
});

prueba("el catalán se queda sin idioma, no se inventa uno", () => {
  // Su picklist solo tiene Español, Inglés y Francés. Mandar «Catalán» sería un
  // valor que su CRM no reconoce; prefiero el campo vacío y pedirles que lo
  // añadan, que es lo que hay que hacer.
  const trato = construirTratoParaElCrm(payload({ language: "ca" }), vinculos);
  assert.equal(trato.Idioma, undefined);
});

console.log("\nEl cobro");

prueba("la forma de cobro es la acordada: depósito del 30%", () => {
  // 735 de sus 1.000 tratos llevan ese valor, escrito así, sin tilde en
  // «Deposito». Es su lista, no la nuestra.
  const trato = construirTratoParaElCrm(payload(), vinculos);
  assert.equal(trato.Forma_de_Cobro, "Deposito 30%");
});

prueba("el importe del depósito es el 30% del total", () => {
  const trato = construirTratoParaElCrm(payload(), vinculos);
  // 13.802,40 × 30% = 4.140,72
  assert.equal(trato.Importe_Dep_sito_New, 4140.72);
});

prueba("sin importe no hay depósito que calcular", () => {
  const trato = construirTratoParaElCrm(payload({ amount: null }), vinculos);
  assert.equal(trato.Importe_Dep_sito_New, undefined);
  assert.equal(trato.Amount, undefined);
});

prueba("el tipo de pago NO se rellena", () => {
  // Crédito o prepago se pacta con cada colegio y aquí no se sabe. Ponerlo por
  // defecto llenaría novecientos tratos de un dato que nadie ha decidido.
  const trato = construirTratoParaElCrm(payload(), vinculos);
  assert.equal(trato.Tipo_de_Pago, undefined);
});

console.log("\nLo que ya funcionaba y no se puede romper");

prueba("el nombre del trato es el del grupo", () => {
  const trato = construirTratoParaElCrm(payload(), vinculos);
  assert.equal(trato.Deal_Name, "IES JAUME BALMES 2027");
});

prueba("el contacto y la cuenta van enlazados por id", () => {
  const trato = construirTratoParaElCrm(payload(), vinculos);
  assert.deepEqual(trato.Contact_Name, { id: "C1" });
  assert.deepEqual(trato.Account_Name, { id: "A1" });
});

prueba("la fase de salida es una del embudo, nunca «Nueva»", () => {
  // El .env traía ZOHO_DEAL_STAGE=Nueva y «Nueva» no es una de sus fases: siete
  // tratos acabaron ahí, fuera del embudo, sin que nadie lo viera.
  const trato = construirTratoParaElCrm(payload(), vinculos);
  const embudo = [
    "Preparando Presupuesto",
    "Presupuesto Enviado",
    "Seguimiento al Presupuesto",
    "Pendiente de deposito",
    "Oportunidad Ganada",
  ];
  assert.ok(embudo.includes(String(trato.Stage)), `fase inesperada: ${trato.Stage}`);
});

prueba("un viaje sin nada informado no manda campos vacíos", () => {
  // Un campo a null o a cadena vacía PISA lo que hubiera escrito una persona.
  const pelado = {
    contact: { email: "x@y.z", first_name: "X", last_name: "Y", full_name: "X Y" },
    account: {},
    opportunity: {},
    proposalOptions: [],
  } as PayloadDeOportunidad;

  const trato = construirTratoParaElCrm(pelado, { dealName: "Viaje" });

  for (const campo of [
    "Fecha_llegada_actividad",
    "Fecha_salida_actividad",
    "N_mero_de_personas",
    "Profesor_entrenador",
    "Departamento",
    "Idioma",
    "Edad_participantes",
    "Contacto_grupo",
    "Amount",
    "Importe_Dep_sito_New",
  ]) {
    assert.equal(trato[campo], undefined, `${campo} no debería ir`);
  }
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
