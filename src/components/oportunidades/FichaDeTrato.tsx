import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  abrirAdjuntoDelCrm,
  cambiosDeFaseApi,
  clienteDelTratoApi,
  fichaDelCrmApi,
  historialDelCrmApi,
  type CambioDeFaseLeido,
} from "../../services/apiClient";
import type { OportunidadFila } from "../../domain/oportunidadUnificada";
import { webCorta, type ClienteDelTrato } from "../../domain/clienteDelTrato";
import { eventosDelTrato, type FichaDelCrmCompleta, type ListaDelTratoLeida } from "../../domain/fichaDelCrm";
import {
  FASES_EN_ORDEN,
  FASES_LATERALES,
  abierta,
  diasHasta,
  estadoDe,
  euros,
  fechaLarga,
  noches,
  rangoLlegada,
  siguientePaso,
} from "../../domain/oportunidadesVista";
import { enElOrdenDelCrm, estiloDeFase, type ColoresDeFase } from "../../domain/colorDeFase";
import { parseTrip } from "../confirm/ConfirmRequestsPanel";
import { ArchivosDelTrato, HitosDelCrm, LineaDeTiempoDelTrato, PresupuestosDelCrm, TodosLosCampos, eur } from "./InfoDelCrm";
import { MoverDeFase } from "./MoverDeFase";
import { tintaSobre } from "./TablaYTablero";
import { comoTratoDeZoho } from "./tratoDeZoho";
import { textoDelCierre } from "./textos";

const DEPARTAMENTOS: Record<string, string> = { GROUPS: "Groups", SPORTS: "Sports", OTRO: "Otro" };
type Carpeta = "presupuesto" | "actividad" | "archivos" | "campos";

/** Una de las cinco cajas de la cabecera: en rojo lo que falta o está vencido, en verde lo que va bien. */
function Caja({ rotulo, valor, nota, tono = "" }: { rotulo: string; valor: ReactNode; nota?: ReactNode; tono?: "" | "mal" | "bien" }) {
  return (
    <div className={`opc-caja${tono ? ` is-${tono}` : ""}`}>
      <small>{rotulo}</small>
      <strong>{valor || "—"}</strong>
      {nota ? <span>{nota}</span> : null}
    </div>
  );
}

/** Un bloque con peso: color propio, letra y título, y dentro lo importante en grande. */
function Bloque({ letra, color, titulo, extra, children }: { letra: string; color: string; titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="opc-bloque" style={{ "--b": color } as CSSProperties}>
      <header>
        <span className="opc-bloque__ic" aria-hidden="true">
          {letra}
        </span>
        <h4>{titulo}</h4>
        {extra ? <small>{extra}</small> : null}
      </header>
      <div className="opc-bloque__c">{children}</div>
    </section>
  );
}

function Par({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <>
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </>
  );
}

/**
 * La ficha de una oportunidad que solo existe en Zoho, a pantalla completa.
 *
 * Diseño «C2», elegido por Anthony el 16/11/2026 sobre maqueta
 * (`Jarvis/informes/Oravia-maqueta-ficha`):
 *  - cabecera en el azul de la marca, con los cinco datos que se miran siempre
 *    en cajas (rojo = falta o vencido, verde = va bien) y «lo siguiente» junto al
 *    ÚNICO botón, «Abrir en Zoho»;
 *  - barra de fases que se pulsa para mover la oportunidad y enseña lo que queda;
 *  - cuatro bloques con peso: el cliente (cuenta y contacto), el viaje (con lo que
 *    se ofreció y lo aceptado), el dinero (su situación) y los proveedores;
 *  - a la derecha, las carpetas: el presupuesto tal como está en Zoho, la
 *    actividad, los archivos y todos los campos del CRM.
 *
 * Solo se enseña lo que tiene dato. Todo es lectura salvo mover de fase.
 */
