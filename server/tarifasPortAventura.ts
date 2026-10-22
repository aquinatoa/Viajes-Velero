/**
 * El PDF de tarifas de grupos de PortAventura («Tarifas Grupos Parques 2027»),
 * leído sin modelo.
 *
 * Es una tabla fija: 8 productos (1 día PortAventura Park, 2 parques, Caribe,
 * Ferrari Land…), una fila por categoría (Adulto, Joven/Secundaria/Uni,
 * PROMO Early Bird…) y una columna por modalidad (Entrada, Entrada + Ticket
 * Plus, + Express 10) y periodo (A a D). Cada precio va a su celda por su
 * posición en la página, que es lo único fiable: el texto mezcla la tabla con
 * el calendario de al lado.
 *
 * La lectura con IA de septiembre cargó bien los 386 precios, pero ninguna
 * condición: ni la gratuidad de los profesores (1 por cada 10 escolares), ni
 * que el Express solo vale de lunes a viernes en dos periodos, ni el Early
 * Bird hasta el 28/02 (Ruth, 21/10/2026: «no se cargaban todas las
 * modalidades»). Aquí van todas, cada una a su sitio.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type {
  AiCandidateActivityRate,
  AiCandidatePolicy,
  AiDetectedActivity,
  AiDocumentAnalysisResult,
} from "../src/domain/documentImportTypes";

interface Trozo {
  texto: string;
  x: number;
  /** Desde arriba, como se lee. */
  top: number;
  ancho: number;
}

const PRODUCTOS: Array<{ nombre: string; lugar: string; duracion: string; patron: RegExp }> = [
  { nombre: "1 día PortAventura Park", lugar: "PortAventura Park", duracion: "1 día", patron: /^1 día PortAventura/ },
  { nombre: "1 día, 2 parques PortAventura Park y Ferrari Land", lugar: "PortAventura Park y Ferrari Land", duracion: "1 día", patron: /1 día, 2 parques/ },
  { nombre: "1 día Caribe Aquatic Park", lugar: "Caribe Aquatic Park", duracion: "1 día", patron: /1 día Caribe/ },
  { nombre: "2 días, 2 parques PortAventura Park y Ferrari Land", lugar: "PortAventura Park y Ferrari Land", duracion: "2 días", patron: /2 días, 2 parques/ },
  { nombre: "2 días, 3 parques PortAventura Park, Ferrari Land y Caribe Aquatic Park", lugar: "PortAventura Park, Ferrari Land y Caribe Aquatic Park", duracion: "2 días", patron: /2 días, 3 parques/ },
  { nombre: "1 día Ferrari Land", lugar: "Ferrari Land", duracion: "1 día", patron: /1 día Ferrari Land/ },
  { nombre: "3 días, 2 parques PortAventura Park y Ferrari Land", lugar: "PortAventura Park y Ferrari Land", duracion: "3 días", patron: /3 días, 2 parques/ },
  { nombre: "3 días, 3 parques PortAventura Park, Ferrari Land y Caribe Aquatic Park", lugar: "PortAventura Park, Ferrari Land y Caribe Aquatic Park", duracion: "3 días", patron: /3 días, 3 parques/ },
];

/** Las categorías de la tabla, con la edad de las condiciones generales del PDF. */
const CATEGORIAS: Array<{ nombre: string; etiqueta: string; min: number | null; max: number | null }> = [
  { nombre: "PROMO Early Bird Adulto", etiqueta: "PROMO Early Bird Adulto (18-59)", min: 18, max: 59 },
  { nombre: "PROMO Early Bird Secundaria", etiqueta: "PROMO Early Bird Secundaria (12-17)", min: 12, max: 17 },
  { nombre: "PROMO Early Bird Primaria", etiqueta: "PROMO Early Bird Primaria (4-11)", min: 4, max: 11 },
  { nombre: "Adulto", etiqueta: "Adulto (18-59)", min: 18, max: 59 },
  { nombre: "Joven/Secundaria/Uni", etiqueta: "Joven/Secundaria/Uni (12-17)", min: 12, max: 17 },
  { nombre: "Júnior/Primaria", etiqueta: "Júnior/Primaria (4-11)", min: 4, max: 11 },
  { nombre: "Sénior", etiqueta: "Sénior (desde 60)", min: 60, max: null },
  { nombre: "Pax con Discapacidad", etiqueta: "Pax con Discapacidad", min: null, max: null },
];

const MODALIDADES = ["Entrada", "Entrada + Ticket Plus", "Entrada + Ticket Plus + Express 10"] as const;

