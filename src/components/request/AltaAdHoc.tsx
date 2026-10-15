import { useRef, useState, type DragEvent } from "react";
import {
  codigoDeRegimen,
  nuevoIdAdHoc,
  problemasDeLaActividad,
  problemasDelHotel,
  type ActividadAdHoc,
  type HotelAdHoc,
} from "../../domain/adHoc";
import {
  MARGEN_DEPORTIVO,
  MARGEN_GRUPOS,
  margenDelDepartamento,
  precioConMargen,
  type ContextoDeCotizacion,
  type LecturaDeCotizacion,
} from "../../domain/cotizacionDelProveedor";
import { descargarCotizacionDelProveedor, leerCotizacionDelProveedorApi } from "../../services/apiClient";

/**
 * Meter en la cotización un hotel o una actividad que no está en el catálogo,
 * con el precio que ha dado el proveedor.
 *
 * Javier, 29/09/2026: «no tenemos tarifas del hotel, pero a veces el proveedor
 * nos cotiza en el momento un correo. ¿Lo podremos copiar y pegar aquí y el
 * cotizador nos cotizará?». Anthony, 15/10/2026: «debe ser un adjuntar
 * documento, como el analizador de tarifas, pero más sencillo, porque ya
 * sabríamos de qué hoteles estamos subiendo la información».
 *
 * Así que primero va la cotización (el fichero o el correo pegado); la
 * aplicación la lee y propone el COSTE; el de venta sale con el margen del
 * departamento; y quien cotiza lo revisa antes de añadirlo. La cotización se
 * guarda como justificante, solo para Oravia.
 */

function numero(texto: string): number | null {
  const limpio = texto.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Un importe para el campo de texto: «45,5». */
function enCampo(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n).replace(".", ",");
}

