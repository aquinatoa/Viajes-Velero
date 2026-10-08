import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildProposal,
  logCrmSyncAttempt,
  extractRequestExtras,
  findCandidateOpportunities,
  prepareNewOpportunityPayload,
  readTripMessage,
  validateTripRequest,
  saveNormalizedTripRequest,
  upsertClientFromRequest,
  extractClientInfo,
} from "../../services/mcpTools";
import {
  abrirProposalPdf,
  buscarContactoCrmApi,
  upsertClientApi,
  borrarBorradorApi,
  guardarBorradorApi,
  leerBorradorApi,
  listarBorradoresApi,
  tomarBorradorApi,
  type BorradorEnLista,
  createZohoOpportunityApi,
  prepareProposalDeliveryApi,
  searchAccommodationsApi,
  searchActivitiesApi,
  sendProposalDeliveryApi,
  type ContactoDelCrm,
  type ProposalDeliveryResult,
} from "../../services/apiClient";
import isotipoBlanco from "../../assets/oravia-isotipo-blanco.png";
import {
  borrarBorrador,
  estaVacio,
  guardarBorrador,
  haceCuanto,
  leerBorrador,
  tituloDelBorrador,
  type BorradorSolicitud,
} from "./draft";
import type { ClientSegment } from "../../domain/documentImportTypes";
import { podio, razonDelPodio } from "../../domain/podio";
import { etiquetaDeRegimen, rejillaDeActividad } from "../../domain/rejillaDeTarifas";
import { TablaDeTarifas } from "../inventory/TablaDeTarifas";
import { leerRango, leerUnaFecha } from "../../domain/fechas";
import { interpretarRespuesta } from "../../domain/interpretarRespuesta";
import {
  bloquesParaValidar,
  firmaDeLaPeticion,
  loQueFaltaDeVerdad,
} from "../../domain/validacionDeLaPeticion";
import {
  conservarLoContestado,
  loQueSeIgnora,
  sePuedeRecomendar,
  siguientePregunta,
  type Hueco,
} from "../../domain/loQueFalta";
import { applyDefaultMarkup } from "../../services/pricing";
import type {
  AccommodationRate,
  AccommodationSearchMatch,
  ComprobacionDeEncaje,
  FindCandidateOpportunitiesResult,
  ActivitySearchMatch,
  NormalizedRequestDraft,
  ParseTripRequestInput,
  ParseTripRequestResult,
  SearchAccommodationsResult,
  SearchActivitiesResult,
  TripProposal,
} from "../../domain/types";

/**
 * El lienzo: pantalla de nueva solicitud.
 *
 * Sustituye al asistente de cinco pasos en ventana emergente. Aquí no hay
 * "siguiente": el mensaje del cliente está siempre a la izquierda y la propuesta
 * se construye a la derecha. La barra de arriba informa de cómo va, pero no
 * bloquea nada: solo el botón de enviar espera a que no falten datos.
 *
 * Una opción = un hotel + su programa de actividades. El programa se elige una
 * vez para todo el viaje (la base) y luego se puede quitar o añadir por opción,
 * que es lo que pidió el cliente. El modelo ya lo soportaba: `activitiesByOption`.
 */

const MAX_OPCIONES = 3;

export interface RequestCanvasProps {
  onFinished?: () => void;
  /** Grupos o Deportivo del usuario. Null en los roles globales (ADMIN). */
  departamentoDelUsuario?: "GROUPS" | "SPORTS" | null;
  onExit: () => void;
  /**
   * Quién está trabajando. Hace falta para no llamar «alguien» a uno mismo: la
   * lista de borradores decía «alguien la tiene abierta» sobre los borradores
   * del propio usuario, porque cada autoguardado deja la reserva puesta y nadie
   * la comparaba con quien estaba mirando la pantalla.
   */
  currentUserId?: string | null;
}

type HitoEstado = "pendiente" | "trabajando" | "aviso" | "hecho";

interface Hito {
  id: 1 | 2 | 3;
  titulo: string;
  detalle: string;
  estado: HitoEstado;
}

/**
 * Un turno ya cerrado del chat: lo que se preguntó y lo que se contestó.
 *
 * La pregunta PENDIENTE no se guarda aquí: se calcula en cada pintada desde lo
 * que falta. Guardarla obligaría a mantener dos verdades sobre el mismo hueco,
 * y acabarían discrepando en cuanto alguien corrija un campo a mano.
 */
interface TurnoDelChat {
  pregunta: string;
  /**
   * Lo contestado. Vacío cuando la app solo dice algo —«no he entendido esa
   * fecha»—: en un chat, no entender algo también es un turno.
   */
  respuesta: string;
}

/**
 * El precio de venta de una tarifa, con la MISMA regla con la que se cotiza.
 *
 * `server/pricing.ts` y `services/proposalService.ts` aplican el margen del 8%
 * cuando el documento solo trae el neto. Esta pantalla no lo hacía: enseñaba el
 * neto pelado, así que un hotel sin PVP salía en la lista un 8% más barato de
 * lo que después decía el presupuesto. Es exactamente el malentendido que este
 * repaso venía a quitar.
 */
function precioDeTarifa(tarifa: { pvpAmount: number; netSaleAmount: number }): number {
  return tarifa.pvpAmount || (tarifa.netSaleAmount ? applyDefaultMarkup(tarifa.netSaleAmount) : 0);
}

/** Precio por alumno de una opción: el hotel más las actividades con precio. */
function precioPorAlumno(
  hotel: AccommodationSearchMatch,
  actividades: ActivitySearchMatch[],
  noches: number,
): number {
  const base = precioDeTarifa(hotel.rate) * Math.max(noches, 1);
  const extras = actividades.reduce((suma, item) => suma + (item.rate.salePvpAmount || 0), 0);
  return Math.round((base + extras) * 100) / 100;
}

function nochesEntre(desde: string, hasta: string): number {
  if (!desde || !hasta) return 0;
  const inicio = new Date(desde).getTime();
  const fin = new Date(hasta).getTime();
  if (Number.isNaN(inicio) || Number.isNaN(fin)) return 0;
  return Math.max(Math.round((fin - inicio) / 86_400_000), 0);
}

function euros(valor: number): string {
  // Los céntimos se enseñan cuando los hay. Redondearlos a cero dejaba «19 €»
  // arriba y 383 € abajo (19,15 × 20), y nadie entendía la cuenta.
  const conCentimos = Math.abs(valor - Math.round(valor)) >= 0.005;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: conCentimos ? 2 : 0,
    maximumFractionDigits: conCentimos ? 2 : 0,
  }).format(valor);
}

/** El canal de una tarifa, en palabras. GENERIC es un código interno, no un nombre. */
function canalEnPalabras(segmento: string | null | undefined): string {
  const s = (segmento ?? "").trim();
  if (!s || s === "GENERIC") return "general · vale para cualquier cliente";
  if (s === "SWISS_TTOO") return "turoperador suizo";
  return s;
}

/**
 * La temporada de una tarifa, sin repetirse. El espejo local guarda como
 * nombre de temporada el propio rango ISO, y salía dos veces: el rango y
 * debajo las mismas fechas formateadas.
 */
function temporadaDe(r: { seasonName?: string | null; year?: number | null; dateFrom?: string | null; dateTo?: string | null }): string {
  const nombre = (r.seasonName ?? "").trim();
  const nombreUtil = nombre && !/^\d{4}-\d{2}-\d{2}/.test(nombre) ? nombre : "";
  const fechas = r.dateFrom && r.dateTo ? `${fechaCorta(r.dateFrom)} → ${fechaCorta(r.dateTo)}` : "";
  if (nombreUtil && fechas) return `${nombreUtil} · ${fechas}`;
  return nombreUtil || fechas || String(r.year ?? "") || "sin nombre";
}

/** Orden natural del régimen en una lista: de menos a más servicio. */
const ORDEN_REGIMEN_LISTA = ["SA", "AD", "MP", "PC"];
function ordenRegimen(codigo: string | null | undefined): number {
  const i = ORDEN_REGIMEN_LISTA.indexOf((codigo ?? "").toUpperCase());
  return i === -1 ? 99 : i;
}

