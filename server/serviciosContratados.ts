import { PrismaClient } from "@prisma/client";
import { desgloseDeLaOpcion } from "../src/domain/desgloseDeOpcion";
import {
  buscarIdPorNombre,
  buscarPorNombreParecido,
  crearRegistro,
  escribirServiciosContratados,
  leerServiciosContratados,
  updateZohoDeal,
  type FilaExistente,
} from "./zoho";

export { desgloseDeLaOpcion, importeDesdeTexto } from "../src/domain/desgloseDeOpcion";

const prisma = new PrismaClient();

/**
 * Lo contratado, en la tabla del trato.
 *
 * Anthony, 07/10/2026: «esa es la tabla que se tiene que actualizar: Servicios
 * Contratados». Cuando el colegio elige una opción (o se marca desde la ficha)
 * la app escribía en el trato la fase y una nota, y lo contratado de verdad
 * —qué hotel, cuántos alumnos, a qué precio, cuántas noches— lo tenía que
 * teclear alguien a mano en el subformulario, como hacen con LA SALLE
 * DONOSTIA 2027: una fila «ALUMNOS EN MÚLTIPLE - PC» y otra «PROFESORES EN
 * DOBLE - PC», cada una con pasajeros, precio por persona y noche, coste y
 * noches. El Importe del trato es la suma.
 *
 * Esto rellena esas filas desde la opción elegida. El desglose de la opción
 * está guardado como texto («43,13 € x 48 alumnos + 60,11 € x 8 profesores
 * (uso individual), por noche x 4 noches») porque la propuesta es una foto;
 * se lee de ahí, y el formato es nuestro, así que se lee sin adivinar.
 *
 * «Servicio» y «Proveedor» son enlaces a Productos y Proveedores del CRM: se
 * buscan por nombre y, si no existen, se crean. El producto sigue su patrón
 * («Habitación Múltiple - Hotel - PC»); lo que ellos tengan ya con ese nombre
 * se reutiliza.
 *
 * Lo que hacen SUS funciones con estas filas (código que nos pasó Anthony el
 * 13/10/2026, porque la API no deja leerlo):
 *
 * - «NEO_Actualizar_Totales_Por_Presupuesto», en cada edición del trato: el
 *   Importe es la suma de las filas con `Validado`, con `Coste` Y `Precio`, y
 *   del presupuesto `N_Presupuesto_Subformulario`. Una fila sin coste o sin
 *   validar no cuenta: por eso el Importe se quedaba a 0. Si el producto es
 *   «P.Pax», cuenta Viajeros × Cantidad × Precio.
 * - «JZ_NEO_Subform_Servicios_Contratados»: rehace las filas; si una no trae
 *   Coste copia el «Precio de coste» del producto, y en P.Pax pone en
 *   Cantidad las noches entre entrada y salida. Las filas salen con id nuevo,
 *   así que las nuestras se reconocen por la referencia en Comentarios.
 *
 * Así que cada fila lleva su coste, y se marca validada solo si el coste se
 * sabe: el precio sale de una tarifa ya aprobada en la revisión por
 * proveedor. Si el coste no se sabe, la fila va sin validar y lo dice.
 */

/** El régimen de la app (SA/AD/MP/PC o texto) → la lista del CRM. */
export function regimenEnCrm(boardType: string | null | undefined): string | null {
  const b = (boardType ?? "").trim().toLowerCase();
  if (!b) return null;
  if (b === "pc" || b.includes("completa")) return "Pensión Completa";
  if (b === "mp" || b.includes("media")) return "Media Pensión";
  if (b === "ad" || b.includes("desayuno")) return "Alojamiento y Desayuno";
  if (b === "sa" || b.includes("solo")) return "Solo Alojamiento";
  return null;
}

/** La abreviatura que usan ellos en el nombre del producto. */
function regimenCorto(boardType: string | null | undefined): string {
  const r = regimenEnCrm(boardType);
  return r === "Pensión Completa" ? "PC" : r === "Media Pensión" ? "MP" : r === "Alojamiento y Desayuno" ? "AD" : r === "Solo Alojamiento" ? "SA" : "";
}

