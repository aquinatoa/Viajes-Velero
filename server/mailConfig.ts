/**
 * Configuración de correo saliente, por departamento.
 *
 * Cada departamento (Groups y Sports) envía desde SU buzón compartido, no desde
 * una dirección genérica. Es un requisito del cliente, no una preferencia: Zoho
 * solo vincula a la oportunidad los correos que pasan por la cuenta que tiene
 * sincronizada, así que si la propuesta sale de otro sitio, desaparece del
 * historial del trato (confirmado por el soporte de Zoho, reunión del 17/06).
 *
 * MIENTRAS NO HAYA CREDENCIALES la app funciona igual en "modo simulación":
 * genera el correo y el PDF, los guarda y marca la entrega como SIMULATED. Para
 * encenderlo de verdad solo hay que rellenar las claves en el `.env`; no hay que
 * tocar código.
 */

export type MailDepartment = "GROUPS" | "SPORTS";

export interface DepartmentMailbox {
  /** Remitente: groups@… o sports@… */
  address: string;
  /** Nombre visible en la bandeja del cliente. */
  displayName: string;
  /** Clave de aplicación de Zoho Mail. Vacío = modo simulación. */
  appPassword: string;
  host: string;
  port: number;
  secure: boolean;
}

export interface MailSettings {
  mailboxes: Record<MailDepartment, DepartmentMailbox>;
  /**
   * Dominio de las direcciones por expediente (fase 6). Si está vacío, el
   * "responder a" es el propio buzón y la referencia viaja solo en el asunto.
   */
  perTripReplyDomain: string;
  /** Base pública de la app, para el enlace de la propuesta. Vacío hasta Azure. */
  publicBaseUrl: string;
  /** A dónde van los correos mientras se prueba. Vacío = al destinatario real. */
  testRecipient: string;
}

function mailbox(prefix: string, fallbackName: string): DepartmentMailbox {
  return {
    address: process.env[`${prefix}_ADDRESS`] ?? "",
    displayName: process.env[`${prefix}_NAME`] ?? fallbackName,
    appPassword: process.env[`${prefix}_APP_PASSWORD`] ?? "",
    host: process.env.MAIL_HOST ?? "smtp.zoho.eu",
    port: Number(process.env.MAIL_PORT ?? 465),
    secure: (process.env.MAIL_SECURE ?? "true") !== "false",
  };
}

export function loadMailSettings(): MailSettings {
  return {
    mailboxes: {
      GROUPS: mailbox("MAIL_GROUPS", "Oravia Travel Group"),
      SPORTS: mailbox("MAIL_SPORTS", "Oravia Sports"),
    },
    perTripReplyDomain: process.env.MAIL_PER_TRIP_DOMAIN ?? "",
    publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, ""),
    testRecipient: process.env.MAIL_TEST_RECIPIENT ?? "",
  };
}

/** ¿Este buzón puede enviar de verdad, o toca simular? */
export function canSend(box: DepartmentMailbox): boolean {
  return Boolean(box.address && box.appPassword);
}

/**
 * Buzón que corresponde a un departamento. Un usuario global (sin departamento)
 * envía por Groups, que es el buzón principal según el cliente.
 */
export function mailboxFor(settings: MailSettings, department?: string | null): DepartmentMailbox {
  return department === "SPORTS" ? settings.mailboxes.SPORTS : settings.mailboxes.GROUPS;
}

/**
 * Dirección de respuesta de una propuesta concreta. Con dominio por expediente
 * configurado devuelve `groups+ORV-2026-0184@dominio`, que es lo que permite
 * reconocer el viaje sin depender de que Zoho acierte. Sin él, el propio buzón.
 */
export function replyToFor(
  settings: MailSettings,
  box: DepartmentMailbox,
  reference: string,
): string {
  if (!settings.perTripReplyDomain || !box.address) return box.address;
  const local = box.address.split("@")[0];
  return `${local}+${reference}@${settings.perTripReplyDomain}`;
}
