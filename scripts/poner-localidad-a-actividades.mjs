/**
 * Pone la LOCALIDAD a las actividades ya publicadas, que es por lo que se
 * busca.
 *
 * Una actividad tiene dos sitios distintos y hasta ahora solo guardaba uno:
 *
 *   locationMain   dónde ocurre: «PortAventura Park», «Caribe Aquatic Park».
 *                  Es lo que se le cuenta al colegio.
 *   locality       en qué pueblo está. Es por lo que se busca.
 *
 * Al no existir el segundo, buscar Salou devolvía CERO actividades teniendo 402
 * publicadas. Solo aparecían escribiendo «PortAventura Park» en el destino, y
 * eso no lo pide ningún colegio.
 *
 * La localidad sale del documento del que se publicó la actividad, que es la
 * que puso una persona al registrarlo sabiendo para qué destino se vende. Si el
 * documento no la tiene, la actividad se deja como está y se dice cuál es.
 *
 *   node --import tsx scripts/poner-localidad-a-actividades.mjs
 *   node --import tsx scripts/poner-localidad-a-actividades.mjs --aplicar
 */
import "../server/loadEnv.ts";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const aplicar = process.argv.includes("--aplicar");

const actividades = await prisma.activity.findMany({
  select: {
    id: true,
    activityName: true,
    locationMain: true,
    locality: true,
    sourceDocumentId: true,
    _count: { select: { rates: true } },
  },
  orderBy: { activityName: "asc" },
});

// La ubicación de cada documento, de una sola consulta.
const idsDocumento = [...new Set(actividades.map((a) => a.sourceDocumentId).filter(Boolean))];
const documentos = await prisma.sourceDocument.findMany({
  where: { id: { in: idsDocumento } },
  select: { id: true, controlName: true, controlLocation: true },
});
const sitioDelDocumento = new Map(documentos.map((d) => [d.id, d]));

console.log(
  `${actividades.length} actividades.` +
    (aplicar ? " Se van a aplicar los cambios.\n" : " ENSAYO EN SECO: no se escribe nada.\n"),
);

let puestas = 0;
let yaEstaban = 0;
let sinDonde = 0;

for (const actividad of actividades) {
  const doc = actividad.sourceDocumentId ? sitioDelDocumento.get(actividad.sourceDocumentId) : null;
  const etiqueta = `${actividad.activityName.slice(0, 42).padEnd(44)} ${String(actividad._count.rates).padStart(3)} tarifas`;

  if (actividad.locality?.trim()) {
    yaEstaban += 1;
    continue;
  }

  const localidad = doc?.controlLocation?.trim();
  if (!localidad) {
    sinDonde += 1;
    console.log(`  ?  ${etiqueta} · su documento «${doc?.controlName ?? "sin documento"}» tampoco tiene sitio`);
    continue;
  }

  console.log(`  →  ${etiqueta} · «${actividad.locationMain ?? "sin sitio"}» → localidad «${localidad}»`);
  puestas += 1;

  if (aplicar) {
    await prisma.activity.update({ where: { id: actividad.id }, data: { locality: localidad } });
  }
}

console.log(
  `\n${puestas} ${aplicar ? "actualizadas" : "se actualizarían"}, ${yaEstaban} ya la tenían, ${sinDonde} sin sitio en su documento.`,
);
if (!aplicar && puestas > 0) {
  console.log("Para aplicarlo de verdad: añade --aplicar");
}
if (sinDonde > 0) {
  console.log(
    "\nLas que no tienen sitio hay que arreglarlas en su documento, en el campo «Dónde está».",
  );
}

await prisma.$disconnect();
