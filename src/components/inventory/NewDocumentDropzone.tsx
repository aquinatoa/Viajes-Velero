import { useMemo, useRef, useState } from "react";
import type {
  ClientSegment,
  InventoryTargetType,
  RateKind,
} from "../../domain/documentImportTypes";
import { DEFAULT_MARGIN_PERCENT } from "../../domain/documentImportTypes";
import {
  analyzeInventoryDocumentApi,
  analyzeInventoryDocumentWithAiApi,
  createInventoryDocumentApi,
  createInventoryDocumentStagingApi,
  uploadInventoryDocumentFileApi,
} from "../../services/apiClient";
import { getErrorMessage } from "./inventoryFormatting";

/**
 * Alta de un documento de tarifas: el archivo primero.
 *
 * El orden anterior era al revés —rellenar una ficha de siete campos, guardar,
 * y solo entonces subir el PDF y acertar con tres botones en el orden correcto—.
 * Aquí sueltas el archivo, la aplicación deduce lo que puede de su nombre, y
 * solo pregunta lo que de verdad no puede saber: si los precios son de compra o
 * de venta. Un botón hace el resto de la cadena.
 */

const PASOS = [
  { key: "creando", label: "Registrando el documento" },
  { key: "subiendo", label: "Subiendo el archivo" },
  { key: "texto", label: "Sacando el texto" },
  { key: "ia", label: "Entendiendo las tarifas" },
  { key: "revision", label: "Preparando la revisión" },
] as const;

type PasoKey = (typeof PASOS)[number]["key"];

/** Ejemplo con el que se enseña la consecuencia de elegir compra o venta. */
const COSTE_EJEMPLO = 65;

/**
 * Saca del nombre del archivo lo que se pueda: la temporada y un nombre legible.
 * No adivina precios ni tipos de tarifa — eso lo decide siempre una persona.
 */
