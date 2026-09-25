/**
 * Cómo se convierte lo extraído de un documento en el texto que lee el colegio.
 *
 * Es donde se perdía la mitad de la información. El Hotel Santa Mónica Playa
 * acabó publicado así:
 *
 *   observations: «… | Gratuidad | Tasa turística | Menús por alergias, dietas
 *                  o intolerancias | …»
 *   conditionsText: vacío
 *   freePolicy: vacío
 *
 * Tres fallos a la vez:
 *
 *   1. Se guardaba el TÍTULO de cada condición y no su contenido. El importador
 *      sí guarda el detalle —en `conditionText` de cada suplemento— pero al
 *      componer el texto no se miraba. En el documento ponía «Menús por
 *      alergias, dietas o intolerancias A CONFIRMAR CON EL HOTEL Y SUJETOS A
 *      POSIBLE SUPLEMENTO»; se publicó sin la segunda mitad, que es la que dice
 *      lo que hay que hacer.
 *
 *   2. Todo caía en Observaciones bajo la etiqueta «Suplementos», incluido lo
 *      que no es un suplemento: una gratuidad, una tasa o un menú especial.
 *
 *   3. Las gratuidades solo se buscaban entre las políticas. Cuando el modelo
 *      clasificaba la gratuidad como suplemento —que es lo normal, porque viene
 *      en la misma columna del Excel— el alojamiento quedaba sin gratuidades y
 *      el PDF salía sin ese recuadro.
 *
 * Está en su propio módulo, separado de la base de datos, para poder
 * comprobarlo: es texto que ve un cliente y equivocarse no da ningún error.
 */

/** Un suplemento tal como lo guarda el importador. */
export interface SuplementoExtraido {
  adjustmentType?: string | null;
  concept: string;
  amountType?: string | null;
  amount?: unknown;
  appliesPer?: string | null;
  /** El detalle. Es lo que se perdía. */
  conditionText?: string | null;
}

/** Una condición tal como la guarda el importador. */
export interface PoliticaExtraida {
  policyType?: string | null;
  policyText: string;
}

export interface FechaEspecialExtraida {
  availabilityStatus: string;
  reason?: string | null;
}

/**
 * Qué es cada cosa, mirando lo que dice.
 *
 * El modelo mete en «suplementos» todo lo que ve en la columna de condiciones
 * del Excel, tenga precio o no. Aquí se reparte por lo que significa, que es lo
 * que permite que una gratuidad acabe en gratuidades y no entre los recargos.
 */
const ES_GRATUIDAD = /gratuidad|gratu[ïi]tat|pax free|plaza gratis|free\b/i;
const NO_ES_SUPLEMENTO =
  /tasa tur[ií]stica|men[uú]s? (por|especial)|alergia|dieta|intoleran|cancelaci[oó]n|dep[oó]sito|fianza|rooming|release|edad m[aá]xima|seguro/i;

/** Un importe legible: «15 €», «+10%», «15 € por pax y noche». */
function importeDe(s: SuplementoExtraido): string {
  const bruto = s.amount === null || s.amount === undefined ? "" : String(s.amount).trim();
  if (!bruto || bruto === "0") return "";

  const tipo = String(s.amountType ?? "").toLowerCase();
  const unidad = tipo.includes("percent") || tipo.includes("porcent") ? "%" : "€";
  const por = String(s.appliesPer ?? "").trim();
  return `${bruto} ${unidad}${por ? ` por ${por}` : ""}`;
}

/**
 * Una condición en una línea, con su detalle.
 *
 * El orden importa: primero qué es, después cuánto cuesta y al final la letra
 * pequeña. Es como se lee una ficha de hotel.
 */
export function lineaDe(s: SuplementoExtraido): string {
  const partes = [s.concept?.trim()].filter(Boolean) as string[];

  const importe = importeDe(s);
  if (importe) partes.push(importe);

  const detalle = String(s.conditionText ?? "").trim();
  // Si el detalle repite el concepto —pasa cuando el modelo copia la celda
  // entera— no se pone dos veces.
  if (detalle && !partes.join(" ").toLowerCase().includes(detalle.toLowerCase())) {
    partes.push(detalle);
  }

  return partes.join(" · ");
}

export interface TextosDelAlojamiento {
  conditionsText: string | null;
  observations: string | null;
  freePolicy: string | null;
}

/**
 * Los tres textos que se publican de un alojamiento.
 *
 * `conditionsText` lleva lo que el colegio tiene que saber para decidir;
 * `observations`, lo de la ficha —proveedor, provincia— y los recargos;
 * `freePolicy`, las gratuidades, que van aparte porque cambian el precio.
 */
export function componerTextos(datos: {
  politicas: PoliticaExtraida[];
  suplementos: SuplementoExtraido[];
  fechasEspeciales: FechaEspecialExtraida[];
  providerName?: string | null;
  province?: string | null;
  country?: string | null;
}): TextosDelAlojamiento {
  const { politicas, suplementos, fechasEspeciales } = datos;

  // Las gratuidades, vengan de donde vengan.
  const gratuidades = [
    ...politicas.filter((p) => ES_GRATUIDAD.test(`${p.policyType ?? ""} ${p.policyText}`)),
    ...suplementos.filter((s) => ES_GRATUIDAD.test(`${s.concept} ${s.conditionText ?? ""}`)),
  ];

  const freePolicy =
    gratuidades
      .map((g) => ("policyText" in g ? String(g.policyText).trim() : lineaDe(g as SuplementoExtraido)))
      .filter(Boolean)
      .join(" · ") || null;

  const esGratuidad = (s: SuplementoExtraido) => ES_GRATUIDAD.test(`${s.concept} ${s.conditionText ?? ""}`);

  // Lo que no es ni gratuidad ni recargo: condiciones de verdad.
  const comoCondicion = suplementos.filter(
    (s) => !esGratuidad(s) && NO_ES_SUPLEMENTO.test(`${s.concept} ${s.conditionText ?? ""}`),
  );
  // Y lo que sí encarece: los suplementos propiamente dichos.
  const recargos = suplementos.filter(
    (s) => !esGratuidad(s) && !NO_ES_SUPLEMENTO.test(`${s.concept} ${s.conditionText ?? ""}`),
  );

  const condiciones = [
    ...politicas
      .filter((p) => !ES_GRATUIDAD.test(`${p.policyType ?? ""} ${p.policyText}`))
      .map((p) => {
        const tipo = String(p.policyType ?? "").trim();
        // La etiqueta del importador va delante, como hasta ahora: el PDF la
        // traduce a un nombre legible y la usa para ordenar.
        return tipo && tipo !== "UNKNOWN" ? `[${tipo}] ${p.policyText}` : p.policyText;
      }),
    ...comoCondicion.map(lineaDe),
  ].filter(Boolean);

  const recargosTexto = recargos.map(lineaDe).filter(Boolean).join(" | ");
  const fechasTexto = fechasEspeciales
    .map((f) => (f.reason ? `${f.availabilityStatus}: ${f.reason}` : f.availabilityStatus))
    .filter(Boolean)
    .join(" | ");

  const observations =
    [
      datos.providerName ? `Proveedor: ${datos.providerName}` : "",
      datos.province ? `Provincia: ${datos.province}` : "",
      datos.country ? `País: ${datos.country}` : "",
      recargosTexto ? `Suplementos: ${recargosTexto}` : "",
      fechasTexto ? `Fechas especiales: ${fechasTexto}` : "",
    ]
      .filter(Boolean)
      .join(" | ") || null;

  return {
    conditionsText: condiciones.join(" | ") || null,
    observations,
    freePolicy,
  };
}
