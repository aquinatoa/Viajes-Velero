/**
 * Traer el correo de los buzones. Pieza C2.
 *
 * Entra por IMAP a `groups@` y `sports@`, se trae lo que no tenemos y lo guarda
 * emparejado con su viaje. No borra nada ni mueve nada: quien siga usando
 * Outlook tiene que ver su buzón exactamente igual que antes.
 *
 * Se lee por UID y se recuerda el último visto, que es la forma barata de no
 * traerse mil correos cada vez. Si el servidor reinicia su numeración
 * —`uidValidity` cambia—, se empieza de cero en esa carpeta, porque los UID
 * viejos ya no significan nada.
 *
 * Todo lo que hace es IDEMPOTENTE: pasarlo dos veces no duplica mensajes.
 * Importa porque esto va a correr en bucle y porque un reintento tras un corte
 * de red es lo normal, no la excepción.
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { PrismaClient } from "@prisma/client";
import { loadMailSettings, mailboxFor, type MailSettings } from "./mailConfig";
import { enviosParaEmparejar, guardarMensajeEntrante, type Buzon } from "./correoDb";

const prisma = new PrismaClient();

/**
 * Cuántos correos se traen como mucho de una carpeta en cada pasada.
 *
 * No es una preferencia: la primera vez que se mire un buzón con años de
 * correo, traerlo entero bloquearía el proceso y llenaría la base de cosas que
 * no interesan. Se van trayendo por tandas.
 */
const MAXIMO_POR_PASADA = 200;

