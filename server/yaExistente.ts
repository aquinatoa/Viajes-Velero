/**
 * «Ya existente»: al volver a subir un documento de tarifas, lo que ya está
 * publicado igual no se vuelve a revisar.
 *
 * Ruth, 24/11/2026: «Si tenemos que revisar TODO otra vez no es práctico...
 * Debería poder identificar lo que ya está cargado como "ya existente" o algo
 * así». Hasta ahora, subir el Excel de hoteles con dos rectificaciones dejaba
 * las 737 tarifas, los 132 suplementos y las 184 condiciones «pendientes de
 * revisión».
 *
 * Al crear los candidatos de un documento, cada tarifa, suplemento, condición y
 * fecha especial se compara con lo publicado del alojamiento o la actividad del
 * mismo nombre (de cualquier documento: el Excel nuevo es otro documento). Si
 * coincide en todo lo que se publica —incluido el precio, calculado como al
 * publicar—, queda aprobado y marcado `yaExistente`. Lo nuevo y lo que cambia
 * sigue pendiente, como siempre.
 *
 * El alojamiento o la actividad solo se aprueba solo si TODO lo suyo ya
 * existía: si algo cambia, se revisa entero, que es donde hay que mirar.
 */
import { PrismaClient } from "@prisma/client";

import { resolveRatePrices, toRateKind } from "./pricing";

const prisma = new PrismaClient();

type Valor = string | number | boolean | Date | null | undefined | { toString(): string };

function texto(v: Valor): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function importe(v: Valor): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(String(v));
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : texto(v);
}

/** Sin canal y «GENERIC» son lo mismo: la publicación los trata igual. */
function canalDe(v: Valor): string {
  const t = texto(v);
  return t === "" ? "generic" : t;
}

