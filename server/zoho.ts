import "./loadEnv";
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
  dealStage: process.env.ZOHO_DEAL_STAGE ?? "Qualification",
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

async function searchContactByEmail(email: string) {
  const result = await zohoRequest<ZohoRecordResponse<Record<string, unknown>>>(
    `${zohoConfig.contactsModule}/search?email=${encodeURIComponent(email)}`,
    { method: "GET" }
  );
  return result.data?.[0] ?? null;
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
  const existing = await searchContactByEmail(payload.email).catch(() => null);
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
  const existing = await searchAccountByName(name).catch(() => null);
  if (existing?.id) {
    return String(existing.id);
  }
  return createAccount(name);
}

export async function createZohoOpportunity(payload: {
  contact: {
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
  };
  account: {
    crm_account_id?: string | null;
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
  };
  proposalOptions: unknown;
}) {
  const contactId = await upsertContact({
    email: payload.contact.email,
    firstName: payload.contact.first_name,
    lastName: payload.contact.last_name
  });

  const accountId =
    payload.account.crm_account_id || (await upsertAccount(payload.contact.full_name));

  const dealName =
    payload.opportunity.opportunity_name ||
    `${payload.opportunity.destination ?? "Viaje"} ${payload.contact.full_name}`;

  const record: Record<string, unknown> = {
    Deal_Name: dealName,
    Stage: zohoConfig.dealStage
  };

  if (contactId) {
    record.Contact_Name = { id: contactId };
  }
  if (accountId) {
    record.Account_Name = { id: accountId };
  }
  if (payload.opportunity.date_to) {
    record.Closing_Date = payload.opportunity.date_to;
  }
  if (zohoConfig.dealOptionsField) {
    record[zohoConfig.dealOptionsField] = JSON.stringify(payload.proposalOptions, null, 2);
  }

  const result = await zohoRequest<ZohoRecordResponse<{ details?: { id?: string } }>>(
    `${zohoConfig.dealsModule}`,
    {
      method: "POST",
      body: JSON.stringify({
        data: [record]
      })
    }
  );

  return {
    dealId: result.data?.[0]?.details?.id ?? null,
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