/**
 * El hotel como lo nombran ellos: «Hotel Planas 3* (Salou)» → «Hotel Planas».
 * Fuera las estrellas, lo que va entre paréntesis y lo que sigue a un guion
 * largo («4R Hotels 3* – Salou & Calafell (…)» → «4R Hotels»).
 */
export function nombreCortoDelHotel(snapshot: string | null | undefined): string {
  return (snapshot ?? "")
    .split(/\s[–—-]\s/)[0]
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d\s*\*+/g, " ")
    .replace(/\*+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PALABRAS_VACIAS = new Set(["hotel", "hotels", "hostal", "camping", "aparthotel", "apartamentos", "resort", "de", "del", "la", "el", "los", "las", "y", "&", "en"]);

/** Las palabras que de verdad identifican al hotel, sin tildes ni mayúsculas. */
export function palabrasClave(nombreCorto: string): string[] {
  return nombreCorto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 1 && !PALABRAS_VACIAS.has(p));
}

function normalizado(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Entre los proveedores que contienen la palabra más larga del hotel, el que
 * contiene TODAS sus palabras clave. Si hay exactamente uno, es él; si hay
 * varios o ninguno, null: no se adivina.
 */
export function elegirProveedor(
  nombreCorto: string,
  candidatos: Array<{ id: string; nombre: string }>,
): { id: string; nombre: string } | null {
  const claves = palabrasClave(nombreCorto);
  if (claves.length === 0) return null;
  const conTodas = candidatos.filter((c) => claves.every((k) => normalizado(c.nombre).includes(k)));
  if (conTodas.length === 1) return conTodas[0];
  // «CAMPING LA SIESTA» y «LA SIESTA BEACH CLUB» contienen «siesta»; el que
  // no tiene ninguna palabra de más es el nuestro.
  const mismasPalabras = conTodas.filter((c) => palabrasClave(c.nombre).join(" ") === claves.join(" "));
  return mismasPalabras.length === 1 ? mismasPalabras[0] : null;
}

const centimos = (n: number) => Math.round(n * 100);

/**
 * El coste de un precio de venta, buscado en las tarifas del hotel y régimen:
 * las que se venden a ese precio y, de ellas, su neto. Si todas dicen el mismo
 * neto, ese es el coste; si no hay ninguna, o dicen netos distintos, o la
 * tarifa vino de un papel de venta (sin neto), null: no se adivina.
 *
 * La propuesta guarda el precio pero no el coste, y su enlace al hotel se
 * pierde cuando se vuelve a publicar el documento (ORV-2026-0006 lo había
 * perdido el 13/10), así que se busca por nombre en el catálogo de hoy.
 */
export function costeDelPrecio(
  precio: number,
  tarifas: Array<{ pvp: number | null; neto: number | null }>,
): number | null {
  const netos = new Set(
    tarifas
      .filter((t) => t.pvp !== null && centimos(t.pvp) === centimos(precio))
      .map((t) => (t.neto !== null && t.neto > 0 ? centimos(t.neto) : -1)),
  );
  if (netos.size !== 1) return null;
  const [unico] = [...netos];
  return unico > 0 ? unico / 100 : null;
}

/**
 * Qué filas del trato se quedan y con qué número de presupuesto van las
 * nuestras.
 *
 * La API v8 CONSERVA las filas que no se mandan; para quitar una hay que
 * nombrarla con `_delete` (13/10/2026: las dos filas viejas del trato de
 * prueba se quedaron al lado de las nuevas). Se borran solo las que escribió
 * la app para ESTA propuesta (llevan su referencia en Comentarios); las demás
 * no se tocan. Y si ya había filas ajenas, las nuestras van en otro
 * presupuesto (el siguiente libre) para no sumarse a las suyas; si la app ya
 * había escrito antes, repite su número.
 */
export function planDelSubformulario(
  existentes: FilaExistente[],
  referencia: string,
): { conservar: string[]; borrar: string[]; numero: number } {
  const nuestras = existentes.filter((f) => (f.comentarios ?? "").includes(referencia));
  const ajenas = existentes.filter((f) => !(f.comentarios ?? "").includes(referencia));
  const numeroPrevio = nuestras.find((f) => f.numero !== null)?.numero ?? null;
  const usados = ajenas.map((f) => f.numero ?? 1);
  const numero = numeroPrevio ?? (usados.length ? Math.max(...usados) + 1 : 1);
  return { conservar: ajenas.map((f) => f.id), borrar: nuestras.map((f) => f.id), numero };
}

/** Una fila del subformulario, todavía con nombres en vez de ids. */
export interface FilaContratada {
  quien: "alumnos" | "profesores";
  comentario: string;
  pax: number;
  precio: number;
  noches: number;
  producto: string;
  proveedor: string;
  regimen: string | null;
  fechaEntrada: string | null;
  fechaSalida: string | null;
}

export interface OpcionParaContratar {
  accommodationNameSnapshot: string | null;
  boardType: string | null;
  dateFrom: Date | string | null;
  dateTo: Date | string | null;
  priceBreakdownText: string | null;
  totalPvpText: string | null;
  /** El coste guardado al cotizar (desde el 15/10/2026). Decimal de Prisma o número. */
  studentCostAmount?: unknown;
  teacherCostAmount?: unknown;
}

function numeroONulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * El coste de una fila: el que se guardó al cotizar, si lo hay; si no (las
 * propuestas de antes del 15/10/2026), el que se deduce del catálogo por el
 * precio. Un alojamiento ad hoc solo tiene el guardado.
 */
export function costeDeLaFila(
  fila: Pick<FilaContratada, "quien" | "precio">,
  opcion: Pick<OpcionParaContratar, "studentCostAmount" | "teacherCostAmount">,
  tarifas: Array<{ pvp: number | null; neto: number | null }>,
): number | null {
  const guardado = numeroONulo(fila.quien === "profesores" ? opcion.teacherCostAmount : opcion.studentCostAmount);
  return guardado ?? costeDelPrecio(fila.precio, tarifas);
}

function fecha(valor: Date | string | null): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Las filas de la opción: alumnos (en múltiple) y, si los hay, profesores
 * (en individual si tenían tarifa propia; si no, en múltiple al mismo precio).
 */
export function filasDeLaOpcion(opcion: OpcionParaContratar): { filas: FilaContratada[]; total: number | null } | null {
  const d = desgloseDeLaOpcion(opcion.priceBreakdownText, opcion.totalPvpText);
  const hotel = (opcion.accommodationNameSnapshot ?? "").trim();
  if (!d || !hotel) return null;

  const corto = regimenCorto(opcion.boardType);
  const sufijo = corto ? ` - ${corto}` : "";
  const hotelCorto = nombreCortoDelHotel(hotel) || hotel;
  // En el nombre del producto, como ellos: «Canada Palace», sin «Hotel».
  const hotelEnProducto = hotelCorto.replace(/^hotel\s+/i, "");
  const comun = {
    noches: d.noches,
    proveedor: hotelCorto,
    regimen: regimenEnCrm(opcion.boardType),
    fechaEntrada: fecha(opcion.dateFrom),
    fechaSalida: fecha(opcion.dateTo),
  };

  const filas: FilaContratada[] = [
    {
      ...comun,
      quien: "alumnos",
      comentario: `ALUMNOS EN MÚLTIPLE${sufijo}`,
      pax: d.alumnos.pax,
      precio: d.alumnos.precio,
      producto: `Habitación Múltiple - ${hotelEnProducto}${sufijo}`,
    },
  ];
  if (d.profesores && d.profesores.pax > 0) {
    const tipo = d.profesores.individual ? "Individual" : "Múltiple";
    filas.push({
      ...comun,
      quien: "profesores",
      comentario: `PROFESORES EN ${tipo.toUpperCase()}${sufijo}`,
      pax: d.profesores.pax,
      precio: d.profesores.precio,
      producto: `Habitación ${tipo} - ${hotelEnProducto}${sufijo}`,
    });
  }
  return { filas, total: d.total };
}

export interface ResultadoDeContratar {
  dealId: string;
  filas: number;
  total: number | null;
  /** Filas que van sin validar porque no se sabe su coste. */
  sinCoste: number;
  presupuesto: number;
  conservadas: number;
  creados: string[];
}

/** Las tarifas del hotel y régimen de la opción, en el catálogo de hoy. */
async function tarifasDelHotel(
  opcion: { accommodationId: string | null; accommodationNameSnapshot: string | null; boardType: string | null },
): Promise<Array<{ pvp: number | null; neto: number | null }>> {
  const nombre = (opcion.accommodationNameSnapshot ?? "").trim();
  const donde = [
    ...(opcion.accommodationId ? [{ id: opcion.accommodationId }] : []),
    ...(nombre ? [{ accommodationName: nombre }] : []),
  ];
  if (donde.length === 0) return [];
  const rates = await prisma.accommodationRate.findMany({
    where: { accommodation: { OR: donde }, ...(opcion.boardType ? { boardType: opcion.boardType } : {}) },
    select: { pvpAmount: true, netSaleAmount: true },
  });
  return rates.map((r) => ({
    pvp: r.pvpAmount === null ? null : Number(r.pvpAmount),
    neto: r.netSaleAmount === null ? null : Number(r.netSaleAmount),
  }));
}

/**
 * Escribe en el trato lo contratado de UNA entrega. No lanza: lo que falle se
 * apunta en el registro, porque la elección del colegio ya está guardada y no
 * puede depender de Zoho.
 */
export async function contratarEnElCrm(deliveryId: string, optionNumber: number): Promise<ResultadoDeContratar | null> {
  try {
    const delivery = await prisma.proposalDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        proposal: {
          include: {
            accommodationOptions: true,
            tripRequest: { select: { crmDealId: true } },
          },
        },
      },
    });
    const dealId = delivery?.proposal?.tripRequest?.crmDealId ?? null;
    if (!delivery || !dealId) {
      console.info(`[crm] ${deliveryId}: sin trato en el CRM, no hay dónde escribir lo contratado.`);
      return null;
    }
    const opcion = delivery.proposal.accommodationOptions.find((o) => o.optionNumber === optionNumber);
    if (!opcion) {
      console.error(`[crm] ${delivery.reference}: la opción ${optionNumber} no existe en la propuesta.`);
      return null;
    }
    const plan = filasDeLaOpcion(opcion);
    if (!plan) {
      console.error(`[crm] ${delivery.reference}: no se pudo leer el desglose de la opción ${optionNumber}: «${opcion.priceBreakdownText}».`);
      return null;
    }

    const tarifas = await tarifasDelHotel(opcion);
    const existentes = await leerServiciosContratados(dealId);
    const { conservar, borrar, numero } = planDelSubformulario(existentes, delivery.reference);

    const creados: string[] = [];
    const proveedor = await idDeProveedor(plan.filas[0].proveedor, creados);
    const categoria = delivery.department === "SPORTS" ? "Turismo Deportivo" : "Grupos";

    const filas = [];
    let sinCoste = 0;
    for (const f of plan.filas) {
      const coste = costeDeLaFila(f, opcion, tarifas);
      if (coste === null) sinCoste += 1;
      const productoId = await idDeProducto(f, coste, proveedor.id, categoria, delivery.reference, creados);
      const avisos = [
        ...(proveedor.nuevo ? ["proveedor nuevo en el CRM: revisar"] : []),
        ...(coste === null ? ["falta el coste: poner Coste y marcar Validado"] : []),
      ];
      filas.push({
        N_Presupuesto: numero,
        Servicio: { id: productoId },
        Proveedor: { id: proveedor.id },
        Viajeros: f.pax,
        Precio: f.precio,
        Coste: coste,
        Cantidad: f.noches,
        Fecha_Entrada: f.fechaEntrada,
        Fecha_Salida: f.fechaSalida,
        Regimen: f.regimen,
        Unidad_de_uso: "P.Pax",
        Tipo_de_Servicio: "Alojamiento",
        Comentarios: [f.comentario, delivery.reference, ...avisos].join(" · "),
        // Sin coste, su función no la sumaría aunque fuera validada; y validar
        // una fila sin coste diría que está revisada cuando no lo está.
        Validado: coste !== null,
      });
    }

    await escribirServiciosContratados(dealId, [...borrar.map((id) => ({ id, _delete: null })), ...filas], numero, plan.total);
    // Y la línea de opción elegida, la misma que escribe el botón de Viajes.
    await updateZohoDeal({ dealId, chosenOption: optionNumber });

    console.info(
      `[crm] ${delivery.reference}: ${filas.length} fila(s) en Servicios Contratados (presupuesto ${numero}` +
        (conservar.length ? `, ${conservar.length} fila(s) ajenas conservadas` : "") +
        `), importe ${plan.total ?? "?"}` +
        (sinCoste ? `, ${sinCoste} sin coste: sin validar` : "") +
        (creados.length ? `, creados: ${creados.join(", ")}` : "") +
        ".",
    );
    return { dealId, filas: filas.length, total: plan.total, sinCoste, presupuesto: numero, conservadas: conservar.length, creados };
  } catch (error) {
    console.error("[crm] no se pudo escribir lo contratado", error);
    return null;
  }
}

