/**
 * El idioma de lo que ve el cliente: el PDF, la página del enlace y el correo.
 *
 * Decisión de Oravia (Anthony, 23/09/2026): «el presupuesto se genera en el
 * idioma en que llegó la solicitud», y los idiomas son catalán, inglés y
 * francés, además del castellano. Javier lo volvió a preguntar el 16/11/2026.
 *
 * Dos clases de texto, dos maneras de traducirlo:
 *   · Los rótulos fijos («Opción 1», «Resumen del viaje», el correo que
 *     acompaña a la propuesta) van AQUÍ, traducidos a mano: son pocos, se ven
 *     siempre y no pueden depender de que un modelo conteste.
 *   · Lo que cambia en cada propuesta (el desglose, las condiciones de cada
 *     hotel, las notas de quien cotiza) lo traduce el servidor con IA y lo
 *     guarda (`server/traduccionDelDocumento.ts`). Aquí están las piezas puras
 *     de esa traducción: qué textos se mandan, cómo se vuelven a colocar y la
 *     comprobación de que ninguna cifra ha cambiado por el camino.
 *
 * Los importes se quedan con el formato de siempre («8.971,04 €») en todos los
 * idiomas: es el mismo número en el documento, en la página y en el CRM.
 *
 * Es lógica pura, sin pantalla, sin base de datos y sin red.
 */

export type IdiomaDelDocumento = "es" | "ca" | "en" | "fr";

export const IDIOMAS_DEL_DOCUMENTO: IdiomaDelDocumento[] = ["es", "ca", "en", "fr"];

/** Para dar formato a las fechas. */
export const LOCALE_DEL_IDIOMA: Record<IdiomaDelDocumento, string> = { es: "es-ES", ca: "ca-ES", en: "en-GB", fr: "fr-FR" };

/** Como se le dice al traductor y a quien cotiza. */
export const NOMBRE_DEL_IDIOMA: Record<IdiomaDelDocumento, string> = { es: "castellano", ca: "catalán", en: "inglés", fr: "francés" };

const sinTildes = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/**
 * El idioma del documento a partir de lo que guarda la solicitud («Catalán»,
 * «Inglés», «English», «fr»…). Lo que no es catalán, inglés ni francés sale en
 * castellano: son los cuatro que pidió Oravia.
 */
export function idiomaDelDocumento(valor: string | null | undefined): IdiomaDelDocumento {
  const v = sinTildes(valor ?? "");
  if (/^(ca|cat|catala|catalan|catalana|valencia|valenciano)\b/.test(v)) return "ca";
  if (/^(en|eng|ingles|inglesa|english|anglais|angles)\b/.test(v)) return "en";
  if (/^(fr|fra|fre|frances|francesa|francais|french)\b/.test(v)) return "fr";
  return "es";
}

/**
 * El idioma con el que salió una propuesta, leído del asunto de su correo («Propuesta…», «Proposta…»,
 * «Proposal…», «Proposition…»). Es lo que manda en la página del enlace: tiene que decir lo mismo, y en el
 * mismo idioma, que el PDF que el cliente ya tiene. Lo enviado antes de los idiomas (17/11/2026) es castellano.
 */
export function idiomaDelAsunto(asunto: string | null | undefined): IdiomaDelDocumento {
  const a = (asunto ?? "").trim();
  if (/^Proposta\s/.test(a)) return "ca";
  if (/^Proposal\s/.test(a)) return "en";
  if (/^Proposition\s/.test(a)) return "fr";
  return "es";
}

type Frase = Record<IdiomaDelDocumento, string>;