async function trozosDeLaPagina(filePath: string): Promise<{ trozos: Trozo[]; texto: string } | null> {
  const datos = new Uint8Array(await fs.readFile(filePath));
  const tarea = getDocument({ data: datos, useSystemFonts: true });
  const pdf = await tarea.promise;
  try {
    const pagina = await pdf.getPage(1);
    const alto = pagina.getViewport({ scale: 1 }).height;
    const contenido = await pagina.getTextContent();
    const trozos: Trozo[] = [];
    for (const item of contenido.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform as number[];
      trozos.push({ texto: item.str, x, top: alto - y, ancho: item.width });
    }
    const texto = contenido.items.map((i) => ("str" in i ? i.str : "")).join(" ").replace(/\s+/g, " ");
    pagina.cleanup();
    return { trozos, texto };
  } finally {
    await tarea.destroy();
  }
}

/** Las palabras de una franja horizontal, juntas y en orden. */
function filasDe(trozos: Trozo[], tolerancia = 1.6): Array<{ top: number; trozos: Trozo[] }> {
  const filas: Array<{ top: number; trozos: Trozo[] }> = [];
  for (const t of [...trozos].sort((a, b) => a.top - b.top)) {
    const f = filas.find((x) => Math.abs(x.top - t.top) <= tolerancia);
    if (f) f.trozos.push(t);
    else filas.push({ top: t.top, trozos: [t] });
  }
  for (const f of filas) f.trozos.sort((a, b) => a.x - b.x);
  return filas;
}

/** Un trozo de texto del PDF entre dos marcas, sin saltos. */
function entre(texto: string, desde: RegExp, hasta: RegExp): string | null {
  const i = texto.search(desde);
  if (i < 0) return null;
  const resto = texto.slice(i);
  const j = resto.slice(1).search(hasta);
  return (j < 0 ? resto : resto.slice(0, j + 1)).replace(/\s+/g, " ").trim();
}