function deducirDelNombre(fileName: string) {
  const sinExtension = fileName.replace(/\.[a-z0-9]+$/i, "");

  // Temporada: un año de 4 cifras entre 2020 y 2039 en cualquier parte del nombre.
  const año = sinExtension.match(/\b(20[2-3]\d)\b/);

  // Nombre legible: se quitan separadores, el año y el ruido típico de descarga.
  const nombre = sinExtension
    .replace(/[_\-]+/g, " ")
    .replace(/\b20[2-3]\d\b/g, "")
    .replace(/\[\d+\]|\(\d+\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    año: año ? Number(año[1]) : null,
    nombre: nombre.length > 2 ? nombre : sinExtension,
  };
}

function formatearEuros(valor: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(valor);
}

interface Props {
  /** Se llama al terminar, para refrescar la lista. */
  onDone: (documentId: string) => void | Promise<void>;
  onCancel: () => void;
}

export function NewDocumentDropzone({ onDone, onCancel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const [nombre, setNombre] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [año, setAño] = useState<number | null>(null);
  const [tipo, setTipo] = useState<InventoryTargetType>("ACCOMMODATION");

  const [rateKind, setRateKind] = useState<RateKind>("PURCHASE");
  const [margen, setMargen] = useState<number>(DEFAULT_MARGIN_PERCENT);
  const [cliente, setCliente] = useState<ClientSegment>("GENERIC");

  const [paso, setPaso] = useState<PasoKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trabajando = paso !== null;

  function aceptarArchivo(elegido: File | undefined) {
    if (!elegido) return;
    const deducido = deducirDelNombre(elegido.name);
    setFile(elegido);
    setNombre(deducido.nombre);
    setAño(deducido.año);
    setError(null);
  }

  function quitarArchivo() {
    setFile(null);
    setNombre("");
    setAño(null);
    setUbicacion("");
    if (inputRef.current) inputRef.current.value = "";
  }

  // Consecuencia de la elección. En un documento de compra hay una cuenta que
  // enseñar; en uno de venta no la hay, y decir "65 € se guardará como 65 €" es
  // una perogrullada. Ahí lo que importa es a quién se le ofrecerá el precio.
  const ejemplo = useMemo(() => {
    if (rateKind === "PURCHASE") {
      const venta = Math.round(COSTE_EJEMPLO * (1 + margen / 100) * 100) / 100;
      return `Un coste de ${formatearEuros(COSTE_EJEMPLO)} entrará al catálogo como ${formatearEuros(
        venta,
      )} de venta. El comercial podrá ajustarlo en cada presupuesto.`;
    }
    if (cliente === "SWISS_TTOO") {
      return "Los precios entran tal cual, sin margen. Y solo se ofrecerán al turoperador suizo: no aparecerán al cotizar para ningún otro cliente.";
    }
    return "Los precios entran tal cual, sin margen. Se ofrecerán al cotizar para colegios, clubes y agencias.";
  }, [rateKind, margen, cliente]);

  const puedeEnviar = Boolean(file) && nombre.trim().length > 0 && !trabajando;

  async function handleSubmit() {
    if (!file || !nombre.trim()) return;
    setError(null);

    try {
      setPaso("creando");
      const documento = await createInventoryDocumentApi({
        targetType: tipo,
        controlName: nombre.trim(),
        controlLocation: ubicacion.trim() || undefined,
        controlYear: año,
        rateKind,
        marginPercent: rateKind === "PURCHASE" ? margen : null,
        clientSegment: rateKind === "SALE" ? cliente : null,
      });

      setPaso("subiendo");
      await uploadInventoryDocumentFileApi(documento.id, file);

      setPaso("texto");
      await analyzeInventoryDocumentApi(documento.id);

      setPaso("ia");
      await analyzeInventoryDocumentWithAiApi(documento.id);

      setPaso("revision");
      await createInventoryDocumentStagingApi(documento.id);

      await onDone(documento.id);
    } catch (caught) {
      setError(
        getErrorMessage(
          caught,
          "No se pudo completar el alta. El documento puede haber quedado a medias: búscalo en la lista.",
        ),
      );
    } finally {
      setPaso(null);
    }
  }

  const pasoActual = PASOS.findIndex((p) => p.key === paso);

  return (
    <section className="alta" aria-label="Subir tarifas">
      {/* ---------- 1 · el archivo ---------- */}
      {!file ? (
        <div
          className={`alta__drop${arrastrando ? " is-over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(event) => {
            event.preventDefault();
            setArrastrando(false);
            aceptarArchivo(event.dataTransfer.files?.[0]);
          }}
        >
          <span className="alta__drop-ico" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="44" height="44" fill="none" aria-hidden="true">
              <path
                d="M14 40a8 8 0 0 1-.6-16A12 12 0 0 1 36 21.5a7.5 7.5 0 0 1-.5 18.5H14Z"
                fill="currentColor"
                opacity=".16"
              />
              <path
                d="M24 33V17m0 0-6 6m6-6 6 6"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <p className="alta__drop-title">Suelta aquí el PDF de tarifas</p>
          <p className="alta__drop-sub">o elígelo de tu ordenador · PDF y Excel, hasta 25 MB</p>
          <button type="button" className="alta__drop-btn" onClick={() => inputRef.current?.click()}>
            Elegir archivo
          </button>
          <input
            ref={inputRef}
            type="file"
            className="alta__file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*"
            onChange={(event) => aceptarArchivo(event.target.files?.[0])}
          />
        </div>
      ) : (
        <>
          <div className="alta__file-card">
            <span className="alta__file-ico" aria-hidden="true">
              {file.name.toLowerCase().endsWith(".pdf") ? "PDF" : "DOC"}
            </span>
            <span className="alta__file-txt">
              <b>{file.name}</b>
              <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
            </span>
            <button
              type="button"
              className="alta__file-x"
              disabled={trabajando}
              onClick={quitarArchivo}
            >
              Cambiar
            </button>
          </div>

          {/* ---------- 2 · lo que se ha deducido ---------- */}
          <div className="alta__auto">
            <span className="alta__auto-tag">Sacado del nombre del archivo</span>
            <div className="alta__auto-fields">
              <label>
                <span>Nombre</span>
                <input
                  value={nombre}
                  disabled={trabajando}
                  onChange={(event) => setNombre(event.target.value)}
                />
              </label>
              <label>
                <span>Temporada</span>
                <input
                  type="number"
                  value={año ?? ""}
                  disabled={trabajando}
                  placeholder="2027"
                  onChange={(event) =>
                    setAño(event.target.value ? Number(event.target.value) : null)
                  }
                />
              </label>
              <label>
                <span>Dónde está</span>
                <input
                  value={ubicacion}
                  disabled={trabajando}
                  placeholder="Salou, Cambrils…"
                  onChange={(event) => setUbicacion(event.target.value)}
                />
              </label>
              <label>
                <span>Qué es</span>
                <select
                  value={tipo}
                  disabled={trabajando}
                  onChange={(event) => setTipo(event.target.value as InventoryTargetType)}
                >
                  <option value="ACCOMMODATION">Alojamiento</option>
                  <option value="ACTIVITY">Actividad</option>
                  <option value="MIXED">Las dos cosas</option>
                </select>
              </label>
            </div>
          </div>

          {/* ---------- 3 · la única pregunta que importa ---------- */}
          <div className="alta__ask">
            <h4>¿Qué precios trae este documento?</h4>
            <div className="alta__cards" role="radiogroup" aria-label="Qué precios trae">
              <button
                type="button"
                role="radio"
                aria-checked={rateKind === "PURCHASE"}
                className={`alta__card${rateKind === "PURCHASE" ? " on" : ""}`}
                disabled={trabajando}
                onClick={() => setRateKind("PURCHASE")}
              >
                <span className="alta__card-k">De compra</span>
                <span className="alta__card-d">
                  Lo que os cuesta a vosotros. La aplicación le añadirá vuestro margen.
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={rateKind === "SALE"}
                className={`alta__card${rateKind === "SALE" ? " on" : ""}`}
                disabled={trabajando}
                onClick={() => setRateKind("SALE")}
              >
                <span className="alta__card-k">De venta</span>
                <span className="alta__card-d">
                  Lo que cobráis al cliente. Se guarda tal cual, sin tocar.
                </span>
              </button>
            </div>

            {rateKind === "PURCHASE" ? (
              <div className="alta__sub">
                <span className="alta__sub-q">¿Qué margen le aplicamos?</span>
                <div className="alta__chips">
                  {[8, 12].map((valor) => (
                    <button
                      key={valor}
                      type="button"
                      className={`alta__chip${margen === valor ? " on" : ""}`}
                      disabled={trabajando}
                      onClick={() => setMargen(valor)}
                    >
                      {valor}&nbsp;%
                      <em>{valor === 8 ? "el habitual" : "Deportivo"}</em>
                    </button>
                  ))}
                  <label className="alta__chip alta__chip--free">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={margen === 8 || margen === 12 ? "" : margen}
                      disabled={trabajando}
                      placeholder="Otro"
                      onChange={(event) =>
                        setMargen(event.target.value ? Number(event.target.value) : 0)
                      }
                    />
                    <span>%</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="alta__sub">
                <span className="alta__sub-q">¿Para qué cliente es esta tarifa?</span>
                <div className="alta__chips">
                  <button
                    type="button"
                    className={`alta__chip${cliente === "GENERIC" ? " on" : ""}`}
                    disabled={trabajando}
                    onClick={() => setCliente("GENERIC")}
                  >
                    Cualquier cliente
                    <em>colegios, clubes, agencias</em>
                  </button>
                  <button
                    type="button"
                    className={`alta__chip${cliente === "SWISS_TTOO" ? " on" : ""}`}
                    disabled={trabajando}
                    onClick={() => setCliente("SWISS_TTOO")}
                  >
                    Turoperador suizo
                    <em>Destination · Travelclub</em>
                  </button>
                </div>
              </div>
            )}

            {/* La consecuencia, en dinero. Explica el margen sin explicarlo. */}
            <p className="alta__example">{ejemplo}</p>
          </div>

          {/* ---------- 4 · una sola acción ---------- */}
          {error ? <p className="alta__error">{error}</p> : null}

          {trabajando ? (
            <ol className="alta__steps">
              {PASOS.map((p, index) => (
                <li
                  key={p.key}
                  className={index < pasoActual ? "is-done" : index === pasoActual ? "is-now" : ""}
                >
                  {p.label}
                </li>
              ))}
            </ol>
          ) : null}

          <div className="alta__go">
            <button type="button" className="primary" disabled={!puedeEnviar} onClick={() => void handleSubmit()}>
              {trabajando ? "Trabajando…" : "Subir y leer"}
            </button>
            <button type="button" disabled={trabajando} onClick={onCancel}>
              Cancelar
            </button>
            <span className="alta__go-hint">
              {trabajando
                ? "No cierres la pestaña: la lectura tarda un par de minutos."
                : "Lo sube, lo lee y te deja las tarifas listas para revisar."}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