/** Los rótulos fijos. `{x}` se sustituye por el valor que se pase. */
const TEXTOS = {
  // ── El documento (PDF y página) ──
  subtitulo: { es: "Propuesta de viaje de grupo", ca: "Proposta de viatge de grup", en: "Group travel proposal", fr: "Proposition de voyage de groupe" },
  destino: { es: "Destino", ca: "Destinació", en: "Destination", fr: "Destination" },
  fechas: { es: "Fechas", ca: "Dates", en: "Dates", fr: "Dates" },
  participantes: { es: "Participantes", ca: "Participants", en: "Participants", fr: "Participants" },
  profesores: { es: "Profesores", ca: "Professors", en: "Teachers", fr: "Enseignants" },
  entrenadores: { es: "Entrenadores", ca: "Entrenadors", en: "Coaches", fr: "Entraîneurs" },
  alojamientos: { es: "Los alojamientos", ca: "Els allotjaments", en: "Accommodation", fr: "Les hébergements" },
  eligeUna: {
    es: "Elige una de estas opciones. El precio incluye las noches del grupo completo.",
    ca: "Trieu una d'aquestes opcions. El preu inclou les nits de tot el grup.",
    en: "Choose one of these options. The price includes the nights for the whole group.",
    fr: "Choisissez l'une de ces options. Le prix comprend les nuits pour l'ensemble du groupe.",
  },
  elegidUna: {
    es: "Elegid una de estas opciones. El precio incluye las noches del grupo completo.",
    ca: "Trieu una d'aquestes opcions. El preu inclou les nits de tot el grup.",
    en: "Choose one of these options. The price includes the nights for the whole group.",
    fr: "Choisissez l'une de ces options. Le prix comprend les nuits pour l'ensemble du groupe.",
  },
  opcion: { es: "Opción {n}", ca: "Opció {n}", en: "Option {n}", fr: "Option {n}" },
  totalDeLaOpcion: { es: "Total de la opción", ca: "Total de l'opció", en: "Option total", fr: "Total de l'option" },
  desglose: { es: "Desglose", ca: "Desglossament", en: "Breakdown", fr: "Détail" },
  gratuidades: { es: "Gratuidades", ca: "Gratuïtats", en: "Free places", fr: "Gratuités" },
  condiciones: { es: "Qué incluye y condiciones", ca: "Què inclou i condicions", en: "What's included and conditions", fr: "Ce qui est inclus et conditions" },
  observaciones: { es: "Observaciones", ca: "Observacions", en: "Remarks", fr: "Remarques" },
  actividades: { es: "Las actividades", ca: "Les activitats", en: "Activities", fr: "Les activités" },
  totalDeLasActividades: { es: "Total de las actividades", ca: "Total de les activitats", en: "Activities total", fr: "Total des activités" },
  resumen: { es: "Resumen del viaje", ca: "Resum del viatge", en: "Trip summary", fr: "Résumé du voyage" },
  columnaOpcion: { es: "Opción", ca: "Opció", en: "Option", fr: "Option" },
  columnaAlojamiento: { es: "Alojamiento", ca: "Allotjament", en: "Accommodation", fr: "Hébergement" },
  columnaActividades: { es: "Actividades", ca: "Activitats", en: "Activities", fr: "Activités" },
  columnaTotal: { es: "Total del viaje", ca: "Total del viatge", en: "Trip total", fr: "Total du voyage" },
  notas: { es: "Notas", ca: "Notes", en: "Notes", fr: "Notes" },
  pagina: { es: "Página {i} de {n}", ca: "Pàgina {i} de {n}", en: "Page {i} of {n}", fr: "Page {i} sur {n}" },
  paraAceptarLaPropuesta: { es: "Para aceptar la propuesta", ca: "Per acceptar la proposta", en: "To accept the proposal", fr: "Pour accepter la proposition" },
  paraAceptarUnaOpcion: { es: "Para aceptar una opción", ca: "Per acceptar una opció", en: "To accept an option", fr: "Pour accepter une option" },
  entraYAcepta: {
    es: "Entra en {url} y pulsa «Aceptar la propuesta».",
    ca: "Entreu a {url} i premeu «Acceptar la proposta».",
    en: "Go to {url} and click “Accept the proposal”.",
    fr: "Rendez-vous sur {url} et cliquez sur « Accepter la proposition ».",
  },
  entraYElige: {
    es: "Entra en {url} y pulsa la que prefieras.",
    ca: "Entreu a {url} i premeu la que preferiu.",
    en: "Go to {url} and click the one you prefer.",
    fr: "Rendez-vous sur {url} et cliquez sur celle que vous préférez.",
  },
  preparadaPor: { es: "Preparada por {quien}", ca: "Preparada per {quien}", en: "Prepared by {quien}", fr: "Préparée par {quien}" },

  // ── Solo la página del enlace ──
  habeisAceptado: { es: "Habéis aceptado la propuesta", ca: "Heu acceptat la proposta", en: "You have accepted the proposal", fr: "Vous avez accepté la proposition" },
  habeisElegido: { es: "Habéis elegido la opción {n}", ca: "Heu triat l'opció {n}", en: "You have chosen option {n}", fr: "Vous avez choisi l'option {n}" },
  haceFaltaElDeposito: {
    es: "Nos ponemos con ello. Para reservar en firme hace falta el depósito{antes}; os escribimos con los datos del pago.",
    ca: "Ens hi posem. Per reservar en ferm cal el dipòsit{antes}; us escriurem amb les dades del pagament.",
    en: "We'll get started. To confirm the booking we need the deposit{antes}; we'll email you the payment details.",
    fr: "Nous nous en occupons. Pour confirmer la réservation, l'acompte est nécessaire{antes} ; nous vous écrirons avec les informations de paiement.",
  },
  antesDel: { es: " antes del {fecha}", ca: " abans del {fecha}", en: " by {fecha}", fr: " avant le {fecha}" },
  estaEsLaPropuesta: {
    es: "Esta es la propuesta que hemos preparado. Si os encaja, aceptadla y seguimos adelante.",
    ca: "Aquesta és la proposta que hem preparat. Si us encaixa, accepteu-la i tirem endavant.",
    en: "This is the proposal we have prepared. If it suits you, accept it and we'll move forward.",
    fr: "Voici la proposition que nous avons préparée. Si elle vous convient, acceptez-la et nous poursuivons.",
  },
  estasSonLasOpciones: {
    es: "Estas son las opciones que hemos preparado. Elegid la que prefiráis y seguimos adelante.",
    ca: "Aquestes són les opcions que hem preparat. Trieu la que preferiu i tirem endavant.",
    en: "These are the options we have prepared. Choose the one you prefer and we'll move forward.",
    fr: "Voici les options que nous avons préparées. Choisissez celle que vous préférez et nous poursuivons.",
  },
  esLaElegida: { es: "Es la que habéis elegido", ca: "És la que heu triat", en: "This is the one you chose", fr: "C'est celle que vous avez choisie" },
  esLaAceptada: { es: "Es la que habéis aceptado", ca: "És la que heu acceptat", en: "You have accepted this proposal", fr: "C'est celle que vous avez acceptée" },
  guardando: { es: "Guardando…", ca: "Desant…", en: "Saving…", fr: "Enregistrement…" },
  elegirEsta: { es: "Elegir esta", ca: "Triar aquesta", en: "Choose this one", fr: "Choisir celle-ci" },
  aceptarLaPropuesta: { es: "Aceptar la propuesta", ca: "Acceptar la proposta", en: "Accept the proposal", fr: "Accepter la proposition" },
  algunaDuda: {
    es: "¿Alguna duda? Respondednos al correo con el que os llegó esta propuesta, indicando la referencia {ref}.",
    ca: "Algun dubte? Responeu-nos al correu amb què us va arribar aquesta proposta, indicant la referència {ref}.",
    en: "Any questions? Reply to the email in which you received this proposal, quoting reference {ref}.",
    fr: "Une question ? Répondez à l'e-mail par lequel vous avez reçu cette proposition, en indiquant la référence {ref}.",
  },

  // ── El correo que acompaña a la propuesta ──
  correoAsunto: { es: "Propuesta {ref} · {titulo}", ca: "Proposta {ref} · {titulo}", en: "Proposal {ref} · {titulo}", fr: "Proposition {ref} · {titulo}" },
  correoSaludoCon: { es: "Hola {nombre},", ca: "Hola {nombre},", en: "Hello {nombre},", fr: "Bonjour {nombre}," },
  correoSaludo: { es: "Hola,", ca: "Hola,", en: "Hello,", fr: "Bonjour," },
  correoFechas: { es: " para las fechas del {desde} al {hasta}", ca: " per a les dates del {desde} al {hasta}", en: " for the dates {desde} to {hasta}", fr: " pour les dates du {desde} au {hasta}" },
  correoSoloActividades: {
    es: "Os adjuntamos la propuesta de actividades para {titulo}{fechas}.",
    ca: "Us adjuntem la proposta d'activitats per a {titulo}{fechas}.",
    en: "Please find attached the activities proposal for {titulo}{fechas}.",
    fr: "Veuillez trouver ci-joint la proposition d'activités pour {titulo}{fechas}.",
  },
  correoUnaOpcion: {
    es: "Os adjuntamos la propuesta para {titulo}{fechas}, con una opción de alojamiento.",
    ca: "Us adjuntem la proposta per a {titulo}{fechas}, amb una opció d'allotjament.",
    en: "Please find attached the proposal for {titulo}{fechas}, with one accommodation option.",
    fr: "Veuillez trouver ci-joint la proposition pour {titulo}{fechas}, avec une option d'hébergement.",
  },
  correoVariasOpciones: {
    es: "Os adjuntamos la propuesta para {titulo}{fechas}, con {n} opciones para que elijáis la que mejor os encaje.",
    ca: "Us adjuntem la proposta per a {titulo}{fechas}, amb {n} opcions perquè trieu la que millor us encaixi.",
    en: "Please find attached the proposal for {titulo}{fechas}, with {n} options for you to choose the one that suits you best.",
    fr: "Veuillez trouver ci-joint la proposition pour {titulo}{fechas}, avec {n} options pour que vous choisissiez celle qui vous convient le mieux.",
  },
  correoVerYAceptar: { es: "Podéis verla y aceptarla aquí: {url}", ca: "La podeu veure i acceptar aquí: {url}", en: "You can view and accept it here: {url}", fr: "Vous pouvez la consulter et l'accepter ici : {url}" },
  correoDecidSiEncaja: {
    es: "Respondiendo a este correo nos decís si os encaja y seguimos adelante.",
    ca: "Responent a aquest correu ens dieu si us encaixa i tirem endavant.",
    en: "Reply to this email to let us know if it suits you and we'll move forward.",
    fr: "Répondez à cet e-mail pour nous dire si elle vous convient et nous poursuivons.",
  },
  correoVerYElegir: {
    es: "Podéis verlas y aceptar la que prefiráis aquí: {url}",
    ca: "Les podeu veure i acceptar la que preferiu aquí: {url}",
    en: "You can view them and accept the one you prefer here: {url}",
    fr: "Vous pouvez les consulter et accepter celle que vous préférez ici : {url}",
  },
  correoDecidCual: {
    es: "Respondiendo a este correo nos decís cuál preferís y seguimos adelante.",
    ca: "Responent a aquest correu ens dieu quina preferiu i tirem endavant.",
    en: "Reply to this email to tell us which one you prefer and we'll move forward.",
    fr: "Répondez à cet e-mail pour nous indiquer celle que vous préférez et nous poursuivons.",
  },
  correoCualquierDuda: {
    es: "Cualquier duda, responded a este mismo correo indicando la referencia {ref}.",
    ca: "Per a qualsevol dubte, responeu a aquest mateix correu indicant la referència {ref}.",
    en: "If you have any questions, reply to this email quoting reference {ref}.",
    fr: "Pour toute question, répondez à ce même e-mail en indiquant la référence {ref}.",
  },
  correoDespedida: { es: "Un saludo,", ca: "Salutacions,", en: "Kind regards,", fr: "Cordialement," },
} satisfies Record<string, Frase>;