export async function leerTarifasPortAventura(
  filePath: string | null | undefined,
  controlName: string,
  controlYear: number | null = null,
): Promise<AiDocumentAnalysisResult | null> {
  if (!filePath || path.extname(filePath).toLowerCase() !== ".pdf") return null;
  let pagina: Awaited<ReturnType<typeof trozosDeLaPagina>>;
  try {
    pagina = await trozosDeLaPagina(filePath);
  } catch (error) {
    if (process.env.DEPURAR_LECTOR) console.error(error);
    return null;
  }
  if (!pagina || !/Tarifas Grupos Parques/i.test(pagina.texto) || !/PortAventura/i.test(pagina.texto)) return null;
  const { trozos, texto } = pagina;
  const anio = Number(/Tarifas Grupos Parques (20\d\d)/.exec(texto)?.[1]) || controlYear || null;
  const warnings: string[] = [];

  // ── Cabecera: las letras de periodo de cada modalidad ──
  const accesos = trozos.find((t) => /^Accesos$/.test(t.texto.trim()));
  const letras = trozos.filter(
    (t) => /^[A-D]$/.test(t.texto.trim()) && accesos && t.top > accesos.top && t.top - accesos.top < 20 && t.x > accesos.x + 10 && t.x < accesos.x + 200,
  );
  const columnas = letras
    .sort((a, b) => a.x - b.x)
    .map((t, i) => ({ x: t.x + t.ancho / 2, periodo: t.texto.trim(), modalidad: MODALIDADES[Math.floor(i / 4)] }));
  if (columnas.length !== 12) {
    return null; // No es la tabla que conocemos: mejor no leer nada que leer mal.
  }
  const xMin = columnas[0].x - 12;
  const xMax = columnas[11].x + 12;
  const topCabecera = Math.max(...letras.map((l) => l.top));

  // ── Filas de categoría, en orden; un producto nuevo empieza con su primera categoría ──
  // (Las letras sueltas del nombre del producto, escrito a la izquierda, no cuentan.)
  const xCategoria = (t: Trozo) => t.x > (accesos?.x ?? 0) - 55 && t.x < (accesos?.x ?? 0) - 5 && !/^\d+$/.test(t.texto.trim());
  const promo = trozos.find((t) => /Promo Early Bird disponible/i.test(t.texto));
  const finTabla = promo ? promo.top - 2 : Infinity;
  // Solo categorías y precios: el nombre del producto (a la izquierda) y los
  // accesos (PAP/FL/CAP) caen a media altura y mezclarían las filas.
  const esPrecio = (t: Trozo) => /^\d+\s*€?$/.test(t.texto.trim()) && t.x + t.ancho / 2 >= xMin && t.x + t.ancho / 2 <= xMax;
  const filas = filasDe(trozos.filter((t) => t.top > topCabecera + 3 && t.top < finTabla && (xCategoria(t) || esPrecio(t))));
  const tarifas: AiCandidateActivityRate[] = [];
  let producto = -1;
  let anterior: string | null = null;
  for (const f of filas) {
    const nombre = f.trozos.filter(xCategoria).map((t) => t.texto.trim()).join(" ").replace(/\s+/g, " ").trim();
    const cat = CATEGORIAS.find((c) => c.nombre === nombre);
    if (!cat) continue;
    // Empieza producto: la PROMO de adulto, o el adulto si no viene detrás de la PROMO de primaria.
    if (producto < 0 || cat.nombre === "PROMO Early Bird Adulto" || (cat.nombre === "Adulto" && anterior !== "PROMO Early Bird Primaria")) {
      producto += 1;
    }
    anterior = cat.nombre;
    const prod = PRODUCTOS[producto];
    if (!prod) {
      warnings.push(`Hay más productos en la tabla de los que se conocen: la fila «${nombre}» no se ha leído.`);
      continue;
    }
    for (const t of f.trozos) {
      const m = /^(\d+)\s*€?$/.exec(t.texto.trim());
      if (!m) continue;
      const cx = t.x + t.ancho / 2;
      if (cx < xMin || cx > xMax) continue;
      const col = columnas.reduce((a, b) => (Math.abs(b.x - cx) < Math.abs(a.x - cx) ? b : a));
      tarifas.push({
        activityName: prod.nombre,
        rateUnit: "PER_PAX",
        year: anio,
        seasonName: null,
        dateFrom: null,
        dateTo: null,
        currency: "EUR",
        salePvpAmount: Number(m[1]),
        costNetAmount: null,
        durationText: prod.duracion,
        ageLabel: `${cat.etiqueta} · ${col.modalidad} · Periodo ${col.periodo}`,
        ageMin: cat.min,
        ageMax: cat.max,
        minPax: 20,
        maxPax: null,
        rawText: `${prod.nombre} · ${cat.nombre} · ${col.modalidad} · periodo ${col.periodo} · ${m[1]} €`,
      });
    }
  }
  const productosLeidos = new Set(tarifas.map((t) => t.activityName));
  if (productosLeidos.size !== PRODUCTOS.length) {
    warnings.push(`Se esperaban ${PRODUCTOS.length} productos y se han leído ${productosLeidos.size}: revisa la tabla.`);
  }

  // ── Las actividades, con su descripción del PDF ──
  const descripcion = (p: (typeof PRODUCTOS)[number]) => {
    // El PDF solo describe las combinadas («La entrada de 2 días, 3 parques…»).
    if (!/parques/.test(p.nombre)) return null;
    const clave = p.nombre.replace(/ PortAventura Park.*/, "").trim();
    const frase = new RegExp(`La entrada de ${clave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.]*\\.(?:[^.]*\\.){0,2}`).exec(texto)?.[0];
    return frase ? frase.replace(/\s+/g, " ").trim() : null;
  };
  const actividades: AiDetectedActivity[] = PRODUCTOS.filter((p) => productosLeidos.has(p.nombre)).map((p) => ({
    activityName: p.nombre,
    supplierName: "PortAventura World",
    locationMain: p.lugar,
    activityType: "Entrada parque temático",
    durationText: p.duracion,
    descriptionText: descripcion(p),
  }));

  // ── Las condiciones, del texto del PDF (de todo el documento: valen para las 8) ──
  const politicas: AiCandidatePolicy[] = [];
  const poner = (policyType: string, policyText: string | null, rawText?: string | null) => {
    if (policyText) politicas.push({ policyType, policyText, rawText: rawText ?? null });
  };
  const gratuidades = entre(texto, /Política de gratuidades:/, /Reservas:/);
  if (gratuidades) {
    const escolares = /una entrada gratis para el profesor por cada (\d+) escolares de pago/i.exec(gratuidades);
    poner(
      "GRATUITY",
      `Gratuidades: ${escolares ? `1 profesor gratis por cada ${escolares[1]} escolares de pago` : "ver condiciones"}. ${gratuidades.replace(/^Política de gratuidades:\s*/, "")}`,
      gratuidades,
    );
  }
  const express = entre(texto, /Estos paquetes están sujetos a disponibilidad/, /Ticket Paseo/);
  if (express) {
    poner("SPECIAL_NOTES", `Entrada + Ticket Plus + Express 10: ${express.replace(/^Estos paquetes/, "sujeto a disponibilidad. Estos paquetes")}`, express);
  }
  const earlyBird = entre(texto, /Promo Early Bird disponible/, /Descripción de entradas/);
  poner("SPECIAL_NOTES", earlyBird ? `PROMO Early Bird: ${earlyBird.replace(/^Promo Early Bird\s*/, "")}` : null, earlyBird);
  const ticketPlus = entre(texto, /Entrada \+ Ticket Plus: los paquetes/, /Entrada \+ Ticket Plus \+ Express 10: los paquetes/);
  poner("SPECIAL_NOTES", ticketPlus, ticketPlus);
  const expressDesc = entre(texto, /Entrada \+ Ticket Plus \+ Express 10: los paquetes/, /Estos paquetes/);
  poner("SPECIAL_NOTES", expressDesc, expressDesc);
  const sénior = entre(texto, /Ticket Paseo para Grupos Sénior/, /\*Por favor|Condiciones Temporada/);
  poner("SPECIAL_NOTES", sénior, sénior);
  const grupo = /Se considera grupo a un mínimo de (\d+) personas de pago/i.exec(texto);
  const cupo = /Cupo limitado a (\d+) entradas por día/i.exec(texto);
  if (grupo) {
    poner(
      "GROUP_SIZE",
      `Grupo: mínimo ${grupo[1]} personas de pago (10 en grupos de personas con discapacidad acreditando un mínimo del 33 %).${cupo ? ` Cupo limitado a ${cupo[1]} entradas por día.` : ""}`,
    );
  }
  const edades = [
    /Adulto: de 18 a 59 años/i.test(texto) ? "Adulto: de 18 a 59 años" : null,
    /Joven\/Secundaria\/Uni: de 12 a 17 años/i.test(texto) ? "Joven/Secundaria/Uni: de 12 a 17 años y universitarios acreditados" : null,
    /Júnior\/Primaria: de 4 a 11 años/i.test(texto) ? "Júnior/Primaria: de 4 a 11 años" : null,
    /Sénior: desde 60 años/i.test(texto) ? "Sénior: desde 60 años" : null,
    /Niños de 0 a 3 años: entrada gratuita/i.test(texto) ? "niños de 0 a 3 años, entrada gratuita" : null,
  ].filter(Boolean);
  poner("SPECIAL_NOTES", edades.length ? `Edades: ${edades.join(" · ")}.` : null);
  const generales = [
    /Precios «desde» válidos para la temporada/i.test(texto) ? "Precios «desde» válidos para la temporada, según el calendario de apertura de parques" : null,
    /Tarifas y calendario de períodos sujetos a cambio/i.test(texto) ? "tarifas y calendario de periodos sujetos a cambio sin previo aviso" : null,
    /IVA del 21 % incluido/i.test(texto) ? "IVA del 21 % incluido" : null,
  ].filter(Boolean);
  poner("SPECIAL_NOTES", generales.length ? `Condiciones: ${generales.join("; ")}.` : null);
  const reservas = entre(texto, /Reservas:\s*Imprescindible/, /Calendarios y horarios sujetos a cambios/);
  poner("SPECIAL_NOTES", reservas ? `Reservas: ${reservas.replace(/^Reservas:\s*/, "")}` : null, reservas);
  // La tabla de pagos, modificaciones y cancelaciones: el texto sale mezclado por
  // columnas, así que se registra lo que dice cada fila, comprobando que está.
  if (/Pago con Tarjeta de Crédito del 100 % de la reserva en el\s*momento de finalizar la compra/i.test(texto)) {
    poner(
      "PAYMENT",
      "Pago: reservas por la Webstore, 100 % con tarjeta al finalizar la compra. Por e-mail, 100 % con tarjeta o por transferencia 8 días antes de la visita, con 20 € de gastos de gestión; a menos de 4 días, con tarjeta en 24 h desde la confirmación, con 20 € de gastos.",
    );
  }
  if (/Cancelaciones/.test(texto) && /No se permiten cancelaciones/.test(texto)) {
    poner(
      "CANCELLATION",
      "Cancelaciones: a más de 7 días, se permiten. De 7 a 4 días, solo cambiar el día de visita (20 € de gastos y tarifa vigente de la nueva fecha). A menos de 4 días, no se permiten. No se devuelven entradas no utilizadas.",
    );
  }
  if (/Ampliación de menos del 50% del grupo inicial/i.test(texto)) {
    poner(
      "CANCELLATION",
      "Modificaciones: ampliar menos del 50 % del grupo mantiene la tarifa contratada; ampliar el 50 % o más añade las entradas a la tarifa vigente. Por e-mail y con las entradas ya recibidas, 3 € de gastos por entrada (ampliaciones y reducciones) y 20 € por cambiar el día; por la Webstore, sin gastos hasta el mínimo de grupo. A menos de 4 días, no se permiten modificaciones.",
    );
  }

  const resumen =
    `Tarifas de grupos de PortAventura ${anio ?? ""}: ${actividades.length} productos y ${tarifas.length} tarifas ` +
    `(categoría × modalidad × periodo), y ${politicas.length} condiciones del PDF.`;
  return {
    mode: "plantilla",
    documentSummary: resumen.replace(/\s+/g, " "),
    detectedAccommodation: null,
    detectedAccommodations: [],
    detectedActivities: actividades,
    candidateRates: [],
    candidateActivityRates: tarifas,
    candidateSupplements: [],
    candidatePolicies: politicas,
    candidateBlackoutDates: [],
    warnings,
    confidence: warnings.length ? 0.8 : 1,
  };
}
