import "./loadEnv";
// El embudo vive en `crmPipeline`, que a su vez importa de aquí dos funciones.
// El ciclo es inocuo: ninguno de los dos módulos LEE lo del otro mientras se
// evalúa, solo dentro de funciones que se llaman después. Si algún día uno de
// los dos usa lo importado en su cuerpo, habrá que sacar el embudo a su propio
// módulo.
import { FASES } from "./crmPipeline";
type ZohoTokenResponse = {
  access_token: string;
  refresh_token?: string;
  api_domain?: string;
  token_type: string;
  expires_in: number;
  error?: string;
};

type ZohoRecordResponse<T> = {
  data?: T[];
  message?: string;
  code?: string;
};

type CachedAuth = {
  accessToken: string;
  expiresAt: number;
  apiDomain: string;
};

const zohoConfig = {
  apiDomain: process.env.ZOHO_API_DOMAIN ?? "https://www.zohoapis.eu",
  accountsDomain: process.env.ZOHO_ACCOUNTS_DOMAIN ?? "https://accounts.zoho.eu",
  clientId: process.env.ZOHO_CLIENT_ID ?? "",
  clientSecret: process.env.ZOHO_CLIENT_SECRET ?? "",
  refreshToken: process.env.ZOHO_REFRESH_TOKEN ?? "",
  redirectUri: process.env.ZOHO_REDIRECT_URI ?? "http://localhost:5173/callback",
  contactsModule: process.env.ZOHO_CONTACTS_MODULE ?? "Contacts",
  accountsModule: process.env.ZOHO_ACCOUNTS_MODULE ?? "Accounts",
  dealsModule: process.env.ZOHO_DEALS_MODULE ?? "Deals",
  // Primera fase del embudo de Oravia. Antes ponía «Nueva», que NO existe en su
  // picklist: los tratos nacían con una fase inventada y se quedaban ahí.
  // El resto del recorrido lo mueve `crmPipeline.ts`.
  dealStage: process.env.ZOHO_DEAL_STAGE ?? "Preparando Presupuesto",
  dealOptionsField: process.env.ZOHO_DEAL_OPTIONS_FIELD ?? "Description",
  approvedOptionField: process.env.ZOHO_APPROVED_OPTION_FIELD ?? ""
};

let runtimeRefreshToken = zohoConfig.refreshToken;
let cachedAuth: CachedAuth | null = null;

export class ZohoReauthRequiredError extends Error {
  authUrl: string;

  constructor(message: string) {
    super(message);
    this.name = "ZohoReauthRequiredError";
    this.authUrl = getZohoAuthUrl();
  }
}

function ensureZohoConfig() {
  const required = [
    ["ZOHO_CLIENT_ID", zohoConfig.clientId],
    ["ZOHO_CLIENT_SECRET", zohoConfig.clientSecret],
    ["ZOHO_REDIRECT_URI", zohoConfig.redirectUri]
  ];

  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno Zoho: ${missing.join(", ")}`);
  }
}

function currentRefreshToken() {
  return runtimeRefreshToken || zohoConfig.refreshToken;
}

export function getZohoAuthUrl() {
  ensureZohoConfig();

  const scopes = [
    "ZohoCRM.modules.contacts.ALL",
    "ZohoCRM.modules.accounts.ALL",
    "ZohoCRM.modules.deals.ALL",
    "ZohoCRM.settings.modules.READ",
    "ZohoCRM.settings.fields.READ"
  ].join(",");

  const params = new URLSearchParams({
    scope: scopes,
    client_id: zohoConfig.clientId,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    redirect_uri: zohoConfig.redirectUri
  });

  return `${zohoConfig.accountsDomain}/oauth/v2/auth?${params.toString()}`;
}

export function getZohoAuthStatus() {
  return {
    configured: Boolean(zohoConfig.clientId && zohoConfig.clientSecret),
    hasRefreshToken: Boolean(currentRefreshToken()),
    redirectUri: zohoConfig.redirectUri,
    authUrl: getZohoAuthUrl()
  };
}

function clearCachedAuth() {
  cachedAuth = null;
}

async function requestToken(body: URLSearchParams) {
  const response = await fetch(`${zohoConfig.accountsDomain}/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const json = (await response.json()) as ZohoTokenResponse;
  if (!response.ok || json.error) {
    throw new ZohoReauthRequiredError(
      `No se pudo autenticar con Zoho: ${json.error ?? response.statusText}`
    );
  }

  return json;
}

