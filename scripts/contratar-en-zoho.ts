/**
 * Escribe en el CRM REAL lo contratado de una propuesta ya elegida: las filas
 * de «Servicios Contratados», el Importe y la línea de opción elegida.
 *
 *   node --import tsx scripts/contratar-en-zoho.ts ORV-2026-0006
 *
 * ESCRIBE EN ZOHO. Sirve para probar el circuito sobre un trato de prueba y
 * para rellenar a posteriori una propuesta que se eligió antes de que esto
 * existiera. Usa la base de datos del .env (local o la que apunte).
 */
import { PrismaClient } from "@prisma/client";
import { contratarEnElCrm } from "../server/serviciosContratados";

const referencia = process.argv[2];
if (!referencia) {
  console.error("Falta la referencia (ORV-AAAA-NNNN).");
  process.exit(1);
}

const prisma = new PrismaClient();
const delivery = await prisma.proposalDelivery.findFirst({ where: { reference: referencia } });
if (!delivery) {
  console.error(`No hay ninguna entrega con referencia ${referencia} en esta base de datos.`);
  process.exit(1);
}
if (!delivery.chosenOptionNumber) {
  console.error(`${referencia} no tiene opción elegida todavía.`);
  process.exit(1);
}
console.log(`${referencia}: opción elegida ${delivery.chosenOptionNumber}. Escribiendo en el CRM…`);
const r = await contratarEnElCrm(delivery.id, delivery.chosenOptionNumber);
console.log(r ? `Hecho: trato ${r.dealId}, ${r.filas} fila(s), importe ${r.total}${r.creados.length ? `, creados: ${r.creados.join(", ")}` : ""}.` : "No se escribió nada: mira el registro de arriba.");
await prisma.$disconnect();
