/**
 * El calendario de periodos de PortAventura para la temporada 2027.
 *
 * Sale del PDF «PA_2027_01_Entradas_Grupos_Parques_PVP» que subió Oravia (los
 * colores del calendario, leídos el 20/10/2026 y comprobados a ojo: A rosa, B
 * azul, C amarillo, D verde; sin color, parques cerrados). Las entradas de
 * PortAventura Park, Ferrari Land y Caribe Aquatic Park cobran por periodo y
 * hasta ahora se cogía siempre el más barato sin saber qué día tocaba.
 *
 * Cuando Oravia suba el PDF de 2028 habrá que leerlo igual y añadirlo aquí.
 */

export type PeriodoDePortAventura = "A" | "B" | "C" | "D" | "CERRADO";

const CALENDARIO: Record<string, PeriodoDePortAventura> = {"2027-02-01":"CERRADO","2027-02-02":"CERRADO","2027-02-03":"CERRADO","2027-02-04":"CERRADO","2027-02-05":"CERRADO","2027-02-06":"CERRADO","2027-02-07":"CERRADO","2027-02-08":"CERRADO","2027-02-09":"CERRADO","2027-02-10":"CERRADO","2027-02-11":"CERRADO","2027-02-12":"CERRADO","2027-02-13":"CERRADO","2027-02-14":"CERRADO","2027-02-15":"CERRADO","2027-02-16":"CERRADO","2027-02-17":"CERRADO","2027-02-18":"CERRADO","2027-02-19":"CERRADO","2027-02-20":"A","2027-02-21":"A","2027-02-22":"CERRADO","2027-02-23":"CERRADO","2027-02-24":"CERRADO","2027-02-25":"CERRADO","2027-02-26":"CERRADO","2027-02-27":"A","2027-02-28":"A","2027-03-01":"CERRADO","2027-03-02":"CERRADO","2027-03-03":"CERRADO","2027-03-04":"CERRADO","2027-03-05":"CERRADO","2027-03-06":"A","2027-03-07":"A","2027-03-08":"CERRADO","2027-03-09":"CERRADO","2027-03-10":"CERRADO","2027-03-11":"CERRADO","2027-03-12":"CERRADO","2027-03-13":"A","2027-03-14":"A","2027-03-15":"CERRADO","2027-03-16":"CERRADO","2027-03-17":"CERRADO","2027-03-18":"B","2027-03-19":"B","2027-03-20":"C","2027-03-21":"C","2027-03-22":"C","2027-03-23":"D","2027-03-24":"D","2027-03-25":"D","2027-03-26":"C","2027-03-27":"C","2027-03-28":"C","2027-03-29":"C","2027-03-30":"C","2027-03-31":"D","2027-04-01":"D","2027-04-02":"D","2027-04-03":"C","2027-04-04":"B","2027-04-05":"C","2027-04-06":"C","2027-04-07":"D","2027-04-08":"D","2027-04-09":"D","2027-04-10":"C","2027-04-11":"B","2027-04-12":"B","2027-04-13":"C","2027-04-14":"D","2027-04-15":"D","2027-04-16":"D","2027-04-17":"C","2027-04-18":"B","2027-04-19":"B","2027-04-20":"B","2027-04-21":"B","2027-04-22":"D","2027-04-23":"D","2027-04-24":"C","2027-04-25":"B","2027-04-26":"C","2027-04-27":"C","2027-04-28":"D","2027-04-29":"D","2027-04-30":"D","2027-05-01":"D","2027-05-02":"B","2027-05-03":"C","2027-05-04":"C","2027-05-05":"D","2027-05-06":"D","2027-05-07":"D","2027-05-08":"C","2027-05-09":"B","2027-05-10":"C","2027-05-11":"C","2027-05-12":"D","2027-05-13":"D","2027-05-14":"D","2027-05-15":"C","2027-05-16":"B","2027-05-17":"C","2027-05-18":"C","2027-05-19":"D","2027-05-20":"D","2027-05-21":"D","2027-05-22":"C","2027-05-23":"B","2027-05-24":"C","2027-05-25":"C","2027-05-26":"D","2027-05-27":"D","2027-05-28":"D","2027-05-29":"C","2027-05-30":"B","2027-05-31":"D","2027-06-01":"D","2027-06-02":"D","2027-06-03":"D","2027-06-04":"D","2027-06-05":"B","2027-06-06":"B","2027-06-07":"C","2027-06-08":"D","2027-06-09":"D","2027-06-10":"D","2027-06-11":"C","2027-06-12":"B","2027-06-13":"B","2027-06-14":"C","2027-06-15":"D","2027-06-16":"D","2027-06-17":"D","2027-06-18":"C","2027-06-19":"C","2027-06-20":"B","2027-06-21":"C","2027-06-22":"C","2027-06-23":"C","2027-06-24":"C","2027-06-25":"C","2027-06-26":"B","2027-06-27":"B","2027-06-28":"B","2027-06-29":"B","2027-06-30":"B","2027-07-01":"C","2027-07-02":"C","2027-07-03":"C","2027-07-04":"C","2027-07-05":"CERRADO","2027-07-06":"CERRADO","2027-07-07":"CERRADO","2027-07-08":"CERRADO","2027-07-09":"CERRADO","2027-07-10":"CERRADO","2027-07-11":"CERRADO","2027-07-12":"CERRADO","2027-07-13":"CERRADO","2027-07-14":"CERRADO","2027-07-15":"CERRADO","2027-07-16":"CERRADO","2027-07-17":"CERRADO","2027-07-18":"CERRADO","2027-07-19":"CERRADO","2027-07-20":"CERRADO","2027-07-21":"CERRADO","2027-07-22":"CERRADO","2027-07-23":"CERRADO","2027-07-24":"CERRADO","2027-07-25":"CERRADO","2027-07-26":"CERRADO","2027-07-27":"CERRADO","2027-07-28":"CERRADO","2027-07-29":"CERRADO","2027-07-30":"CERRADO","2027-07-31":"CERRADO","2027-08-01":"C","2027-08-02":"CERRADO","2027-08-03":"CERRADO","2027-08-04":"CERRADO","2027-08-05":"CERRADO","2027-08-06":"CERRADO","2027-08-07":"CERRADO","2027-08-08":"CERRADO","2027-08-09":"CERRADO","2027-08-10":"CERRADO","2027-08-11":"CERRADO","2027-08-12":"CERRADO","2027-08-13":"CERRADO","2027-08-14":"CERRADO","2027-08-15":"CERRADO","2027-08-16":"CERRADO","2027-08-17":"CERRADO","2027-08-18":"CERRADO","2027-08-19":"CERRADO","2027-08-20":"CERRADO","2027-08-21":"CERRADO","2027-08-22":"CERRADO","2027-08-23":"CERRADO","2027-08-24":"CERRADO","2027-08-25":"CERRADO","2027-08-26":"CERRADO","2027-08-27":"CERRADO","2027-08-28":"CERRADO","2027-08-29":"CERRADO","2027-08-30":"C","2027-08-31":"C","2027-09-01":"C","2027-09-02":"C","2027-09-03":"C","2027-09-04":"C","2027-09-05":"B","2027-09-06":"B","2027-09-07":"B","2027-09-08":"B","2027-09-09":"B","2027-09-10":"C","2027-09-11":"C","2027-09-12":"B","2027-09-13":"B","2027-09-14":"B","2027-09-15":"B","2027-09-16":"B","2027-09-17":"C","2027-09-18":"C","2027-09-19":"B","2027-09-20":"B","2027-09-21":"B","2027-09-22":"B","2027-09-23":"B","2027-09-24":"C","2027-09-25":"C","2027-09-26":"B","2027-09-27":"B","2027-09-28":"B","2027-09-29":"B","2027-09-30":"B","2027-10-01":"B","2027-10-02":"D","2027-10-03":"D","2027-10-04":"B","2027-10-05":"B","2027-10-06":"B","2027-10-07":"B","2027-10-08":"B","2027-10-09":"C","2027-10-10":"C","2027-10-11":"C","2027-10-12":"C","2027-10-13":"A","2027-10-14":"A","2027-10-15":"B","2027-10-16":"D","2027-10-17":"C","2027-10-18":"C","2027-10-19":"C","2027-10-20":"C","2027-10-21":"C","2027-10-22":"C","2027-10-23":"D","2027-10-24":"C","2027-10-25":"C","2027-10-26":"C","2027-10-27":"C","2027-10-28":"C","2027-10-29":"C","2027-10-30":"D","2027-10-31":"D","2027-11-01":"D","2027-11-02":"A","2027-11-03":"A","2027-11-04":"A","2027-11-05":"B","2027-11-06":"C","2027-11-07":"C","2027-11-08":"A","2027-11-09":"A","2027-11-10":"A","2027-11-11":"B","2027-11-12":"B","2027-11-13":"B","2027-11-14":"B","2027-11-15":"CERRADO","2027-11-16":"CERRADO","2027-11-17":"CERRADO","2027-11-18":"CERRADO","2027-11-19":"B","2027-11-20":"B","2027-11-21":"B","2027-11-22":"CERRADO","2027-11-23":"CERRADO","2027-11-24":"CERRADO","2027-11-25":"CERRADO","2027-11-26":"B","2027-11-27":"B","2027-11-28":"B","2027-11-29":"A","2027-11-30":"A","2027-12-01":"A","2027-12-02":"A","2027-12-03":"B","2027-12-04":"B","2027-12-05":"B","2027-12-06":"C","2027-12-07":"C","2027-12-08":"C","2027-12-09":"B","2027-12-10":"B","2027-12-11":"B","2027-12-12":"B","2027-12-13":"A","2027-12-14":"A","2027-12-15":"A","2027-12-16":"A","2027-12-17":"B","2027-12-18":"B","2027-12-19":"B","2027-12-20":"CERRADO","2027-12-21":"CERRADO","2027-12-22":"CERRADO","2027-12-23":"CERRADO","2027-12-24":"CERRADO","2027-12-25":"CERRADO","2027-12-26":"CERRADO","2027-12-27":"B","2027-12-28":"B","2027-12-29":"B","2027-12-30":"B","2027-12-31":"B","2028-01-01":"B","2028-01-02":"B","2028-01-03":"CERRADO","2028-01-04":"CERRADO","2028-01-05":"CERRADO","2028-01-06":"CERRADO","2028-01-07":"CERRADO","2028-01-08":"CERRADO","2028-01-09":"CERRADO","2028-01-10":"CERRADO","2028-01-11":"CERRADO","2028-01-12":"CERRADO","2028-01-13":"CERRADO","2028-01-14":"CERRADO","2028-01-15":"CERRADO","2028-01-16":"CERRADO","2028-01-17":"CERRADO","2028-01-18":"CERRADO","2028-01-19":"CERRADO","2028-01-20":"CERRADO","2028-01-21":"CERRADO","2028-01-22":"CERRADO","2028-01-23":"CERRADO","2028-01-24":"CERRADO","2028-01-25":"CERRADO","2028-01-26":"CERRADO","2028-01-27":"CERRADO","2028-01-28":"CERRADO","2028-01-29":"CERRADO","2028-01-30":"CERRADO"};

