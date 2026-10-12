// Reglas del escriba (el agente que escribe preguntas desde los apuntes).
// Viven solo aquí para que la acción, la tarjeta del navegador y el script de
// pruebas usen los mismos números. Sin nada del servidor: también se importa
// desde el navegador (el contador de caracteres y los textos de la tarjeta).

export const AGENT = {
  // Invocaciones CON ÉXITO por usuario y día de Colombia. Las fallidas no
  // cuentan.
  dailyInvocations: 3,
  // Cuántas preguntas puede escribir de una vez. Lo decide el escriba según el
  // contenido; el usuario no elige.
  minQuestions: 3,
  maxQuestions: 15,
  // Entrada: texto pegado o un PDF.
  maxTextChars: 20_000,
  maxPdfBytes: 4 * 1024 * 1024,
  maxPdfPages: 40,
  // Una invocación PENDING más vieja que esto cuenta como fallida: la
  // petición murió a medias (Vercel la cortó, se cayó el servidor...).
  pendingExpiryMinutes: 5,
  // Lo que se espera a Gemini antes de rendirse.
  timeoutMs: 45_000,
} as const;

// Los <textarea> envían los saltos de línea como "\r\n", pero el navegador
// los cuenta como uno. Se pasan a "\n" antes de contar para que la tarjeta y
// el servidor cuenten lo mismo (como en lib/questions/validation.ts).
export function normalizarApuntes(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

// "1,8 MB" o "340 KB", para la tarjeta del archivo elegido. es-CO usa la coma
// decimal.
export function formatFileSize(bytes: number): string {
  const format = (value: number) =>
    new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(value);
  if (bytes < 1024 * 1024) return `${format(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${format(bytes / (1024 * 1024))} MB`;
}

// Mensajes de error que ve el usuario. Los del PDF los usan también la
// tarjeta (comprobación previa) y el servidor (la que cuenta).
export const AGENT_ERRORS = {
  limit: "Ya lo has invocado 3 veces hoy. Vuelve mañana con más apuntes.",
  emptyText: "Pega tus apuntes antes de invocar al escriba.",
  textTooLong: `Tus apuntes no pueden pasar de ${new Intl.NumberFormat("es-CO").format(AGENT.maxTextChars)} caracteres.`,
  noPdf: "Elige un PDF antes de invocar al escriba.",
  pdfTooBig: "Este PDF pesa más de 4 MB.",
  pdfNotPdf: "Ese archivo no es un PDF.",
  pdfTooManyPages: `Este PDF tiene más de ${AGENT.maxPdfPages} páginas.`,
  pdfUnreadable: "No he podido leer este PDF.",
  noQuestions: "No he encontrado texto con el que escribir preguntas.",
  subjectFull:
    "Esta materia ya tiene 200 preguntas, el máximo. Borra alguna para que el escriba pueda escribir más.",
  googleLimit:
    "El límite de Google está agotado. Inténtalo más tarde. Esta invocación no cuenta.",
  noResponse:
    "Gemini no respondió. Tus apuntes siguen aquí: inténtalo en unos minutos. Esta invocación no cuenta.",
  badResponse:
    "El escriba no ha podido terminar de escribir. Inténtalo de nuevo: esta invocación no cuenta.",
  unavailable: "El escriba no está disponible ahora mismo. Esta invocación no cuenta.",
} as const;