function sinAcentos(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Si este alojamiento NO está en el pueblo que pidió el colegio.
 *
 * La búsqueda trae a propósito los de la misma comarca: pidiendo Cambrils
 * aparecen los de Salou, que están a diez minutos, y muchas veces son la mejor
 * opción. Pero la lista no lo decía, y leída de corrido parecía que el destino
 * no se estaba aplicando. Un hotel puede estar en varias localidades
 * («Salou / Calafell»), así que se comparan todas.
 */
function esDeOtraLocalidad(localidad: string | null | undefined, destino: string): boolean {
  const pedido = sinAcentos(destino ?? "");
  const suya = (localidad ?? "").trim();
  if (!pedido || !suya) return false;
  return !suya
    .split(/[/,;&]|\s+y\s+/)
    .map(sinAcentos)
    .filter(Boolean)
    .includes(pedido);
}


/**
 * Por qué no ha salido ningún hotel, dicho con precisión.
 *
 * El mensaje de antes era siempre el mismo: «No hay hoteles con tarifa para esas
 * fechas. Revisa el destino o las fechas». En la reunión del 21/09 eso costó
 * veinte minutos. La petición del colegio no traía destino —solo decía la
 * actividad— y el aviso mandaba a mirar las fechas, así que se probó 2026, 2027,
 * octubre y junio antes de caer en que lo que faltaba era el pueblo.
 *
 * «Revisa A o B» cuando el sistema sabe cuál de los dos falla no es ayudar: es
 * repartir el trabajo de diagnóstico al que menos información tiene.
 */
function porQueNoHayHoteles(datos: NormalizedRequestDraft, resultado: SearchAccommodationsResult): string {
  if (!datos.destinationText.trim()) {
    return (
      "Falta el destino: la petición no dice a qué pueblo van. Escríbelo en «Destino» " +
      "y vuelve a buscar."
    );
  }

  if (!datos.dateFrom.trim() || !datos.dateTo.trim()) {
    return `Faltan las fechas del viaje. Escríbelas y se buscará en ${datos.destinationText}.`;
  }

  // El catálogo de Oravia es de 2027. Cotizar 2026 no devuelve nada y el aviso
  // no lo decía: en la reunión se dio varias vueltas a las fechas sin saberlo.
  const anio = Number(datos.dateFrom.slice(0, 4));
  const anios = [...new Set((resultado.matches ?? []).map((m) => m.rate.year))].filter(Boolean);
  if (anio && anios.length > 0 && !anios.includes(anio)) {
    return (
      `No hay tarifas de ${anio} en ${datos.destinationText}. ` +
      `El catálogo cargado cubre ${anios.sort().join(", ")}.`
    );
  }

  return (
    `No hay hoteles con tarifa en ${datos.destinationText} para esas fechas. ` +
    "Puede que el destino esté bien escrito pero no haya tarifas cargadas de ese año."
  );
}

/**
 * Por qué no hay actividades. Javier, 07/10/2026: «las actividades no me
 * salen cuando le doy a cotizar», y la pantalla decía «0 disponibles» y nada
 * más. Hay tres motivos distintos y cada uno se arregla en un sitio.
 */
function porQueNoHayActividades(datos: NormalizedRequestDraft | null, resultado: SearchActivitiesResult): string {
  if (resultado.status === "insufficient_filters") {
    const faltan = resultado.missingFields
      .filter((f) => f.severity === "critical")
      .map((f) => f.label.toLowerCase());
    return faltan.length
      ? `Para buscar actividades falta: ${faltan.join(", ")}.`
      : "Faltan datos de la petición para buscar actividades.";
  }
  if ((resultado.sinTarifa?.length ?? 0) > 0) {
    return "Las actividades del catálogo no tienen precio: aparecen abajo, marcadas para fijarlo al cotizar.";
  }
  const donde = datos?.destinationText?.trim() ? ` para ${datos.destinationText}` : "";
  return (
    `No hay actividades publicadas en el catálogo${donde}. ` +
    "Si hay actividades leídas pero sin aprobar o sin publicar, publícalas en Tarifas → el documento → " +
    "«Revisar y publicar aprobados»."
  );
}

/** ¿Esta actividad encaja con lo escrito en el buscador? Sin tildes ni mayúsculas. */
function coincideActividad(item: ActivitySearchMatch, texto: string): boolean {
  const q = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (!q) return true;
  const campos = [item.activity.activityName, item.activity.supplierName, item.activity.locationMain, item.rate.ageLabel];
  return campos.some((c) => (c ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(q));
}

/** Convierte cualquier error (incluidos los de validación) en una frase legible. */
function mensajeDeError(error: unknown, porDefecto: string): string {
  if (error && typeof error === "object" && "issues" in error) {
    const incidencias = (error as { issues?: Array<{ message?: string }> }).issues ?? [];
    const frases = incidencias.map((i) => i.message).filter(Boolean);
    if (frases.length) return frases.join(" ");
  }
  return error instanceof Error ? error.message : porDefecto;
}

export function RequestCanvas({
  onFinished,
  onExit,
  currentUserId = null,
  departamentoDelUsuario = null,
}: RequestCanvasProps) {
  // La petición
  const [mensajes, setMensajes] = useState<string[]>([]);
  const [borrador, setBorrador] = useState("");
  const [form, setForm] = useState<ParseTripRequestInput>({
    clientType: "new",
    email: "",
    firstName: "",
    lastName: "",
    opportunityName: "",
    rawTripRequestText: "",
  });
  const [entendido, setEntendido] = useState<NormalizedRequestDraft | null>(null);
  /** Tope por alumno y requisitos especiales, sacados del propio mensaje. */
  const [tope, setTope] = useState<number | null>(null);
  const [requisitos, setRequisitos] = useState<string[]>([]);
  /** Lo que se ha ido preguntando y contestando en el chat de la petición. */
  const [conversacion, setConversacion] = useState<TurnoDelChat[]>([]);
  /**
   * Preguntas ya hechas que se quedaron sin respuesta.
   *
   * Se guardan para NO repetirlas. Insistir con el tope por alumno cuando ya
   * han dicho que no lo tienen es lo que hace que se deje de leer la pantalla.
   * Las que bloquean -destino, fechas, alumnos- no entran aquí: esas se
   * preguntan hasta que se contestan, porque sin ellas no hay nada que buscar.
   */
  const [preguntadas, setPreguntadas] = useState<string[]>([]);
  /** La ventana de «Lo que hemos entendido» está abierta. */
  const [revisandoPeticion, setRevisandoPeticion] = useState(false);
  /**
   * La huella de la petición tal y como se validó.
   *
   * No un simple «validado: true»: así el visto bueno CADUCA. Si después
   * cambia algo -un segundo correo del colegio, una respuesta en el chat, un
   * campo corregido a mano- la huella deja de coincidir y se vuelve a pedir.
   * Un «revisado» sobre datos que ya han cambiado no vale nada.
   */
  const [firmaValidada, setFirmaValidada] = useState<string | null>(null);
  /** Solicitudes previas del mismo cliente: evita crear dos tratos del mismo viaje. */
  const [previas, setPrevias] = useState<FindCandidateOpportunitiesResult | null>(null);
  const [parseResult, setParseResult] = useState<ParseTripRequestResult | null>(null);

  /**
   * Para qué cliente se cotiza. El mismo hotel tiene tarifa pactada con el
   * turoperador suizo y tarifa general, y valen distinto. Por defecto, colegio.
   */
  const [canal, setCanal] = useState<ClientSegment>("GENERIC");

  /**
   * Grupos o Turismo Deportivo.
   *
   * Decide DOS cosas: el campo «Departamento» del trato -que Oravia rellena en
   * el 99% de los suyos- y desde qué buzón sale el correo. Iban por separado:
   * sin departamento el correo salía igualmente de Grupos y el trato se quedaba
   * sin clasificar. Arranca con el del usuario; un ADMIN no tiene ninguno, así
   * que lo elige en la ventana de revisión.
   */
  const [departamento, setDepartamento] = useState<"GROUPS" | "SPORTS" | "">(
    departamentoDelUsuario ?? "",
  );

  // Lo que se construye
  const [hoteles, setHoteles] = useState<SearchAccommodationsResult | null>(null);
  const [actividades, setActividades] = useState<SearchActivitiesResult | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [programaBase, setProgramaBase] = useState<string[]>([]);
  // El buscador de actividades. Con todas las del catálogo en la lista
  // (Javier, 08/10/2026: «sería una lista de 100 o 250 actividades»), lo que
  // hace útil la pantalla es escribir «kayak» y ver tres.
  const [busquedaActividades, setBusquedaActividades] = useState("");
  /** Excepciones por opción: qué actividad se quita o se añade respecto a la base. */
  const [excepciones, setExcepciones] = useState<Record<number, { fuera: string[]; dentro: string[] }>>({});
  /**
   * Precios puestos a mano, para las actividades que el catálogo no tarifa.
   *
   * «Arbitraje» está en el catálogo sin ninguna tarifa, así que la búsqueda ni
   * lo enseñaba. Oravia lo quiere como opción elegible, diciendo que hay que
   * ponerle precio, y lo pone quien cotiza. Se guarda en el borrador como todo
   * lo demás: es una decisión suya, no un dato del catálogo.
   */
  const [preciosFijados, setPreciosFijados] = useState<Record<string, number>>({});

  // Cierre
  /**
   * Solicitud ya creada en la base, si el cierre llegó a crearla. Se guarda en
   * el borrador del navegador: si la pestaña se recarga a mitad del cierre, es
   * lo único que impide que el reintento cree una solicitud nueva y, tras ella,
   * un segundo trato en el CRM.
   */
  const [solicitudId, setSolicitudId] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<TripProposal | null>(null);
  const [dealId, setDealId] = useState<string | null>(null);
  const [entrega, setEntrega] = useState<ProposalDeliveryResult | null>(null);
  const [enviada, setEnviada] = useState(false);
  /**
   * Cómo acabó el envío, para decirlo a la cara.
   *
   * Antes solo quedaba una franja ámbar arriba del lienzo y la pantalla igual
   * que estaba: con la propuesta ya fuera, se seguía mirando la misma lista de
   * hoteles sin saber si había que hacer algo más. Y un fallo salía en el mismo
   * sitio y con el mismo aspecto que cualquier otro aviso.
   */
  const [resultadoEnvio, setResultadoEnvio] = useState<
    { estado: "enviada" | "preparada" | "fallo"; motivo: string | null } | null
  >(null);

  /** El borrador que se está escribiendo, ya en el servidor. */
  const [borradorId, setBorradorId] = useState<string | null>(null);
  /** Los borradores a medias que este usuario puede continuar. */
  const [borradores, setBorradores] = useState<BorradorEnLista[]>([]);
  /** Borrador encontrado al entrar: se ofrece, no se aplica a la fuerza. */
  const [recuperable, setRecuperable] = useState<BorradorSolicitud | null>(null);
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null);
  /** El contacto tal y como está en el CRM, si ese correo ya estaba. */
  const [contactoCrm, setContactoCrm] = useState<ContactoDelCrm | null>(null);
  /** Hotel cuyo detalle se está mirando. Popover, no modal: no interrumpe. */
  const [detalle, setDetalle] = useState<string | null>(null);
  /** Actividad cuya ventana de tarifas está abierta. */
  const [detalleActividad, setDetalleActividad] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);
  /**
   * Se esta rehaciendo el documento, no enviando.
   *
   * Los dos usan , asi que sin distinguirlo el boton de
   * enviar decia «Enviando…» mientras solo se regeneraba el PDF. Eso asusta.
   */
  const [rehaciendo, setRehaciendo] = useState(false);
  /**
   * Qué se está eligiendo ahora: alojamientos o actividades.
   *
   * Antes iba todo en una sola columna, uno debajo de otro, con mucho
   * desplazamiento. Quien cotiza no tenía forma de ver de un vistazo si se
   * había dejado algo sin asignar, que es justo lo que hay que comprobar antes
   * de enviar.
   */
  const [selec, setSelec] = useState<"alojamientos" | "actividades">("alojamientos");
  const [vista, setVista] = useState<"lista" | "comparar">("lista");
  const [ocupado, setOcupado] = useState<"" | "leyendo" | "buscando" | "enviando">("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");


  // Al entrar, mirar si quedó trabajo a medias. No se aplica solo: se ofrece.
  useEffect(() => {
    const encontrado = leerBorrador();
    if (encontrado) setRecuperable(encontrado);
  }, []);

  // Y los borradores del servidor, que son los que se pueden continuar desde
  // otro ordenador o los que dejó un compañero.
  const recargarBorradores = useCallback(() => {
    return listarBorradoresApi()
      .then(({ drafts }) => setBorradores(drafts))
      .catch(() => {
        // Sin lista se sigue trabajando: se empieza una solicitud nueva.
      });
  }, []);

  useEffect(() => {
    void recargarBorradores();
  }, [recargarBorradores]);

  /** Los de la lista, menos el que se está editando ahora mismo. */
  const otrosBorradores = useMemo(
    () => borradores.filter((d) => d.id !== borradorId),
    [borradores, borradorId],
  );

  /**
   * Tirar un borrador que ya no sirve.
   *
   * Hasta ahora la lista solo dejaba continuar. Una prueba que salió mal se
   * quedaba ahí para siempre y no había forma de quitarla desde la pantalla.
   */
  async function descartarDelServidor(id: string) {
    setBorradores((antes) => antes.filter((d) => d.id !== id));
    if (id === borradorId) setBorradorId(null);
    await borrarBorradorApi(id).catch(() => {
      // Si no se pudo, la próxima recarga lo vuelve a enseñar: mejor eso que
      // afirmar que se borró algo que sigue ahí.
      void recargarBorradores();
    });
  }

  /**
   * Continuar un borrador del servidor, sea de quien sea.
   *
   * Si lo tenía abierto otra persona se avisa y se toma: no hay cerrojo duro a
   * propósito, porque si alguien se va de vacaciones con un borrador abierto su
   * compañera tiene que poder seguirlo. Lo que no puede pasar es que se lo
   * encuentre sin enterarse.
   */
  async function continuarBorrador(id: string) {
    setError("");
    setOcupado("leyendo");
    try {
      const { draft } = await leerBorradorApi(id);
      const estado = draft.payload as BorradorSolicitud | null;
      if (!estado) {
        setError("Ese borrador no se puede leer. Empieza una solicitud nueva.");
        return;
      }

      if (draft.lockedByUserId) {
        setAviso("Otra persona lo tenía abierto. Lo has tomado tú: avísale para que no trabajéis los dos.");
      }
      await tomarBorradorApi(id).catch(() => {});

      setBorradorId(draft.id);
      setSolicitudId(estado.solicitudId ?? null);
      setCanal(estado.canal ?? "GENERIC");
      setMensajes(estado.mensajes ?? []);
      setBorrador(estado.redaccion ?? "");
      setForm(estado.form);
      setEntendido(estado.entendido);
      setTope(estado.tope ?? null);
      setRequisitos(estado.requisitos ?? []);
      setDepartamento(estado.departamento ?? departamentoDelUsuario ?? "");
      setConversacion(estado.conversacion ?? []);
      setPreguntadas(estado.preguntadas ?? []);
      setElegidos(estado.elegidos ?? []);
      setProgramaBase(estado.programaBase ?? []);
      setExcepciones(estado.excepciones ?? {});
      setPreciosFijados(estado.preciosFijados ?? {});
      setRecuperable(null);

      // Las tarifas pueden haber cambiado desde que se guardó: se vuelve a
      // buscar en vez de enseñar precios viejos.
      if (estado.entendido?.destinationText) {
        await buscarHoteles(estado.entendido, estado.canal ?? "GENERIC", {
          requisitos: estado.requisitos ?? [],
          tope: estado.tope ?? null,
        });
      }
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo abrir el borrador."));
    } finally {
      setOcupado("");
    }
  }

  /**
   * Quién es ese correo en el CRM, en cuanto se sabe.
   *
   * Va en un efecto y no dentro de «leer» para que valga en los tres caminos
   * por los que puede aparecer un correo: leído del mensaje, escrito a mano en
   * la ventana de revisión, o corregido después. Antes solo se intentaba al
   * leer, y encima con el valor anterior del estado, así que en la práctica no
   * se consultaba.
   *
   * Importa porque sin esto se crea una segunda ficha del mismo colegio cada
   * vez que alguien escribe el nombre de otra manera. En el Zoho de Oravia
   * quedaron tres cuentas llamadas «Marta Ferrer».
   */
  const ultimoCorreoConsultado = useRef<string>("");
  useEffect(() => {
    const correo = form.email.trim().toLowerCase();
    // Sin arroba no es un correo todavía: se está escribiendo.
    if (!correo || !/.+@.+\..+/.test(correo)) return;
    if (correo === ultimoCorreoConsultado.current) return;

    const reloj = window.setTimeout(() => {
      ultimoCorreoConsultado.current = correo;
      void traerContactoDelCrm(correo);
    }, 600);
    return () => window.clearTimeout(reloj);
  }, [form.email]);

  /**
   * El hilo del chat, para poder llevarlo al final.
   *
   * La tarjeta tiene altura fija y el que se desplaza es el hilo, no la
   * página. Sin esto, cada respuesta nueva quedaba fuera de la vista y había
   * que bajar a mano para leer lo que acababa de contestar la app.
   */
  const hiloRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const hilo = hiloRef.current;
    if (!hilo) return;
    hilo.scrollTop = hilo.scrollHeight;
    // `entendido` y `preguntadas` en vez de la pregunta pendiente: esta se
    // calcula mas abajo y son justo los dos estados que la hacen cambiar.
  }, [conversacion, mensajes, entendido, preguntadas]);

  // Guardado continuo, con un respiro para no escribir en cada tecla.
  const guardadoRef = useRef<number | null>(null);
  useEffect(() => {
    if (enviada) return;
    if (guardadoRef.current) window.clearTimeout(guardadoRef.current);
    guardadoRef.current = window.setTimeout(() => {
      const estado = {
        solicitudId,
        canal,
        mensajes,
        redaccion: borrador,
        form,
        entendido,
        tope,
        requisitos,
        departamento,
        // El hilo del chat viaja con el borrador: sin esto, retomarlo mañana
        // volvía a preguntar lo que el colegio ya había contestado.
        conversacion,
        preguntadas,
        elegidos,
        programaBase,
        excepciones,
        preciosFijados,
      };

      // En el navegador, siempre: es la red que salva lo escrito si se cae la
      // red justo ahora o se recarga la pestaña.
      guardarBorrador(estado);
      setGuardadoEn(new Date().toISOString());

      // Y en el servidor, que es donde vive de verdad y lo que permite
      // retomarlo desde otro ordenador o que lo continúe un compañero.
      if (estaVacio(estado)) return;
      void guardarBorradorApi({
        id: borradorId,
        title: tituloDelBorrador(estado),
        payload: estado,
        tripRequestId: solicitudId,
      })
        .then(({ draft }) => {
          if (!borradorId) setBorradorId(draft.id);
        })
        .catch(() => {
          // Sin servidor se sigue trabajando: lo del navegador ya está guardado
          // y el siguiente guardado reintentará.
        });
    }, 600);
    return () => {
      if (guardadoRef.current) window.clearTimeout(guardadoRef.current);
    };
  }, [mensajes, borrador, form, entendido, tope, requisitos, departamento, conversacion, preguntadas, elegidos, programaBase, excepciones, preciosFijados, solicitudId, canal, enviada]);

  /** Recupera el borrador y vuelve a buscar hoteles: las tarifas pueden haber cambiado. */
  function recuperar() {
    if (!recuperable) return;
    setSolicitudId(recuperable.solicitudId ?? null);
    setCanal(recuperable.canal ?? "GENERIC");
    setMensajes(recuperable.mensajes);
    setBorrador(recuperable.redaccion);
    setForm(recuperable.form);
    setEntendido(recuperable.entendido);
    setTope(recuperable.tope);
    setDepartamento(recuperable.departamento ?? departamentoDelUsuario ?? "");
    setConversacion(recuperable.conversacion ?? []);
    setPreguntadas(recuperable.preguntadas ?? []);
    setRequisitos(recuperable.requisitos);
    setElegidos(recuperable.elegidos);
    setProgramaBase(recuperable.programaBase);
    setExcepciones(recuperable.excepciones);
    setPreciosFijados(recuperable.preciosFijados ?? {});
    if (recuperable.entendido) {
      setParseResult({
        normalized: recuperable.entendido,
        missingFields: [],
        warnings: [],
        requestStatus: "READY_FOR_SEARCH",
      });
      void buscarHoteles(recuperable.entendido, canal, {
        requisitos: recuperable.requisitos ?? [],
        tope: recuperable.tope ?? null,
      });
    }
    setRecuperable(null);
    setAviso("Recuperado el borrador. Las tarifas se han vuelto a consultar.");
  }

  /**
   * Descartar el trabajo a medias que ofrece el aviso de arriba.
   *
   * Antes solo limpiaba el navegador: la fila del servidor se quedaba, así que
   * el borrador «descartado» reaparecía en la lista de abajo y en cualquier
   * otro ordenador. Descartar tiene que descartar.
   */
  function descartarBorrador() {
    borrarBorrador();
    setRecuperable(null);
    if (borradorId) void descartarDelServidor(borradorId);
  }

  const noches = entendido ? nochesEntre(entendido.dateFrom, entendido.dateTo) : 0;

  // La petición tal y como está ahora mismo, con lo que no cabe en el borrador
  // normalizado: el tope y los requisitos. Es lo que mira el chat para decidir
  // qué preguntar y lo que mira la búsqueda para comprobar el encaje.
  const peticionEnCurso = entendido
    ? { ...entendido, topePorAlumno: tope, requisitos }
    : null;
  const pregunta = peticionEnCurso ? siguientePregunta(peticionEnCurso, preguntadas) : null;
  const seIgnora = peticionEnCurso ? loQueSeIgnora(peticionEnCurso, preguntadas) : [];

  // Hay lo mínimo para interpretar la petición: destino, fechas y alumnos.
  // Hasta aquí no se enseña nada de «Lo que hemos entendido»: un bloque de
  // catorce campos medio vacíos mientras el chat pregunta lo básico no se
  // revisa, y al no revisarse se manda un presupuesto sobre lo que la app
  // adivinó.
  const hayLoMinimo = peticionEnCurso ? sePuedeRecomendar(peticionEnCurso) : false;

  const firmaAhora = entendido
    ? firmaDeLaPeticion({
        ...entendido,
        topePorAlumno: tope,
        requisitos,
        centreName: form.centreName ?? "",
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        opportunityName: form.opportunityName ?? "",
        canal,
        departamento,
      })
    : "";
  const peticionValidada = Boolean(firmaValidada) && firmaValidada === firmaAhora;

  /**
   * Busca hoteles y actividades para una petición ya entendida.
   *
   * Los requisitos y el tope llegan por parámetro, no del estado. Quien llama
   * acaba de hacer `setRequisitos` / `setTope` en el mismo manejador, y React
   * no ha actualizado nada todavía: leyéndolos del estado, la PRIMERA búsqueda
   * -la única que importa- iba sin requisitos y sin tope, así que ningún
   * alojamiento traía comprobaciones y no había podio. Por defecto se usan los
   * del estado, que es lo correcto cuando solo cambia el canal.
   */
  async function buscarHoteles(
    datos: NormalizedRequestDraft,
    canalPedido: ClientSegment = canal,
    pedido: { requisitos: string[]; tope: number | null } = { requisitos, tope },
  ) {
    setOcupado("buscando");
    try {
      // `boardType` es el nombre que espera la búsqueda; el régimen del mensaje
      // viaja en `regimeRequested` y hay que traducirlo aquí.
      const filtros = {
        destinationText: datos.destinationText,
        destinationCountry: datos.destinationCountry,
        dateFrom: datos.dateFrom,
        dateTo: datos.dateTo,
        participants: datos.participants,
        teachers: datos.teachers,
        boardType: datos.regimeRequested,
        categoryRequested: datos.categoryRequested,
        // Para quién se cotiza. Sin decirlo, las tarifas pactadas con un canal
        // (el turoperador suizo) no aparecían NUNCA: quedaban cargadas y
        // muertas.
        clientSegment: canalPedido,
        // Lo que el centro pidió en prosa y el tope por alumno. Se leían del
        // mensaje y se pintaban en pantalla, pero no llegaban a la búsqueda:
        // los dos celíacos y la alumna con movilidad reducida no influían en
        // nada. Sin esto no se puede decir si un alojamiento encaja.
        requisitos: pedido.requisitos,
        topePorAlumno: pedido.tope,
      };
      const [alojamientos, planes] = await Promise.all([
        searchAccommodationsApi(filtros),
        searchActivitiesApi(filtros),
      ]);
      setHoteles(alojamientos);
      setActividades(planes);
      if (alojamientos.matches.length === 0) {
        setAviso(porQueNoHayHoteles(datos, alojamientos));
      }
    } finally {
      setOcupado("");
    }
  }

  /** Actividades que van en una opción: la base, menos las quitadas, más las añadidas. */
  function actividadesDe(opcion: number): string[] {
    const excepcion = excepciones[opcion] ?? { fuera: [], dentro: [] };
    return [...programaBase.filter((id) => !excepcion.fuera.includes(id)), ...excepcion.dentro];
  }

  /** Todas las que se pueden elegir: las tarifadas y las que hay que tarifar. */
  const actividadesElegibles = useMemo<ActivitySearchMatch[]>(
    () => [...(actividades?.matches ?? []), ...(actividades?.sinTarifa ?? [])],
    [actividades],
  );

  /**
   * Una actividad con su precio REAL, sea del catálogo o puesto a mano.
   *
   * Todo lo que suma —el precio por alumno, el tope, el documento— pasa por
   * aquí, así que el precio fijado se aplica una vez y en un solo sitio.
   */
  function matchActividad(id: string): ActivitySearchMatch | undefined {
    const encontrada = actividadesElegibles.find((m) => m.activity.id === id);
    if (!encontrada) return undefined;
    const puesto = preciosFijados[id];
    if (!encontrada.precioAFijar || !puesto) return encontrada;
    return {
      ...encontrada,
      rate: { ...encontrada.rate, salePvpAmount: puesto },
      precioFijado: puesto,
    };
  }

  /** Sin precio no se puede elegir: entraría en el documento valiendo cero. */
  function faltaPonerlePrecio(item: ActivitySearchMatch): boolean {
    return Boolean(item.precioAFijar) && !preciosFijados[item.activity.id];
  }

  function matchHotel(id: string): AccommodationSearchMatch | undefined {
    return hoteles?.matches.find((m) => m.accommodation.id === id);
  }

  // ── Los tres hitos, calculados del estado real ──────────────────────────────
  const hitos: Hito[] = useMemo(() => {
    const faltaEnPeticion: string[] = [];
    if (!entendido?.destinationText) faltaEnPeticion.push("el destino");
    if (!entendido?.dateFrom || !entendido?.dateTo) faltaEnPeticion.push("las fechas");
    if (!entendido?.participants) faltaEnPeticion.push("el número de alumnos");

    const peticion: Hito = {
      id: 1,
      titulo: "La petición",
      detalle: !entendido
        ? "Pega el mensaje del cliente"
        : faltaEnPeticion.length
          ? `Falta ${faltaEnPeticion.join(", ")}`
          : peticionValidada
            ? "Entendida y confirmada"
            : "Falta confirmarla",
      estado:
        ocupado === "leyendo"
          ? "trabajando"
          : !entendido
            ? "pendiente"
            : faltaEnPeticion.length || !peticionValidada
              ? "aviso"
              : "hecho",
    };

    const sinPrecio = elegidos.some((id) =>
      actividadesDe(elegidos.indexOf(id) + 1).some((actId) => !(matchActividad(actId)?.rate.salePvpAmount)),
    );
    const fueraDeTope = tope
      ? elegidos.filter((id, indice) => {
          const hotel = matchHotel(id);
          if (!hotel) return false;
          const enOpcion = actividadesDe(indice + 1).map(matchActividad).filter(Boolean) as ActivitySearchMatch[];
          return precioPorAlumno(hotel, enOpcion, noches) > tope;
        }).length
      : 0;

    const opciones: Hito = {
      id: 2,
      titulo: "Las opciones",
      detalle:
        ocupado === "buscando"
          ? "Buscando hoteles…"
          : elegidos.length === 0
            ? hoteles
              ? `Elige hasta ${MAX_OPCIONES} hoteles de la lista`
              : "Sin montar"
            : fueraDeTope
              ? `${elegidos.length} ${elegidos.length === 1 ? "hotel" : "hoteles"} · ${fueraDeTope} se pasa${fueraDeTope === 1 ? "" : "n"} del tope`
              : `${elegidos.length} ${elegidos.length === 1 ? "hotel" : "hoteles"} · ${programaBase.length} ${programaBase.length === 1 ? "actividad" : "actividades"}`,
      estado:
        ocupado === "buscando"
          ? "trabajando"
          : elegidos.length === 0
            ? "pendiente"
            : programaBase.length === 0 || sinPrecio || fueraDeTope
              ? "aviso"
              : "hecho",
    };

    const faltaContacto: string[] = [];
    if (!form.email.trim()) faltaContacto.push("el correo");
    if (!form.firstName.trim() || !form.lastName.trim()) faltaContacto.push("el nombre de contacto");
    const faltaCorreo = faltaContacto.length > 0;
    const enviar: Hito = {
      id: 3,
      titulo: "Enviar",
      detalle: enviada && entrega
        ? entrega.simulated
          ? `${entrega.reference} preparada, sin salir`
          : `Enviada como ${entrega.reference}`
        : faltaCorreo
          ? `Falta ${faltaContacto.join(" y ")}`
          : elegidos.length === 0
            ? "Aún no hay opciones"
            : "Todo listo",
      estado: enviada ? "hecho" : ocupado === "enviando" ? "trabajando" : faltaCorreo || elegidos.length === 0 ? "pendiente" : "hecho",
    };

    return [peticion, opciones, enviar];
  }, [entendido, elegidos, programaBase, excepciones, form.email, form.firstName, form.lastName, ocupado, entrega, enviada, actividades, hoteles, tope, noches, peticionValidada]);

  // El visto bueno es la puerta de salida, no la de entrada. Buscar se busca
  // en cuanto hay lo mínimo -si no, la pantalla se queda muerta mientras se
  // revisa-, pero nada sale hacia el colegio ni hacia el CRM sin que alguien
  // haya leído y confirmado lo que se entendió.
  const puedeRevisar =
    hitos[2].estado === "hecho" && !enviada && elegidos.length > 0 && peticionValidada;

  // ── Acciones ────────────────────────────────────────────────────────────────

  /**
   * Una respuesta del chat.
   *
   * `valor === null` es «no lo han dicho»: cierra la pregunta y NO rellena el
   * dato. Si el colegio no dijo el régimen, la petición se queda sin régimen y
   * el encaje no lo comprueba; ponerle «pensión completa» porque es lo habitual
   * sería inventarse lo que pidió un cliente.
   *
   * Y en cuanto hay lo justo se vuelve a buscar, sin esperar al final: el chat
   * tiene que enseñar el efecto de cada respuesta. Los valores nuevos se pasan
   * a mano a la búsqueda porque el estado de React todavía no los tiene.
   */
  async function contestar(
    hueco: Hueco,
    valor: string | string[] | number | null,
    dicho: string,
    ademas?: Partial<NormalizedRequestDraft>,
  ) {
    if (!entendido) return;
    setConversacion((hilo) => [...hilo, { pregunta: hueco.pregunta, respuesta: dicho }]);

    if (valor === null) {
      setPreguntadas((ya) => (ya.includes(hueco.clave) ? ya : [...ya, hueco.clave]));
      return;
    }

    let nuevo = entendido;
    let nuevoTope = tope;
    let nuevosReq = requisitos;

    switch (hueco.clave) {
      case "destinationText":
        nuevo = { ...entendido, destinationText: String(valor) };
        break;
      case "dateFrom":
        nuevo = { ...entendido, dateFrom: String(valor) };
        break;
      case "dateTo":
        nuevo = { ...entendido, dateTo: String(valor) };
        break;
      case "participants":
        nuevo = { ...entendido, participants: Number(valor) };
        break;
      case "teachers":
        nuevo = { ...entendido, teachers: Number(valor) };
        break;
      case "regimeRequested":
        nuevo = { ...entendido, regimeRequested: String(valor) };
        break;
      case "categoryRequested":
        nuevo = { ...entendido, categoryRequested: String(valor) };
        break;
      case "topePorAlumno":
        nuevoTope = Number(valor);
        break;
      case "requisitos":
        nuevosReq = Array.isArray(valor) ? valor : [String(valor)];
        break;
    }

    // Escribir «del 12 al 16 de mayo» contestando a «¿qué día llegan?» da las
    // dos fechas de una vez. Volver a preguntar la salida cuando acaban de
    // decirla es el tipo de cosa que hace abandonar un chat.
    if (ademas) nuevo = { ...nuevo, ...ademas };

    setEntendido(nuevo);
    setTope(nuevoTope);
    setRequisitos(nuevosReq);
    setAviso("");

    if (sePuedeRecomendar({ ...nuevo, topePorAlumno: nuevoTope, requisitos: nuevosReq })) {
      try {
        await buscarHoteles(nuevo, canal, { requisitos: nuevosReq, tope: nuevoTope });
      } catch (err) {
        setError(mensajeDeError(err, "No se pudo buscar con esa respuesta."));
      }
    }
  }

  /**
   * Una respuesta escrita en el compositor.
   *
   * Hay UN solo sitio donde escribir, y aquí se decide qué hacer con lo que
   * pone. Lo importante es que casi nunca contesta exactamente a lo que se
   * preguntó: a «¿a qué destino quieren ir?» se contestó «Seríamos 48 alumnos
   * de entre 15 y 17 años. Nos interesa un hotel de 3 estrellas en pensión
   * completa» y la app guardó esa frase ENTERA como destino.
   *
   * Así que la respuesta se lee con los mismos lectores que leen el correo del
   * colegio, se aprovecha TODO lo que traiga, y si no contesta a lo que se
   * preguntaba, se dice y se insiste.
   */
  async function contestarEscribiendo(hueco: Hueco, texto: string) {
    const hoy = new Date();

    // Los lectores de siempre, aplicados a la respuesta: es un mensaje más.
    const leido = readTripMessage(texto).normalized;
    const extrasLeidos = extractRequestExtras(texto);
    const rango = leerRango(texto, hoy);
    const unaFecha = leerUnaFecha(texto, hoy);

    const lectura = {
      destinationText: leido.destinationText,
      dateFrom: rango.desde || (hueco.clave === "dateFrom" ? unaFecha : leido.dateFrom) || "",
      dateTo: rango.hasta || (hueco.clave === "dateTo" ? unaFecha : leido.dateTo) || "",
      participants: leido.participants,
      teachers: leido.teachers,
      ageRangeText: leido.ageRangeText,
      regimeRequested: leido.regimeRequested,
      categoryRequested: leido.categoryRequested,
      topePorAlumno: extrasLeidos.budgetPerStudent,
      requisitos: extrasLeidos.specialRequirements,
    };

    const r = interpretarRespuesta(hueco, texto, lectura);

    // Lo dicho por la persona, y lo que la app contesta, van al hilo antes de
    // nada: si la búsqueda tarda, la conversación no se queda congelada.
    setConversacion((hilo) => [
      ...hilo,
      { pregunta: hueco.pregunta, respuesta: texto },
      ...(r.dice ? [{ pregunta: r.dice, respuesta: "" }] : []),
    ]);

    if (Object.keys(r.aplicar).length === 0) {
      if (!r.contesta) return;
    }

    const nuevo: NormalizedRequestDraft = {
      ...(entendido as NormalizedRequestDraft),
      ...(r.aplicar.destinationText ? { destinationText: r.aplicar.destinationText } : {}),
      ...(r.aplicar.dateFrom ? { dateFrom: r.aplicar.dateFrom } : {}),
      ...(r.aplicar.dateTo ? { dateTo: r.aplicar.dateTo } : {}),
      ...(r.aplicar.participants ? { participants: r.aplicar.participants } : {}),
      ...(r.aplicar.teachers !== undefined && r.aplicar.teachers !== null
        ? { teachers: r.aplicar.teachers }
        : {}),
      ...(r.aplicar.ageRangeText
        ? {
            ageRangeText: r.aplicar.ageRangeText,
            // El buscador saca el número de `averageAgeText` cuando no hay
            // guion; solo con `ageRangeText` la edad se vería y no filtraría.
            averageAgeText: /^\d{1,2}$/.test(r.aplicar.ageRangeText.trim())
              ? `${r.aplicar.ageRangeText.trim()} años`
              : (entendido as NormalizedRequestDraft).averageAgeText,
          }
        : {}),
      ...(r.aplicar.regimeRequested ? { regimeRequested: r.aplicar.regimeRequested } : {}),
      ...(r.aplicar.categoryRequested ? { categoryRequested: r.aplicar.categoryRequested } : {}),
    };

    const nuevoTope = r.aplicar.topePorAlumno ?? tope;
    const nuevosReq = r.aplicar.requisitos?.length
      ? [...new Set([...requisitos, ...r.aplicar.requisitos])]
      : requisitos;

    setEntendido(nuevo);
    setTope(nuevoTope);
    setRequisitos(nuevosReq);
    setAviso("");

    if (sePuedeRecomendar({ ...nuevo, topePorAlumno: nuevoTope, requisitos: nuevosReq })) {
      try {
        await buscarHoteles(nuevo, canal, { requisitos: nuevosReq, tope: nuevoTope });
      } catch (err) {
        setError(mensajeDeError(err, "No se pudo buscar con esa respuesta."));
      }
    }
  }

  /**
   * El botón de enviar, que hace lo que toque según dónde esté la conversación.
   *
   * Si hay una pregunta abierta, lo escrito la contesta. Si no la hay, es un
   * mensaje nuevo del colegio y se vuelve a leer todo.
   */
  async function enviarDelCompositor() {
    const texto = borrador.trim();
    if (!texto || ocupado !== "") return;
    if (pregunta) {
      setBorrador("");
      await contestarEscribiendo(pregunta, texto);
      return;
    }
    await leerYBuscar();
  }

  // `añadirMensaje` ya no existe: con un solo botón de enviar, apilar mensajes
  // sin leerlos era un paso que no llevaba a ninguna parte. Enviar añade el
  // mensaje Y lo lee, que es lo que se quería hacer las dos veces.

  /**
   * Trae el contacto del CRM y rellena lo que falte.
   *
   * Nunca pisa lo que haya escrito el operador: solo completa los huecos. Si el
   * correo no está en Zoho no pasa nada, es un colegio nuevo. Y si Zoho no
   * contesta, tampoco: la solicitud se puede terminar sin el CRM.
   */
  async function traerContactoDelCrm(email: string): Promise<void> {
    try {
      const contacto = await buscarContactoCrmApi(email.trim());
      if (!contacto) {
        setContactoCrm(null);
        return;
      }
      setContactoCrm(contacto);
      setForm((actual) => ({
        ...actual,
        firstName: actual.firstName.trim() || contacto.firstName,
        lastName: actual.lastName.trim() || contacto.lastName,
        // El centro que manda es el de su cuenta en Zoho, no el que hayamos
        // adivinado del mensaje: si el colegio ya existe, su nombre bueno es el
        // que ellos escribieron alli. Asi no se crea una segunda cuenta por una
        // tilde o un «IES» de mas.
        centreName: contacto.accountName || (actual.centreName ?? ""),
      }));
    } catch {
      // Sin CRM se sigue trabajando: el contacto se escribe a mano, como antes.
      setContactoCrm(null);
    }
  }

  /** Lee el mensaje, saca los datos y busca hoteles: es un solo gesto para quien cotiza. */
  async function leerYBuscar() {
    const texto = [...mensajes, borrador].map((m) => m.trim()).filter(Boolean).join("\n\n");
    if (!texto) {
      setError("Pega antes el mensaje del cliente.");
      return;
    }
    setError("");
    setAviso("");
    setOcupado("leyendo");
    try {
      const datosCliente = extractClientInfo(texto);
      const entrada: ParseTripRequestInput = {
        ...form,
        email: form.email || datosCliente.email || "",
        firstName: form.firstName || datosCliente.firstName || "",
        lastName: form.lastName || datosCliente.lastName || "",
        // El centro da nombre a la cuenta del CRM. Sin el, la app creaba la
        // cuenta con el nombre de la persona.
        centreName: form.centreName || datosCliente.centreName || "",
        opportunityName: form.opportunityName || datosCliente.opportunityName || "",
        rawTripRequestText: texto,
      };
      setForm(entrada);

      // La consulta al CRM la dispara el efecto de más abajo, mirando
      // `form.email`. Aquí NO se llama: `form` todavía tiene el valor viejo
      // -`setForm` acaba de encolarse- y en la primera lectura eso es la cadena
      // vacía, así que la condición era falsa y el CRM no se consultaba NUNCA.
      // Es el mismo fallo que tenían los requisitos: leer del estado dentro del
      // manejador que lo acaba de cambiar.

      // Leer NO exige datos de contacto: el correo hace falta para enviar.
      const resultado = readTripMessage(texto);
      setParseResult(resultado);
      // Lo leído ahora manda, pero lo que este mensaje NO diga no borra lo que
      // ya se había contestado en el chat. Sin esto, un segundo correo del
      // colegio -que no repite el destino- borraba el «Salou» recién dicho y la
      // app lo volvía a preguntar.
      const leido = conservarLoContestado(resultado.normalized, entendido);
      setEntendido(leido);

      const extras = extractRequestExtras(texto);
      const topeLeido = extras.budgetPerStudent ?? tope;
      const reqLeidos = extras.specialRequirements.length ? extras.specialRequirements : requisitos;
      setTope(topeLeido);
      setRequisitos(reqLeidos);

      if (borrador.trim()) {
        setMensajes((actuales) => [...actuales, borrador.trim()]);
        setBorrador("");
      }

      // Sin destino, fechas y alumnos no hay nada que buscar: el chat lo
      // pregunta y se busca en cuanto esté. Lanzar la búsqueda igualmente
      // devolvía cero hoteles y un aviso, que es la pantalla vacía de siempre.
      if (sePuedeRecomendar({ ...leido, topePorAlumno: topeLeido, requisitos: reqLeidos })) {
        await buscarHoteles(leido, canal, { requisitos: reqLeidos, tope: topeLeido });
      }
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo leer el mensaje."));
    } finally {
      setOcupado("");
    }
  }

  function alternarHotel(id: string) {
    // El aviso se decide FUERA del updater: cambiar otro estado dentro de él
    // dispara el aviso de React de "actualizar mientras se renderiza" y, en
    // modo estricto, el updater corre dos veces.
    if (elegidos.includes(id)) {
      setElegidos(elegidos.filter((x) => x !== id));
      setAviso("");
      return;
    }
    if (elegidos.length >= MAX_OPCIONES) {
      setAviso(`Solo caben ${MAX_OPCIONES} opciones. Quita una antes de añadir otra.`);
      return;
    }
    setElegidos([...elegidos, id]);
    setAviso("");
  }

  function alternarBase(id: string) {
    setProgramaBase((actuales) =>
      actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id],
    );
  }

  /** Marca o desmarca una actividad en UNA opción concreta (la matriz). */
  function alternarEnOpcion(actividadId: string, opcion: number) {
    const puesta = actividadesDe(opcion).includes(actividadId);
    const enBase = programaBase.includes(actividadId);
    setExcepciones((actuales) => {
      const actual = actuales[opcion] ?? { fuera: [], dentro: [] };
      let { fuera, dentro } = { fuera: [...actual.fuera], dentro: [...actual.dentro] };
      if (puesta) {
        if (enBase) fuera = [...fuera, actividadId];
        else dentro = dentro.filter((x) => x !== actividadId);
      } else {
        if (enBase) fuera = fuera.filter((x) => x !== actividadId);
        else dentro = [...dentro, actividadId];
      }
      return { ...actuales, [opcion]: { fuera, dentro } };
    });
  }

  /**
   * Prepara la propuesta SIN enviarla: crea el cliente, guarda la solicitud,
   * monta las opciones, crea el trato en Zoho y genera el documento. Deja la
   * entrega en borrador para poder revisarla antes de que salga.
   */
  /**
   * Rehacer el documento sin salir de la pantalla de revisión.
   *
   * Es la misma preparación, así que reaprovecha la entrega en borrador: se
   * conservan la referencia y el enlace público, y el PDF se regenera con lo
   * que hay ahora. No crea una segunda entrega ni un segundo trato.
   *
   * Solo se marca aparte para que el botón de enviar no diga «Enviando…»
   * mientras esto ocurre.
   */
  async function rehacerDocumento() {
    setRehaciendo(true);
    setAviso("");
    try {
      await prepararParaRevisar();
      setAviso("Documento rehecho con lo que hay ahora. Vuelve a abrirlo para verlo.");
    } finally {
      setRehaciendo(false);
    }
  }

  async function prepararParaRevisar() {
    if (!parseResult || !entendido) return;
    setError("");
    const validacion = validateTripRequest({
      clientType: form.clientType,
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      normalized: entendido,
    });
    const errores = validacion.issues.filter((i) => i.severity === "error");
    if (errores.length) {
      setError(errores.map((i) => i.message).join(" "));
      setRevisando(false);
      return;
    }

    setOcupado("enviando");
    try {
      // Los cinco pasos son reintentables: ninguno se salta, todos reescriben lo
      // que ya crearon. Saltárselos parecía más rápido, pero dejaba fuera las
      // correcciones hechas entre el fallo y el reintento, y no sobrevivía a una
      // recarga del navegador, que es cuando de verdad se duplicaba todo.
      const cliente = await upsertClientFromRequest(form);

      const candidatas = await findCandidateOpportunities(cliente, entendido);
      setPrevias(candidatas);

      // `entendido` y no `parseResult`: lo segundo es la primera lectura del
      // mensaje y no recoge ni las correcciones a mano ni lo contestado en el
      // chat. Guardando aquello, el documento salía «para 0 alumnos».
      const guardada = await saveNormalizedTripRequest(
        cliente.id,
        form,
        parseResult,
        entendido,
        solicitudId,
        // Lo elegido aquí manda sobre el departamento del usuario: un ADMIN no
        // tiene ninguno, y de este mismo dato salen el campo del CRM y el buzón
        // desde el que se envía.
        departamento || null,
      );
      setSolicitudId(guardada.id);

      const actividadesPorOpcion: Record<number, string[]> = {};
      elegidos.forEach((_, indice) => {
        actividadesPorOpcion[indice + 1] = actividadesDe(indice + 1);
      });

      const nueva = await buildProposal({
        tripRequestId: guardada.id,
        normalized: entendido,
        accommodationMatches: hoteles?.matches ?? [],
        // Con el precio ya resuelto: las que el catálogo no tarifa llevan el
        // que puso quien cotiza. Mandando `matches` a secas, «Arbitraje» ni
        // llegaba, y si llegara entraría valiendo cero.
        activityMatches: actividadesElegibles.map(
          (item) => matchActividad(item.activity.id) ?? item,
        ),
        builderState: {
          selectedAccommodationIds: elegidos,
          activitiesByOption: actividadesPorOpcion,
          selectedActivityIds: programaBase,
        },
      });
      setPropuesta(nueva);

      const payload = prepareNewOpportunityPayload({
        client: cliente,
        request: entendido,
        proposal: nueva,
        opportunityName: form.opportunityName,
      });
      // `tripRequestId` es lo que impide que reintentar cree un segundo trato:
      // el servidor lo mira en la BD, no en esta pantalla, que se pierde al
      // recargar el navegador.
      const trato = await createZohoOpportunityApi({
        tripRequestId: guardada.id,
        contact: payload.contact as { email: string; first_name: string; last_name: string; full_name: string },
        account: payload.account as { crm_account_id?: string | null },
        opportunity: payload.opportunity as Record<string, unknown>,
        proposalOptions: payload.activities,
      });
      logCrmSyncAttempt(payload);
      setDealId(trato.dealId);

      // Se guarda la identidad que Zoho acaba de resolver. Estos dos campos
      // existian desde el principio y no los escribia nadie: por eso cada
      // solicitud volvia a buscar el contacto en Zoho desde cero, y cada
      // busqueda era otra ocasion de no encontrarlo y crear un duplicado.
      // A partir de aqui, el mismo colegio ya se reconoce por identificador.
      if (trato.contactId || trato.accountId) {
        try {
          await upsertClientApi({
            email: form.email,
            firstName: form.firstName,
            lastName: form.lastName,
            clientType: form.clientType,
            centreName: form.centreName ?? null,
            crmContactId: trato.contactId ?? null,
            crmAccountId: trato.accountId ?? null,
          });
        } catch {
          // No se corta el cierre por esto: la propuesta ya existe y el trato
          // tambien. Solo significa que la proxima vez habra que volver a
          // buscar en Zoho.
        }
      }

      const preparada = await prepareProposalDeliveryApi(nueva.id, {
        recipientEmail: form.email,
        recipientName: [form.firstName, form.lastName].filter(Boolean).join(" "),
      });
      setEntrega(preparada);
      setAviso("");
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo preparar la propuesta."));
      setRevisando(false);
    } finally {
      setOcupado("");
    }
  }

  /** Ya revisada: esto es lo único que la pone en el buzón del colegio. */
  async function enviarAhora() {
    if (!entrega) return;
    setError("");
    setOcupado("enviando");
    try {
      const enviada = await sendProposalDeliveryApi(entrega.id);
      setEntrega(enviada);
      setEnviada(true);

      // La propuesta ya salió: esto deja de ser trabajo a medias. El servidor
      // cierra su borrador al enviar; aquí se quita de la pantalla y del
      // navegador para que el aviso de «tienes una solicitud a medias» no siga
      // ofreciendo continuar algo que ya está hecho.
      borrarBorrador();
      setRecuperable(null);
      setBorradorId(null);
      void recargarBorradores();
      setRevisando(false);
      borrarBorrador();
      // «Preparada» NO es «enviada»: en local no hay clave de buzón y el
      // colegio no recibe nada. Darlo por enviado es lo que hace que alguien
      // se quede esperando una respuesta que nunca iba a llegar.
      setResultadoEnvio({
        estado: enviada.simulated ? "preparada" : "enviada",
        motivo: enviada.simulated ? "falta la clave del buzón del departamento" : null,
      });
    } catch (err) {
      const motivo = mensajeDeError(err, "No se pudo enviar la propuesta.");
      setError(motivo);
      setResultadoEnvio({ estado: "fallo", motivo });
    } finally {
      setOcupado("");
    }
  }

  /** Abrir el documento tal cual lo recibirá el colegio. */
  async function verDocumento() {
    if (!entrega) return;
    try {
      await abrirProposalPdf(entrega.id);
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo abrir el documento."));
    }
  }

  /** Lo siguiente que hay que hacer, dicho en una frase. */
  function siguientePaso(): string {
    if (!entendido) return "Pega el mensaje del cliente en La petición y pulsa enviar.";
    if (pregunta) return `Contesta en La petición: ${pregunta.pregunta}`;
    if (!hoteles) return "Contesta lo que falte en La petición y buscaré los hoteles.";
    if (hoteles.matches.length === 0) return "No hay hoteles para esas fechas: revisa el destino o las fechas.";
    if (elegidos.length === 0) return `Elige hasta ${MAX_OPCIONES} hoteles: cada uno será una opción.`;
    if (!peticionValidada) return "Revisa «Lo que hemos entendido» y confírmalo antes de enviar.";
    if (programaBase.length === 0) return "Elige las actividades del programa, o envía solo con alojamiento.";
    if (!form.email.trim() || !form.firstName.trim() || !form.lastName.trim()) {
      return "Rellena el correo y el nombre de contacto del centro para poder enviar.";
    }
    return "Todo listo: pulsa Revisar y enviar para ver antes lo que saldrá.";
  }

  // ── Pintado ─────────────────────────────────────────────────────────────────

  const titulo = form.opportunityName?.trim() || entendido?.destinationText || "Nueva solicitud";

  return (
    <div className="cv">
      {/* Franja de marca: ancla la pantalla a la casa y separa el trabajo del
          resto de la consola. Sin ella todo quedaba blanco sobre gris. */}
      <div className="cv__rail" aria-hidden="true">
        <img className="cv__raillogo" src={isotipoBlanco} alt="" width={26} height={26} />
        <span className="cv__railtxt">Nueva solicitud</span>
      </div>

      <div className="cv__main">
      <header className="cv__top">
        <div>
          <p className="cv__crumb">Propuestas · nueva solicitud</p>
          <h1 className="cv__title">{titulo}</h1>
        </div>
        <div className="cv__actions">
          <button type="button" className="cv__ghost" onClick={onExit}>
            Salir
          </button>
          <button
            type="button"
            className={puedeRevisar ? "cv__send" : "cv__send cv__send--off"}
            onClick={() => {
              // Se prepara siempre, no solo la primera vez: el paso es
              // reintentable y así lo que se revisa es lo elegido AHORA. Antes,
              // volver atrás y cambiar de hotel dejaba en pantalla el documento
              // anterior.
              setRevisando(true);
              void prepararParaRevisar();
            }}
            disabled={!puedeRevisar || ocupado !== ""}
          >
            {enviada ? "Enviada" : "Revisar y enviar"}
          </button>
        </div>
      </header>

      {recuperable ? (
        <div className="cv__resume" role="status">
          <span>
            Tienes una solicitud a medias de {haceCuanto(recuperable.guardadoEn)}
            {recuperable.entendido?.destinationText ? ` · ${recuperable.entendido.destinationText}` : ""}.
          </span>
          <span className="cv__resumeacc">
            <button type="button" className="cv__ghost cv__ghost--sm" onClick={descartarBorrador}>
              Descartar
            </button>
            <button type="button" className="cv__primary cv__primary--sm" onClick={recuperar}>
              Seguir con ella
            </button>
          </span>
        </div>
      ) : null}

      {/* Los borradores del servidor. Antes solo había UNO y vivía en este
          navegador: empezar otra solicitud pisaba la anterior y nadie podía
          continuar la de un compañero. Puntos 4 y 5 de Ruth. */}
      {/* La que tienes abierta AHORA no se lista: ya la estás viendo, y salía
          repetida debajo del aviso de «tienes una solicitud a medias». */}
      {otrosBorradores.length > 0 && !entendido && mensajes.length === 0 ? (
        <div className="cv__drafts">
          <p className="cv__draftsh">
            Solicitudes a medias · {otrosBorradores.length}
            <span>Tuyas y de tu departamento. Se pueden continuar.</span>
          </p>
          <ul>
            {otrosBorradores.slice(0, 8).map((d) => (
              <li key={d.id}>
                <button type="button" className="cv__draft" onClick={() => void continuarBorrador(d.id)}>
                  <span className="cv__draftt">{d.title}</span>
                  <span className="cv__draftm">
                    {/* Por dónde se quedó. Dos intentos del mismo colegio —uno
                        enviado y otro abandonado— daban dos líneas idénticas, y
                        la pregunta «¿por qué me sigue apareciendo una pendiente
                        si ya la envié?» no tenía respuesta en la pantalla. */}
                    {d.avance ? <b>{d.avance}</b> : null}
                    {d.avance ? " · " : ""}
                    {haceCuanto(d.updatedAt)}
                    {/* «Alguien» solo si de verdad es otra persona. Cada
                        autoguardado deja la reserva puesta, así que sin
                        comparar con quien mira la pantalla, tus propios
                        borradores decían que los tenía abierta alguien. */}
                    {d.lockedByUserId && d.lockedByUserId !== currentUserId
                      ? " · alguien la tiene abierta"
                      : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className="cv__draftx"
                  onClick={() => void descartarDelServidor(d.id)}
                  title={`Descartar «${d.title}»`}
                  aria-label={`Descartar «${d.title}»`}
                >
                  Descartar
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <nav className="cv__track" aria-label="Avance de la solicitud">
        {hitos.map((hito, indice) => (
          <div key={hito.id} className="cv__hitowrap">
            {indice > 0 ? <span className="cv__arrow" aria-hidden="true" /> : null}
            <div className="cv__hito" data-estado={hito.estado}>
              <span className="cv__hitoico">{hito.estado === "hecho" ? "✓" : hito.id}</span>
              <span className="cv__hitotxt">
                <span className="cv__hitot">{hito.titulo}</span>
                <span className="cv__hitos">{hito.detalle}</span>
              </span>
            </div>
          </div>
        ))}
      </nav>

      {error ? (
        <div className="cv__alert alert alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {aviso ? (
        <div className="cv__alert alert alert--warning" role="status">
          {aviso}
        </div>
      ) : null}

      <div className="cv__panes">
        {/* ── La petición ── */}
        <section className="cv__left" aria-label="La petición">
          <div className="cv__card">
            <div className="cv__cardh">
              <span className="cv__lbl">La petición</span>
              <span className="cv__note">
                {mensajes.length} mensaje{mensajes.length === 1 ? "" : "s"}
                {conversacion.length > 0 ? ` · ${conversacion.length} contestadas` : ""}
              </span>
            </div>
            <div className="cv__cardb">
              {/* El hilo: lo único que se desplaza. La tarjeta tiene altura
                  fija y el compositor se queda abajo, como en cualquier chat.
                  Antes crecía la tarjeta y se desplazaba la página entera, así
                  que con seis turnos el sitio donde escribir se iba fuera de
                  la pantalla. */}
              <div className="cv__hilo" ref={hiloRef}>
              {mensajes.length === 0 ? (
                <p className="cv__empty">Pega abajo el correo o el WhatsApp del colegio.</p>
              ) : (
                mensajes.map((mensaje, indice) => (
                  <p className="cv__bubble" key={indice}>
                    {mensaje}
                  </p>
                ))
              )}

              {/* El hilo: lo que la app ha ido preguntando y lo contestado.
                  Antes esto era una lista de campos vacíos con el rótulo «faltan
                  datos». Un campo vacío no dice qué escribir ni por qué hace
                  falta; una pregunta sí. */}
              {conversacion.map((turno, indice) => (
                <Fragment key={indice}>
                  <p className="cv__bubble cv__bubble--app">{turno.pregunta}</p>
                  {/* Sin respuesta cuando la app solo avisa de algo: «no he
                      entendido esa fecha». Pintar una burbuja vacia debajo
                      pareceria que se contesto y no se ve. */}
                  {turno.respuesta ? (
                    <p className="cv__bubble cv__bubble--yo">{turno.respuesta}</p>
                  ) : null}
                </Fragment>
              ))}

              {pregunta ? (
                <div className={pregunta.bloquea ? "cv__preg cv__preg--stop" : "cv__preg"}>
                  <p className="cv__pregt">{pregunta.pregunta}</p>
                  {/* El porqué va con la pregunta. «¿Qué régimen?» es un
                      trámite; «¿qué régimen? es lo que más mueve el precio» es
                      una razón para pararse a contestar. */}
                  <p className="cv__pregp">{pregunta.porque}</p>
                  <RespuestaAlHueco hueco={pregunta} onContestar={contestar} />
                </div>
              ) : entendido ? (
                <div className="cv__listo">
                  <p className="cv__listot">Ya tengo lo necesario para recomendar.</p>
                  <p className="cv__listop">
                    {seIgnora.length === 0
                      ? "Y sé todo lo que pidieron: la lista de la derecha ya está comprobada contra cada punto."
                      : `Sigo sin saber ${seIgnora.join(", ")}. Los alojamientos salen igual, pero esos puntos no se comprueban.`}
                  </p>
                </div>
              ) : null}

              </div>

              <div className="cv__pie">
              <textarea
                className="cv__composer"
                value={borrador}
                onChange={(evento) => setBorrador(evento.target.value)}
                placeholder={textoDeAyuda(pregunta, mensajes.length)}
                rows={pregunta ? 2 : 3}
                onKeyDown={(evento) => {
                  // Enter envía; Mayús+Enter parte la línea, como en cualquier
                  // chat. Pegar un correo de ocho líneas tiene que seguir
                  // siendo posible.
                  if (evento.key === "Enter" && !evento.shiftKey) {
                    evento.preventDefault();
                    void enviarDelCompositor();
                  }
                }}
              />
              <div className="cv__composerrow">
                <span className="cv__pista">
                  {pregunta
                    ? "Escribe la respuesta y pulsa Enter"
                    : "Pega aquí lo que te vaya llegando del colegio"}
                </span>
                <button
                  type="button"
                  className="cv__enviar"
                  onClick={enviarDelCompositor}
                  disabled={!borrador.trim() || ocupado !== ""}
                  aria-label={pregunta ? "Contestar" : "Enviar el mensaje y leerlo"}
                  title={pregunta ? "Contestar" : "Enviar el mensaje y leerlo"}
                >
                  {ocupado === "leyendo" ? (
                    <span className="cv__enviando" aria-hidden="true" />
                  ) : (
                    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                      <path
                        d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15.6 12 3.4 13.8Z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </button>
              </div>
              </div>
            </div>
          </div>

          {/* Aquí vivían «Lo que pide el centro», el aviso de solicitudes
              previas y «Lo que hemos entendido» con sus catorce campos, y
              después la barra de revisión. Todo eso está ahora en la ventana y
              en la columna de la derecha: aquí solo hay chat, con altura fija
              y su propio desplazamiento. */}
        </section>

        {/* ── Las opciones ── */}
        <section className="cv__right" aria-label="Las opciones">
          {/* Las opciones no se enseñan hasta que alguien ha leído y confirmado
              lo que se entendió. Enseñarlas antes invita a elegir tres hoteles
              sobre un destino que la app dedujo y nadie miró; y con el podio
              delante, nadie vuelve atrás a revisar nada.

              La búsqueda sí corre por detrás: al confirmar, la lista ya está.
              Lo que se retiene es el enseñarla, no el trabajo. */}
          {!peticionValidada ? (
            <div className="cv__puerta">
              <p className="cv__puertat">
                {!entendido
                  ? "Aquí aparecerán los alojamientos y las actividades."
                  : !hayLoMinimo
                    ? "Primero, lo mínimo para poder buscar"
                    : "Falta un paso: confirmar lo que hemos entendido"}
              </p>
              <p className="cv__puertap">
                {!entendido
                  ? "Pega el mensaje del colegio en La petición y pulsa enviar."
                  : !hayLoMinimo
                    ? pregunta
                      ? `Contesta en el chat: ${pregunta.pregunta}`
                      : "Contesta lo que falte en el chat."
                    : "Léelo y confírmalo. Con eso se busca, y con eso se cotiza."}
                {/* Que el contacto ya exista cambia lo que hay que revisar, así
                    que se dice antes de abrir la ventana, no dentro. */}
                {hayLoMinimo && contactoCrm ? (
                  <b>
                    {contactoCrm.deals.length
                      ? ` Ojo: ya está en el CRM, con ${contactoCrm.deals.length} oportunidad(es) abiertas.`
                      : " Este contacto ya está en el CRM."}
                  </b>
                ) : null}
              </p>
              {hayLoMinimo && entendido ? (
                <button
                  type="button"
                  className="cv__primary"
                  onClick={() => setRevisandoPeticion(true)}
                >
                  Lo que hemos entendido
                </button>
              ) : null}
              {hayLoMinimo && hoteles ? (
                <p className="cv__puertan">
                  {hoteles.matches.length} alojamientos encontrados, listos para cuando confirmes.
                </p>
              ) : null}
            </div>
          ) : (
            <>
          <div className="cv__revisado">
            <span>
              <b>Revisado por ti.</b> Si cambia algo de la petición, habrá que volver a confirmarlo.
            </span>
            <button
              type="button"
              className="cv__ghost cv__ghost--sm"
              onClick={() => setRevisandoPeticion(true)}
            >
              Lo que hemos entendido
            </button>
          </div>

          {hoteles ? (
            <>
              {/* Dos pestañas, alojamientos y actividades. Antes iba todo en una
                  sola columna con mucho desplazamiento, y quien cotiza no tenía
                  forma de ver de un vistazo si se había dejado algo sin asignar.
                  Cada pestaña lleva su cuenta al lado. */}
              <div className="cv__tabs" role="tablist" aria-label="Qué se está eligiendo">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selec === "alojamientos"}
                  className={selec === "alojamientos" ? "is-on" : ""}
                  onClick={() => setSelec("alojamientos")}
                >
                  Alojamientos
                  <b>{elegidos.length} de {MAX_OPCIONES}</b>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selec === "actividades"}
                  className={selec === "actividades" ? "is-on" : ""}
                  onClick={() => setSelec("actividades")}
                >
                  Actividades
                  <b>
                    {programaBase.length === 0
                      ? "ninguna"
                      : `${programaBase.length} ${programaBase.length === 1 ? "elegida" : "elegidas"}`}
                  </b>
                </button>
              </div>

              {selec === "alojamientos" ? (
                <div className="cv__opsh">
                  <span className="cv__lbl">
                    {hoteles.matches.length} con tarifa · elige hasta {MAX_OPCIONES}
                  </span>
                  <div className="cv__seg" role="tablist" aria-label="Vista">
                    <button type="button" className={vista === "lista" ? "is-on" : ""} onClick={() => setVista("lista")}>
                      Lista
                    </button>
                    <button
                      type="button"
                      className={vista === "comparar" ? "is-on" : ""}
                      onClick={() => setVista("comparar")}
                      disabled={elegidos.length === 0}
                    >
                      Comparar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="cv__opsh">
                  <span className="cv__lbl">
                    {(actividades?.matches.length ?? 0)} disponibles · van en todas las opciones
                  </span>
                </div>
              )}
            </>
          ) : null}

          {selec === "alojamientos" ? (
            !hoteles ? (
            <div className="cv__slot">
              {ocupado === "buscando"
                ? "Buscando hoteles con tarifa para esas fechas…"
                : "Aquí aparecerán los hoteles en cuanto leamos la petición."}
            </div>
          ) : hoteles.matches.length === 0 ? (
            <div className="cv__slot">
              {entendido
                ? porQueNoHayHoteles(entendido, hoteles)
                : "No hay hoteles con tarifa para esas fechas."}
            </div>
          ) : vista === "lista" ? (
            <ListaOpciones
              hoteles={hoteles.matches}
              elegidos={elegidos}
              noches={noches}
              tope={tope}
              actividadesDe={actividadesDe}
              matchActividad={matchActividad}
              programaBase={programaBase}
              onAlternar={alternarHotel}
              alumnos={entendido?.participants ?? 0}
              profesores={entendido?.teachers ?? 0}
              desde={entendido?.dateFrom ?? ""}
              hasta={entendido?.dateTo ?? ""}
              destinoPedido={entendido?.destinationText ?? ""}
              detalle={detalle}
              onDetalle={(id) => setDetalle((actual) => (actual === id ? null : id))}
            />
          ) : (
            <MatrizPrograma
              elegidos={elegidos}
              matchHotel={matchHotel}
              actividadesDisponibles={actividades?.matches ?? []}
              programaBase={programaBase}
              actividadesDe={actividadesDe}
              noches={noches}
              onAlternarOpcion={alternarEnOpcion}
            />
          )
          ) : null}

          {selec === "actividades" && actividades ? (
            <div className="cv__card">
              {detalleActividad
                ? (() => {
                    const item = actividades.matches.find((m) => m.activity.id === detalleActividad);
                    return item ? (
                      <VentanaDeActividad
                        item={item}
                        alumnos={entendido?.participants ?? 0}
                        onCerrar={() => setDetalleActividad(null)}
                      />
                    ) : null;
                  })()
                : null}
              <div className="cv__cardh">
                <span className="cv__lbl">El programa</span>
                <button
                  type="button"
                  className="cv__link"
                  onClick={() => { setSelec("alojamientos"); setVista("comparar"); }}
                  disabled={elegidos.length === 0}
                >
                  Personalizar por opción
                </button>
              </div>
              {actividades.matches.length === 0 ? (
                <div className="cv__slot">{porQueNoHayActividades(entendido, actividades)}</div>
              ) : null}
              {actividades.warnings.some((w) => w.code === "activities_outside_destination") ? (
                <div className="cv__slot">
                  No hay actividades en el destino pedido: se muestran las de otras zonas, marcadas en cada una.
                </div>
              ) : null}
              {actividades.matches.length > 0 ? (
                <div className="cv__actsbuscar">
                  <input
                    type="search"
                    value={busquedaActividades}
                    onChange={(e) => setBusquedaActividades(e.target.value)}
                    placeholder={`Buscar entre ${actividades.matches.length} actividades: nombre, proveedor o sitio…`}
                    aria-label="Buscar actividad"
                  />
                </div>
              ) : null}
              <ul className="cv__acts">
                {actividades.matches.filter((item) => coincideActividad(item, busquedaActividades)).map((item) => {
                  const puesta = programaBase.includes(item.activity.id);
                  return (
                    <li key={item.activity.id}>
                      <button
                        type="button"
                        className={puesta ? "cv__act is-on" : "cv__act"}
                        onClick={() => alternarBase(item.activity.id)}
                        aria-pressed={puesta}
                      >
                        <span className="cv__actchk">{puesta ? "✓" : ""}</span>
                        <span className="cv__actm">
                          <span className="cv__actt">
                            {item.activity.activityName}
                            {item.destacada ? <span className="cv__actchip cv__actchip--top">Destacada</span> : null}
                            {item.fueraDelDestino ? (
                              <span className="cv__actchip cv__actchip--fuera">Fuera del destino</span>
                            ) : null}
                          </span>
                          <span className="cv__acts2">{[item.activity.locationMain, item.activity.durationText].filter(Boolean).join(" · ")}</span>
                          {/* Qué tarifa es. PortAventura Park tiene 81 y aquí
                              solo se veía un precio, sin decir de cuál. */}
                          <span className="cv__acts2 cv__acttar">
                            {item.rate.ageLabel ? `Tarifa: ${item.rate.ageLabel}` : "Tarifa única"}
                            {" · por persona"}
                            {(item.alternativas?.length ?? 0) > 0 ? ` · ${item.alternativas!.length + 1} tarifas` : ""}
                          </span>
                        </span>
                        <span className={item.rate.salePvpAmount ? "cv__actp" : "cv__actp cv__actp--none"}>
                          {item.rate.salePvpAmount ? euros(item.rate.salePvpAmount) : "a consultar"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="cv__info cv__info--act"
                        aria-haspopup="dialog"
                        onClick={() => setDetalleActividad(item.activity.id)}
                      >
                        Ver tarifas
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Las que el catálogo no tarifa. Antes ni aparecían: la búsqueda
                  recorre las tarifas de cada actividad, y sin tarifas no salía
                  ni una. «Arbitraje» llevaba así desde el principio. */}
              {(actividades.sinTarifa ?? []).length > 0 ? (
                <div className="cv__actsx">
                  <p className="cv__actsxh">
                    Sin precio en el catálogo
                    <span>Ponle el precio y quedará elegible. Es por persona.</span>
                  </p>
                  <ul className="cv__acts">
                    {(actividades.sinTarifa ?? []).map((item) => {
                      const puesta = programaBase.includes(item.activity.id);
                      const falta = faltaPonerlePrecio(item);
                      return (
                        <li key={item.activity.id}>
                          <button
                            type="button"
                            className={puesta ? "cv__act is-on" : "cv__act"}
                            onClick={() => alternarBase(item.activity.id)}
                            aria-pressed={puesta}
                            disabled={falta}
                            title={falta ? "Ponle precio antes de añadirla al programa" : undefined}
                          >
                            <span className="cv__actchk">{puesta ? "✓" : ""}</span>
                            <span className="cv__actm">
                              <span className="cv__actt">{item.activity.activityName}</span>
                              <span className="cv__acts2">
                                {[item.activity.supplierName, item.activity.durationText]
                                  .filter(Boolean)
                                  .join(" · ") || "Sin proveedor ni duración en el catálogo"}
                              </span>
                            </span>
                          </button>
                          <label className="cv__actprecio">
                            <span className="sr-only">
                              Precio por persona de {item.activity.activityName}
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={preciosFijados[item.activity.id] ?? ""}
                              onChange={(evento) => {
                                const valor = Number(evento.target.value);
                                setPreciosFijados((antes) => {
                                  const siguiente = { ...antes };
                                  if (Number.isFinite(valor) && valor > 0) {
                                    siguiente[item.activity.id] = valor;
                                  } else {
                                    delete siguiente[item.activity.id];
                                    // Sin precio no puede seguir en el programa:
                                    // entraría en el documento valiendo cero.
                                    setProgramaBase((base) =>
                                      base.filter((id) => id !== item.activity.id),
                                    );
                                  }
                                  return siguiente;
                                });
                              }}
                            />
                            <span aria-hidden="true">€</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
            </>
          )}
        </section>
      </div>


      {resultadoEnvio ? (
        <AvisoDelEnvio
          estado={resultadoEnvio.estado}
          referencia={entrega?.reference ?? null}
          destinatario={entrega?.recipientEmail ?? null}
          motivo={resultadoEnvio.motivo}
          hayDocumento={Boolean(entrega)}
          onVerDocumento={verDocumento}
          onReintentar={() => {
            setResultadoEnvio(null);
            void enviarAhora();
          }}
          onVolver={() => {
            setResultadoEnvio(null);
            setRevisando(true);
          }}
          // Terminado el envío, esta pantalla ya no tiene nada que hacer: se
          // vuelve al inicio, donde está la lista de presupuestos.
          onInicio={() => {
            setResultadoEnvio(null);
            onFinished?.();
          }}
        />
      ) : null}

      {revisandoPeticion && entendido ? (
        <PanelEntendido
          entendido={entendido}
          setEntendido={setEntendido}
          form={form}
          setForm={setForm}
          tope={tope}
          setTope={setTope}
          requisitos={requisitos}
          canal={canal}
          setCanal={setCanal}
          departamento={departamento}
          setDepartamento={setDepartamento}
          contactoCrm={contactoCrm}
          previas={previas}
          validado={peticionValidada}
          onValidar={() => {
            // La huella se guarda con los datos de ESTE momento, no un
            // «validado: true». Si mañana cambian las fechas, deja de coincidir
            // y el visto bueno se cae solo.
            setFirmaValidada(
              firmaDeLaPeticion({
                ...entendido,
                topePorAlumno: tope,
                requisitos,
                centreName: form.centreName ?? "",
                email: form.email,
                firstName: form.firstName,
                lastName: form.lastName,
                opportunityName: form.opportunityName ?? "",
                canal,
                departamento,
              }),
            );
            setRevisandoPeticion(false);
            // Lo corregido cambia la búsqueda: se vuelve a buscar al confirmar.
            void buscarHoteles(entendido, canal, { requisitos, tope });
          }}
          onCerrar={() => setRevisandoPeticion(false)}
        />
      ) : null}

      {revisando ? (
        <div className="rv" role="dialog" aria-modal="true" aria-label="Revisar antes de enviar">
          <div className="rv__back" onClick={() => (enviada ? undefined : setRevisando(false))} />
          <aside className="rv__panel">
            <header className="rv__head">
              <div>
                <p className="rv__k">Antes de que salga</p>
                <h2 className="rv__t">{entrega ? entrega.reference : "Preparando la propuesta…"}</h2>
              </div>
              <button type="button" className="cv__ghost cv__ghost--sm" onClick={() => setRevisando(false)}>
                Volver
              </button>
            </header>

            <div className="rv__body">
              {ocupado === "enviando" && !entrega ? (
                <p className="cv__empty">
                  Creando el cliente, guardando la solicitud, montando las opciones, creando el trato en
                  Zoho y generando el documento…
                </p>
              ) : (
                <>
                  <section className="rv__block">
                    <h3 className="rv__bt">Sobre qué se ha hecho</h3>
                    <dl className="rv__datos">
                      <div>
                        <dt>Destino</dt>
                        <dd>{entendido?.destinationText || "—"}</dd>
                      </div>
                      <div>
                        <dt>Fechas</dt>
                        <dd>
                          {entendido?.dateFrom && entendido?.dateTo
                            ? `${entendido.dateFrom} → ${entendido.dateTo}`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Noches</dt>
                        <dd>{noches || "—"}</dd>
                      </div>
                      <div>
                        <dt>Grupo</dt>
                        <dd>
                          {entendido?.participants ?? 0} alumnos
                          {entendido?.teachers ? ` · ${entendido.teachers} profesores` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt>Régimen</dt>
                        <dd>{entendido?.regimeRequested || "sin especificar"}</dd>
                      </div>
                      <div>
                        <dt>Categoría</dt>
                        <dd>{entendido?.categoryRequested || "sin especificar"}</dd>
                      </div>
                      {tope ? (
                        <div>
                          <dt>Presupuesto</dt>
                          <dd>{tope} € por alumno</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>Actividades</dt>
                        <dd>
                          {programaBase.length === 0
                            ? "ninguna"
                            : `${programaBase.length} en el programa`}
                        </dd>
                      </div>
                    </dl>
                    {requisitos.length ? (
                      <p className="rv__sub">Piden: {requisitos.join(" · ")}</p>
                    ) : null}
                    {/* El total de cada opción se multiplica por el grupo, así
                        que sin alumnos el documento sale a cero y sin sumar
                        actividades. Pasó: salió «para 0 alumnos». */}
                    {!entendido?.participants ? (
                      <p className="rv__ojo">
                        Sin número de alumnos el documento sale con los totales a cero y sin sumar las
                        actividades. Vuelve y contéstalo antes de enviar.
                      </p>
                    ) : null}
                  </section>

                  <section className="rv__block">
                    <h3 className="rv__bt">A quién va</h3>
                    <p className="rv__line">
                      <strong>{[form.firstName, form.lastName].filter(Boolean).join(" ") || "Sin nombre"}</strong>
                      <span>{form.email}</span>
                    </p>
                    {entrega ? <p className="rv__sub">Asunto: {entrega.subject}</p> : null}
                  </section>

                  <section className="rv__block">
                    <h3 className="rv__bt">Qué recibirá</h3>
                    <ul className="rv__opts">
                      {elegidos.map((id, indice) => {
                        const hotel = matchHotel(id);
                        const enOpcion = actividadesDe(indice + 1)
                          .map(matchActividad)
                          .filter(Boolean) as ActivitySearchMatch[];
                        return (
                          <li key={id}>
                            <div className="rv__opth">
                              <span className="rv__optn">Opción {indice + 1}</span>
                              <span className="rv__optp">
                                {hotel ? euros(precioPorAlumno(hotel, enOpcion, noches)) : "—"} por alumno
                              </span>
                            </div>
                            <p className="rv__optt">{hotel?.accommodation.accommodationName ?? "Alojamiento"}</p>
                            {tope && hotel && precioPorAlumno(hotel, enOpcion, noches) > tope ? (
                              <p className="rv__warnline">
                                Se pasa {euros(precioPorAlumno(hotel, enOpcion, noches) - tope)} del tope que
                                puso el centro.
                              </p>
                            ) : null}
                            <p className="rv__optl">
                              {enOpcion.length
                                ? enOpcion.map((a) => a.activity.activityName).join(" · ")
                                : "Sin actividades"}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  <section className="rv__block">
                    <h3 className="rv__bt">Qué se queda registrado</h3>
                    <p className="rv__line">
                      <span>Trato en Zoho</span>
                      <strong>{dealId ?? "se creará al preparar"}</strong>
                    </p>
                    <p className="rv__line">
                      <span>Solicitud y propuesta</span>
                      <strong>{propuesta ? "guardadas" : "se guardarán"}</strong>
                    </p>
                    <p className="rv__line">
                      <span>Documento</span>
                      <strong>{entrega?.pdfPath ? "generado" : "se generará"}</strong>
                    </p>
                  </section>

                  {entrega ? (
                    <section className="rv__block">
                      <h3 className="rv__bt">El correo que saldrá</h3>
                      <pre className="rv__mail">{entrega.subject}</pre>
                      {entrega.simulated ? (
                        <p className="rv__warn">
                          Ojo: todavía no hay clave del buzón del departamento, así que al enviar la
                          propuesta quedará preparada pero no saldrá de verdad.
                        </p>
                      ) : null}
                    </section>
                  ) : null}
                </>
              )}
            </div>

            <footer className="rv__foot">
              <div className="rv__docrow">
                <button
                  type="button"
                  className="cv__ghost"
                  onClick={verDocumento}
                  disabled={!entrega?.pdfPath}
                >
                  Ver el documento
                </button>
                {/* Rehacerlo sin salir de aquí.
                    El mecanismo ya existía —«Revisar y enviar» vuelve a
                    prepararlo todo— pero ese botón está en la barra de arriba,
                    que esta pantalla tapa. Así que para regenerar el documento
                    había que salir, volver a entrar y no era evidente que eso
                    lo rehiciera. Mientras no se haya enviado, rehacer es una
                    operación normal, no una salida de emergencia.

                    Conserva la referencia y el enlace: por dentro reaprovecha
                    la entrega en borrador en vez de crear otra. */}
                <button
                  type="button"
                  className="cv__ghost"
                  onClick={() => void rehacerDocumento()}
                  disabled={ocupado !== "" || enviada}
                  title="Vuelve a generar el PDF con lo que hay ahora, sin cambiar la referencia"
                >
                  {rehaciendo ? "Rehaciendo…" : "Rehacer el documento"}
                </button>
              </div>
              <div className="rv__footr">
                <button type="button" className="cv__ghost" onClick={() => setRevisando(false)} disabled={ocupado !== ""}>
                  Guardar sin enviar
                </button>
                <button
                  type="button"
                  className={entrega ? "cv__send" : "cv__send cv__send--off"}
                  onClick={enviarAhora}
                  disabled={!entrega || ocupado !== "" || enviada}
                >
                  {ocupado === "enviando" && !rehaciendo ? "Enviando…" : "Enviar al colegio"}
                </button>
              </div>
            </footer>
          </aside>
        </div>
      ) : null}

      <footer className="cv__foot">
        <span className="cv__foott">
          {entrega
            ? `Propuesta ${entrega.reference}${dealId ? ` · trato ${dealId}` : ""}`
            : siguientePaso()}
        </span>
        <span className="cv__footr">
          {guardadoEn && !enviada ? "Guardado · " : ""}
          {noches ? `${noches} noches · ${entendido?.participants ?? 0} alumnos` : "Sin fechas todavía"}
        </span>
      </footer>
      </div>
    </div>
  );
}

/* ── Piezas ────────────────────────────────────────────────────────────────── */

/**
 * El texto de ayuda del compositor, que cambia con la pregunta abierta.
 *
 * Es lo que sustituye al campo propio de cada pregunta: si solo hay un sitio
 * donde escribir, ese sitio tiene que decir qué se espera ahora mismo.
 */
/**
 * La ventana de «Lo que hemos entendido».
 *
 * Antes era un bloque más de la columna izquierda, debajo del chat: catorce
 * campos sueltos que aparecían desde el primer momento, medio vacíos, mientras
 * el chat todavía preguntaba lo básico. Nadie revisa catorce campos vacíos, y
 * al no revisarlos se manda un presupuesto sobre lo que la app adivinó.
 *
 * Ahora es un alto en el camino: aparece cuando hay lo mínimo, se LEE, y se
 * valida o se corrige. Dos modos en la misma ventana, no dos pantallas:
 *
 *   LEER      agrupado como se lee —el viaje, el grupo, lo que piden, el
 *             centro— y con lo que falta de verdad en ámbar.
 *   MODIFICAR los mismos bloques, editables ahí mismo.
 *
 * No hay un botón de «dímelo en el chat» aquí dentro a propósito. Dos caminos
 * para la misma corrección acaban con medio dato cambiado en cada uno: la
 * ventana corrige, el chat conversa.
 */
/**
 * Qué ha pasado al enviar, dicho a la cara.
 *
 * Antes, enviar dejaba una franja ámbar arriba del lienzo y la pantalla igual
 * que estaba. Con la propuesta ya fuera, quien cotiza se quedaba mirando la
 * misma lista de hoteles sin saber si tenía que hacer algo más, y el fallo
 * -cuando lo había- salía en el mismo sitio y con el mismo aspecto que un
 * aviso cualquiera.
 *
 * Tres desenlaces, y los tres se dicen distinto:
 *
 *   ENVIADA    salió. Se cierra y se vuelve al inicio.
 *   PREPARADA  el documento está, pero NO ha salido: falta la clave del buzón.
 *              Esto pasa siempre en local y no puede parecer un envío.
 *   FALLO      no salió. Aquí lo importante no es el error, es que nada se ha
 *              perdido y que reintentar no duplica: el trato de Zoho, la
 *              solicitud y el documento ya están creados y se reutilizan.
 */
function AvisoDelEnvio({
  estado,
  referencia,
  destinatario,
  motivo,
  hayDocumento,
  onVerDocumento,
  onReintentar,
  onVolver,
  onInicio,
}: {
  estado: "enviada" | "preparada" | "fallo";
  referencia: string | null;
  destinatario: string | null;
  motivo: string | null;
  hayDocumento: boolean;
  onVerDocumento: () => void;
  onReintentar: () => void;
  onVolver: () => void;
  onInicio: () => void;
}) {
  const fallo = estado === "fallo";

  // Escape solo cuando hay algo que reintentar: con la propuesta ya enviada,
  // cerrar sin querer y quedarse en el lienzo confunde más que ayuda.
  useEffect(() => {
    if (!fallo) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onVolver();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [fallo, onVolver]);

  return (
    <div className="cv__velo" role="dialog" aria-modal="true" aria-label="Resultado del envío">
      <div className={`cv__fin cv__fin--${estado}`}>
        <span className="cv__finico" aria-hidden="true">
          {estado === "enviada" ? "✓" : estado === "preparada" ? "!" : "✕"}
        </span>

        <p className="cv__fint">
          {estado === "enviada"
            ? "Enviada"
            : estado === "preparada"
              ? "Preparada, pero no ha salido"
              : "No se ha podido enviar"}
        </p>

        <p className="cv__finp">
          {estado === "enviada" ? (
            <>
              La propuesta <b>{referencia}</b> está en el correo de <b>{destinatario}</b>.
            </>
          ) : estado === "preparada" ? (
            <>
              La propuesta <b>{referencia}</b> está generada y guardada, pero{" "}
              <b>el colegio no ha recibido nada</b>: {motivo ?? "falta la clave del buzón del departamento"}.
            </>
          ) : (
            <>{motivo ?? "El servidor de correo no aceptó el envío."}</>
          )}
        </p>

        {fallo ? (
          <div className="cv__finsalvo">
            <p className="cv__finsalvot">No se ha perdido nada</p>
            <ul>
              <li>La solicitud y la propuesta están guardadas.</li>
              <li>El trato del CRM está creado.</li>
              <li>El documento está generado.</li>
            </ul>
            <p className="cv__finsalvop">
              Reintentar no duplica nada: reutiliza lo que ya existe, incluida la referencia.
            </p>
          </div>
        ) : null}

        <div className="cv__finacc">
          {hayDocumento ? (
            <button type="button" className="cv__ghost cv__ghost--sm" onClick={onVerDocumento}>
              Ver el documento
            </button>
          ) : null}
          {fallo ? (
            <>
              <button type="button" className="cv__ghost cv__ghost--sm" onClick={onVolver}>
                Volver a la propuesta
              </button>
              <button type="button" className="cv__primary cv__primary--sm" onClick={onReintentar}>
                Reintentar el envío
              </button>
            </>
          ) : (
            <button type="button" className="cv__primary cv__primary--sm" onClick={onInicio}>
              Ir al inicio
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelEntendido({
  entendido,
  setEntendido,
  form,
  setForm,
  tope,
  setTope,
  requisitos,
  canal,
  setCanal,
  departamento,
  setDepartamento,
  contactoCrm,
  previas,
  validado,
  onValidar,
  onCerrar,
}: {
  entendido: NormalizedRequestDraft;
  setEntendido: (valor: NormalizedRequestDraft) => void;
  form: ParseTripRequestInput;
  setForm: (valor: ParseTripRequestInput) => void;
  tope: number | null;
  setTope: (valor: number | null) => void;
  requisitos: string[];
  canal: ClientSegment;
  setCanal: (valor: ClientSegment) => void;
  departamento: "GROUPS" | "SPORTS" | "";
  setDepartamento: (valor: "GROUPS" | "SPORTS" | "") => void;
  contactoCrm: ContactoDelCrm | null;
  previas: FindCandidateOpportunitiesResult | null;
  validado: boolean;
  onValidar: () => void;
  onCerrar: () => void;
}) {
  const [editando, setEditando] = useState(false);

  const datos = {
    ...entendido,
    topePorAlumno: tope,
    requisitos,
    centreName: form.centreName ?? "",
    email: form.email,
    firstName: form.firstName,
    lastName: form.lastName,
    opportunityName: form.opportunityName ?? "",
    canal,
    departamento,
  };
  const bloques = bloquesParaValidar(datos);
  const faltan = loQueFaltaDeVerdad(datos);

  // Escape cierra, como cualquier ventana. Sin esto hay que buscar la aspa.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  return (
    <div className="cv__velo" role="dialog" aria-modal="true" aria-label="Lo que hemos entendido">
      <div className="cv__vent">
        <header className="cv__venth">
          <div>
            <p className="cv__venttl">Lo que hemos entendido</p>
            <p className="cv__ventsub">
              {editando
                ? "Corrige lo que haga falta. Se guarda al confirmar."
                : "Léelo antes de seguir: esto es lo que se va a usar para buscar los alojamientos y lo que irá al presupuesto."}
            </p>
          </div>
          <button type="button" className="cv__ventx" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="cv__ventb">
          {/* Quién es este correo en el CRM. Va ARRIBA, antes que los datos,
              porque cambia lo que hay que hacer: si el contacto ya existe, sus
              datos mandan sobre lo que hayamos adivinado del mensaje, y si
              además tiene oportunidades abiertas puede que este viaje sea una
              de ellas y no haga falta crear otra. */}
          {contactoCrm ? (
            <div className={contactoCrm.deals.length ? "cv__ventavi" : "cv__ventcrmok"}>
              <p className="cv__ventavit">
                {contactoCrm.deals.length
                  ? "Este contacto ya está en el CRM, y con oportunidades abiertas"
                  : "Este contacto ya está en el CRM"}
              </p>
              <p className="cv__ventavip">
                <b>{contactoCrm.fullName}</b>
                {contactoCrm.accountName ? ` · ${contactoCrm.accountName}` : " · sin cuenta asociada"}
                {contactoCrm.phone ? ` · ${contactoCrm.phone}` : ""}
              </p>
              {contactoCrm.deals.length ? (
                <>
                  <ul>
                    {contactoCrm.deals.map((d) => (
                      <li key={d.id ?? d.dealName}>
                        {d.dealName} <span className="cv__ventchip">{d.stage}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="cv__ventavip">
                    Si este viaje es una de ellas, mejor continuarla que crear una segunda oportunidad del
                    mismo viaje.
                  </p>
                </>
              ) : null}
            </div>
          ) : form.email.trim() ? (
            <div className="cv__ventcrmno">
              <b>{form.email.trim()}</b> no está en el CRM: se creará el contacto y su cuenta al enviar.
            </div>
          ) : null}

          {/* Un trato repetido no se descubre en el CRM tres días después. */}
          {previas && previas.opportunities.length ? (
            <div className="cv__ventavi">
              <p className="cv__ventavit">Ojo: este cliente ya tenía solicitudes</p>
              <ul>
                {previas.opportunities.map((oportunidad) => (
                  <li key={oportunidad.id}>{oportunidad.name}</li>
                ))}
              </ul>
              <p className="cv__ventavip">
                Si es el mismo viaje, mejor continuar aquella que crear una segunda oportunidad.
              </p>
            </div>
          ) : null}

          {faltan.length && !editando ? (
            <div className="cv__ventfalta">
              Falta <b>{faltan.join(", ")}</b>. Se puede seguir buscando, pero sin eso no se puede enviar.
            </div>
          ) : null}

          {editando ? (
            <CamposEntendido
              entendido={entendido}
              setEntendido={setEntendido}
              form={form}
              setForm={setForm}
              tope={tope}
              setTope={setTope}
              canal={canal}
              setCanal={setCanal}
              departamento={departamento}
              setDepartamento={setDepartamento}
              contactoCrm={contactoCrm}
            />
          ) : (
            bloques.map((bloque) => (
              <section key={bloque.titulo} className="cv__ventbloq">
                <p className="cv__ventbt">{bloque.titulo}</p>
                <p className="cv__ventbp">{bloque.para}</p>
                <dl className="cv__ventgrid">
                  {bloque.filas.map((f) => (
                    <div key={f.que} className={f.falta ? "cv__ventfila is-falta" : "cv__ventfila"}>
                      <dt>{f.que}</dt>
                      <dd>{f.valor}</dd>
                      {f.nota ? <p className="cv__ventnota">{f.nota}</p> : null}
                    </div>
                  ))}
                </dl>
              </section>
            ))
          )}

          {!editando ? (
            <p className="cv__ventpie">
              ¿Falta algo que aquí no aparece? Cierra y escríbelo en el chat: lo que se conversa se queda
              en el hilo, y lo que se corrige se corrige aquí.
            </p>
          ) : null}
        </div>

        <footer className="cv__ventf">
          {editando ? (
            <>
              <button type="button" className="cv__ghost cv__ghost--sm" onClick={() => setEditando(false)}>
                Volver a leerlo
              </button>
              <button
                type="button"
                className="cv__primary cv__primary--sm"
                onClick={() => {
                  setEditando(false);
                  onValidar();
                }}
              >
                Guardar y confirmar
              </button>
            </>
          ) : (
            <>
              <button type="button" className="cv__ghost cv__ghost--sm" onClick={() => setEditando(true)}>
                Modificar
              </button>
              <button type="button" className="cv__primary cv__primary--sm" onClick={onValidar}>
                {validado ? "Sigue estando bien" : "Está todo bien"}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

/**
 * Los mismos datos, editables, y agrupados igual que al leerlos.
 *
 * Es el modo «Modificar» de la ventana. Estaba suelto en la columna izquierda
 * como catorce campos en fila; agrupado en los mismos cuatro bloques que la
 * lectura, se corrige donde se acaba de ver el fallo.
 */
function CamposEntendido({
  entendido,
  setEntendido,
  form,
  setForm,
  tope,
  setTope,
  canal,
  setCanal,
  departamento,
  setDepartamento,
  contactoCrm,
}: {
  entendido: NormalizedRequestDraft;
  setEntendido: (valor: NormalizedRequestDraft) => void;
  form: ParseTripRequestInput;
  setForm: (valor: ParseTripRequestInput) => void;
  tope: number | null;
  setTope: (valor: number | null) => void;
  canal: ClientSegment;
  setCanal: (valor: ClientSegment) => void;
  departamento: "GROUPS" | "SPORTS" | "";
  setDepartamento: (valor: "GROUPS" | "SPORTS" | "") => void;
  contactoCrm: ContactoDelCrm | null;
}) {
  return (
    <>
      <section className="cv__ventbloq">
        <p className="cv__ventbt">El viaje</p>
        <div className="cv__fields">
          <Campo
            etiqueta="Destino"
            valor={entendido.destinationText}
            onChange={(v) => setEntendido({ ...entendido, destinationText: v })}
            resaltar={!entendido.destinationText.trim()}
            ayuda="Busca en toda la comarca: pidiendo Cambrils también salen los de Salou."
          />
          <Campo
            etiqueta="Desde"
            valor={entendido.dateFrom}
            onChange={(v) => setEntendido({ ...entendido, dateFrom: v })}
            placeholder="2027-05-12"
          />
          <Campo
            etiqueta="Hasta"
            valor={entendido.dateTo}
            onChange={(v) => setEntendido({ ...entendido, dateTo: v })}
            placeholder="2027-05-16"
          />
        </div>
      </section>

      <section className="cv__ventbloq">
        <p className="cv__ventbt">El grupo</p>
        <div className="cv__fields">
          <Campo
            etiqueta="Alumnos"
            valor={entendido.participants?.toString() ?? ""}
            onChange={(v) => setEntendido({ ...entendido, participants: Number(v) || null })}
          />
          <Campo
            etiqueta="Profesores"
            valor={entendido.teachers?.toString() ?? ""}
            onChange={(v) => setEntendido({ ...entendido, teachers: Number(v) || null })}
            ayuda="Se alojan y se cobran, muchas veces en habitación individual."
          />
          {/* La edad no estaba y la busqueda la exige: el aviso «hace falta una
              edad o rango de edad» no tenia donde contestarse y dejaba la
              solicitud atascada. Se escriben los DOS campos porque el buscador
              saca el numero de `averageAgeText` cuando no hay guion; solo con
              `ageRangeText` la edad se veria pero no filtraria nada. */}
          <Campo
            etiqueta="Edades"
            valor={entendido.ageRangeText}
            onChange={(v) => {
              const limpio = v.trim();
              const suelta = limpio.match(/^(\d{1,2})$/);
              setEntendido({
                ...entendido,
                ageRangeText: v,
                averageAgeText: suelta ? `${suelta[1]} años` : "",
              });
            }}
            placeholder="15-17, o 15"
            ayuda="Descarta actividades por edad. No es obligatoria."
          />
        </div>
      </section>

      <section className="cv__ventbloq">
        <p className="cv__ventbt">Lo que piden</p>
        <div className="cv__fields">
          <Campo
            etiqueta="Régimen"
            valor={entendido.regimeRequested}
            onChange={(v) => setEntendido({ ...entendido, regimeRequested: v })}
            placeholder="pensión completa"
          />
          <Campo
            etiqueta="Categoría"
            valor={entendido.categoryRequested}
            onChange={(v) => setEntendido({ ...entendido, categoryRequested: v })}
            placeholder="3*"
          />
          {/* «Tope por alumno» no se entendia. Es el presupuesto que dice el
              colegio, y solo sirve para marcar en la lista lo que se pasa: no
              descarta nada ni cambia ningun precio. */}
          <Campo
            etiqueta="Presupuesto por alumno"
            valor={tope?.toString() ?? ""}
            onChange={(v) => setTope(Number(v) || null)}
            placeholder="sin tope"
            ayuda="Solo marca en la lista lo que se pasa: no descarta nada."
          />
        </div>
      </section>

      <section className="cv__ventbloq">
        <p className="cv__ventbt">El centro y el contacto</p>
        <div className="cv__fields">
          {/* El centro es la CUENTA del CRM. Sin el, la app creaba la cuenta
              con el nombre de la persona y en el Zoho de Oravia quedaron tres
              cuentas llamadas «Marta Ferrer». */}
          <Campo
            etiqueta="Centro"
            valor={form.centreName ?? ""}
            onChange={(v) => setForm({ ...form, centreName: v })}
            placeholder="IES Jaume Balmes"
            resaltar={!(form.centreName ?? "").trim()}
            ayuda="El colegio, club o agencia. Es lo que da nombre a la cuenta en Zoho."
          />
          <Campo
            etiqueta="Correo del centro"
            valor={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            placeholder="direccion@colegio.es"
            resaltar={!form.email.trim()}
          />
          <Campo
            etiqueta="Contacto · nombre"
            valor={form.firstName}
            onChange={(v) => setForm({ ...form, firstName: v })}
            placeholder="Marta"
            resaltar={!form.firstName.trim()}
          />
          <Campo
            etiqueta="Contacto · apellidos"
            valor={form.lastName}
            onChange={(v) => setForm({ ...form, lastName: v })}
            placeholder="Ferrer"
            resaltar={!form.lastName.trim()}
          />
          <Campo
            etiqueta="Nombre del viaje"
            valor={form.opportunityName ?? ""}
            onChange={(v) => setForm({ ...form, opportunityName: v })}
            placeholder="IES JAUME BALMES 2027"
          />
          {/* Sin esto no se sabe qué tarifa aplica: el mismo hotel tiene una
              pactada con el turoperador suizo y otra general. */}
          <label className="cv__field">
            <span>Cotizamos para</span>
            <select value={canal} onChange={(evento) => setCanal(evento.target.value as ClientSegment)}>
              <option value="GENERIC">Colegio, club o agencia</option>
              <option value="SWISS_TTOO">Turoperador suizo</option>
            </select>
          </label>
          {/* El departamento decide DOS cosas: el campo «Departamento» del
              trato -que Oravia rellena en el 99% de los suyos- y desde qué
              buzón sale el correo. Iban por separado: sin departamento el
              correo salía igualmente de Grupos y el trato se quedaba sin
              clasificar. Viene relleno con el del usuario; quien lo tiene no lo
              toca nunca, y un ADMIN -que es rol global y no tiene- lo elige. */}
          <label className={departamento ? "cv__field" : "cv__field cv__field--ojo"}>
            <span>Departamento</span>
            <select
              value={departamento}
              onChange={(evento) => setDepartamento(evento.target.value as "GROUPS" | "SPORTS" | "")}
            >
              <option value="">Sin elegir</option>
              <option value="GROUPS">Grupos</option>
              <option value="SPORTS">Turismo Deportivo</option>
            </select>
            <small>Clasifica el trato en el CRM y elige el buzón desde el que sale el correo.</small>
          </label>
        </div>
        {/* Que el contacto venga del CRM hay que decirlo: si no, el operador no
            sabe si lo escribió él o si son los datos buenos de Zoho, y vuelve a
            teclearlo por si acaso. */}
        {contactoCrm ? (
          <p className="cv__crmhit">
            <b>{contactoCrm.fullName}</b> ya está en el CRM
            {contactoCrm.accountName ? ` · ${contactoCrm.accountName}` : ""}
          </p>
        ) : null}
      </section>
    </>
  );
}

function textoDeAyuda(hueco: Hueco | null, mensajes: number): string {
  if (!hueco) {
    return mensajes === 0
      ? "Hola, somos el IES… queremos un fin de curso a…"
      : "Escribe o pega lo siguiente que te digan…";
  }
  switch (hueco.clave) {
    case "destinationText":
      return "Salou, Cambrils, Andorra…";
    case "dateFrom":
      return "12/05/2027 · o «del 12 al 16 de mayo de 2027»";
    case "dateTo":
      return "16/05/2027";
    case "participants":
      return "48";
    case "teachers":
      return "4";
    case "topePorAlumno":
      return "300";
    default:
      return "Escribe la respuesta…";
  }
}

/**
 * Los atajos de una pregunta: elegir de una lista y «No lo han dicho».
 *
 * Aquí NO hay ninguna casilla de texto. La había, y con el compositor de abajo
 * quedaban dos sitios donde escribir la misma respuesta: «no pueden haber dos
 * casillas de respuesta». Lo que se escribe va siempre al compositor; esto son
 * solo las respuestas de un toque.
 */
function RespuestaAlHueco({
  hueco,
  onContestar,
}: {
  hueco: Hueco;
  onContestar: (hueco: Hueco, valor: string | string[] | number | null, dicho: string) => void;
}) {
  const [marcados, setMarcados] = useState<string[]>([]);

  // Al cambiar de pregunta se limpia lo marcado: sin esto, los requisitos
  // señalados se arrastraban a la pregunta siguiente.
  useEffect(() => {
    setMarcados([]);
  }, [hueco.clave, hueco.pregunta]);

  const noLoHanDicho = (
    <button
      type="button"
      className="cv__nodicho"
      onClick={() =>
        onContestar(
          hueco,
          null,
          hueco.clave === "requisitos" ? "No hay nada especial" : "No lo han dicho",
        )
      }
    >
      {hueco.clave === "requisitos" ? "No hay nada especial" : "No lo han dicho"}
    </button>
  );

  if (hueco.tipo === "opciones") {
    return (
      <div className="cv__respuesta">
        <div className="cv__ops">
          {(hueco.opciones ?? []).map((o) => (
            <button
              key={o.valor}
              type="button"
              className="cv__op"
              onClick={() => onContestar(hueco, o.valor, o.etiqueta)}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
        {noLoHanDicho}
      </div>
    );
  }

  if (hueco.tipo === "varias") {
    const alternar = (valor: string) =>
      setMarcados((ya) => (ya.includes(valor) ? ya.filter((x) => x !== valor) : [...ya, valor]));
    return (
      <div className="cv__respuesta">
        <div className="cv__ops">
          {(hueco.opciones ?? []).map((o) => (
            <button
              key={o.valor}
              type="button"
              className={marcados.includes(o.valor) ? "cv__op is-on" : "cv__op"}
              aria-pressed={marcados.includes(o.valor)}
              onClick={() => alternar(o.valor)}
            >
              {marcados.includes(o.valor) ? "✓ " : ""}
              {o.etiqueta}
            </button>
          ))}
        </div>
        <div className="cv__respuestarow">
          <button
            type="button"
            className="cv__primary cv__primary--sm"
            disabled={marcados.length === 0}
            onClick={() => {
              const dicho = (hueco.opciones ?? [])
                .filter((o) => marcados.includes(o.valor))
                .map((o) => o.etiqueta)
                .join(", ");
              onContestar(hueco, marcados, dicho);
            }}
          >
            Listo
          </button>
          {noLoHanDicho}
        </div>
      </div>
    );
  }

  // Lo que se escribe va al compositor. Aqui solo queda, cuando se puede, la
  // salida: lo que bloquea no se puede saltar, porque sin destino no hay nada
  // que buscar y ofrecerlo solo lleva a una pantalla vacia sin explicacion.
  if (hueco.bloquea) return null;
  return <div className="cv__respuesta">{noLoHanDicho}</div>;
}

function Campo({
  etiqueta,
  valor,
  onChange,
  placeholder,
  resaltar,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  resaltar?: boolean;
  /** Una frase bajo el campo, para lo que la etiqueta sola no explica. */
  ayuda?: string;
}) {
  return (
    <label className={resaltar ? "cv__field cv__field--miss" : "cv__field"}>
      <span>{etiqueta}</span>
      <input value={valor} onChange={(evento) => onChange(evento.target.value)} placeholder={placeholder} />
      {ayuda ? <small className="cv__ayuda">{ayuda}</small> : null}
    </label>
  );
}

/**
 * Un ✓, una ✗ o un — por cada cosa que pidió el centro.
 *
 * La tira va en la propia fila, no dentro del detalle: la queja era que había
 * que abrir un popover diminuto para saber si el hotel servía, y con veinte
 * hoteles eso son veinte aperturas. Aquí se ve de un vistazo y el detalle queda
 * para leer la letra pequeña.
 *
 * El guion NO es una cruz. «No consta» quiere decir que el documento del hotel
 * no habla del tema, no que no lo tenga.
 */
function TiraDeEncaje({ encaje, corta = false }: { encaje?: ComprobacionDeEncaje[]; corta?: boolean }) {
  if (!encaje || encaje.length === 0) return null;
  const items = corta ? encaje.slice(0, 4) : encaje;
  const restantes = encaje.length - items.length;

  return (
    <span className="cv__enc">
      {items.map((c, i) => (
        <span
          key={`${c.que}-${i}`}
          className={`cv__encit cv__encit--${c.estado}`}
          title={c.detalle ? `${c.que} · ${c.detalle}` : c.que}
        >
          <b>{c.estado === "cumple" ? "✓" : c.estado === "no_cumple" ? "✗" : "—"}</b>
          {c.que}
        </span>
      ))}
      {restantes > 0 ? <span className="cv__encmas">+{restantes}</span> : null}
    </span>
  );
}

/** Una fecha ISO escrita como la escribiría una persona: «12 may 2027». */
function fechaCorta(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

/**
 * El podio: los tres que mejor encajan con lo que pidió ESTE centro.
 *
 * No es la cabecera de la lista con otro color. La lista ordena por la
 * puntuación de la búsqueda —parecido con los filtros— y el podio por cuántas
 * de las cosas que pidió el colegio cumple cada hotel. Al podio no sube nada
 * que incumpla algo, así que puede tener dos, uno o ninguno.
 */
function Podio({
  tres,
  elegidos,
  noches,
  tope,
  onAlternar,
  onDetalle,
}: {
  tres: AccommodationSearchMatch[];
  elegidos: string[];
  noches: number;
  tope: number | null;
  onAlternar: (id: string) => void;
  onDetalle: (id: string) => void;
}) {
  if (tres.length === 0) return null;

  return (
    <section className="cv__podio" aria-label="Los que mejor encajan">
      <p className="cv__podioh">
        <span className="cv__lbl">Los que mejor encajan</span>
        <span>
          Ordenados por lo que pidió el centro, no por precio. Ninguno de estos incumple nada de lo que
          pidieron.
        </span>
      </p>
      <ol className="cv__podiol">
        {tres.map((item, i) => {
          const puesto = elegidos.includes(item.accommodation.id);
          const precio = precioPorAlumno(item, [], noches);
          return (
            <li key={item.accommodation.id} className={puesto ? "cv__pcard is-on" : "cv__pcard"}>
              <button
                type="button"
                className="cv__pmain"
                onClick={() => onAlternar(item.accommodation.id)}
                aria-pressed={puesto}
              >
                <span className="cv__ppos">{i + 1}º</span>
                <span className="cv__pt">{item.accommodation.accommodationName}</span>
                <span className="cv__ps">
                  {[item.accommodation.categoryType, etiquetaDeRegimen(item.rate.boardType), item.accommodation.locality]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span className="cv__pp">
                  {euros(precio)}
                  <b>por alumno</b>
                  {tope ? (
                    <i className={precio > tope ? "cv__tope cv__tope--out" : "cv__tope cv__tope--in"}>
                      {precio > tope ? `+${euros(precio - tope)}` : "cabe"}
                    </i>
                  ) : null}
                </span>
                <span className="cv__prazon">{razonDelPodio(item)}</span>
                <TiraDeEncaje encaje={item.encaje} />
                <span className="cv__pcta">{puesto ? "Quitar de las opciones" : "Elegir este"}</span>
              </button>
              <button type="button" className="cv__plink" onClick={() => onDetalle(item.accommodation.id)}>
                Ver todo el detalle
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Qué se está seleccionando exactamente, antes de mandárselo a un colegio.
 *
 * Sustituye al popover de 330 px que enseñaba cuatro líneas. Lo pidió así:
 * «si agrupamos por hotel y en detalles mostramos todo… para que sepamos qué
 * estamos seleccionando y qué estamos reservando para que no haya malentendidos
 * antes de pasar a revisar y enviar».
 *
 * De ahí el orden de los bloques: primero lo que se reserva con su precio
 * —habitación, régimen, temporada, total del grupo—, después lo que pidió el
 * centro punto por punto, y solo entonces las OTRAS tarifas del mismo hotel.
 * Ese último bloque es el que faltaba: el 4R tiene cuarenta tarifas, la
 * búsqueda elige una, y hasta ahora no había forma de saber que existían las
 * demás.
 */
function DetalleAlojamiento({
  item,
  noches,
  alumnos,
  profesores,
  desde,
  hasta,
}: {
  item: AccommodationSearchMatch;
  noches: number;
  alumnos: number;
  profesores: number;
  desde: string;
  hasta: string;
}) {
  const nAlumno = precioDeTarifa(item.rate);
  const nProfesor = item.singleRate ? precioDeTarifa(item.singleRate) : nAlumno;
  const dias = Math.max(noches, 1);
  const totalAlumnos = nAlumno * alumnos * dias;
  const totalProfesores = nProfesor * profesores * dias;
  const total = totalAlumnos + totalProfesores;

  const alternativas = item.alternativas ?? [];
  const nombreTarifa = (r: AccommodationRate) =>
    [etiquetaDeRegimen(r.boardType), r.occupancyLabel, r.includedService].filter(Boolean).join(" · ") ||
    "sin describir";
  // Las alternativas, ordenadas como se leen: por régimen y, dentro, por precio.
  const alternativasOrdenadas = [...alternativas].sort(
    (a, b) => ordenRegimen(a.boardType) - ordenRegimen(b.boardType) || precioDeTarifa(a) - precioDeTarifa(b),
  );

  // Dos tarifas con la misma descripcion y distinto precio son dos cosas
  // distintas que el documento no distinguio: el Santa Monica tiene media
  // pension a 28,75 EUR y a 51,75 EUR para las mismas fechas, y en el catalogo
  // no hay nada -ni habitacion, ni servicio, ni hoja de origen- que diga en que
  // se diferencian. Callarlo seria dejar elegir a ciegas.
  const descripciones = [item.rate, ...alternativas].map(nombreTarifa);
  const hayIndistinguibles = descripciones.some((d, i) => descripciones.indexOf(d) !== i);

  return (
    <div className="cv__det" role="region" aria-label={`Detalle de ${item.accommodation.accommodationName}`}>
      {/* 1 · Lo que se reserva. Es la razon de ser de este panel. */}
      <div className="cv__detbloq">
        <p className="cv__deth">Esto es lo que vas a reservar</p>
        <p className="cv__detsub">
          {item.accommodation.accommodationName}
          {item.accommodation.locality ? ` · ${item.accommodation.locality}` : ""}
          {item.accommodation.categoryType ? ` · ${item.accommodation.categoryType}` : ""}
        </p>
        <dl className="cv__detgrid">
          <div>
            <dt>Estancia</dt>
            <dd>
              {dias} {dias === 1 ? "noche" : "noches"}
              {desde && hasta ? ` · ${fechaCorta(desde)} → ${fechaCorta(hasta)}` : ""}
            </dd>
          </div>
          <div>
            <dt>Grupo</dt>
            <dd>
              {alumnos} {alumnos === 1 ? "alumno" : "alumnos"}
              {profesores > 0 ? ` · ${profesores} ${profesores === 1 ? "profesor" : "profesores"}` : ""}
            </dd>
          </div>
          <div>
            <dt>Régimen</dt>
            <dd>{etiquetaDeRegimen(item.rate.boardType) || "sin especificar en la tarifa"}</dd>
          </div>
          <div>
            <dt>Habitación</dt>
            <dd>{item.rate.occupancyLabel || "la que trae la tarifa (sin detallar)"}</dd>
          </div>
          {item.rate.includedService ? (
            <div>
              <dt>Incluye además</dt>
              <dd>{item.rate.includedService}</dd>
            </div>
          ) : null}
          <div>
            <dt>Temporada</dt>
            <dd>{temporadaDe(item.rate)}</dd>
          </div>
          {item.rate.minNights ? (
            <div>
              <dt>Estancia mínima</dt>
              <dd>{item.rate.minNights} noches</dd>
            </div>
          ) : null}
          <div>
            <dt>Tarifa</dt>
            <dd>{canalEnPalabras(item.rate.clientSegment)}</dd>
          </div>
        </dl>

        <table className="cv__dettabla cv__dettabla--precio">
          <tbody>
            <tr>
              <th scope="row">Alumnos</th>
              <td>
                {euros(nAlumno)} × {alumnos} × {dias} {dias === 1 ? "noche" : "noches"}
              </td>
              <td className="cv__num">{euros(totalAlumnos)}</td>
            </tr>
            {profesores > 0 ? (
              <tr>
                <th scope="row">Profesores</th>
                <td>
                  {euros(nProfesor)} × {profesores} × {dias} {dias === 1 ? "noche" : "noches"}
                  {/* Sin tarifa individual los profesores se cotizan al precio de
                      los alumnos. Callarlo es prometer una habitacion individual
                      que nadie ha tarifado. */}
                  {item.singleRate ? " · uso individual" : " · sin tarifa individual: mismo precio"}
                </td>
                <td className="cv__num">{euros(totalProfesores)}</td>
              </tr>
            ) : null}
            <tr className="cv__dettotal">
              <th scope="row">Total del alojamiento</th>
              <td>solo el hotel, sin actividades</td>
              <td className="cv__num">{euros(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 2 · Contra lo que pidio el centro, punto por punto. */}
      {item.encaje && item.encaje.length > 0 ? (
        <div className="cv__detbloq">
          <p className="cv__deth">Lo que pidió el centro</p>
          <ul className="cv__detenc">
            {item.encaje.map((c, i) => (
              <li key={`${c.que}-${i}`} className={`cv__detenc--${c.estado}`}>
                <b>{c.estado === "cumple" ? "✓" : c.estado === "no_cumple" ? "✗" : "—"}</b>
                <span>
                  {c.que}
                  {c.detalle ? <em>{c.detalle}</em> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="cv__detnota">
            Un guion no es un no: quiere decir que el documento de este hotel no habla del tema. Hay que
            preguntárselo antes de prometerlo.
          </p>
        </div>
      ) : null}

      {/* 3 · Las demas tarifas del mismo hotel. Esto es lo que no existia. */}
      {alternativas.length > 0 ? (
        <div className="cv__detbloq">
          <p className="cv__deth">
            Lo que tiene este hotel para estas fechas{" "}
            <span className="cv__detn">{alternativas.length + 1}</span>
          </p>
          <div className="cv__detscroll">
            <table className="cv__dettabla">
              <thead>
                <tr>
                  <th scope="col">Tarifa</th>
                  <th scope="col">Temporada</th>
                  <th scope="col">Mín.</th>
                  <th scope="col" className="cv__num">
                    Por persona y noche
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="cv__detsel">
                  <td>
                    {nombreTarifa(item.rate)} <span className="cv__detchip">alumnos</span>
                  </td>
                  <td>{temporadaDe(item.rate)}</td>
                  <td>{item.rate.minNights || "—"}</td>
                  <td className="cv__num">{euros(nAlumno)}</td>
                </tr>
                {alternativasOrdenadas.map((r) => (
                  <tr key={r.id} className={item.singleRate && r.id === item.singleRate.id ? "cv__detsel" : undefined}>
                    <td>
                      {nombreTarifa(r)}
                      {item.singleRate && r.id === item.singleRate.id ? (
                        <>
                          {" "}
                          <span className="cv__detchip">profesores</span>
                        </>
                      ) : null}
                    </td>
                    <td>{temporadaDe(r)}</td>
                    <td>{r.minNights || "—"}</td>
                    <td className="cv__num">{euros(precioDeTarifa(r))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cv__detnota">
            Solo las tarifas válidas para las fechas del viaje; las de otras temporadas no se enseñan. La
            búsqueda elige la de los alumnos por lo que pidió el centro, y la de uso individual para los
            profesores cuando la hay; de momento las demás no se pueden elegir desde aquí.
          </p>
          {hayIndistinguibles ? (
            <p className="cv__detaviso">
              Hay tarifas con la misma descripción y distinto precio. El documento no dejó registrado en qué
              se diferencian —habitación, edificio, servicio—, así que no se puede saber cuál corresponde a
              este grupo sin preguntárselo al hotel.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 4 · Todo lo que el documento del hotel dice, entero. */}
      {item.accommodation.freePolicy ? (
        <div className="cv__detbloq">
          <p className="cv__deth">Gratuidades</p>
          <p className="cv__dettxt">{item.accommodation.freePolicy}</p>
        </div>
      ) : null}
      {item.accommodation.conditionsText ? (
        <div className="cv__detbloq">
          <p className="cv__deth">Condiciones</p>
          <ul className="cv__detlista">
            {item.accommodation.conditionsText.split(" | ").map((linea, i) => (
              <li key={i}>{linea.replace(/^\[([A-Z_]+)\]\s*/, "")}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {item.accommodation.observations ? (
        <div className="cv__detbloq">
          <p className="cv__deth">Observaciones</p>
          <ul className="cv__detlista">
            {item.accommodation.observations.split(" | ").map((linea, i) => (
              <li key={i}>{linea}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!item.accommodation.freePolicy &&
      !item.accommodation.conditionsText &&
      !item.accommodation.observations ? (
        <div className="cv__detbloq">
          <p className="cv__detnota">
            De este alojamiento no se publicó ninguna condición ni gratuidad. Si su documento las traía, hay
            que volver a publicarlo: lo que no está aquí tampoco saldrá en el presupuesto.
          </p>
        </div>
      ) : null}

      <p className="cv__detpie">
        De: {item.accommodation.sourceDocumentName || item.accommodation.sourceFile || "origen sin registrar"}
      </p>
    </div>
  );
}

/**
 * El detalle de un hotel, en una ventana sobre el velo.
 *
 * Antes se desplegaba en línea debajo de la fila: con las tres tablas que
 * trae, empujaba la lista entera hacia abajo y había que volver a buscar
 * dónde estabas. Una ventana se lee, se cierra, y la lista no se ha movido.
 * Es el mismo velo que «Lo que hemos entendido».
 */
function VentanaDeDetalle({
  item,
  noches,
  alumnos,
  profesores,
  desde,
  hasta,
  onCerrar,
}: {
  item: AccommodationSearchMatch;
  noches: number;
  alumnos: number;
  profesores: number;
  desde: string;
  hasta: string;
  onCerrar: () => void;
}) {
  // Escape cierra, como cualquier ventana. Sin esto hay que buscar la aspa.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  const sub = [
    item.accommodation.categoryType,
    etiquetaDeRegimen(item.rate.boardType),
    item.accommodation.locality,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="cv__velo"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${item.accommodation.accommodationName}`}
      onClick={(evento) => {
        // Pulsar fuera de la ventana la cierra; dentro, no.
        if (evento.target === evento.currentTarget) onCerrar();
      }}
    >
      <div className="cv__vent cv__vent--detalle">
        <header className="cv__venth">
          <div>
            <p className="cv__venttl">{item.accommodation.accommodationName}</p>
            {sub ? <p className="cv__ventsub">{sub}</p> : null}
          </div>
          <button type="button" className="cv__ventx" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="cv__ventb">
          <DetalleAlojamiento
            item={item}
            noches={noches}
            alumnos={alumnos}
            profesores={profesores}
            desde={desde}
            hasta={hasta}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * La ventana de una actividad: qué tarifa se ha elegido, por qué, y todas las
 * que tiene para este canal, con la elegida marcada. Antes la fila enseñaba un
 * precio sin decir de qué tarifa era, y PortAventura Park tiene 81.
 */
function VentanaDeActividad({
  item,
  alumnos,
  onCerrar,
}: {
  item: ActivitySearchMatch;
  alumnos: number;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  const todas = [item.rate, ...(item.alternativas ?? [])];
  const rejilla = rejillaDeActividad(
    todas.map((r) => ({
      id: r.id,
      year: r.year,
      ageLabel: r.ageLabel || null,
      label: r.ageLabel || null,
      currency: "EUR",
      amount: r.salePvpAmount > 0 ? r.salePvpAmount : null,
      durationText: r.durationText || null,
      clientSegment: null,
    })),
  );
  const precio = item.rate.salePvpAmount;
  const sub = [item.activity.supplierName, item.activity.locationMain, item.activity.durationText]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="cv__velo"
      role="dialog"
      aria-modal="true"
      aria-label={`Tarifas de ${item.activity.activityName}`}
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) onCerrar();
      }}
    >
      <div className="cv__vent cv__vent--detalle">
        <header className="cv__venth">
          <div>
            <p className="cv__venttl">{item.activity.activityName}</p>
            {sub ? <p className="cv__ventsub">{sub}</p> : null}
          </div>
          <button type="button" className="cv__ventx" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="cv__ventb">
          <div className="cv__det">
            <div className="cv__detbloq">
              <p className="cv__deth">Esto es lo que vas a añadir al programa</p>
              <dl className="cv__detgrid">
                <div>
                  <dt>Tarifa</dt>
                  <dd>{item.rate.ageLabel || "tarifa única"}</dd>
                </div>
                <div>
                  <dt>Precio</dt>
                  <dd>{precio > 0 ? `${euros(precio)} por persona` : "a consultar"}</dd>
                </div>
                {precio > 0 && alumnos > 0 ? (
                  <div>
                    <dt>Para el grupo</dt>
                    <dd>
                      {euros(precio)} × {alumnos} {alumnos === 1 ? "alumno" : "alumnos"} = {euros(precio * alumnos)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <p className="cv__detnota">
                El precio por persona se suma al precio por alumno de cada opción en la que esté esta actividad.
              </p>
            </div>

            {item.matchReasons.length > 0 ? (
              <div className="cv__detbloq">
                <p className="cv__deth">Por qué esta tarifa</p>
                <ul className="cv__detenc">
                  {item.matchReasons.map((razon, i) => (
                    <li key={i} className="cv__detenc--cumple">
                      <b>✓</b>
                      <span>{razon}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {rejilla && todas.length > 1 ? (
              <div className="cv__detbloq">
                <p className="cv__deth">
                  Todas las tarifas de esta actividad <span className="cv__detn">{todas.length}</span>
                </p>
                <TablaDeTarifas rejilla={rejilla} seleccionadaId={item.rate.id} />
                <p className="cv__detnota">
                  La marcada con ✓ es la que se ha elegido para este grupo. De momento las demás no se pueden elegir
                  desde aquí.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListaOpciones({
  hoteles,
  elegidos,
  noches,
  tope,
  alumnos,
  profesores,
  desde,
  hasta,
  actividadesDe,
  matchActividad,
  programaBase,
  onAlternar,
  destinoPedido,
  detalle,
  onDetalle,
}: {
  hoteles: AccommodationSearchMatch[];
  elegidos: string[];
  noches: number;
  tope: number | null;
  alumnos: number;
  profesores: number;
  desde: string;
  hasta: string;
  actividadesDe: (opcion: number) => string[];
  matchActividad: (id: string) => ActivitySearchMatch | undefined;
  programaBase: string[];
  onAlternar: (id: string) => void;
  destinoPedido: string;
  detalle: string | null;
  onDetalle: (id: string) => void;
}) {
  const tres = podio(hoteles);
  const enElPodio = new Set(tres.map((item) => item.accommodation.id));
  const enDetalle = detalle ? hoteles.find((item) => item.accommodation.id === detalle) ?? null : null;

  return (
    <>
      {enDetalle ? (
        <VentanaDeDetalle
          item={enDetalle}
          noches={noches}
          alumnos={alumnos}
          profesores={profesores}
          desde={desde}
          hasta={hasta}
          onCerrar={() => onDetalle(enDetalle.accommodation.id)}
        />
      ) : null}
      <Podio
        tres={tres}
        elegidos={elegidos}
        noches={noches}
        tope={tope}
        onAlternar={onAlternar}
        onDetalle={onDetalle}
      />

      {tres.length > 0 ? (
        <p className="cv__opsh cv__opsh--sub">
          <span className="cv__lbl">Todos los alojamientos con tarifa</span>
        </p>
      ) : null}

      <ul className="cv__hotels">
        {hoteles.slice(0, 20).map((item) => {
          const puesto = elegidos.includes(item.accommodation.id);
          const opcion = elegidos.indexOf(item.accommodation.id) + 1;
          const enOpcion = puesto ? actividadesDe(opcion) : [];
          const fuera = puesto ? programaBase.filter((id) => !enOpcion.includes(id)) : [];
          const dentro = puesto ? enOpcion.filter((id) => !programaBase.includes(id)) : [];
          const precio = puesto
            ? precioPorAlumno(item, enOpcion.map(matchActividad).filter(Boolean) as ActivitySearchMatch[], noches)
            : precioPorAlumno(item, [], noches);
          const abierto = detalle === item.accommodation.id;

          return (
            <li key={item.accommodation.id} className={puesto ? "cv__hotel is-on" : "cv__hotel"}>
              <button
                type="button"
                className="cv__hotelmain"
                onClick={() => onAlternar(item.accommodation.id)}
                aria-pressed={puesto}
              >
                <span className="cv__hotelchk">{puesto ? opcion : ""}</span>
                <span className="cv__hotelm">
                  <span className="cv__hotelt">
                    {item.accommodation.accommodationName}
                    {enElPodio.has(item.accommodation.id) ? (
                      <span className="cv__reco">recomendado</span>
                    ) : null}
                  </span>
                  <span className="cv__hotels2">
                    {[
                      item.accommodation.categoryType,
                      item.rate.boardType,
                      item.rate.occupancyLabel,
                      item.accommodation.locality,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {/* Un hotel de otro pueblo de la misma comarca tambien sale, a
                        proposito: pidiendo Cambrils aparece Salou, que esta a diez
                        minutos. Lo que faltaba era decirlo. Sin esta marca la
                        lista parecia ignorar el destino. */}
                    {esDeOtraLocalidad(item.accommodation.locality, destinoPedido) ? (
                      <span className="cv__cerca">cerca</span>
                    ) : null}
                  </span>
                  {/* La tira de ✓ y — va en la fila, no dentro del detalle: con
                      veinte hoteles, abrir veinte fichas para saber cual sirve
                      era justamente la queja. */}
                  <TiraDeEncaje encaje={item.encaje} corta />
                </span>
                <span className="cv__hotelp">
                  {euros(precio)}
                  <b>por alumno</b>
                </span>
                {tope ? (
                  <span className={precio > tope ? "cv__tope cv__tope--out" : "cv__tope cv__tope--in"}>
                    {precio > tope ? `+${euros(precio - tope)}` : "cabe"}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="cv__info"
                aria-haspopup="dialog"
                aria-expanded={abierto}
                onClick={() => onDetalle(item.accommodation.id)}
              >
                Ver todo el detalle
              </button>
              {puesto && (fuera.length || dentro.length) ? (
                <p className="cv__delta">
                  <span>Programa base</span>
                  {fuera.map((id) => (
                    <span key={id} className="cv__delta--out">
                      sin {matchActividad(id)?.activity.activityName ?? "una actividad"}
                    </span>
                  ))}
                  {dentro.map((id) => (
                    <span key={id} className="cv__delta--in">
                      + {matchActividad(id)?.activity.activityName ?? "una actividad"}
                    </span>
                  ))}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function MatrizPrograma({
  elegidos,
  matchHotel,
  actividadesDisponibles,
  programaBase,
  actividadesDe,
  noches,
  onAlternarOpcion,
}: {
  elegidos: string[];
  matchHotel: (id: string) => AccommodationSearchMatch | undefined;
  actividadesDisponibles: ActivitySearchMatch[];
  programaBase: string[];
  actividadesDe: (opcion: number) => string[];
  noches: number;
  onAlternarOpcion: (actividadId: string, opcion: number) => void;
}) {
  // Se muestran las de la base más las añadidas a alguna opción.
  const enAlguna = new Set(programaBase);
  elegidos.forEach((_, indice) => actividadesDe(indice + 1).forEach((id) => enAlguna.add(id)));
  const filas = actividadesDisponibles.filter((item) => enAlguna.has(item.activity.id));

  return (
    <div className="cv__mx" style={{ ["--cols" as string]: elegidos.length }}>
      <div className="cv__mxrow cv__mxrow--head">
        <div className="cv__mxk">El programa</div>
        {elegidos.map((id, indice) => (
          <div className="cv__mxh" key={id}>
            Opción {indice + 1}
            <span>{matchHotel(id)?.accommodation.accommodationName ?? ""}</span>
          </div>
        ))}
      </div>

      {filas.length === 0 ? (
        <p className="cv__empty" style={{ padding: "14px" }}>
          Elige actividades en la vista de lista y aquí podrás quitarlas o añadirlas por opción.
        </p>
      ) : (
        filas.map((item) => {
          const puestas = elegidos.filter((_, indice) => actividadesDe(indice + 1).includes(item.activity.id)).length;
          const varia = puestas > 0 && puestas < elegidos.length;
          return (
            <div className="cv__mxrow" key={item.activity.id}>
              <div className="cv__mxk">
                <span className="cv__mxt">
                  {item.activity.activityName}
                  {varia ? <span className="cv__varia">varía</span> : null}
                </span>
                <span className="cv__mxs">
                  {item.rate.salePvpAmount ? euros(item.rate.salePvpAmount) : "a consultar"}
                </span>
              </div>
              {elegidos.map((hotelId, indice) => {
                const puesta = actividadesDe(indice + 1).includes(item.activity.id);
                return (
                  <div className="cv__mxc" key={hotelId}>
                    <button
                      type="button"
                      className={puesta ? "cv__chk is-on" : "cv__chk"}
                      aria-pressed={puesta}
                      aria-label={`${item.activity.activityName} en la opción ${indice + 1}`}
                      onClick={() => onAlternarOpcion(item.activity.id, indice + 1)}
                    >
                      ✓
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })
      )}

      <div className="cv__mxrow cv__mxrow--foot">
        <div className="cv__mxk">Precio por alumno</div>
        {elegidos.map((hotelId, indice) => {
          const hotel = matchHotel(hotelId);
          const enOpcion = actividadesDe(indice + 1)
            .map((id) => actividadesDisponibles.find((a) => a.activity.id === id))
            .filter(Boolean) as ActivitySearchMatch[];
          return (
            <div className="cv__mxc cv__mxn" key={hotelId}>
              {hotel ? euros(precioPorAlumno(hotel, enOpcion, noches)) : "—"}
            </div>
          );
        })}
      </div>
    </div>
  );
}
