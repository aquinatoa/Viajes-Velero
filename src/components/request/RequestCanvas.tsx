import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type {
  AccommodationSearchMatch,
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

/** Precio por alumno de una opción: el hotel más las actividades con precio. */
function precioPorAlumno(
  hotel: AccommodationSearchMatch,
  actividades: ActivitySearchMatch[],
  noches: number,
): number {
  const base = (hotel.rate.pvpAmount || hotel.rate.netSaleAmount || 0) * Math.max(noches, 1);
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
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(valor);
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

/** Convierte cualquier error (incluidos los de validación) en una frase legible. */
function mensajeDeError(error: unknown, porDefecto: string): string {
  if (error && typeof error === "object" && "issues" in error) {
    const incidencias = (error as { issues?: Array<{ message?: string }> }).issues ?? [];
    const frases = incidencias.map((i) => i.message).filter(Boolean);
    if (frases.length) return frases.join(" ");
  }
  return error instanceof Error ? error.message : porDefecto;
}

export function RequestCanvas({ onFinished, onExit, currentUserId = null }: RequestCanvasProps) {
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
  /** Solicitudes previas del mismo cliente: evita crear dos tratos del mismo viaje. */
  const [previas, setPrevias] = useState<FindCandidateOpportunitiesResult | null>(null);
  const [parseResult, setParseResult] = useState<ParseTripRequestResult | null>(null);

  /**
   * Para qué cliente se cotiza. El mismo hotel tiene tarifa pactada con el
   * turoperador suizo y tarifa general, y valen distinto. Por defecto, colegio.
   */
  const [canal, setCanal] = useState<ClientSegment>("GENERIC");

  // Lo que se construye
  const [hoteles, setHoteles] = useState<SearchAccommodationsResult | null>(null);
  const [actividades, setActividades] = useState<SearchActivitiesResult | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [programaBase, setProgramaBase] = useState<string[]>([]);
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
      setElegidos(estado.elegidos ?? []);
      setProgramaBase(estado.programaBase ?? []);
      setExcepciones(estado.excepciones ?? {});
      setPreciosFijados(estado.preciosFijados ?? {});
      setRecuperable(null);

      // Las tarifas pueden haber cambiado desde que se guardó: se vuelve a
      // buscar en vez de enseñar precios viejos.
      if (estado.entendido?.destinationText) {
        await buscarHoteles(estado.entendido, estado.canal ?? "GENERIC");
      }
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo abrir el borrador."));
    } finally {
      setOcupado("");
    }
  }

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
  }, [mensajes, borrador, form, entendido, tope, requisitos, elegidos, programaBase, excepciones, preciosFijados, solicitudId, canal, enviada]);

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
      void buscarHoteles(recuperable.entendido);
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

  /** Busca hoteles y actividades para una petición ya entendida. */
  async function buscarHoteles(datos: NormalizedRequestDraft, canalPedido: ClientSegment = canal) {
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
          : "Entendida",
      estado: ocupado === "leyendo" ? "trabajando" : !entendido ? "pendiente" : faltaEnPeticion.length ? "aviso" : "hecho",
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
  }, [entendido, elegidos, programaBase, excepciones, form.email, form.firstName, form.lastName, ocupado, entrega, enviada, actividades, hoteles, tope, noches]);

  const puedeRevisar = hitos[2].estado === "hecho" && !enviada && elegidos.length > 0;

  // ── Acciones ────────────────────────────────────────────────────────────────

  function añadirMensaje() {
    const texto = borrador.trim();
    if (!texto) return;
    setMensajes((actuales) => [...actuales, texto]);
    setBorrador("");
  }

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

      // Si ese correo ya está en el CRM, sus datos mandan sobre lo que
      // adivinemos del mensaje. Teclear el contacto en cada solicitud acaba
      // creando una segunda ficha del mismo colegio con el nombre escrito de
      // otra manera. No bloquea: si Zoho no contesta, se sigue igual.
      if (form.email) void traerContactoDelCrm(form.email);

      // Leer NO exige datos de contacto: el correo hace falta para enviar.
      const resultado = readTripMessage(texto);
      setParseResult(resultado);
      setEntendido(resultado.normalized);

      const extras = extractRequestExtras(texto);
      setTope(extras.budgetPerStudent);
      setRequisitos(extras.specialRequirements);

      if (borrador.trim()) {
        setMensajes((actuales) => [...actuales, borrador.trim()]);
        setBorrador("");
      }

      await buscarHoteles(resultado.normalized);
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

      const guardada = await saveNormalizedTripRequest(cliente.id, form, parseResult, solicitudId);
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
      setAviso(
        enviada.simulated
          ? `Propuesta ${enviada.reference} preparada. No ha salido: falta la clave del buzón del departamento.`
          : `Propuesta ${enviada.reference} enviada a ${enviada.recipientEmail}.`,
      );
      onFinished?.();
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo enviar la propuesta."));
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
    if (!entendido) return "Pega el mensaje del cliente y pulsa Ver lo que hemos entendido.";
    if (!hoteles) return "Pulsa Ver lo que hemos entendido para buscar hoteles.";
    if (hoteles.matches.length === 0) return "No hay hoteles para esas fechas: revisa el destino o las fechas.";
    if (elegidos.length === 0) return `Elige hasta ${MAX_OPCIONES} hoteles: cada uno será una opción.`;
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
              <span className="cv__note">{mensajes.length} mensaje{mensajes.length === 1 ? "" : "s"}</span>
            </div>
            <div className="cv__cardb">
              {mensajes.length === 0 ? (
                <p className="cv__empty">Pega abajo el correo o el WhatsApp del colegio.</p>
              ) : (
                mensajes.map((mensaje, indice) => (
                  <p className="cv__bubble" key={indice}>
                    {mensaje}
                  </p>
                ))
              )}
              <textarea
                className="cv__composer"
                value={borrador}
                onChange={(evento) => setBorrador(evento.target.value)}
                placeholder="Hola, somos el IES… queremos un fin de curso a…"
                rows={3}
              />
              <div className="cv__composerrow">
                <button type="button" className="cv__ghost cv__ghost--sm" onClick={añadirMensaje} disabled={!borrador.trim()}>
                  Añadir mensaje
                </button>
                <button type="button" className="cv__primary cv__primary--sm" onClick={leerYBuscar} disabled={ocupado !== ""}>
                  {ocupado === "leyendo" ? "Leyendo…" : "Ver lo que hemos entendido"}
                </button>
              </div>
            </div>
          </div>

          {requisitos.length ? (
            <div className="cv__card">
              <div className="cv__cardh">
                <span className="cv__lbl">Lo que pide el centro</span>
                <span className="cv__note">del propio mensaje</span>
              </div>
              <ul className="cv__reqs">
                {requisitos.map((requisito) => (
                  <li key={requisito}>{requisito}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {previas && previas.opportunities.length ? (
            <div className="cv__card cv__card--warn">
              <div className="cv__cardh">
                <span className="cv__lbl">Ojo: este cliente ya tenía solicitudes</span>
              </div>
              <ul className="cv__reqs">
                {previas.opportunities.map((oportunidad) => (
                  <li key={oportunidad.id}>{oportunidad.name}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {entendido ? (
            <div className="cv__card">
              <div className="cv__cardh">
                <span className="cv__lbl">Lo que hemos entendido</span>
                <span className="cv__note">editable</span>
              </div>
              <div className="cv__cardb cv__fields">
                <Campo etiqueta="Destino" valor={entendido.destinationText} onChange={(v) => setEntendido({ ...entendido, destinationText: v })} />
                <Campo etiqueta="Desde" valor={entendido.dateFrom} onChange={(v) => setEntendido({ ...entendido, dateFrom: v })} placeholder="2026-10-15" />
                <Campo etiqueta="Hasta" valor={entendido.dateTo} onChange={(v) => setEntendido({ ...entendido, dateTo: v })} placeholder="2026-10-19" />
                <Campo etiqueta="Alumnos" valor={entendido.participants?.toString() ?? ""} onChange={(v) => setEntendido({ ...entendido, participants: Number(v) || null })} />
                <Campo etiqueta="Profesores" valor={entendido.teachers?.toString() ?? ""} onChange={(v) => setEntendido({ ...entendido, teachers: Number(v) || null })} />
                {/* La edad no estaba y la busqueda la exige: el aviso "hace falta
                    una edad o rango de edad" no tenia donde contestarse y dejaba
                    la solicitud atascada. Se escriben los DOS campos porque el
                    buscador saca el numero de `averageAgeText` cuando no hay
                    guion; solo con `ageRangeText` la edad se veria pero no
                    filtraria nada. */}
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
                  resaltar={!entendido.ageRangeText.trim() && !entendido.averageAgeText.trim()}
                />
                <Campo etiqueta="Régimen" valor={entendido.regimeRequested} onChange={(v) => setEntendido({ ...entendido, regimeRequested: v })} />
                {/* El centro es la CUENTA del CRM. Sin el, la app creaba la
                    cuenta con el nombre de la persona y en el Zoho de Oravia
                    quedaron tres cuentas llamadas «Marta Ferrer». */}
                <Campo
                  etiqueta="Centro"
                  valor={form.centreName ?? ""}
                  onChange={(v) => setForm({ ...form, centreName: v })}
                  placeholder="IES Jaume Balmes"
                  resaltar={!(form.centreName ?? "").trim()}
                  ayuda="El colegio, club o agencia. Es lo que da nombre a la cuenta en Zoho."
                />
                <Campo etiqueta="Correo del centro" valor={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="direccion@colegio.es" resaltar={!form.email.trim()} />
                <Campo etiqueta="Contacto · nombre" valor={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} placeholder="Javier" resaltar={!form.firstName.trim()} />
                <Campo etiqueta="Contacto · apellidos" valor={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} placeholder="Martínez" resaltar={!form.lastName.trim()} />
                {/* Que el contacto venga del CRM hay que decirlo: si no, el
                    operador no sabe si lo escribió él o si son los datos buenos
                    de Zoho, y vuelve a teclearlo por si acaso. */}
                {contactoCrm ? (
                  <p className="cv__crmhit">
                    <b>{contactoCrm.fullName}</b> ya está en el CRM
                    {contactoCrm.accountName ? ` · ${contactoCrm.accountName}` : ""}
                    {contactoCrm.deals.length
                      ? ` · ${contactoCrm.deals.length} oportunidad(es): ${contactoCrm.deals
                          .map((d) => `${d.dealName} (${d.stage})`)
                          .join(", ")}`
                      : " · sin oportunidades abiertas"}
                  </p>
                ) : null}
                <Campo etiqueta="Nombre del viaje" valor={form.opportunityName ?? ""} onChange={(v) => setForm({ ...form, opportunityName: v })} placeholder="Fin de curso Roma 2026" />
                {/* «Tope por alumno» no se entendia. Es el presupuesto que dice
                    el colegio, y solo sirve para marcar en la lista lo que se
                    pasa: no descarta nada ni cambia ningun precio. */}
                <Campo
                  etiqueta="Presupuesto por alumno"
                  valor={tope?.toString() ?? ""}
                  onChange={(v) => setTope(Number(v) || null)}
                  placeholder="sin tope"
                  ayuda="Lo que dice el colegio que puede pagar. Solo marca en la lista lo que se pasa: no descarta nada."
                />
                {/* Sin esto no se sabe qué tarifa aplica: el mismo hotel tiene
                    una pactada con el turoperador suizo y otra general. */}
                <label className="cv__field">
                  <span>Cotizamos para</span>
                  <select
                    value={canal}
                    onChange={(evento) => {
                      const elegido = evento.target.value as ClientSegment;
                      setCanal(elegido);
                      if (entendido) void buscarHoteles(entendido, elegido);
                    }}
                  >
                    <option value="GENERIC">Colegio, club o agencia</option>
                    <option value="SWISS_TTOO">Turoperador suizo</option>
                  </select>
                </label>
              </div>
            </div>
          ) : null}
        </section>

        {/* ── Las opciones ── */}
        <section className="cv__right" aria-label="Las opciones">
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
              <ul className="cv__acts">
                {actividades.matches.slice(0, 12).map((item) => {
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
                          <span className="cv__actt">{item.activity.activityName}</span>
                          <span className="cv__acts2">{[item.activity.locationMain, item.activity.durationText].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className={item.rate.salePvpAmount ? "cv__actp" : "cv__actp cv__actp--none"}>
                          {item.rate.salePvpAmount ? euros(item.rate.salePvpAmount) : "a consultar"}
                        </span>
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
        </section>
      </div>


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

function ListaOpciones({
  hoteles,
  elegidos,
  noches,
  tope,
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
  actividadesDe: (opcion: number) => string[];
  matchActividad: (id: string) => ActivitySearchMatch | undefined;
  programaBase: string[];
  onAlternar: (id: string) => void;
  destinoPedido: string;
  detalle: string | null;
  onDetalle: (id: string) => void;
}) {
  return (
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

        return (
          <li key={item.accommodation.id} className={puesto ? "cv__hotel is-on" : "cv__hotel"}>
            <button type="button" className="cv__hotelmain" onClick={() => onAlternar(item.accommodation.id)} aria-pressed={puesto}>
              <span className="cv__hotelchk">{puesto ? opcion : ""}</span>
              <span className="cv__hotelm">
                <span className="cv__hotelt">{item.accommodation.accommodationName}</span>
                <span className="cv__hotels2">
                  {[item.accommodation.categoryType, item.rate.boardType, item.accommodation.locality]
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
              aria-expanded={detalle === item.accommodation.id}
              aria-label={`Detalle de ${item.accommodation.accommodationName}`}
              onClick={() => onDetalle(item.accommodation.id)}
            >
              Detalle
            </button>
            {detalle === item.accommodation.id ? (
              <div className="cv__pop" role="dialog" aria-label={item.accommodation.accommodationName}>
                <p className="cv__popt">{item.accommodation.accommodationName}</p>
                <p className="cv__pops">
                  {[item.accommodation.categoryType, item.accommodation.accommodationType, item.accommodation.locality]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="cv__popr">
                  <span>Precio por alumno</span>
                  <strong>{euros(precio)}</strong>
                </p>
                <p className="cv__popr">
                  <span>Régimen</span>
                  <strong>{item.rate.boardType || "sin especificar"}</strong>
                </p>
                {item.accommodation.freePolicy ? (
                  <p className="cv__popr">
                    <span>Gratuidades</span>
                    <strong>{item.accommodation.freePolicy}</strong>
                  </p>
                ) : null}
                {item.accommodation.conditionsText ? (
                  <p className="cv__popc">{item.accommodation.conditionsText}</p>
                ) : null}
                {item.accommodation.observations ? (
                  <p className="cv__popc">{item.accommodation.observations}</p>
                ) : null}
                <p className="cv__popf">
                  De: {item.accommodation.sourceDocumentName || item.accommodation.sourceFile || "origen sin registrar"}
                </p>
              </div>
            ) : null}
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
