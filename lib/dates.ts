// Fechas de entrega. Se tratan como DÍAS de calendario, no como instantes:
// se guardan a las 00:00 UTC de ese día y se muestran siempre en UTC, así que
// el día no cambia aunque el servidor (Vercel, en UTC) y el usuario (Bogotá)
// estén en zonas distintas.

// Zona en la que se decide qué día es "hoy". Colombia no tiene horario de
// verano, así que siempre es UTC-5.
export const APP_TIME_ZONE = "America/Bogota";

// Formato que manda <input type="date">: "2026-10-20".
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Fecha de hoy en APP_TIME_ZONE como texto "AAAA-MM-DD". Recibe la hora como
// parámetro para poder probarla con una hora fija.
export function todayInAppTimeZone(now: Date = new Date()): string {
  // "en-US" solo para asegurar cifras occidentales (0-9). El orden del texto
  // no importa, porque se arma a mano con las partes.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const part = (type: "year" | "month" | "day") =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
}

// Convierte "AAAA-MM-DD" en un Date a las 00:00 UTC de ese día, o null si el
// texto no tiene ese formato o la fecha no existe.
export function parseDateInput(value: string): Date | null {
  const match = DATE_INPUT_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Date.UTC no protesta con fechas imposibles: el 30 de febrero lo pasa al
  // 2 de marzo. Si al leerla no sale el mismo día, la fecha no existía.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

// Hoy en APP_TIME_ZONE como Date a las 00:00 UTC, la misma convención con la
// que se guardan las fechas de entrega: así se comparan directamente. Un jefe
// está vencido si su dueDate es ANTERIOR a esto (el día de la entrega todavía
// no lo está).
export function todayDateInAppTimeZone(now: Date = new Date()): Date {
  const today = todayInAppTimeZone(now);
  const date = parseDateInput(today);
  // todayInAppTimeZone siempre da "AAAA-MM-DD": si no, es un error de programación.
  if (!date) throw new Error(`Día no válido: ${today}`);
  return date;
}

// El INSTANTE en que empezó hoy en APP_TIME_ZONE: las 00:00 de Bogotá, que son
// las 05:00 UTC. No es la convención de las fechas de entrega (esas son días
// guardados a las 00:00 UTC): esto se compara con instantes de verdad, como el
// createdAt de una invocación del escriba. Colombia no tiene horario de
// verano, así que el desfase es siempre de 5 horas.
const APP_UTC_OFFSET_MS = 5 * 60 * 60 * 1000;

export function startOfTodayInAppTimeZone(now: Date = new Date()): Date {
  return new Date(todayDateInAppTimeZone(now).getTime() + APP_UTC_OFFSET_MS);
}

// "20 de octubre de 2026". En UTC, porque así se guardó (ver arriba).
const dueDateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  dateStyle: "long",
});

export function formatDueDate(date: Date): string {
  return dueDateFormatter.format(date);
}