export type ClaveDeTexto = keyof typeof TEXTOS;
export const CLAVES_DE_TEXTO = Object.keys(TEXTOS) as ClaveDeTexto[];

/** Un rótulo fijo en su idioma, con sus valores puestos. */
export function texto(idioma: IdiomaDelDocumento, clave: ClaveDeTexto, valores: Record<string, string | number> = {}): string {
  const frase: Frase = TEXTOS[clave];
  return (frase[idioma] ?? frase.es).replace(/\{(\w+)\}/g, (entero, nombre: string) => (nombre in valores ? String(valores[nombre]) : entero));
}

/** Una fecha larga en el idioma: «12 de mayo de 2027», «12 May 2027». */
export function fechaEnIdioma(valor: Date | string | null | undefined, idioma: IdiomaDelDocumento): string {
  if (!valor) return "";
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat(LOCALE_DEL_IDIOMA[idioma], { day: "numeric", month: "long", year: "numeric" }).format(fecha);
}

// ── Lo que traduce el servidor: las piezas puras ───────────────────────────

/** Un texto con algo que traducir: al menos una palabra. Un importe o una fecha en cifras, no. */
const TIENE_PALABRAS = /\p{L}{2,}/u;

/**
 * Los textos de una estructura (el documento del cliente) que hay que traducir,
 * sin repetidos. Las claves de `saltar` no se tocan: los nombres de los
 * alojamientos y de las actividades son nombres propios.
 */