export async function exchangeZohoAuthCode(code: string) {
  ensureZohoConfig();

  const token = await requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: zohoConfig.clientId,
      client_secret: zohoConfig.clientSecret,
      redirect_uri: zohoConfig.redirectUri,
      code
    })
  );

  if (!token.refresh_token) {
    throw new Error("Zoho no devolvió un refresh token nuevo.");
  }

  runtimeRefreshToken = token.refresh_token;
  cachedAuth = {
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(0, token.expires_in - 60) * 1000,
    apiDomain: token.api_domain || zohoConfig.apiDomain
  };

  return {
    refreshToken: token.refresh_token,
    apiDomain: token.api_domain || zohoConfig.apiDomain
  };
}

async function refreshAccessToken() {
  ensureZohoConfig();

  const refreshToken = currentRefreshToken();
  if (!refreshToken) {
    throw new ZohoReauthRequiredError("No hay refresh token disponible para Zoho.");
  }

  const token = await requestToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: zohoConfig.clientId,
      client_secret: zohoConfig.clientSecret,
      grant_type: "refresh_token",
      redirect_uri: zohoConfig.redirectUri
    })
  );

  cachedAuth = {
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(0, token.expires_in - 60) * 1000,
    apiDomain: token.api_domain || zohoConfig.apiDomain
  };

  return cachedAuth;
}

async function getAccessToken() {
  if (cachedAuth && cachedAuth.expiresAt > Date.now()) {
    return cachedAuth;
  }

  return refreshAccessToken();
}

