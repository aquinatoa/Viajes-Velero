/**
 * Qué se puede borrar y qué no.
 *
 * Borrar es la única operación de la app que no tiene vuelta atrás, así que la
 * regla que decide quién puede hacerlo importa más que la mecánica de borrar.
 * Se equivoca hacia el lado malo en silencio: dejar pasar de más no da error,
 * simplemente desaparece un expediente que alguien necesitaba.
 *
 * La regla, en una línea: el depósito cobrado no se borra nunca; lo que ya
 * salió al colegio, solo un administrador; lo demás, quien lo vea.
 *
 * Cómo correrla:  npm run test:borrado
 * No necesita base de datos: la regla es una función pura.
 */
import assert from "node:assert/strict";

import { porQueNoSePuedeBorrar } from "../server/borrarSolicitud";

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

const admin = { id: "u-admin", role: "ADMIN", department: null } as never;
const jefaGroups = { id: "u-rpujol", role: "DEPT_ADMIN", department: "GROUPS" } as never;
const cotizadora = { id: "u-groups", role: "QUOTER", department: "GROUPS" } as never;

/** Un envío con lo mínimo que mira la regla. */
function envio(cambios: Record<string, unknown> = {}) {
  return {
    status: "DRAFT",
    sentAt: null,
    viewCount: 0,
    chosenOptionNumber: null,
    depositPaidAt: null,
    ...cambios,
  };
}

/** Una solicitud con los envíos que se le pasen, repartidos en una propuesta. */
function solicitud(...envios: ReturnType<typeof envio>[]) {
  return { proposals: [{ deliveries: envios }] } as never;
}

console.log("\nLo que todavía no ha salido de casa");

prueba("una prueba preparada y sin enviar la borra su cotizadora", () => {
  assert.equal(porQueNoSePuedeBorrar(solicitud(envio()), cotizadora), null);
});

prueba("una que falló al enviarse también", () => {
  assert.equal(porQueNoSePuedeBorrar(solicitud(envio({ status: "FAILED" })), cotizadora), null);
});

prueba("y una SIMULATED, que es el PDF hecho pero el correo sin salir", () => {
  // Es el estado en el que se quedan todas las pruebas mientras no haya clave
  // del buzón. Si esto no se pudiera borrar, la funcionalidad no serviría para
  // lo que se ha pedido.
  assert.equal(porQueNoSePuedeBorrar(solicitud(envio({ status: "SIMULATED" })), cotizadora), null);
});

prueba("una SIMULATED con fecha de envío sigue siendo borrable", () => {
  // Simular TAMBIÉN graba `sentAt`. Si la regla mirara solo la fecha, ninguna
  // prueba sería borrable: es lo que pasaba con las once de la mesa.
  assert.equal(
    porQueNoSePuedeBorrar(solicitud(envio({ status: "SIMULATED", sentAt: new Date() })), cotizadora),
    null,
  );
});

prueba("pero si la han abierto, ya está fuera aunque fuera simulada", () => {
  // El enlace público se puede pasar a mano.
  const motivo = porQueNoSePuedeBorrar(
    solicitud(envio({ status: "SIMULATED", sentAt: new Date(), viewCount: 1 })),
    cotizadora,
  );
  assert.match(String(motivo), /administrador/i);
});

prueba("una solicitud sin ningún envío se borra sin más", () => {
  assert.equal(porQueNoSePuedeBorrar(solicitud(), cotizadora), null);
});

console.log("\nLo que ya está fuera");

prueba("una propuesta enviada NO la borra una cotizadora", () => {
  const motivo = porQueNoSePuedeBorrar(
    solicitud(envio({ status: "SENT", sentAt: new Date() })),
    cotizadora,
  );
  assert.match(String(motivo), /administrador/i);
});

prueba("ni la jefa de departamento", () => {
  // El PDF está en la bandeja de alguien de fuera: borrarlo aquí no lo quita
  // de allí. Por eso sube un escalón, hasta el administrador global.
  const motivo = porQueNoSePuedeBorrar(
    solicitud(envio({ status: "SENT", sentAt: new Date() })),
    jefaGroups,
  );
  assert.match(String(motivo), /administrador/i);
});

prueba("pero un administrador sí", () => {
  assert.equal(
    porQueNoSePuedeBorrar(solicitud(envio({ status: "SENT", sentAt: new Date() })), admin),
    null,
  );
});

prueba("una que el colegio ya abrió cuenta como enviada", () => {
  // `sentAt` puede estar vacío si se envió por otra vía, pero si la han abierto
  // es que el enlace salió. La regla mira el hecho, no el campo.
  const motivo = porQueNoSePuedeBorrar(solicitud(envio({ viewCount: 3 })), cotizadora);
  assert.match(String(motivo), /administrador/i);
});

prueba("si el colegio eligió opción, se dice eso y no otra cosa", () => {
  const motivo = porQueNoSePuedeBorrar(solicitud(envio({ chosenOptionNumber: 2 })), cotizadora);
  assert.match(String(motivo), /eligió una opción/i);
});

console.log("\nLo que no se borra nunca");

prueba("con el depósito cobrado no la borra ni un administrador", () => {
  const motivo = porQueNoSePuedeBorrar(
    solicitud(envio({ status: "SENT", sentAt: new Date(), depositPaidAt: new Date() })),
    admin,
  );
  assert.match(String(motivo), /depósito cobrado/i);
});

prueba("y el depósito manda sobre lo demás", () => {
  // Aunque el envío que lo lleva no sea el primero de la lista.
  const motivo = porQueNoSePuedeBorrar(
    solicitud(envio(), envio({ depositPaidAt: new Date() })),
    admin,
  );
  assert.match(String(motivo), /depósito cobrado/i);
});

console.log("\nVarias versiones de la misma solicitud");

prueba("un solo envío ya fuera bloquea a toda la solicitud", () => {
  // Una solicitud puede tener tres versiones: dos borradores y una enviada.
  // Borrarla se lleva las tres, así que manda la que más protección necesita.
  const motivo = porQueNoSePuedeBorrar(
    solicitud(envio(), envio({ status: "SENT", sentAt: new Date() }), envio()),
    cotizadora,
  );
  assert.match(String(motivo), /administrador/i);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
