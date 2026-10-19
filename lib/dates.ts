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

// La SEMANA de la clasificación de compañeros: de lunes a domingo en hora de
// Colombia, como INSTANTES (se comparan con StudySession.completedAt). Empieza
// el lunes a las 00:00 de Bogotá (las 05:00 UTC) y termina el lunes
// siguiente a la misma hora (sin incluirlo).
export function weekInAppTimeZone(now: Date = new Date()): { start: Date; end: Date } {
  const today = todayDateInAppTimeZone(now);
  // getUTCDay: 0 = domingo. Días desde el lunes: lunes 0 … domingo 6.
  const sinceMonday = (today.getUTCDay() + 6) % 7;
  const start = new Date(today.getTime() - sinceMonday * DAY_MS + APP_UTC_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// "20 de octubre de 2026". En UTC, porque así se guardó (ver arriba).
const dueDateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  dateStyle: "long",
});

export function formatDueDate(date: Date): string {
  return dueDateFormatter.format(date);
}

// "30 de sept de 2026": la misma fecha con el mes abreviado, para donde la
// larga no cabe en una línea (el pie de la tarjeta de jefe a 320 px).
const shortDueDateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDueDateShort(date: Date): string {
  return shortDueDateFormatter.format(date);
}

// "lunes 20 de octubre a las 3:15 p. m.": un INSTANTE (el plazo de la misión
// de redención) en hora de Colombia, la de la app. Sin artículo: quien lo usa
// escribe "antes del…" o "hasta el…". Se arma con las partes del formateador
// para no depender de las comas que pone cada versión de Node. Solo en el
// servidor: el navegador recibe el texto ya hecho (su ICU podría escribir
// "p. m." distinto y no coincidir al hidratar).
const deadlineFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: APP_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatDeadline(date: Date | number): string {
  const parts = Object.fromEntries(
    deadlineFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  // "a la 1:05" en singular; "a las 3:15" en plural.
  const article = parts.hour === "1" ? "a la" : "a las";
  return `${parts.weekday} ${parts.day} de ${parts.month} ${article} ${parts.hour}:${parts.minute} ${parts.dayPeriod}`;
}
