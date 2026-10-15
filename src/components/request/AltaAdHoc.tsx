import { useState } from "react";
import {
  codigoDeRegimen,
  nuevoIdAdHoc,
  problemasDeLaActividad,
  problemasDelHotel,
  type ActividadAdHoc,
  type HotelAdHoc,
} from "../../domain/adHoc";

/**
 * Meter en la cotización un hotel o una actividad que no está en el catálogo,
 * con el precio que ha dado el proveedor.
 *
 * Ruth, 29/09/2026: «pegar el correo o el documento con la cotización del
 * proveedor cuando no hay tarifa cargada, y que mande sobre el catálogo. A
 * Sports le pasa siempre». Lo pegado se guarda tal cual en la propuesta como
 * origen del precio: así cualquiera puede comprobar de dónde sale.
 */

function numero(texto: string): number | null {
  const limpio = texto.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

interface PropsHotel {
  tipo: "hotel";
  localidadPorDefecto: string;
  regimenPorDefecto: string;
  onAnadir: (hotel: HotelAdHoc) => void;
  onCerrar: () => void;
}

interface PropsActividad {
  tipo: "actividad";
  onAnadir: (actividad: ActividadAdHoc) => void;
  onCerrar: () => void;
}

export function AltaAdHoc(props: PropsHotel | PropsActividad) {
  const [nombre, setNombre] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [localidad, setLocalidad] = useState(props.tipo === "hotel" ? props.localidadPorDefecto : "");
  const [regimen, setRegimen] = useState(props.tipo === "hotel" ? codigoDeRegimen(props.regimenPorDefecto) || "PC" : "");
  const [precio, setPrecio] = useState("");
  const [precioProfesor, setPrecioProfesor] = useState("");
  const [condiciones, setCondiciones] = useState("");
  const [origen, setOrigen] = useState("");
  const [problemas, setProblemas] = useState<string[]>([]);

  function anadir() {
    if (props.tipo === "hotel") {
      const hotel: HotelAdHoc = {
        id: nuevoIdAdHoc(),
        nombre,
        localidad,
        regimen,
        precioAlumno: numero(precio) ?? 0,
        precioProfesor: precioProfesor.trim() ? numero(precioProfesor) ?? 0 : null,
        condiciones,
        origen,
      };
      const faltan = problemasDelHotel(hotel);
      setProblemas(faltan);
      if (faltan.length === 0) props.onAnadir(hotel);
      return;
    }
    const actividad: ActividadAdHoc = {
      id: nuevoIdAdHoc(),
      nombre,
      proveedor,
      precioPorAlumno: numero(precio) ?? 0,
      descripcion: condiciones,
      origen,
    };
    const faltan = problemasDeLaActividad(actividad);
    setProblemas(faltan);
    if (faltan.length === 0) props.onAnadir(actividad);
  }

  const esHotel = props.tipo === "hotel";

  return (
    <div className="ah" role="region" aria-label={esHotel ? "Alojamiento fuera del catálogo" : "Actividad fuera del catálogo"}>
      <p className="ah__t">
        {esHotel ? "Alojamiento fuera del catálogo" : "Actividad fuera del catálogo"}
        <span>
          Con el precio que os ha dado el proveedor. Vale solo para esta cotización: no se añade al catálogo.
          {esHotel ? " Si el hotel ya está en el catálogo pero os han dado otro precio, ponlo aquí y elige este." : ""}
        </span>
      </p>

      <div className="ah__grid">
        <label className="cv__field">
          <span>{esHotel ? "Alojamiento" : "Actividad"}</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={esHotel ? "Hotel Planas" : "Visita a la bodega"} />
        </label>
        {esHotel ? (
          <>
            <label className="cv__field">
              <span>Dónde</span>
              <input value={localidad} onChange={(e) => setLocalidad(e.target.value)} placeholder="Salou" />
            </label>
            <label className="cv__field">
              <span>Régimen</span>
              <select value={regimen} onChange={(e) => setRegimen(e.target.value)}>
                <option value="PC">Pensión completa</option>
                <option value="MP">Media pensión</option>
                <option value="AD">Alojamiento y desayuno</option>
                <option value="SA">Solo alojamiento</option>
              </select>
            </label>
            <label className="cv__field">
              <span>Alumno y noche (€)</span>
              <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="45,50" />
            </label>
            <label className="cv__field">
              <span>Profesor y noche (€)</span>
              <input
                inputMode="decimal"
                value={precioProfesor}
                onChange={(e) => setPrecioProfesor(e.target.value)}
                placeholder="Vacío: el de los alumnos"
              />
            </label>
          </>
        ) : (
          <>
            <label className="cv__field">
              <span>Proveedor</span>
              <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Celler Mas Ferran" />
            </label>
            <label className="cv__field">
              <span>Por alumno (€)</span>
              <input inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="12" />
            </label>
          </>
        )}
      </div>

      <label className="cv__field ah__largo">
        <span>{esHotel ? "Condiciones (gratuidades, depósito, cancelación)" : "Qué incluye"}</span>
        <textarea rows={2} value={condiciones} onChange={(e) => setCondiciones(e.target.value)} />
      </label>
      <label className="cv__field ah__largo">
        <span>De dónde sale el precio · pega el correo o la cotización del proveedor (solo lo veis vosotros: no sale en el documento)</span>
        <textarea rows={3} value={origen} onChange={(e) => setOrigen(e.target.value)} />
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
        <button type="button" className="cv__ghost cv__ghost--sm" onClick={props.onCerrar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Lo ad hoc ya añadido, con su botón de quitar. */
export function ListaAdHoc({
  elementos,
  onQuitar,
}: {
  elementos: Array<{ id: string; nombre: string; detalle: string }>;
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
          <button type="button" className="cv__ghost cv__ghost--sm" onClick={() => onQuitar(e.id)}>
            Quitar
          </button>
        </li>
      ))}
    </ul>
  );
}