/** El periodo de un día (AAAA-MM-DD), o null si el calendario no lo cubre. */
export function periodoDePortAventura(fechaISO: string): PeriodoDePortAventura | null {
  return CALENDARIO[fechaISO.slice(0, 10)] ?? null;
}

/** «Periodo B», «Período C» en el nombre de una tarifa → «B», «C». */
export function periodoDeLaTarifa(etiqueta: string | null | undefined): string | null {
  const m = /per[ií]odo\s+([a-f])\b/i.exec(etiqueta ?? "");
  return m ? m[1].toUpperCase() : null;
}

/**
 * Los periodos de los días de un viaje, del más frecuente al menos, sin los
 * días cerrados. Vacío si el calendario no cubre ninguno.
 */
export function periodosDelViaje(desdeISO: string | null | undefined, hastaISO: string | null | undefined): string[] {
  if (!desdeISO) return [];
  const desde = new Date(`${desdeISO.slice(0, 10)}T12:00:00Z`);
  const hasta = hastaISO ? new Date(`${hastaISO.slice(0, 10)}T12:00:00Z`) : desde;
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return [];
  const cuenta = new Map<string, number>();
  for (let d = new Date(desde); d.getTime() <= hasta.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const p = periodoDePortAventura(d.toISOString());
    if (p && p !== "CERRADO") cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p]) => p);
}

/** Los días del viaje con su periodo, para explicarlo: «5 y 6/06 B · 7/06 C». */
export function periodosPorDia(desdeISO: string | null | undefined, hastaISO: string | null | undefined): Array<{ fecha: string; periodo: PeriodoDePortAventura | null }> {
  if (!desdeISO) return [];
  const desde = new Date(`${desdeISO.slice(0, 10)}T12:00:00Z`);
  const hasta = hastaISO ? new Date(`${hastaISO.slice(0, 10)}T12:00:00Z`) : desde;
  const lista: Array<{ fecha: string; periodo: PeriodoDePortAventura | null }> = [];
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) return lista;
  for (let d = new Date(desde); d.getTime() <= hasta.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const fecha = d.toISOString().slice(0, 10);
    lista.push({ fecha, periodo: periodoDePortAventura(fecha) });
  }
  return lista;
}