async function zohoRequest<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const auth = await getAccessToken();
  const response = await fetch(`${auth.apiDomain}/crm/v8/${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${auth.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const json = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    code?: string;
  };

  const tokenRejected =
    response.status === 401 ||
    json.code === "INVALID_TOKEN" ||
    json.code === "AUTHENTICATION_FAILURE";

  if (tokenRejected && retry) {
    clearCachedAuth();
    return zohoRequest<T>(path, init, false);
  }

  if (!response.ok) {
    if (tokenRejected) {
      throw new ZohoReauthRequiredError("La autenticación con Zoho ha expirado.");
    }

    throw new Error(json.message ?? json.code ?? `Zoho devolvió ${response.status}`);
  }

  return json;
}

/**
 * Busca un contacto por su correo, mirando también el secundario.
 *
 * `search?email=` de Zoho solo mira el campo Email. Un colegio que tenga la
 * dirección buena en «Correo secundario» no se encontraba, y el contacto se
 * creaba otra vez. Por eso se reintenta por criterio explícito sobre los dos
 * campos.
 */
async function searchContactByEmail(email: string) {
  const limpio = email.trim();
  if (!limpio) return null;

  const porEmail = await zohoRequest<ZohoRecordResponse<Record<string, unknown>>>(
    `${zohoConfig.contactsModule}/search?email=${encodeURIComponent(limpio)}`,
    { method: "GET" }
  );
  if (porEmail.data?.[0]) return porEmail.data[0];

  const criteria = `((Email:equals:${limpio})or(Secondary_Email:equals:${limpio}))`;
  const porCriterio = await zohoRequest<ZohoRecordResponse<Record<string, unknown>>>(
    `${zohoConfig.contactsModule}/search?criteria=${encodeURIComponent(criteria)}`,
    { method: "GET" }
  );
  return porCriterio.data?.[0] ?? null;
}

export interface ContactoDelCrm {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  accountName: string;
  phone: string;
  /** Tratos abiertos de ese contacto, para no crear uno repetido. */
  deals: { id: string; dealName: string; stage: string }[];
}

/**
 * El contacto tal y como está en el CRM, con sus tratos.
 *
 * Oravia pidió no volver a teclear el contacto en cada solicitud: si el colegio
 * ya está en Zoho, sus datos son los buenos y escribirlos a mano solo sirve
 * para crear una segunda ficha con el nombre puesto de otra manera.
 *
 * Devuelve null si no está, que no es un error: es un colegio nuevo.
 */
export async function buscarContactoEnCrm(email: string): Promise<ContactoDelCrm | null> {
  const contacto = await searchContactByEmail(email);
  if (!contacto?.id) return null;

  const id = String(contacto.id);
  const firstName = String(contacto.First_Name ?? "").trim();
  const lastName = String(contacto.Last_Name ?? "").trim();

  const cuenta = contacto.Account_Name as { name?: string } | undefined;

  let deals: ContactoDelCrm["deals"] = [];
  try {
    const criteria = `(Contact_Name.id:equals:${id})`;
    const result = await zohoRequest<ZohoRecordResponse<Record<string, unknown>>>(
      `${zohoConfig.dealsModule}/search?criteria=${encodeURIComponent(criteria)}`,
      { method: "GET" }
    );
    deals =
      result.data?.map((deal) => ({
        id: String(deal.id),
        dealName: String(deal.Deal_Name ?? ""),
        stage: String(deal.Stage ?? ""),
      })) ?? [];
  } catch {
    // Que no se puedan leer los tratos no invalida el contacto, que es lo que
    // se ha venido a buscar.
  }

  return {
    id,
    email: String(contacto.Email ?? email),
    firstName,
    lastName,
    fullName: String(contacto.Full_Name ?? `${firstName} ${lastName}`).trim(),
    accountName: String(cuenta?.name ?? "").trim(),
    phone: String(contacto.Phone ?? contacto.Mobile ?? "").trim(),
    deals,
  };
}

async function createContact(payload: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  const result = await zohoRequest<ZohoRecordResponse<{ details?: { id?: string } }>>(
    `${zohoConfig.contactsModule}`,
    {
      method: "POST",
      body: JSON.stringify({
        data: [
          {
            Email: payload.email,
            First_Name: payload.firstName,
            Last_Name: payload.lastName
          }
        ]
      })
    }
  );

  return result.data?.[0]?.details?.id ?? null;
}

async function upsertContact(payload: {
  email: string;
  firstName: string;
  lastName: string;
}) {
  // Antes esto era `.catch(() => null)`: si la busqueda fallaba por cualquier
  // motivo -un limite de peticiones de Zoho, un corte de un segundo- se tomaba
  // por "no existe" y se creaba un contacto nuevo. Un error tragado se
  // convertia en un duplicado en el CRM del cliente, y nadie se enteraba.
  //
  // Ahora un fallo de busqueda para la operacion. Es preferible que quien
  // cotiza lo reintente a ensuciar su base de contactos.
  let existing: Record<string, unknown> | null;
  try {
    existing = await searchContactByEmail(payload.email);
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    throw new Error(
      `No se ha podido comprobar si ${payload.email} ya está en el CRM, así que no se crea ` +
        `nada para no duplicarlo. Vuelve a intentarlo. (${motivo})`,
    );
  }

  if (existing?.id) {
    return String(existing.id);
  }
  return createContact(payload);
}

async function searchAccountByName(name: string) {
  if (!name.trim()) {
    return null;
  }

  const criteria = `(Account_Name:equals:${name.replace(/[()]/g, "")})`;
  const result = await zohoRequest<ZohoRecordResponse<Record<string, unknown>>>(
    `${zohoConfig.accountsModule}/search?criteria=${encodeURIComponent(criteria)}`,
    { method: "GET" }
  );
  return result.data?.[0] ?? null;
}

async function createAccount(name: string) {
  if (!name.trim()) {
    return null;
  }

  const result = await zohoRequest<ZohoRecordResponse<{ details?: { id?: string } }>>(
    `${zohoConfig.accountsModule}`,
    {
      method: "POST",
      body: JSON.stringify({
        data: [
          {
            Account_Name: name
          }
        ]
      })
    }
  );

  return result.data?.[0]?.details?.id ?? null;
}

async function upsertAccount(name: string) {
  if (!name.trim()) return null;

  // Mismo criterio que con el contacto: un error de busqueda NO puede leerse
  // como "no existe", porque entonces se crea un duplicado en el CRM del
  // cliente y nadie se entera hasta que mira la lista de cuentas.
  let existing: Record<string, unknown> | null;
  try {
    existing = await searchAccountByName(name);
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    throw new Error(
      `No se ha podido comprobar si «${name}» ya es una cuenta del CRM, así que no se crea ` +
        `nada para no duplicarla. Vuelve a intentarlo. (${motivo})`,
    );
  }

  if (existing?.id) {
    return String(existing.id);
  }
  return createAccount(name);
}

/**
 * Cómo se llama en su CRM cada departamento nuestro.
 *
 * Los valores son los de su lista, tal cual: «Grupos» y «Turismo Deportivo».
 * De sus 1.000 tratos, 542 son de Grupos y 427 de Turismo Deportivo, así que
 * son los dos que importan; los otros tres valores de la lista —Familiar,
 * Congresos, Agencia— no los produce esta app.
 */
const DEPARTAMENTO_EN_CRM: Record<string, string> = {
  GROUPS: "Grupos",
  SPORTS: "Turismo Deportivo",
};

/**
 * El idioma, con el nombre exacto de su lista.
 *
 * Su picklist solo tiene Español, Inglés y Francés. El catalán NO está, así
 * que un mensaje en catalán se queda sin idioma en el trato en vez de inventar
 * un valor que su CRM rechazaría. Hay que pedirles que lo añadan.
 *
 * Se aceptan códigos y nombres porque el dato llega de la lectura del mensaje y
 * hoy unas veces es «es» y otras «Español». En sus propios tratos conviven las
 * dos formas: 557 dicen «Español» y 79 dicen «es», que es basura que ya tienen.
 */
function idiomaEnCrm(valor?: string | null): string | null {
  const limpio = String(valor ?? "").trim().toLowerCase();
  if (!limpio) return null;
  if (/^(es|spa|cas|español|espanol|castellano)/.test(limpio)) return "Español";
  if (/^(en|eng|ingl)/.test(limpio)) return "Inglés";
  if (/^(fr|fra|franc)/.test(limpio)) return "Francés";
  return null;
}

/**
 * El depósito acordado con Oravia en junio: 30% al aceptar la propuesta.
 *
 * Es el mismo número que usa la mesa de propuestas para el reloj de los 40
 * días. Vive aquí porque es lo que se escribe en el trato.
 */
const DEPOSITO_PORCENTAJE = 30;
const FORMA_DE_COBRO = "Deposito 30%";

/**
 * La fase con la que nace un trato.
 *
 * Se valida contra el embudo real porque el `.env` traía `ZOHO_DEAL_STAGE=Nueva`
 * y «Nueva» NO es una de sus fases: siete tratos acabaron ahí, fuera del embudo,
 * sin que nadie lo viera hasta leer el CRM entero. Un valor que no existe se
 * ignora y se usa la primera fase de verdad.
 */
function faseInicial(): string {
  const pedida = (zohoConfig.dealStage ?? "").trim();
  const existe = FASES.some((f) => f.trim().toLowerCase() === pedida.toLowerCase());
  if (pedida && existe) return pedida;

  if (pedida) {
    console.warn(
      `[crm] «${pedida}» no es una fase del embudo. Se usa «${FASES[0]}». Revisa ZOHO_DEAL_STAGE.`,
    );
  }
  return FASES[0];
}

/** Quién es quién en el CRM, ya resuelto, para poder montar el trato. */
export interface VinculosDelTrato {
  dealName: string;
  contactId?: string | null;
  accountId?: string | null;
}

/**
 * El registro que se le manda a Zoho al crear un trato.
 *
 * Va aparte de la llamada para poder comprobarlo sin hablar con el CRM: es
 * donde vive todo el mapeo y donde estaría el fallo si un campo se quedara
 * vacío. Que es justo lo que pasaba.
 */
export function construirTratoParaElCrm(
  payload: PayloadDeOportunidad,
  vinculos: VinculosDelTrato,
): Record<string, unknown> {
  const { dealName, contactId, accountId } = vinculos;
  const record: Record<string, unknown> = {
    Deal_Name: dealName,
    Stage: faseInicial()
  };

  if (contactId) {
    record.Contact_Name = { id: contactId };
  }
  if (accountId) {
    record.Account_Name = { id: accountId };
  }
  if (typeof payload.opportunity.amount === "number" && payload.opportunity.amount > 0) {
    record.Amount = payload.opportunity.amount;
  }

  // ── Los campos del viaje ────────────────────────────────────────────────────
  //
  // Hasta ahora TODO esto se quedaba dentro del texto de la descripción, y el
  // trato salía con sus campos vacíos. Lo reportó Ruth: «no rellena ningún
  // campo de la oportunidad como fecha entrada y salida, número de pasajeros,
  // importe depósito, tipo de pago y forma de cobro. Lo pone todo en la
  // descripción».
  //
  // Los campos existían desde siempre. Leídos sus 1.000 tratos, los rellenan
  // ellos a mano casi siempre: Departamento e Idioma en el 99%, Forma de Cobro
  // en el 97%, Número de personas en el 96%, fecha de llegada en el 93%. Un
  // trato nuestro con todo eso vacío se distinguía de los suyos a simple vista.

  const { date_from: entrada, date_to: salida } = payload.opportunity;

  if (entrada) record.Fecha_llegada_actividad = entrada;
  if (salida) {
    record.Fecha_salida_actividad = salida;
    // La fecha de cierre sigue siendo la de salida, como hasta ahora.
    record.Closing_Date = salida;
  }

  if (typeof payload.opportunity.participants === "number" && payload.opportunity.participants > 0) {
    record.N_mero_de_personas = payload.opportunity.participants;
  }
  if (typeof payload.opportunity.teachers === "number" && payload.opportunity.teachers > 0) {
    record.Profesor_entrenador = payload.opportunity.teachers;
  }

  const departamento = DEPARTAMENTO_EN_CRM[payload.opportunity.department ?? ""];
  if (departamento) record.Departamento = departamento;

  const idioma = idiomaEnCrm(payload.opportunity.language);
  if (idioma) record.Idioma = idioma;

  const edades = payload.opportunity.age_range_text?.trim();
  if (edades) record.Edad_participantes = edades;

  const responsable = payload.opportunity.contact_name?.trim();
  if (responsable) record.Contacto_grupo = responsable;

  // El cobro, que es acuerdo nuestro y no dato del colegio: depósito del 30% al
  // aceptar. Es el valor que llevan 735 de sus 1.000 tratos.
  record.Forma_de_Cobro = FORMA_DE_COBRO;
  if (typeof payload.opportunity.amount === "number" && payload.opportunity.amount > 0) {
    record.Importe_Dep_sito_New =
      Math.round(payload.opportunity.amount * (DEPOSITO_PORCENTAJE / 100) * 100) / 100;
  }

  // `Tipo_de_Pago` (Crédito / Prepago) NO se rellena a propósito: es una
  // condición que se pacta con cada colegio y aquí no se sabe. Ponerlo por
  // defecto llenaría 900 tratos de un dato que nadie ha decidido.

  // El detalle de las opciones, en su campo. Antes iba a la Descripción, que es
  // donde ellos escriben a mano y donde la app deja después las notas y la
  // opción elegida: el texto largo tapaba ambas cosas.
  if (zohoConfig.dealOptionsField) {
    record[zohoConfig.dealOptionsField] =
      payload.opportunity.description?.trim() || JSON.stringify(payload.proposalOptions, null, 2);
  }

  return record;
}
/** Lo que la app sabe del viaje cuando abre la oportunidad en el CRM. */
export interface PayloadDeOportunidad {
  contact: {
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
  };
  account: {
    crm_account_id?: string | null;
    /** El centro. Es lo que da nombre a la cuenta en Zoho. */
    name?: string | null;
  };
  opportunity: {
    opportunity_name?: string;
    destination?: string;
    destination_country?: string;
    date_from?: string;
    date_to?: string;
    participants?: number | null;
    teachers?: number | null;
    group_type?: string;
    amount?: number | null;
    description?: string;
    /** Idioma de la solicitud, para el campo «Idioma» del trato. */
    language?: string | null;
    /** «15-17 años», tal como venía en el mensaje. */
    age_range_text?: string | null;
    /** Groups o Sports. Lo pone el servidor desde la sesión, no el navegador. */
    department?: "GROUPS" | "SPORTS" | null;
    /** El responsable del grupo, en texto: su CRM lo tiene aparte del contacto. */
    contact_name?: string | null;
  };
  proposalOptions: unknown;
}

export async function createZohoOpportunity(payload: PayloadDeOportunidad) {
  const contactId = await upsertContact({
    email: payload.contact.email,
    firstName: payload.contact.first_name,
    lastName: payload.contact.last_name
  });

  // La CUENTA es el centro, no la persona.
  //
  // Antes se resolvía con `payload.contact.full_name` y en el CRM de Oravia
  // quedaron cuentas llamadas «Marta Ferrer», tres iguales. Sus cuentas de
  // verdad son «CENTRE D'ESTUDIS JAUME BALMES», «ETAPSPORT», «Tot Turisme».
  //
  // Si no se sabe el centro NO se inventa una cuenta: es preferible un trato
  // sin cuenta, que se ve y se corrige, que otra cuenta basura con nombre de
  // persona, que no se ve hasta que alguien mira la lista.
  const nombreDeCuenta = payload.account.name?.trim() ?? "";
  const accountId = payload.account.crm_account_id || (await upsertAccount(nombreDeCuenta));

  const dealName =
    payload.opportunity.opportunity_name ||
    `${payload.opportunity.destination ?? "Viaje"} ${payload.contact.full_name}`;

  const record = construirTratoParaElCrm(payload, { dealName, contactId, accountId });

  const result = await zohoRequest<ZohoRecordResponse<{ details?: { id?: string } }>>(
    `${zohoConfig.dealsModule}`,
    {
      method: "POST",
      body: JSON.stringify({
        data: [record]
      })
    }
  );

  const dealId = result.data?.[0]?.details?.id ?? null;
  // URL web del trato (deep link). Deriva la base web del dominio de API:
  // www.zohoapis.eu → crm.zoho.eu.
  const webBase = zohoConfig.apiDomain.replace(/(www\.)?zohoapis/, "crm.zoho");
  const dealUrl = dealId ? `${webBase}/crm/tab/${zohoConfig.dealsModule}/${dealId}` : null;

  return {
    dealId,
    dealUrl,
    dealName,
    amount: typeof payload.opportunity.amount === "number" ? payload.opportunity.amount : null,
    contactId,
    accountId
  };
}

export async function searchZohoOpportunitiesByEmail(email: string) {
  const contact = await searchContactByEmail(email);
  if (!contact?.id) {
    return [];
  }

  const criteria = `(Contact_Name.id:equals:${String(contact.id)})`;
  const result = await zohoRequest<ZohoRecordResponse<Record<string, unknown>>>(
    `${zohoConfig.dealsModule}/search?criteria=${encodeURIComponent(criteria)}`,
    { method: "GET" }
  );

  return (
    result.data?.map((deal) => ({
      id: String(deal.id),
      dealName: String(deal.Deal_Name ?? ""),
      stage: String(deal.Stage ?? ""),
      raw: deal
    })) ?? []
  );
}

export async function approveZohoOpportunityOption(payload: {
  dealId: string;
  approvedOptionNumber: number;
}) {
  const update: Record<string, unknown> = {};

  if (zohoConfig.approvedOptionField) {
    update[zohoConfig.approvedOptionField] = payload.approvedOptionNumber;
  } else if (zohoConfig.dealOptionsField) {
    update[zohoConfig.dealOptionsField] = `approved_option_number=${payload.approvedOptionNumber}`;
  }

  await zohoRequest(`${zohoConfig.dealsModule}/${payload.dealId}`, {
    method: "PUT",
    body: JSON.stringify({
      data: [update]
    })
  });

  return {
    dealId: payload.dealId,
    approvedOptionNumber: payload.approvedOptionNumber
  };
}

/** URL web (deep link) de un trato: www.zohoapis.eu → crm.zoho.eu. */
function dealWebUrl(dealId: string): string {
  const webBase = zohoConfig.apiDomain.replace(/(www\.)?zohoapis/, "crm.zoho");
  return `${webBase}/crm/tab/${zohoConfig.dealsModule}/${dealId}`;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function lookupName(value: unknown): string {
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name?: unknown }).name ?? "");
  }
  return value ? String(value) : "";
}

export type ZohoDealSummary = {
  id: string;
  dealName: string;
  stage: string;
  amount: number | null;
  closingDate: string;
  accountName: string;
  contactName: string;
  description: string;
  nextStep: string;
  /** El detalle de las tres opciones, tal como se escribió en el CRM. */
  opcionesTexto: string;
  createdTime: string;
  modifiedTime: string;
  dealUrl: string;
};

/** Lista los tratos del módulo Deals (los más recientes primero). */
export async function listZohoDeals(limit = 200): Promise<ZohoDealSummary[]> {
  // `Opciones_de_Presupuesto` va aquí porque el detalle del presupuesto se
  // escribe ahí desde el 25/09/2026, no en la Descripción. La pantalla de
  // Viajes lee de ese texto las tres opciones y las fechas del viaje: sin
  // pedirlo, se quedaría en blanco para todo trato creado a partir de ahora.
  const fields = [
    "Deal_Name", "Stage", "Amount", "Closing_Date", "Account_Name", "Contact_Name",
    "Description", "Opciones_de_Presupuesto", "Next_Step", "Created_Time", "Modified_Time",
  ].join(",");
  const perPage = Math.min(Math.max(limit, 1), 200);
  const result = await zohoRequest<ZohoRecordResponse<Record<string, unknown>>>(
    `${zohoConfig.dealsModule}?fields=${fields}&per_page=${perPage}&sort_by=Modified_Time&sort_order=desc`,
    { method: "GET" }
  );

  return (
    result.data?.map((deal) => ({
      id: String(deal.id),
      dealName: String(deal.Deal_Name ?? ""),
      stage: String(deal.Stage ?? ""),
      amount: toNumber(deal.Amount),
      closingDate: String(deal.Closing_Date ?? ""),
      accountName: lookupName(deal.Account_Name),
      contactName: lookupName(deal.Contact_Name),
      description: String(deal.Description ?? ""),
      // El detalle del presupuesto. Los tratos anteriores al 25/09/2026 lo
      // tienen dentro de la Descripción, así que se cae ahí cuando falta.
      opcionesTexto: String(deal.Opciones_de_Presupuesto ?? deal.Description ?? ""),
      nextStep: String(deal.Next_Step ?? ""),
      createdTime: String(deal.Created_Time ?? ""),
      modifiedTime: String(deal.Modified_Time ?? ""),
      dealUrl: dealWebUrl(String(deal.id)),
    })) ?? []
  );
}

/** Fases válidas del pipeline (para validar el avance de fase). */
export async function getZohoDealStages(): Promise<string[]> {
  const result = await zohoRequest<{
    fields?: { api_name?: string; pick_list_values?: { display_value?: string }[] }[];
  }>(`settings/fields?module=${zohoConfig.dealsModule}`, { method: "GET" });
  const stageField = result.fields?.find((f) => f.api_name === "Stage");
  return (stageField?.pick_list_values ?? [])
    .map((p) => String(p.display_value ?? ""))
    .filter(Boolean);
}

/**
 * La fase en la que está HOY un trato.
 *
 * Hace falta para no moverlo hacia atrás: sin leer antes, reenviar una
 * propuesta de un viaje ya ganado lo devolvería a «Presupuesto Enviado».
 * Devuelve cadena vacía si el trato no tiene fase o ya no existe.
 */
export async function getZohoDealStage(dealId: string): Promise<string> {
  const result = await zohoRequest<ZohoRecordResponse<Record<string, unknown>>>(
    `${zohoConfig.dealsModule}/${dealId}?fields=Stage`,
    { method: "GET" }
  );
  return String(result.data?.[0]?.Stage ?? "");
}

const CHOSEN_OPTION_PREFIX = "▸ Opción elegida por el cliente:";

/**
 * Actualiza un trato sin destruir su Descripción: cambia la fase, registra la
 * opción elegida y/o añade una nota fechada, conservando el resto del texto.
 */
export async function updateZohoDeal(payload: {
  dealId: string;
  stage?: string;
  chosenOption?: number | null;
  note?: string;
  noteDate?: string; // YYYY-MM-DD (lo pone el backend)
}): Promise<{ dealId: string; stage?: string; chosenOption?: number | null }> {
  const needsDescription = payload.chosenOption != null || (payload.note && payload.note.trim());

  let description = "";
  if (needsDescription) {
    const current = await zohoRequest<ZohoRecordResponse<Record<string, unknown>>>(
      `${zohoConfig.dealsModule}/${payload.dealId}?fields=Description`,
      { method: "GET" }
    );
    description = String(current.data?.[0]?.Description ?? "");
  }

  if (payload.chosenOption != null) {
    // Quita cualquier línea previa de opción elegida y añade la nueva.
    description = description
      .split("\n")
      .filter((line) => !line.startsWith(CHOSEN_OPTION_PREFIX))
      .join("\n")
      .trimEnd();
    description += `\n\n${CHOSEN_OPTION_PREFIX} Opción ${payload.chosenOption}`;
  }

  if (payload.note && payload.note.trim()) {
    const stamp = payload.noteDate ? ` [${payload.noteDate}]` : "";
    description = `${description.trimEnd()}\n▸ Nota${stamp}: ${payload.note.trim()}`;
  }

  const update: Record<string, unknown> = {};
  if (payload.stage) update.Stage = payload.stage;
  if (needsDescription) update.Description = description.trim();

  if (Object.keys(update).length > 0) {
    await zohoRequest(`${zohoConfig.dealsModule}/${payload.dealId}`, {
      method: "PUT",
      body: JSON.stringify({ data: [update] })
    });
  }

  return { dealId: payload.dealId, stage: payload.stage, chosenOption: payload.chosenOption };
}


/**
 * Borra en el CRM el trato de una solicitud.
 *
 * Hace falta porque las pruebas dejan tratos reales en el Zoho de Oravia: el
 * `.env` apunta a su CRM de verdad, no a un entorno de juguete, y cada recorrido
 * de prueba creaba una oportunidad que luego habia que ir a buscar y borrar a
 * mano.
 *
 * Zoho no destruye el registro: lo manda a su papelera, donde se queda 60 dias
 * y se puede restaurar. Eso lo dice la pantalla que pide la confirmacion,
 * porque cambia lo que se esta decidiendo.
 *
 * Solo el trato. El contacto y la cuenta se quedan: un colegio que ha pedido un
 * presupuesto de prueba sigue siendo un colegio, y borrarlo se llevaria por
 * delante el historial de sus otras oportunidades.
 *
 * Se usa el borrado por `ids=`, que responde 200 con el resultado de cada
 * registro, en vez de `Deals/{id}`, que responde 404 a secas: con el 404 no se
 * puede distinguir «ya no estaba» de «no tengo permiso», y son cosas distintas.
 */
export async function eliminarTratoEnCrm(dealId: string): Promise<"BORRADO" | "NO_ESTABA"> {
  const id = String(dealId ?? "").trim();
  if (!id) return "NO_ESTABA";

  try {
    const resultado = await zohoRequest<ZohoRecordResponse<{ code?: string; message?: string }>>(
      `${zohoConfig.dealsModule}?ids=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );

    const codigo = String(resultado.data?.[0]?.code ?? "");
    if (codigo === "SUCCESS") return "BORRADO";
    if (/NOT_FOUND|INVALID_DATA/i.test(codigo)) return "NO_ESTABA";

    throw new Error(
      `Zoho no borro el trato ${id}: ${resultado.data?.[0]?.message ?? codigo ?? "sin motivo"}`,
    );
  } catch (error) {
    // Un trato ya borrado a mano no es un fallo: lo que se queria es que no
    // estuviera, y no esta.
    if (error instanceof Error && /RESOURCE_NOT_FOUND|devolvio 404|devolvió 404/i.test(error.message)) {
      return "NO_ESTABA";
    }
    throw error;
  }
}