function euros(n: number): string {
  return `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Lo que el sistema de ficheros acepta; lo demás se explica al leerlo. */
const ACEPTA = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.xlsm,.csv,.txt,.eml";

interface Comunes {
  /** Lo que ya se sabe de la petición: fechas, destino, grupo. */
  contexto: Omit<ContextoDeCotizacion, "tipo" | "nombre">;
  departamento: string;
  onCerrar: () => void;
}

interface PropsHotel extends Comunes {
  tipo: "hotel";
  onAnadir: (hotel: HotelAdHoc) => void;
}

interface PropsActividad extends Comunes {
  tipo: "actividad";
  onAnadir: (actividad: ActividadAdHoc) => void;
}

export function AltaAdHoc(props: PropsHotel | PropsActividad) {
  const esHotel = props.tipo === "hotel";
  const margenPorDefecto = margenDelDepartamento(props.departamento);

  // 1. La cotización
  const [archivo, setArchivo] = useState<File | null>(null);
  const [pegado, setPegado] = useState("");
  const [encima, setEncima] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lectura, setLectura] = useState<LecturaDeCotizacion | null>(null);
  const [justificante, setJustificante] = useState<{ id: string; documento: string | null } | null>(null);
  const [aMano, setAMano] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  // 2. La revisión
  const [nombre, setNombre] = useState("");
  const [donde, setDonde] = useState(esHotel ? props.contexto.destino : "");
  const [regimen, setRegimen] = useState(esHotel ? codigoDeRegimen(props.contexto.regimen) || "PC" : "");
  const [coste, setCoste] = useState("");
  const [costeProfesor, setCosteProfesor] = useState("");
  const [margen, setMargen] = useState<number>(margenPorDefecto);
  const [condiciones, setCondiciones] = useState("");
  const [problemas, setProblemas] = useState<string[]>([]);

  const costeN = numero(coste);
  const costeProfesorN = costeProfesor.trim() ? numero(costeProfesor) : null;
  const venta = costeN && costeN > 0 ? precioConMargen(costeN, margen) : null;
  const ventaProfesor = costeProfesorN && costeProfesorN > 0 ? precioConMargen(costeProfesorN, margen) : null;
  const revisando = Boolean(lectura) || aMano;

  function elegir(fichero: File | null | undefined) {
    if (!fichero) return;
    setArchivo(fichero);
    setError(null);
  }

  function soltar(evento: DragEvent<HTMLLabelElement>) {
    evento.preventDefault();
    setEncima(false);
    elegir(evento.dataTransfer.files?.[0]);
  }

  async function leer() {
    if (!archivo && !pegado.trim()) {
      setError("Adjunta la cotización del proveedor o pega su correo.");
      return;
    }
    setLeyendo(true);
    setError(null);
    try {
      const r = await leerCotizacionDelProveedorApi(
        { ...props.contexto, tipo: props.tipo, nombre: nombre.trim() },
        archivo,
        pegado,
      );
      setJustificante({ id: r.id, documento: r.documento });
      setLectura(r.lectura);
      // Lo que se haya escrito a mano manda sobre lo leído.
      if (!nombre.trim() && r.lectura.nombre) setNombre(r.lectura.nombre);
      if (r.lectura.dondeOProveedor && (!donde.trim() || !esHotel)) setDonde(r.lectura.dondeOProveedor);
      if (esHotel && r.lectura.regimen) setRegimen(r.lectura.regimen);
      setCoste(enCampo(r.lectura.coste));
      setCosteProfesor(enCampo(r.lectura.costeProfesor));
      if (r.lectura.condiciones) setCondiciones(r.lectura.condiciones);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la cotización.");
    } finally {
      setLeyendo(false);
    }
  }

  function anadir() {
    const faltaCoste = !(costeN && costeN > 0)
      ? [esHotel ? "Falta el coste por alumno y noche." : "Falta el coste por alumno."]
      : [];
    const comun = {
      id: nuevoIdAdHoc(),
      nombre,
      origen: pegado,
      margen,
      cotizacionId: justificante?.id ?? null,
      documento: justificante?.documento ?? null,
    };
    if (props.tipo === "hotel") {
      const hotel: HotelAdHoc = {
        ...comun,
        localidad: donde,
        regimen,
        precioAlumno: venta ?? 0,
        precioProfesor: costeProfesor.trim() ? ventaProfesor ?? 0 : null,
        costeAlumno: costeN,
        costeProfesor: costeProfesorN,
        condiciones,
      };
      const faltan = [...faltaCoste, ...problemasDelHotel(hotel).filter((p) => !p.includes("precio por alumno"))];
      setProblemas(faltan);
      if (faltan.length === 0) props.onAnadir(hotel);
      return;
    }
    const actividad: ActividadAdHoc = {
      ...comun,
      proveedor: donde,
      precioPorAlumno: venta ?? 0,
      coste: costeN,
      descripcion: condiciones,
    };
    const faltan = [...faltaCoste, ...problemasDeLaActividad(actividad).filter((p) => !p.includes("precio por alumno"))];
    setProblemas(faltan);
    if (faltan.length === 0) props.onAnadir(actividad);
  }

  const titulo = esHotel ? "Alojamiento fuera del catálogo" : "Actividad fuera del catálogo";

  return (
    <div className="ah" role="region" aria-label={titulo}>
      <p className="ah__t">
        {titulo}
        <span>
          Adjunta la cotización que os ha mandado el proveedor o pega su correo: la leo, te propongo el coste y le
          pongo vuestro margen. Revísalo antes de añadirlo. Vale solo para esta cotización: no entra en el catálogo.
          {esHotel ? " Si el hotel ya está en el catálogo, este lo sustituye." : ""}
        </span>
      </p>

      {/* 1 · La cotización del proveedor */}
      <div className="ah__paso">
        <p className="ah__n">
          <b>1</b> La cotización del proveedor
        </p>
        <label className="cv__field">
          <span>{esHotel ? "¿De qué hotel? (si lo dejas vacío, lo saco del documento)" : "¿Qué actividad? (si lo dejas vacío, la saco del documento)"}</span>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={esHotel ? "Hotel Planas" : "Visita a la bodega"}
          />
        </label>

        <label
          className={`ah__drop${encima ? " on" : ""}${archivo ? " lleno" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={soltar}
        >
          <input
            ref={entrada}
            type="file"
            accept={ACEPTA}
            hidden
            onChange={(e) => {
              elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {archivo ? (
            <>
              <b>{archivo.name}</b>
              <small>{Math.max(1, Math.round(archivo.size / 1024)).toLocaleString("es-ES")} KB · pulsa para cambiarlo</small>
            </>
          ) : (
            <>
              <b>Arrastra aquí la cotización o pulsa para buscarla</b>
              <small>PDF, foto o captura, Excel o correo guardado (.eml)</small>
            </>
          )}
        </label>
        {archivo ? (
          <button type="button" className="cv__ghost cv__ghost--sm ah__quitar" onClick={() => setArchivo(null)}>
            Quitar el archivo
          </button>
        ) : null}

        <label className="cv__field ah__largo">
          <span>… o pega aquí el correo del proveedor</span>
          <textarea
            rows={3}
            value={pegado}
            onChange={(e) => setPegado(e.target.value)}
            placeholder="Buenos días, para el grupo del 12 al 15 de marzo os podemos ofrecer…"
          />
        </label>

        {error ? <p className="ah__error">{error}</p> : null}

        <div className="ah__acc">
          <button type="button" className="cv__primary cv__primary--sm" onClick={leer} disabled={leyendo}>
            {leyendo ? "Leyendo la cotización…" : lectura ? "Volver a leer" : "Leer la cotización"}
          </button>
          {!revisando ? (
            <button type="button" className="cv__ghost cv__ghost--sm" onClick={() => setAMano(true)}>
              Prefiero ponerlo a mano
            </button>
          ) : null}
          <button type="button" className="cv__ghost cv__ghost--sm" onClick={props.onCerrar}>
            Cancelar
          </button>
        </div>
      </div>

      {/* 2 · Revisar y añadir */}
      {revisando ? (
        <div className="ah__paso">
          <p className="ah__n">
            <b>2</b> Revisa y añade
          </p>

          {lectura && lectura.avisos.length > 0 ? (
            <ul className="ah__avisos">
              {lectura.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : null}
          {lectura?.cita ? (
            <p className="ah__cita">
              Sale de: <q>{lectura.cita}</q>
            </p>
          ) : null}
          {lectura?.iva === "no incluido" ? (
            <p className="ah__avisos ah__avisos--uno">El proveedor dice que el IVA va aparte: el coste de abajo no lo lleva.</p>
          ) : null}
          {justificante ? (
            <p className="ah__just">
              Justificante guardado:{" "}
              <button
                type="button"
                className="ah__enlace"
                onClick={() => void descargarCotizacionDelProveedor(justificante.id, justificante.documento)}
              >
                {justificante.documento ?? "el correo pegado"}
              </button>{" "}
              · solo lo veis vosotros, no sale en el documento del colegio
            </p>
          ) : null}

          <div className="ah__grid">
            <label className="cv__field">
              <span>{esHotel ? "Alojamiento" : "Actividad"}</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
            <label className="cv__field">
              <span>{esHotel ? "Dónde" : "Proveedor"}</span>
              <input value={donde} onChange={(e) => setDonde(e.target.value)} placeholder={esHotel ? "Salou" : "Celler Mas Ferran"} />
            </label>
            {esHotel ? (
              <label className="cv__field">
                <span>Régimen</span>
                <select value={regimen} onChange={(e) => setRegimen(e.target.value)}>
                  <option value="PC">Pensión completa</option>
                  <option value="MP">Media pensión</option>
                  <option value="AD">Alojamiento y desayuno</option>
                  <option value="SA">Solo alojamiento</option>
                </select>
              </label>
            ) : null}
          </div>

          <div className="ah__grid">
            <label className="cv__field">
              <span>{esHotel ? "Coste alumno y noche (€)" : "Coste por alumno (€)"}</span>
              <input inputMode="decimal" value={coste} onChange={(e) => setCoste(e.target.value)} placeholder="42,00" />
            </label>
            {esHotel ? (
              <label className="cv__field">
                <span>Coste profesor y noche (€)</span>
                <input
                  inputMode="decimal"
                  value={costeProfesor}
                  onChange={(e) => setCosteProfesor(e.target.value)}
                  placeholder="Vacío: el de los alumnos"
                />
              </label>
            ) : null}
            <div className="cv__field">
              <span>Margen</span>
              <div className="ah__margen">
                {[MARGEN_GRUPOS, MARGEN_DEPORTIVO].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`alta__chip${margen === m ? " on" : ""}`}
                    onClick={() => setMargen(m)}
                  >
                    {m} %<em>{m === MARGEN_DEPORTIVO ? "Deportivo" : "Grupos"}</em>
                  </button>
                ))}
                <input
                  inputMode="decimal"
                  aria-label="Otro margen, en %"
                  placeholder="Otro %"
                  value={margen === MARGEN_GRUPOS || margen === MARGEN_DEPORTIVO ? "" : enCampo(margen)}
                  onChange={(e) => setMargen(numero(e.target.value) ?? margenPorDefecto)}
                />
              </div>
            </div>
          </div>

          <p className="ah__venta">
            {venta ? (
              <>
                Precio al colegio: <b>{euros(venta)}</b> {esHotel ? "alumno y noche" : "por alumno"}
                {esHotel ? (
                  <>
                    {" · "}
                    <b>{euros(ventaProfesor ?? venta)}</b> profesor y noche
                  </>
                ) : null}
                <small> (coste + {margen.toLocaleString("es-ES")} %)</small>
              </>
            ) : (
              <>Pon el coste y te calculo el precio al colegio.</>
            )}
          </p>

          <label className="cv__field ah__largo">
            <span>{esHotel ? "Condiciones (gratuidades, depósito, cancelación) · salen en el documento" : "Qué incluye · sale en el documento"}</span>
            <textarea rows={2} value={condiciones} onChange={(e) => setCondiciones(e.target.value)} />
          </label>

          {problemas.length > 0 ? (
            <ul className="ah__problemas">
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}

          <div className="ah__acc">
            <button type="button" className="cv__primary cv__primary--sm" onClick={anadir}>
              {esHotel ? "Añadir alojamiento" : "Añadir actividad"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Lo ad hoc ya añadido, con su botón de quitar y su justificante. */
export function ListaAdHoc({
  elementos,
  onQuitar,
}: {
  elementos: Array<{ id: string; nombre: string; detalle: string; cotizacionId?: string | null; documento?: string | null }>;
  onQuitar: (id: string) => void;
}) {
  if (elementos.length === 0) return null;
  return (
    <ul className="ah__lista">
      {elementos.map((e) => (
        <li key={e.id}>
          <span className="cv__actchip cv__actchip--top">Ad hoc</span>
          <b>{e.nombre}</b>
          <span>{e.detalle}</span>
          {e.cotizacionId ? (
            <button
              type="button"
              className="ah__enlace"
              onClick={() => void descargarCotizacionDelProveedor(e.cotizacionId as string, e.documento ?? null)}
            >
              Ver cotización
            </button>
          ) : null}
          <button type="button" className="cv__ghost cv__ghost--sm" onClick={() => onQuitar(e.id)}>
            Quitar
          </button>
        </li>
      ))}
    </ul>
  );
}