export function FichaDeTrato({
  fila,
  stages,
  colores,
  onCambio,
  onError,
}: {
  fila: OportunidadFila;
  stages: string[];
  /** Los colores de las fases, tal y como están en el CRM. */
  colores: ColoresDeFase;
  onCambio: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}) {
  const hoy = useMemo(() => new Date(), [fila.clave]);
  const trato = useMemo(() => comoTratoDeZoho(fila), [fila]);
  const trip = useMemo(() => parseTrip(trato.opcionesTexto || trato.description), [trato.opcionesTexto, trato.description]);
  const [carpeta, setCarpeta] = useState<Carpeta>("presupuesto");
  /** La fase pulsada en la barra: abre el panel de mover con ella ya elegida. */
  const [destino, setDestino] = useState<string | null>(null);
  const [cambios, setCambios] = useState<CambioDeFaseLeido[] | null>(null);
  const [errorHistorial, setErrorHistorial] = useState("");
  const [crm, setCrm] = useState<{ ficha: FichaDelCrmCompleta } | null>(null);
  const [leyendoElCrm, setLeyendoElCrm] = useState(false);
  const [errorDelCrm, setErrorDelCrm] = useState("");
  const [listas, setListas] = useState<ListaDelTratoLeida[] | null>(null);
  const [errorListas, setErrorListas] = useState("");
  const [cliente, setCliente] = useState<ClienteDelTrato | null>(null);

  const estado = estadoDe(fila);
  const paso = siguientePaso(fila, hoy);
  const n = noches(fila);
  const rango = rangoLlegada(fila);
  const estilo = estiloDeFase(fila.fase, colores) as CSSProperties | undefined;
  const tinta = tintaSobre((estilo as Record<string, string> | undefined)?.["--c"]);
  const vencido = abierta(fila) ? diasHasta(fila.cierre, hoy) : null;

  useEffect(() => {
    setCarpeta("presupuesto");
    setDestino(null);
    setCambios(null);
    setErrorHistorial("");
  }, [fila.clave]);

  // Lo que el CRM sabe del trato: al abrir la oportunidad (una lectura, sin escribir).
  useEffect(() => {
    setCrm(null);
    setErrorDelCrm("");
    if (!fila.crmDealId) return;
    let vivo = true;
    setLeyendoElCrm(true);
    fichaDelCrmApi(fila.crmDealId)
      .then((r) => vivo && setCrm(r))
      .catch((e: unknown) => vivo && setErrorDelCrm(e instanceof Error ? e.message : "No se pudo leer el CRM."))
      .finally(() => vivo && setLeyendoElCrm(false));
    return () => {
      vivo = false;
    };
  }, [fila.crmDealId, fila.fase]);

  // Historial de fases, notas, archivos y correos: aparte, para que si falla no se caiga el resto.
  useEffect(() => {
    setListas(null);
    setErrorListas("");
    if (!fila.crmDealId) return;
    let vivo = true;
    historialDelCrmApi(fila.crmDealId)
      .then((r) => vivo && setListas(r.listas))
      .catch((e: unknown) => vivo && setErrorListas(e instanceof Error ? e.message : "No se pudo leer el historial del CRM."));
    return () => {
      vivo = false;
    };
  }, [fila.crmDealId, fila.fase]);

  // Quién es el cliente: cuenta y contacto del trato. Si falla, el bloque enseña lo que ya trae la lista.
  useEffect(() => {
    setCliente(null);
    if (!fila.crmDealId) return;
    let vivo = true;
    clienteDelTratoApi(fila.crmDealId)
      .then((r) => vivo && setCliente(r.cliente))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [fila.crmDealId]);

  // Los cambios de fase hechos desde la app solo se piden al abrir la carpeta de actividad.
  useEffect(() => {
    if (carpeta !== "actividad" || !fila.crmDealId || cambios !== null) return;
    let vivo = true;
    cambiosDeFaseApi(fila.crmDealId)
      .then((r) => vivo && setCambios(r.cambios))
      .catch((e: unknown) => vivo && setErrorHistorial(e instanceof Error ? e.message : "No se pudo leer el historial."));
    return () => {
      vivo = false;
    };
  }, [carpeta, fila.crmDealId, cambios]);

  const ficha = crm?.ficha ?? null;
  const opcionesTotal = Math.max(trip.options.length, trip.chosen ?? 0);
  const eventos = useMemo(() => (listas ? eventosDelTrato(listas) : []), [listas]);
  const archivos = eventos.filter((e) => e.tipo === "adjunto");
  const actividad = eventos.filter((e) => e.tipo !== "adjunto");
  const sinPermiso = (listas ?? []).filter((l) => l.estado === "sin_permiso");
  const estadoDeArchivos: "cargando" | "ok" | "sin_leer" = errorListas
    ? "sin_leer"
    : listas === null
      ? "cargando"
      : listas.find((l) => l.lista === "Attachments")?.estado === "ok"
        ? "ok"
        : "sin_leer";
  const abrirArchivo = (adjuntoId: string, nombre: string) => {
    if (!fila.crmDealId) return;
    abrirAdjuntoDelCrm(fila.crmDealId, adjuntoId, nombre).catch((e: unknown) => onError(e instanceof Error ? e.message : "No se pudo abrir el archivo."));
  };

  const campo = (etiqueta: string) => ficha?.campos.grupos.flatMap((g) => g.campos).find((c) => c.etiqueta === etiqueta)?.valor ?? "";
  const personas = campo("Número de personas");
  const presupuestos = ficha?.presupuestos ?? [];
  const lineas = presupuestos.flatMap((p) => p.lineas);
  const aceptado = ficha?.aceptado ?? null;
  const hayAceptado = presupuestos.some((p) => p.aceptado);

  // Los proveedores salen de la tabla de servicios: los del presupuesto aceptado o, si no hay, los de todos.
  const proveedores = useMemo(() => {
    const mapa = new Map<string, { servicios: number; total: number; tipos: Set<string> }>();
    for (const p of presupuestos.filter((x) => x.aceptado || !hayAceptado)) {
      for (const l of p.lineas) {
        const nombre = l.proveedor || "Sin proveedor";
        const x = mapa.get(nombre) ?? { servicios: 0, total: 0, tipos: new Set<string>() };
        x.servicios += 1;
        x.total += l.total ?? 0;
        if (l.tipo) x.tipos.add(l.tipo);
        mapa.set(nombre, x);
      }
    }
    return [...mapa.entries()];
  }, [presupuestos, hayAceptado]);

  // El dinero: del presupuesto aceptado si lo hay; si no, lo que dice el trato.
  const total = aceptado?.total ?? fila.importe;
  const cobrado = aceptado && aceptado.depositoCobrado === "Si" ? (aceptado.deposito ?? 0) : 0;
  const porcentaje = total ? Math.min(100, Math.round((cobrado / total) * 100)) : 0;
  const pendiente = aceptado?.pendiente ?? (total != null ? total - cobrado : null);

  // La barra: las fases del embudo, en el orden del CRM.
  const fases = useMemo(() => {
    const delCrm = stages.length > 0 ? new Set(stages) : null;
    const embudo = (FASES_EN_ORDEN as readonly string[]).filter((f) => !delCrm || delCrm.has(f));
    return enElOrdenDelCrm(embudo, stages);
  }, [stages]);
  const actual = fases.indexOf(fila.fase ?? "");
  const quedan = actual >= 0 ? fases.length - 1 - actual : null;

  const carpetas: [Carpeta, string, number | null][] = [
    ["presupuesto", "Presupuesto en Zoho", ficha ? lineas.length : null],
    ["actividad", "Actividad", listas ? actividad.length : null],
    ["archivos", "Archivos", listas ? archivos.length : null],
    ["campos", "Campos del CRM", ficha ? ficha.campos.rellenos : null],
  ];
  const cuenta = cliente?.cuenta ?? null;
  const contacto = cliente?.contacto ?? null;

  return (
    <article className={`opc opx-c-${estado}`} style={estilo}>
      <header className="opc-cab">
        <div className="opc-cab__t">
          <p>{[fila.cuenta, fila.contacto].filter(Boolean).join(" · ") || "Sin cuenta"}</p>
          <h3>
            {fila.nombre || "(sin nombre)"}
            <span className="opc-fase" style={tinta ? { color: tinta } : undefined}>
              {fila.fase ?? "—"}
            </span>
          </h3>
        </div>
        <div className="opc-sig">
          <div>
            <small>Lo siguiente</small>
            <strong>{paso.texto || "Nada pendiente"}</strong>
            {textoDelCierre(fila, hoy) ? <span>{textoDelCierre(fila, hoy)}</span> : null}
          </div>
          {trato.dealUrl ? (
            <a className="opx-btn opx-btn--primario" href={trato.dealUrl} target="_blank" rel="noreferrer">
              Abrir en Zoho ↗
            </a>
          ) : null}
        </div>
        <div className="opc-cajas">
          <Caja
            rotulo="Llegada"
            valor={rango || "sin fecha"}
            nota={n !== null && n < 0 ? "fechas incoherentes en el CRM" : n !== null && n > 0 ? `${n} noches` : ""}
            tono={!rango || (n !== null && n < 0) ? "mal" : ""}
          />
          <Caja rotulo="Personas" valor={personas} nota={ficha && !personas ? "sin indicar en el CRM" : ""} />
          <Caja
            rotulo="Importe"
            valor={fila.importe ? euros(fila.importe) : "Sin importe"}
            nota={fila.importe ? (pendiente != null && aceptado ? `pendiente ${eur(pendiente)}` : "") : "falta en el CRM"}
            tono={fila.importe ? (aceptado && pendiente === 0 ? "bien" : "") : "mal"}
          />
          <Caja
            rotulo="Cierre previsto"
            valor={fila.cierre ? fechaLarga(fila.cierre) : "sin fecha"}
            nota={vencido !== null && vencido < 0 ? `vencido hace ${-vencido} d` : vencido !== null ? "en plazo" : ""}
            tono={vencido !== null && vencido < 0 ? "mal" : vencido !== null ? "bien" : ""}
          />
          <Caja rotulo="Propietario" valor={fila.propietario ?? ""} nota={fila.departamento ? (DEPARTAMENTOS[fila.departamento] ?? fila.departamento) : ""} />
        </div>
      </header>

      {fila.detalleRestringido ? (
        <p className="opx-nota">La propuesta de esta oportunidad es de otra persona de tu departamento: aquí ves lo que dice Zoho.</p>
      ) : null}
      {errorDelCrm ? <p className="opx-nota">{errorDelCrm}</p> : null}

      <section className="opc-fases" aria-label="Fase de la oportunidad">
        <div className="opc-fases__t">
          <small>Fase · pulsa una para mover la oportunidad</small>
          <small>{quedan === null ? "" : quedan > 0 ? `Quedan ${quedan} pasos por delante` : "Último paso"}</small>
        </div>
        <ol style={{ "--n": fases.length } as CSSProperties}>
          {fases.map((f, i) => (
            <li key={f} className={i < actual ? "is-hecho" : i === actual ? "is-actual" : ""} style={estiloDeFase(f, colores) as CSSProperties | undefined}>
              <button type="button" disabled={i === actual || !fila.crmDealId} aria-pressed={destino === f} title={i === actual ? "Está aquí" : `Mover a «${f}»`} onClick={() => setDestino(destino === f ? null : f)}>
                <i />
                <span>{f}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="opc-fases__lat">
          <small>O sacarla del embudo:</small>
          {FASES_LATERALES.map((f) => (
            <button key={f} type="button" className={`opx-atajo${fila.fase === f ? " is" : ""}`} disabled={fila.fase === f || !fila.crmDealId} onClick={() => setDestino(destino === f ? null : f)}>
              {f}
            </button>
          ))}
        </p>
        {destino ? (
          <div className="opc-mover">
            <MoverDeFase
              fila={fila}
              fasesDelCrm={stages}
              destino={destino}
              opciones={opcionesTotal > 0 ? { total: opcionesTotal, elegida: trip.chosen } : undefined}
              onHecho={(m) => {
                setCambios(null);
                setDestino(null);
                onCambio(m);
              }}
              onError={onError}
            />
            <button type="button" className="opx-btn" onClick={() => setDestino(null)}>
              Cancelar
            </button>
          </div>
        ) : null}
      </section>

      <div className="opc-cuerpo">
        <div className="opc-bloques">
          <Bloque letra="C" color="27, 61, 117" titulo="El cliente" extra={cuenta?.tipo}>
            <p className="opc-grande">{cuenta?.nombre || fila.cuenta || "Sin cuenta"}</p>
            <dl className="opc-dl">
              <Par rotulo="Teléfono">{cuenta?.telefono}</Par>
              <Par rotulo="Web">{cuenta?.web ? <a href={cuenta.web} target="_blank" rel="noreferrer">{webCorta(cuenta.web)}</a> : null}</Par>
              <Par rotulo="Ciudad">{cuenta?.ciudad}</Par>
              <Par rotulo="Correo">{cuenta?.correo ? <a href={`mailto:${cuenta.correo}`}>{cuenta.correo}</a> : null}</Par>
            </dl>
            <div className="opc-sub">
              <small>Contacto</small>
              <dl className="opc-dl">
                <Par rotulo="Nombre">
                  <b>{contacto?.nombre || fila.contacto || "—"}</b>
                  {contacto?.cargo ? ` · ${contacto.cargo}` : ""}
                </Par>
                <Par rotulo="Correo">{contacto?.correo ? <a href={`mailto:${contacto.correo}`}>{contacto.correo}</a> : null}</Par>
                <Par rotulo="Móvil">{contacto?.movil}</Par>
                <Par rotulo="Teléfono">{contacto?.telefono}</Par>
                <Par rotulo="Idioma">{contacto?.idioma}</Par>
              </dl>
            </div>
            {cliente?.tratos ? (
              <div className="opc-sub">
                <small>
                  {cliente.tratos.total} oportunidades con esta cuenta · {cliente.tratos.abiertas} abiertas
                </small>
                <p className="opc-mini">
                  {cliente.tratos.porFase.map((t) => (
                    <i key={t.fase}>
                      {t.fase} {t.n}
                    </i>
                  ))}
                </p>
              </div>
            ) : null}
          </Bloque>

          <Bloque letra="V" color="22, 138, 239" titulo="El viaje" extra={campo("Nro de Oportunidad")}>
            <p className={`opc-grande${n !== null && n < 0 ? " is-mal" : ""}`}>{rango || "Sin fecha de llegada"}</p>
            {n !== null && n < 0 ? <p className="opc-aviso">Las fechas no cuadran en el CRM: la salida es anterior a la llegada.</p> : null}
            <dl className="opc-dl">
              <Par rotulo="Noches">{n !== null && n > 0 ? n : null}</Par>
              <Par rotulo="Personas">{personas}</Par>
              <Par rotulo="Destino">{trip.destino || campo("País de Destino")}</Par>
              <Par rotulo="Grupo">{trip.grupo}</Par>
              <Par rotulo="Idioma">{campo("Idioma")}</Par>
            </dl>
            <div className="opc-sub">
              <small>Lo que se ofreció{hayAceptado || trip.chosen ? " · ya han elegido" : ""}</small>
              {presupuestos.length > 0 ? (
                presupuestos.map((p) => (
                  <div key={p.numero} className={`opc-opcion${p.aceptado ? " is" : ""}`}>
                    <div>
                      <b>Presupuesto {p.numero}</b>
                      {p.aceptado ? <span className="opc-sello">ACEPTADO</span> : null}
                      <small>{[...new Set(p.lineas.map((l) => l.tipo || l.servicio))].join(" · ")}</small>
                    </div>
                    <b>{eur(p.total)}</b>
                  </div>
                ))
              ) : trip.options.length > 0 ? (
                trip.options.map((o) => (
                  <div key={o.n} className={`opc-opcion${trip.chosen === o.n ? " is" : ""}`}>
                    <div>
                      <b>Opción {o.n}</b>
                      {trip.chosen === o.n ? <span className="opc-sello">ELEGIDA</span> : null}
                      <small>{o.name}</small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="opx-muted">{leyendoElCrm ? "Leyendo el CRM…" : "Ningún presupuesto cargado en el CRM todavía."}</p>
              )}
            </div>
          </Bloque>

          <Bloque letra="€" color="31, 122, 77" titulo="El dinero" extra={aceptado?.formaDeCobro || campo("Forma de Cobro")}>
            <p className={`opc-grande${total ? "" : " is-mal"}`}>{total ? eur(total) : "Sin importe en el CRM"}</p>
            {total ? (
              <div>
                <div className="opc-medidor">
                  <i style={{ width: `${porcentaje}%` }} />
                </div>
                <p className="opc-medidor__t">
                  Cobrado {eur(cobrado)} ({porcentaje} %){pendiente != null ? ` · pendiente ${eur(pendiente)}` : ""}
                </p>
              </div>
            ) : (
              <p className="opc-aviso">Sin importe no se puede calcular el depósito ni lo pendiente.</p>
            )}
            <dl className="opc-dl">
              {aceptado ? (
                <Par rotulo="Depósito">
                  {eur(aceptado.deposito)} · <b className={aceptado.depositoCobrado === "Si" ? "opx-t-ok" : "opx-vencido"}>{aceptado.depositoCobrado === "Si" ? "cobrado" : "sin cobrar"}</b>
                </Par>
              ) : null}
              <Par rotulo="Tipo de pago">{aceptado?.tipoDePago || campo("Tipo de pago")}</Par>
              <Par rotulo="PVP por viajero">{aceptado?.pvpPorViajero ? eur(aceptado.pvpPorViajero) : null}</Par>
              <Par rotulo="Reserva">{aceptado?.fechaDeReserva ? fechaLarga(aceptado.fechaDeReserva) : null}</Par>
            </dl>
            {ficha?.economiaVisible && aceptado?.coste != null ? (
              <div className="opc-sub">
                <small>Solo administradores</small>
                <dl className="opc-dl">
                  <Par rotulo="Coste">{eur(aceptado.coste)}</Par>
                  <Par rotulo="Margen">{aceptado.margen != null ? `${String(Math.round(aceptado.margen * 100) / 100).replace(".", ",")} %` : null}</Par>
                </dl>
              </div>
            ) : null}
          </Bloque>

          <Bloque letra="P" color="216, 148, 18" titulo="Proveedores" extra={proveedores.length > 0 ? String(proveedores.length) : undefined}>
            {proveedores.length > 0 ? (
              proveedores.map(([nombre, p]) => (
                <div key={nombre} className="opc-prov">
                  <div>
                    <b>{nombre}</b>
                    <small>
                      {p.servicios} {p.servicios === 1 ? "servicio" : "servicios"}
                      {p.tipos.size > 0 ? ` · ${[...p.tipos].join(", ")}` : ""}
                    </small>
                  </div>
                  <b>{eur(p.total)}</b>
                </div>
              ))
            ) : (
              <p className="opx-muted">{leyendoElCrm ? "Leyendo el CRM…" : "Aparecerán aquí cuando se rellene la tabla de servicios del presupuesto en Zoho."}</p>
            )}
          </Bloque>
        </div>

        <section className="opc-carp" aria-label="Carpetas de la oportunidad">
          <nav role="tablist" aria-label="Carpetas">
            {carpetas.map(([id, nombre, cuantos]) => (
              <button key={id} type="button" role="tab" aria-selected={carpeta === id} className={carpeta === id ? "is" : ""} onClick={() => setCarpeta(id)}>
                {nombre}
                {cuantos !== null ? <b>{cuantos}</b> : null}
              </button>
            ))}
          </nav>
          <div className="opc-carp__c">
            {carpeta === "presupuesto" ? (
              ficha ? (
                <>
                  <PresupuestosDelCrm presupuestos={ficha.presupuestos} hayAceptado={Boolean(ficha.aceptado)} />
                  {ficha.textoLibre ? (
                    <details className="opx-campos-wrap" open={ficha.presupuestos.length === 0}>
                      <summary>Texto de «Opciones de presupuesto» en el CRM</summary>
                      <pre>{ficha.textoLibre}</pre>
                    </details>
                  ) : null}
                </>
              ) : (
                <p className="opx-muted">{leyendoElCrm ? "Leyendo el CRM…" : "No se pudo leer el CRM."}</p>
              )
            ) : null}

            {carpeta === "actividad" ? (
              <>
                {listas === null ? <p className="opx-muted">{errorListas || "Leyendo el CRM…"}</p> : null}
                {sinPermiso.length > 0 ? (
                  <p className="opx-nota">
                    Zoho no deja leer {sinPermiso.map((l) => ({ Stage_History: "el historial de fases", Notes: "las notas", Attachments: "los archivos", Emails: "los correos" })[l.lista]).join(", ")}: a la
                    conexión de la app le falta el permiso de lectura. Hay que volver a autorizarla (en producción, con Mateo).
                  </p>
                ) : null}
                {listas !== null ? <LineaDeTiempoDelTrato eventos={actividad} /> : null}
                {listas === null && ficha ? <HitosDelCrm hitos={ficha.hitos} /> : null}
                <h4 className="opc-carp__h">Cambios de fase hechos desde la app</h4>
                {errorHistorial ? <p className="opx-muted">{errorHistorial}</p> : null}
                {cambios === null && !errorHistorial ? <p className="opx-muted">Cargando…</p> : null}
                {cambios !== null && cambios.length === 0 ? <p className="opx-muted">Todavía ninguno. Los que se hagan desde aquí quedarán con quién, cuándo y por qué.</p> : null}
                {cambios && cambios.length > 0 ? (
                  <ul className="opx-hist">
                    {cambios.map((c) => (
                      <li key={c.id} className={c.origen === "AUTOMATICO" ? "is-auto" : ""}>
                        <b>
                          {c.desde || "sin fase"} → {c.hasta}
                        </b>
                        <span>
                          {c.porNombre || (c.origen === "AUTOMATICO" ? "Automático" : "—")} · {fechaLarga(c.cuando)}
                          {c.motivo ? ` · «${c.motivo}»` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}

            {carpeta === "archivos" ? <ArchivosDelTrato eventos={eventos} estado={estadoDeArchivos} onAbrir={abrirArchivo} /> : null}

            {carpeta === "campos" ? ficha ? <TodosLosCampos campos={ficha.campos} /> : <p className="opx-muted">{leyendoElCrm ? "Leyendo el CRM…" : "No se pudo leer el CRM."}</p> : null}
          </div>
        </section>
      </div>
    </article>
  );
}
