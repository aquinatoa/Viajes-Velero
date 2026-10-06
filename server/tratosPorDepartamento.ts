import type { AuthedUser, Department } from "./auth";

/**
 * Qué tratos del CRM ve cada uno en la pantalla de Viajes.
 *
 * Propuestas y solicitudes ya se filtraban por departamento (`auth.ts`), pero
 * Viajes traía los 200 últimos tratos de Zoho tal cual, para todo el mundo.
 * Javier, el 06/10/2026: «Ruth y Ricard con sus usuarios veían todas las
 * oportunidades». Era aquí.
 *
 * La regla es la misma que en el resto de la app:
 * - ADMIN y USER son globales: ven los dos departamentos.
 * - Quien tiene departamento ve el suyo, y además los tratos sin departamento,
 *   que son los que un administrador global creó sin decirlo. Esconderlos no
 *   es filtrar.
 * - Quien no tiene departamento (no debería pasar fuera de los globales) no
 *   pierde nada: lo único que se puede decir de él con certeza es que no se
 *   sabe de qué departamento es.
 *
 * El departamento del trato viene del campo `Departamento` de Zoho, que ellos
 * rellenan a mano en el 99% de sus tratos y que nosotros escribimos al crear
 * uno («Grupos» / «Turismo Deportivo»). Se lee con manga ancha: sin tildes,
 * sin mayúsculas, y «Sports» o «Deportivo» cuentan como Turismo Deportivo,
 * por si en el CRM aparece escrito de otra forma.
 *
 * Su lista tiene SEIS departamentos, no dos: también «Agencia de Viajes»,
 * «Congresos y Eventos» y «Turismo Familiar». Esos no son de nadie en la app,
 * y no es lo mismo que «sin departamento»: un trato de Turismo Familiar no
 * debe contar como Grupos cuando Javier mira los números de Grupos. Se marcan
 * como OTRO y solo se ven mirando «Todos».
 */

/** GROUPS o SPORTS; OTRO = uno de los otros departamentos de su CRM; null = sin poner. */
export type DepartamentoDelTrato = Department | "OTRO" | null;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** El valor de `Departamento` en Zoho, traducido al departamento de la app. */
export function departamentoDesdeCrm(valor: unknown): DepartamentoDelTrato {
  if (valor === null || valor === undefined) return null;
  const texto = normalizar(String(valor));
  if (!texto || texto === "-none-") return null;
  if (texto.includes("grupo")) return "GROUPS";
  if (texto.includes("deportiv") || texto.includes("sport")) return "SPORTS";
  return "OTRO";
}

/** ¿Este usuario ve los dos departamentos y puede elegir cuál mirar? */
export function veTodosLosDepartamentos(user: Pick<AuthedUser, "role" | "department">): boolean {
  return user.role === "ADMIN" || user.role === "USER" || !user.department;
}

/** Los tratos que este usuario puede ver, en el mismo orden en que llegan. */
export function tratosVisiblesPara<T extends { department: DepartamentoDelTrato }>(
  user: Pick<AuthedUser, "role" | "department">,
  tratos: T[],
): T[] {
  if (veTodosLosDepartamentos(user)) return tratos;
  const suyo = user.department;
  return tratos.filter((t) => t.department === null || t.department === suyo);
}
