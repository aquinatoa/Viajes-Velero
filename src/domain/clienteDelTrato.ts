/**
 * Quién es el cliente de una oportunidad: la cuenta y el contacto del trato, tal
 * como están en el CRM, y cuántas oportunidades tiene esa cuenta.
 *
 * Anthony, 16/11/2026: «es muy importante conocer quién es el cliente. Aquí
 * debería mostrar información del contacto y de la cuenta si los tienen».
 *
 * Puro: recibe los registros de Zoho ya leídos y se queda con lo que la ficha
 * enseña. Lo que el CRM no tiene relleno no viaja (la ficha no pinta huecos).
 */

export interface ContactoDelCliente {
  nombre: string;
  correo?: string;
  telefono?: string;
  movil?: string;
  cargo?: string;
  idioma?: string;
  ciudad?: string;
}

export interface CuentaDelCliente {
  nombre: string;
  telefono?: string;
  web?: string;
  tipo?: string;
  ciudad?: string;
  correo?: string;
}

export interface TratosDeLaCuenta {
  total: number;
  /** Las que no están ni ganadas, ni perdidas, ni cerradas. */
  abiertas: number;
  porFase: { fase: string; n: number }[];
}

export interface ClienteDelTrato {
  contacto: ContactoDelCliente | null;
  cuenta: CuentaDelCliente | null;
  tratos: TratosDeLaCuenta | null;
}

type Registro = Record<string, unknown> | null | undefined;

function texto(valor: unknown): string | undefined {
  const t = typeof valor === "string" ? valor.trim() : typeof valor === "number" ? String(valor) : "";
  return t ? t : undefined;
}

function lugar(...partes: unknown[]): string | undefined {
  const t = partes.map(texto).filter(Boolean).join(", ");
  return t || undefined;
}

/** Una fase que ya no está en juego: ganada, perdida o expediente cerrado. */
export function faseTerminada(fase: string): boolean {
  return /ganad|perdid|cerrad|cierre administrativo/i.test(fase);
}

export function contactoDelCliente(c: Registro): ContactoDelCliente | null {
  if (!c) return null;
  const nombre = texto(c.Full_Name) ?? [texto(c.First_Name), texto(c.Last_Name)].filter(Boolean).join(" ");
  if (!nombre) return null;
  return {
    nombre,
    correo: texto(c.Email),
    telefono: texto(c.Phone),
    movil: texto(c.Mobile),
    cargo: texto(c.Title),
    idioma: texto(c.Idioma) ?? texto(c.Language),
    ciudad: lugar(c.Mailing_City, c.Mailing_Country),
  };
}

export function cuentaDelCliente(a: Registro): CuentaDelCliente | null {
  if (!a) return null;
  const nombre = texto(a.Account_Name);
  if (!nombre) return null;
  return {
    nombre,
    telefono: texto(a.Phone),
    web: texto(a.Website),
    tipo: texto(a.Account_Type),
    ciudad: lugar(a.Billing_City, a.Billing_Country),
    correo: texto(a.Email),
  };
}

/** De «cuántos tratos hay en cada fase» al resumen que enseña la ficha. Null si no se pudo contar. */
export function tratosDeLaCuenta(porFase: { fase: string; n: number }[] | null | undefined): TratosDeLaCuenta | null {
  if (!porFase) return null;
  const limpias = porFase.filter((x) => x.fase && x.n > 0);
  return {
    total: limpias.reduce((t, x) => t + x.n, 0),
    abiertas: limpias.filter((x) => !faseTerminada(x.fase)).reduce((t, x) => t + x.n, 0),
    porFase: limpias,
  };
}

/** La web sin el protocolo ni la barra final, para enseñarla corta. */
export function webCorta(web: string | undefined): string {
  return (web ?? "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