export function textosTraducibles(valor: unknown, saltar: string[] = []): string[] {
  const vistos = new Set<string>();
  const recorrer = (v: unknown): void => {
    if (typeof v === "string") {
      if (TIENE_PALABRAS.test(v)) vistos.add(v);
    } else if (Array.isArray(v)) {
      v.forEach(recorrer);
    } else if (v && typeof v === "object") {
      for (const [clave, hijo] of Object.entries(v as Record<string, unknown>)) {
        if (!saltar.includes(clave)) recorrer(hijo);
      }
    }
  };
  recorrer(valor);
  return [...vistos];
}

/** La misma estructura con cada texto sustituido por su traducción; el que no la tiene se queda como estaba. */
export function conTextosTraducidos<T>(valor: T, traduccion: ReadonlyMap<string, string>, saltar: string[] = []): T {
  const recorrer = (v: unknown): unknown => {
    if (typeof v === "string") return traduccion.get(v) ?? v;
    if (Array.isArray(v)) return v.map(recorrer);
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([clave, hijo]) => [clave, saltar.includes(clave) ? hijo : recorrer(hijo)]));
    }
    return v;
  };
  return recorrer(valor) as T;
}

/**
 * Si la traducción conserva todas las cifras del original: los precios, las
 * noches, las personas, las fechas. Se comparan los grupos de dígitos sin
 * importar el orden ni los separadores («8.971,04» y «8,971.04» son el mismo
 * número), que es lo que un traductor puede mover sin cambiar el dato.
 *
 * El «1» suelto no cuenta: «grupos de 1 noche» es «groupes d'une nuit» y «a
 * one-night stay», y rechazarlo dejaba frases enteras sin traducir.
 */
export function conservaLasCifras(original: string, traducido: string): boolean {
  const cifras = (s: string) => (s.match(/\d+/g) ?? []).filter((c) => c !== "1").sort().join(" ");
  return cifras(original) === cifras(traducido);
}