/** El nombre con el que se reconoce el mismo alojamiento o actividad. */
export function claveDeNombre(nombre: string | null | undefined): string {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Lo que identifica una tarifa de hotel publicada, precio incluido. */
export function firmaDeTarifaDeHotel(t: {
  year: Valor;
  seasonName: Valor;
  dateFrom: Valor;
  dateTo: Valor;
  minNights: Valor;
  boardType: Valor;
  tariffUnit: Valor;
  occupancyLabel: Valor;
  unitName: Valor;
  minPax: Valor;
  includedService: Valor;
  clientSegment: Valor;
  pvpAmount: Valor;
  netSaleAmount: Valor;
}): string {
  return [
    texto(t.year),
    texto(t.seasonName),
    texto(t.dateFrom),
    texto(t.dateTo),
    texto(t.minNights),
    texto(t.boardType),
    texto(t.tariffUnit),
    texto(t.occupancyLabel),
    texto(t.unitName),
    texto(t.minPax),
    texto(t.includedService),
    canalDe(t.clientSegment),
    importe(t.pvpAmount),
    importe(t.netSaleAmount),
  ].join("|");
}

/** Lo que identifica una tarifa de actividad publicada, precio incluido. */
export function firmaDeTarifaDeActividad(t: {
  year: Valor;
  seasonName: Valor;
  dateFrom: Valor;
  dateTo: Valor;
  ageLabel: Valor;
  ageMin: Valor;
  ageMax: Valor;
  rateUnit: Valor;
  minPax: Valor;
  maxPax: Valor;
  clientSegment: Valor;
  salePvpAmount: Valor;
  costNetAmount: Valor;
}): string {
  return [
    texto(t.year),
    texto(t.seasonName),
    texto(t.dateFrom),
    texto(t.dateTo),
    texto(t.ageLabel),
    texto(t.ageMin),
    texto(t.ageMax),
    texto(t.rateUnit),
    texto(t.minPax),
    texto(t.maxPax),
    canalDe(t.clientSegment),
    importe(t.salePvpAmount),
  ].join("|");
}

/**
 * La de actividad con su coste. Si el documento no trae coste, se compara sin
 * él: el del catálogo puede haberse puesto después (PortAventura con su 20 %,
 * los extras de MARSOPA), y eso no es un cambio del documento.
 */
export function firmaDeTarifaDeActividadConCoste(t: Parameters<typeof firmaDeTarifaDeActividad>[0]): string {
  return `${firmaDeTarifaDeActividad(t)}|${importe(t.costNetAmount)}`;
}

export function firmaDeSuplemento(a: {
  adjustmentType: Valor;
  concept: Valor;
  amountType: Valor;
  amount: Valor;
  appliesPer: Valor;
  conditionText: Valor;
}): string {
  return [texto(a.adjustmentType), texto(a.concept), texto(a.amountType), importe(a.amount), texto(a.appliesPer), texto(a.conditionText)].join("|");
}

export function firmaDeCondicion(p: { policyType: Valor; policyText: Valor }): string {
  return [texto(p.policyType), texto(p.policyText)].join("|");
}

export function firmaDeFechaEspecial(b: { dateFrom: Valor; dateTo: Valor; availabilityStatus: Valor; reason: Valor }): string {
  return [texto(b.dateFrom), texto(b.dateTo), texto(b.availabilityStatus), texto(b.reason)].join("|");
}

export interface ResultadoYaExistente {
  tarifas: number;
  suplementos: number;
  condiciones: number;
  fechas: number;
  /** Alojamientos y actividades en los que no cambia nada. */
  enterosSinCambios: number;
}

const PENDIENTE = "PENDING";
const YA_EXISTENTE = { reviewStatus: "APPROVED", requiresReview: false, yaExistente: true } as const;

/**
 * Marca como «ya existente» (aprobado) lo de este documento que ya está
 * publicado igual. Solo toca candidatos PENDIENTES: lo ya revisado a mano no
 * se cambia. No publica nada.
 */
export async function marcarLoYaExistente(sourceDocumentId: string): Promise<ResultadoYaExistente> {
  const resultado: ResultadoYaExistente = { tarifas: 0, suplementos: 0, condiciones: 0, fechas: 0, enterosSinCambios: 0 };
  const documento = await prisma.sourceDocument.findUnique({
    where: { id: sourceDocumentId },
    select: { rateKind: true, marginPercent: true, clientSegment: true, controlYear: true },
  });
  if (!documento) return resultado;
  const rateKind = toRateKind(documento.rateKind);
  const margen = documento.marginPercent === null ? null : Number(documento.marginPercent);
  const canal = documento.clientSegment ?? null;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(String(v)));

  // ── Alojamientos ──
  const alojamientos = await prisma.stagingAccommodation.findMany({
    where: { sourceDocumentId },
    include: { rates: true, adjustments: true, policies: true, blackoutDates: true },
  });
  if (alojamientos.length) {
    // También lo publicado desde este mismo documento: volver a subir el
    // archivo al mismo documento es justo el caso de Ruth.
    const publicados = await prisma.accommodation.findMany({
      include: { rates: true, adjustments: true, policies: true, blackoutDates: true },
    });
    const porNombre = new Map<string, typeof publicados>();
    for (const a of publicados) {
      const clave = claveDeNombre(a.accommodationName);
      porNombre.set(clave, [...(porNombre.get(clave) ?? []), a]);
    }

    for (const candidato of alojamientos) {
      const mismos = porNombre.get(claveDeNombre(candidato.accommodationName)) ?? [];
      if (mismos.length === 0) continue;
      const tarifas = new Set(mismos.flatMap((a) => a.rates.map(firmaDeTarifaDeHotel)));
      const suplementos = new Set(mismos.flatMap((a) => a.adjustments.map(firmaDeSuplemento)));
      const condiciones = new Set(mismos.flatMap((a) => a.policies.map(firmaDeCondicion)));
      const fechas = new Set(mismos.flatMap((a) => a.blackoutDates.map(firmaDeFechaEspecial)));

      const tarifasIguales = candidato.rates.filter((r) => {
        const { salePrice, costPrice } = resolveRatePrices(
          { pvpAmount: num(r.pvpAmount), netAmount: num(r.netAmount), costAmount: num(r.costAmount) },
          rateKind,
          margen,
        );
        return tarifas.has(
          firmaDeTarifaDeHotel({
            year: r.year ?? documento.controlYear,
            seasonName: r.seasonName,
            dateFrom: r.dateFrom,
            dateTo: r.dateTo,
            minNights: r.minNights,
            boardType: r.boardType,
            tariffUnit: r.rateUnit,
            occupancyLabel: r.occupancyLabel,
            unitName: r.unitName,
            minPax: r.minPax,
            includedService: r.includedService,
            clientSegment: canal,
            pvpAmount: salePrice,
            netSaleAmount: costPrice,
          }),
        );
      });
      const suplementosIguales = candidato.adjustments.filter((a) => suplementos.has(firmaDeSuplemento(a)));
      const condicionesIguales = candidato.policies.filter((p) => condiciones.has(firmaDeCondicion(p)));
      const fechasIguales = candidato.blackoutDates.filter((b) => fechas.has(firmaDeFechaEspecial(b)));

      const pendientes = <T extends { id: string; reviewStatus: string }>(filas: T[]) =>
        filas.filter((f) => f.reviewStatus === PENDIENTE).map((f) => f.id);
      const idsTarifas = pendientes(tarifasIguales);
      const idsSuplementos = pendientes(suplementosIguales);
      const idsCondiciones = pendientes(condicionesIguales);
      const idsFechas = pendientes(fechasIguales);
      if (idsTarifas.length) await prisma.stagingAccommodationRate.updateMany({ where: { id: { in: idsTarifas } }, data: YA_EXISTENTE });
      if (idsSuplementos.length) await prisma.stagingAccommodationAdjustment.updateMany({ where: { id: { in: idsSuplementos } }, data: YA_EXISTENTE });
      if (idsCondiciones.length) await prisma.stagingAccommodationPolicy.updateMany({ where: { id: { in: idsCondiciones } }, data: YA_EXISTENTE });
      if (idsFechas.length) await prisma.stagingAccommodationBlackoutDate.updateMany({ where: { id: { in: idsFechas } }, data: YA_EXISTENTE });
      resultado.tarifas += idsTarifas.length;
      resultado.suplementos += idsSuplementos.length;
      resultado.condiciones += idsCondiciones.length;
      resultado.fechas += idsFechas.length;

      const todoIgual =
        tarifasIguales.length === candidato.rates.length &&
        suplementosIguales.length === candidato.adjustments.length &&
        condicionesIguales.length === candidato.policies.length &&
        fechasIguales.length === candidato.blackoutDates.length &&
        candidato.rates.length > 0;
      if (todoIgual && candidato.reviewStatus === PENDIENTE) {
        await prisma.stagingAccommodation.update({ where: { id: candidato.id }, data: { reviewStatus: "APPROVED", yaExistente: true } });
        resultado.enterosSinCambios += 1;
      }
    }
  }

  // ── Actividades ──
  const actividades = await prisma.stagingActivity.findMany({
    where: { sourceDocumentId },
    include: { rates: true, policies: true },
  });
  if (actividades.length) {
    const publicadas = await prisma.activity.findMany({
      include: { rates: true, policies: true },
    });
    const porNombre = new Map<string, typeof publicadas>();
    for (const a of publicadas) {
      const clave = claveDeNombre(a.activityName);
      porNombre.set(clave, [...(porNombre.get(clave) ?? []), a]);
    }

    for (const candidata of actividades) {
      const mismas = porNombre.get(claveDeNombre(candidata.activityName)) ?? [];
      if (mismas.length === 0) continue;
      const tarifas = new Set(mismas.flatMap((a) => a.rates.map(firmaDeTarifaDeActividad)));
      const tarifasConCoste = new Set(mismas.flatMap((a) => a.rates.map(firmaDeTarifaDeActividadConCoste)));
      const condiciones = new Set(mismas.flatMap((a) => a.policies.map(firmaDeCondicion)));

      const tarifasIguales = candidata.rates.filter((r) => {
        const { salePrice, costPrice } = resolveRatePrices(
          { pvpAmount: num(r.salePvpAmount), costAmount: num(r.costNetAmount) },
          rateKind,
          margen,
        );
        const firmar = costPrice === null || costPrice === undefined ? firmaDeTarifaDeActividad : firmaDeTarifaDeActividadConCoste;
        return (costPrice === null || costPrice === undefined ? tarifas : tarifasConCoste).has(
          firmar({
            year: r.year ?? documento.controlYear,
            seasonName: r.seasonName,
            dateFrom: r.dateFrom,
            dateTo: r.dateTo,
            ageLabel: r.ageLabel,
            ageMin: r.ageMin,
            ageMax: r.ageMax,
            rateUnit: r.rateUnit,
            minPax: r.minPax,
            maxPax: r.maxPax,
            clientSegment: canal,
            salePvpAmount: salePrice,
            costNetAmount: costPrice,
          }),
        );
      });
      const condicionesIguales = candidata.policies.filter((p) => condiciones.has(firmaDeCondicion(p)));

      const idsTarifas = tarifasIguales.filter((f) => f.reviewStatus === PENDIENTE).map((f) => f.id);
      const idsCondiciones = condicionesIguales.filter((f) => f.reviewStatus === PENDIENTE).map((f) => f.id);
      if (idsTarifas.length) await prisma.stagingActivityRate.updateMany({ where: { id: { in: idsTarifas } }, data: YA_EXISTENTE });
      if (idsCondiciones.length) await prisma.stagingActivityPolicy.updateMany({ where: { id: { in: idsCondiciones } }, data: YA_EXISTENTE });
      resultado.tarifas += idsTarifas.length;
      resultado.condiciones += idsCondiciones.length;

      const todoIgual =
        tarifasIguales.length === candidata.rates.length &&
        condicionesIguales.length === candidata.policies.length &&
        candidata.rates.length > 0;
      if (todoIgual && candidata.reviewStatus === PENDIENTE) {
        await prisma.stagingActivity.update({ where: { id: candidata.id }, data: { reviewStatus: "APPROVED", yaExistente: true } });
        resultado.enterosSinCambios += 1;
      }
    }
  }

  return resultado;
}