/**
 * El proveedor del CRM para este hotel. Ellos los llaman «HOTEL PLANAS»,
 * «CAMPING LA SIESTA»: se busca por parecido y solo se acepta si hay uno
 * claro. Si no, se crea con el nombre corto en mayúsculas, como los suyos, y
 * la fila lo dice para que alguien lo revise o lo fusione.
 */
async function idDeProveedor(nombreCorto: string, creados: string[]): Promise<{ id: string; nuevo: boolean }> {
  const exacto = await buscarIdPorNombre("Vendors", "Vendor_Name", nombreCorto);
  if (exacto) return { id: exacto, nuevo: false };

  const claves = palabrasClave(nombreCorto);
  const masLarga = [...claves].sort((a, b) => b.length - a.length)[0];
  if (masLarga) {
    const candidatos = await buscarPorNombreParecido("Vendors", "Vendor_Name", masLarga);
    const elegido = elegirProveedor(nombreCorto, candidatos);
    if (elegido) return { id: elegido.id, nuevo: false };
  }

  const nombre = nombreCorto.toUpperCase();
  const id = await crearRegistro("Vendors", { Vendor_Name: nombre });
  creados.push(`proveedor «${nombre}»`);
  return { id, nuevo: true };
}

/**
 * El producto del CRM para esta fila. Por nombre exacto; si no existe, se
 * crea como los suyos: tipo Alojamiento (sin eso el lookup del subformulario
 * lo rechaza: «FILTER_CRITERIA_NOT_SATISFIED»), categoría del departamento,
 * unidad P.Pax (su función multiplica por viajeros solo si lo es), precio de
 * venta, precio de coste y proveedor.
 */
async function idDeProducto(
  f: FilaContratada,
  coste: number | null,
  proveedorId: string,
  categoria: string,
  referencia: string,
  creados: string[],
): Promise<string> {
  const existente = await buscarIdPorNombre("Products", "Product_Name", f.producto);
  if (existente) return existente;
  const id = await crearRegistro("Products", {
    Product_Name: f.producto,
    Vendor_Name: { id: proveedorId },
    Product_Active: true,
    Tipo_de_Servicio: "Alojamiento",
    Product_Category: categoria,
    Usage_Unit: "P.Pax",
    Unit_Price: f.precio,
    ...(coste !== null ? { Precio_de_coste: coste } : {}),
    Description: `Creado por la consola al contratar la propuesta ${referencia}.`,
  });
  creados.push(`producto «${f.producto}»`);
  return id;
}
