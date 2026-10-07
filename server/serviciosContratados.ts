import { PrismaClient } from "@prisma/client";
import {
  buscarIdPorNombre,
  buscarPorNombreParecido,
  crearRegistro,
  escribirServiciosContratados,
  updateZohoDeal,
} from "./zoho";

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
 */

export interface ParteDelDesglose {
  pax: number;
  /** Por persona y noche. */
  precio: number;
}

export interface Desglose {
  alumnos: ParteDelDesglose;
  profesores: (ParteDelDesglose & { individual: boolean }) | null;
  noches: number;
  total: number | null;
}

/** «9.661,12 €» → 9661.12. */
export function importeDesdeTexto(texto: string | null | undefined): number | null {
  const m = /-?[\d.]+(?:,\d+)?/.exec(texto ?? "");
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee el desglose tal como lo escribe `proposalService`:
 *   «{precio} x {n} alumnos[ + {precio} x {m} profesores (uso individual|sin
 *   tarifa individual: mismo precio)], por noche x {k} noches»
 */
export function desgloseDeLaOpcion(
  priceBreakdownText: string | null | undefined,
  totalPvpText: string | null | undefined,
): Desglose | null {
  const texto = (priceBreakdownText ?? "").replace(/\s+/g, " ").trim();
  const alumnos = /([\d.]+,\d{2}) € x (\d+) alumnos/.exec(texto);
  const noches = /por noche x (\d+) noche/.exec(texto);
  if (!alumnos || !noches) return null;

  const profesores = /([\d.]+,\d{2}) € x (\d+) profesores \(([^)]*)\)/.exec(texto);

  return {
    alumnos: { pax: Number(alumnos[2]), precio: importeDesdeTexto(alumnos[1]) ?? 0 },
    profesores: profesores
      ? {
          pax: Number(profesores[2]),
          precio: importeDesdeTexto(profesores[1]) ?? 0,
          individual: /uso individual/i.test(profesores[3]),
        }
      : null,
    noches: Number(noches[1]),
    total: importeDesdeTexto(totalPvpText),
  };
}

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
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 1 && !PALABRAS_VACIAS.has(p));
}

function normalizado(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
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

/** Una fila del subformulario, todavía con nombres en vez de ids. */
export interface FilaContratada {
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
  creados: string[];
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

    const creados: string[] = [];
    const proveedor = await idDeProveedor(plan.filas[0].proveedor, creados);
    const categoria = delivery.department === "SPORTS" ? "Turismo Deportivo" : "Grupos";

    const filas = [];
    for (const f of plan.filas) {
      const productoId = await idDeProducto(f, proveedor.id, categoria, delivery.reference, creados);
      const aviso = proveedor.nuevo ? " · proveedor nuevo en el CRM: revisar" : "";
      filas.push({
        N_Presupuesto: 1,
        Servicio: { id: productoId },
        Proveedor: { id: proveedor.id },
        Viajeros: f.pax,
        Precio: f.precio,
        Cantidad: f.noches,
        Fecha_Entrada: f.fechaEntrada,
        Fecha_Salida: f.fechaSalida,
        Regimen: f.regimen,
        Unidad_de_uso: "P.Pax",
        Tipo_de_Servicio: "Alojamiento",
        Comentarios: `${f.comentario} · ${delivery.reference}${aviso}`,
        Validado: false,
      });
    }

    await escribirServiciosContratados(dealId, filas, plan.total);
    // Y la línea de opción elegida, la misma que escribe el botón de Viajes.
    await updateZohoDeal({ dealId, chosenOption: optionNumber });

    console.info(
      `[crm] ${delivery.reference}: ${filas.length} fila(s) en Servicios Contratados, importe ${plan.total ?? "?"}` +
        (creados.length ? `, creados: ${creados.join(", ")}` : "") +
        ".",
    );
    return { dealId, filas: filas.length, total: plan.total, creados };
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
 * unidad P.Pax, precio de venta y proveedor.
 */
async function idDeProducto(
  f: FilaContratada,
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
    Description: `Creado por la consola al contratar la propuesta ${referencia}.`,
  });
  creados.push(`producto «${f.producto}»`);
  return id;
}