/** Dónde se mira. El INBOX siempre; lo demás, si lo dicen en el `.env`. */
function carpetasDe(): string[] {
  const extra = (process.env.MAIL_CARPETAS ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return ["INBOX", ...extra];
}

export interface ResultadoDeLaPasada {
  buzon: Buzon;
  carpeta: string;
  mirados: number;
  guardados: number;
  emparejados: number;
  sinExpediente: number;
  error?: string;
}

/** Por dónde íbamos en esta carpeta. */
async function ultimoUidVisto(buzon: Buzon, carpeta: string, uidValidity: number): Promise<number> {
  const fila = await prisma.correoMensaje.findFirst({
    where: { buzon, carpeta, uidValidity, direccion: "ENTRANTE" },
    orderBy: { uid: "desc" },
    select: { uid: true },
  });
  return fila?.uid ?? 0;
}

/** El texto del correo, preferiblemente en plano. */
function cuerpoDe(correo: { text?: string; html?: string | false }): string {
  if (correo.text && correo.text.trim()) return correo.text;
  if (typeof correo.html === "string" && correo.html.trim()) {
    // Sin html-to-text: quitar etiquetas basta para leerlo y para buscar la
    // referencia dentro. Lo que se enseña en pantalla se decidirá en C4.
    return correo.html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return "";
}

/** Las direcciones de una cabecera, en texto. */
function direcciones(campo: unknown): string {
  const v = campo as { text?: string; value?: { address?: string }[] } | undefined;
  if (v?.text) return v.text;
  return (v?.value ?? []).map((d) => d.address ?? "").filter(Boolean).join(", ");
}

/**
 * Una pasada por una carpeta de un buzón.
 *
 * La conexión se cierra SIEMPRE, también si algo revienta a medias: un proceso
 * que corre cada pocos minutos y deja conexiones abiertas acaba echado por el
 * servidor de correo, y el síntoma —«de pronto dejó de traer correo»— no se
 * parece en nada a la causa.
 */
export async function traerDeUnaCarpeta(
  buzon: Buzon,
  carpeta: string,
  settings: MailSettings,
): Promise<ResultadoDeLaPasada> {
  const base: ResultadoDeLaPasada = {
    buzon, carpeta, mirados: 0, guardados: 0, emparejados: 0, sinExpediente: 0,
  };

  const box = mailboxFor(settings, buzon);
  if (!box.address || !box.appPassword) {
    return { ...base, error: "El buzón no tiene credenciales configuradas." };
  }

  const cliente = new ImapFlow({
    host: process.env.MAIL_IMAP_HOST ?? "imap.servidor-correo.net",
    port: Number(process.env.MAIL_IMAP_PORT ?? 993),
    secure: true,
    auth: { user: box.address, pass: box.appPassword },
    logger: false,
  });

  try {
    await cliente.connect();

    // En solo lectura: no marca nada como leído. Quien use Outlook tiene que
    // ver su buzón igual que si no existiéramos.
    const buzonAbierto = await cliente.mailboxOpen(carpeta, { readOnly: true });
    const uidValidity = Number(buzonAbierto.uidValidity);
    const desde = await ultimoUidVisto(buzon, carpeta, uidValidity);

    const envios = await enviosParaEmparejar();

    // `desde + 1` en adelante. Con el buzón vacío o recién estrenado esto no
    // devuelve nada y la pasada termina enseguida, que es lo que toca.
    const rango = `${desde + 1}:*`;
    let vistos = 0;

    for await (const mensaje of cliente.fetch(
      rango,
      { uid: true, envelope: true, source: true },
      { uid: true },
    )) {
      if (vistos >= MAXIMO_POR_PASADA) break;
      vistos += 1;
      base.mirados += 1;

      // `uid: '1:*'` devuelve al menos un mensaje aunque no haya ninguno nuevo:
      // el servidor da el último. Se descarta aquí.
      if (Number(mensaje.uid) <= desde) continue;

      const correo = await simpleParser(mensaje.source as Buffer);

      const resultado = await guardarMensajeEntrante(
        {
          buzon,
          carpeta,
          uid: Number(mensaje.uid),
          uidValidity,
          messageId: correo.messageId ?? null,
          inReplyTo: correo.inReplyTo ?? null,
          referencias: Array.isArray(correo.references)
            ? correo.references.join(" ")
            : correo.references ?? null,
          de: direcciones(correo.from) || "(sin remitente)",
          para: direcciones(correo.to),
          asunto: correo.subject ?? "(sin asunto)",
          cuerpo: cuerpoDe(correo),
          fecha: correo.date ?? new Date(),
        },
        envios,
      );

      if (resultado.guardado) {
        base.guardados += 1;
        if (resultado.emparejadoPor) base.emparejados += 1;
        else base.sinExpediente += 1;
      }
    }

    return base;
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  } finally {
    try {
      await cliente.logout();
    } catch {
      // Si el servidor ya cortó, no hay nada que cerrar.
    }
  }
}

/** Una pasada por los dos buzones y todas sus carpetas. */
export async function traerElCorreo(): Promise<ResultadoDeLaPasada[]> {
  const settings = loadMailSettings();
  const resultados: ResultadoDeLaPasada[] = [];

  for (const buzon of ["GROUPS", "SPORTS"] as Buzon[]) {
    for (const carpeta of carpetasDe()) {
      resultados.push(await traerDeUnaCarpeta(buzon, carpeta, settings));
    }
  }

  return resultados;
}

/**
 * El bucle que lo mantiene al día.
 *
 * Arranca con el servidor y se llama solo. No usa IDLE —la notificación en
 * vivo de IMAP— a propósito: con dos buzones y correo de colegios, mirar cada
 * pocos minutos sobra, y una conexión permanente es una cosa más que se cae de
 * madrugada sin que nadie lo vea.
 */
let enMarcha: NodeJS.Timeout | null = null;

export function arrancarLaRecogida(): void {
  const minutos = Number(process.env.MAIL_CADA_MINUTOS ?? 5);
  const settings = loadMailSettings();
  const box = mailboxFor(settings, "GROUPS");

  if (!box.address || !box.appPassword) {
    console.info("[correo] sin credenciales de buzón: no se recoge nada.");
    return;
  }
  if (enMarcha) return;

  const pasada = async () => {
    try {
      const r = await traerElCorreo();
      const nuevos = r.reduce((s, x) => s + x.guardados, 0);
      const sueltos = r.reduce((s, x) => s + x.sinExpediente, 0);
      const fallos = r.filter((x) => x.error);
      if (nuevos > 0) {
        console.info(`[correo] ${nuevos} mensaje(s) nuevo(s), ${sueltos} sin expediente.`);
      }
      for (const f of fallos) console.error(`[correo] ${f.buzon}/${f.carpeta}: ${f.error}`);
    } catch (error) {
      // El bucle no se puede morir por una pasada mala.
      console.error("[correo] la recogida falló entera", error);
    }
  };

  void pasada();
  enMarcha = setInterval(() => void pasada(), Math.max(1, minutos) * 60_000);
  enMarcha.unref?.();
  console.info(`[correo] recogida cada ${minutos} minuto(s).`);
}
