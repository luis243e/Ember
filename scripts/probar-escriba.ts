// Pruebas del escriba contra la base LOCAL (Postgres de Docker), sin gastar
// cuota de Google. Ejecutar:
//   EMBER_FAKE_AGENT=1 node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-escriba.ts
// Con el servidor de desarrollo encendido (npm run dev) se puede añadir
// --payload para comprobar también el HTML y el payload de React.
//
// Comprueba:
//   1. la validación y el descarte de lo que escribe el modelo, el barajado,
//      el modo falso y el inicio del día de Colombia;
//   2. la comprobación del PDF (tamaño, tipo, cabecera, páginas) y las bombas
//      de descompresión; la lectura de la FormData;
//   3. el límite de 3 (las fallidas no cuentan), la concurrencia, la PENDING
//      caducada, el máximo de 200 y las repetidas del banco;
//   3b. el reintento único de Gemini ante un 503 (con un fetch falso);
//   4. que una sellada no se edita, que contestarla o esquivarla la revela y
//      que solo se puede retirar lo permitido;
//   5. el contraataque según la dificultad;
//   6. (--payload) que ninguna sellada llega al HTML ni al payload de React.
//
// Llama directamente a lib/ (como probar-contraataque.ts), sin la capa de las
// Server Actions, que solo añade la sesión. Crea usuarios temporales y los
// borra al final, también si algo falla (try/finally). Se niega a correr
// fuera de localhost.
import { assertLocalDatabase } from "@/scripts/local-only";

// ANTES de importar nada que cree el cliente de Prisma.
assertLocalDatabase("probar-escriba");

// El modo falso: el escriba devuelve preguntas de ejemplo sin llamar a Google.
if (process.env.EMBER_FAKE_AGENT !== "1" || process.env.NODE_ENV === "production") {
  console.error("probar-escriba necesita EMBER_FAKE_AGENT=1 (y no estar en producción). No se ha tocado nada.");
  process.exit(1);
}

const { prisma } = await import("@/lib/prisma");
const { prepararPreguntas, claveEnunciado } = await import("@/lib/agent/questions");
const { crearGenerador, generarPreguntas, GEMINI_RETRY, isFakeAgent } = await import("@/lib/agent/gemini");
const { comprobarPdf, contarPaginasPdf } = await import("@/lib/agent/pdf");
const { leerEntrada } = await import("@/lib/agent/input");
const { invocarEscribaDe, invocacionesRestantes } = await import("@/lib/agent/invocation");
const { AGENT, AGENT_ERRORS } = await import("@/lib/agent/rules");
const { startOfTodayInAppTimeZone } = await import("@/lib/dates");
const { guardarEdicion, PREGUNTA_SELLADA } = await import("@/lib/questions/edit");
const { asestarGolpeDe, responderPreguntaDe, retirarPreguntaDe } = await import("@/lib/battle");
const { COUNTERATTACK } = await import("@/lib/game");
const { parseItems } = await import("@/lib/questions/counterattack");
const pdfs = await import("@/scripts/pdf-de-prueba");
type AgentGenerator = import("@/lib/agent/gemini").AgentGenerator;

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: unknown): void {
  if (ok) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}`, detalle === undefined ? "" : detalle);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MC = (prompt: string, extra: Record<string, unknown> = {}) => ({
  type: "MULTIPLE_CHOICE",
  prompt,
  options: ["Correcta", "Distractor uno", "Distractor dos", "Distractor tres"],
  correctIndex: 0,
  explanation: "Porque sí.",
  ...extra,
});
const TF = (prompt: string, extra: Record<string, unknown> = {}) => ({
  type: "TRUE_FALSE",
  prompt,
  options: ["Verdadero", "Falso"],
  correctIndex: 1,
  explanation: "Porque no.",
  ...extra,
});

// ---------------------------------------------------------------------------
//  1. Lo que escribe el modelo
// ---------------------------------------------------------------------------
async function probarValidacion(): Promise<void> {
  console.log("\n1. Validación de lo que escribe el modelo");

  const raw = {
    questions: [
      MC("Válida de opción múltiple"),
      TF("Válida de verdadero o falso"),
      TF("Verdadero o falso en inglés", { options: ["True", "False"], correctIndex: 0 }),
      MC("Solo tres opciones", { options: ["a", "b", "c"] }),
      MC("Respuesta fuera de rango", { correctIndex: 4 }),
      MC("Respuesta como texto", { correctIndex: "1" }),
      MC("Sin explicación", { explanation: "   " }),
      MC("Opciones repetidas", { options: ["x", "X", "y", "z"] }),
      MC("x".repeat(501)),
      TF("Verdadero o falso al revés", { options: ["Falso", "Verdadero"] }),
      MC("  válida   DE opción múltiple "),
      MC("Ya estaba en el banco"),
      { type: "ESSAY", prompt: "Tipo inventado", options: [], correctIndex: 0, explanation: "x" },
      "no soy un objeto",
      null,
    ],
  };
  const { questions, discarded } = prepararPreguntas(raw, ["YA ESTABA  en el banco"]);
  check(
    `se quedan las 3 válidas y se descartan 12 (${questions.length} / ${discarded})`,
    questions.length === 3 && discarded === 12,
    questions.map((q) => q.prompt),
  );
  check(
    "verdadero o falso guarda siempre [Verdadero, Falso]",
    questions.filter((q) => q.type === "TRUE_FALSE").every((q) => q.options.join() === "Verdadero,Falso"),
  );
  const ingles = questions.find((q) => q.prompt === "Verdadero o falso en inglés");
  check("[True, False] con correctIndex 0 → Verdadero", ingles?.correctIndex === 0);
  check("las repetidas (en la tanda o en el banco) se descartan sin distinguir mayúsculas",
    !questions.some((q) => claveEnunciado(q.prompt) === claveEnunciado("Ya estaba en el banco")));

  const veinte = { questions: Array.from({ length: 20 }, (_, i) => MC(`Pregunta ${i}`)) };
  const recortadas = prepararPreguntas(veinte, []);
  check(`más de ${AGENT.maxQuestions}: se recorta a ${AGENT.maxQuestions}`, recortadas.questions.length === AGENT.maxQuestions);
  check("JSON sin questions → ninguna", prepararPreguntas({ otra: 1 }, []).questions.length === 0);
  check("respuesta que no es un objeto → ninguna", prepararPreguntas("hola", []).questions.length === 0);

  // El barajado: la correcta ("Correcta", en la posición 0) cae en las 4
  // posiciones más o menos igual, y siempre sigue siendo la correcta.
  const posiciones = [0, 0, 0, 0];
  let sigueSiendo = true;
  for (let i = 0; i < 2000; i++) {
    const [q] = prepararPreguntas({ questions: [MC(`Barajar ${i}`)] }, []).questions;
    posiciones[q.correctIndex]++;
    if (q.options[q.correctIndex] !== "Correcta" || new Set(q.options).size !== 4) sigueSiendo = false;
  }
  check("al barajar, la correcta sigue siendo la correcta", sigueSiendo);
  check(`la correcta cae repartida en las 4 posiciones (${posiciones.join(" / ")})`, posiciones.every((n) => n > 400 && n < 600));
  const [vf] = prepararPreguntas({ questions: [TF("No se baraja")] }, []).questions;
  check("verdadero o falso no se baraja", vf.correctIndex === 1 && vf.options[0] === "Verdadero");

  // El modo falso.
  check("modo falso activo en este script", isFakeAgent());
  const fake = await generarPreguntas({ kind: "TEXT", text: "Apuntes de ejemplo" });
  const preparadas = fake.ok ? prepararPreguntas(fake.raw, []) : null;
  check("el escriba falso da 4 válidas y 1 inválida", preparadas?.questions.length === 4 && preparadas.discarded === 1, preparadas);
  const nodeEnv = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  check("en producción el modo falso se ignora aunque EMBER_FAKE_AGENT=1", !isFakeAgent());
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;

  // El inicio del día de Colombia (00:00 en Bogotá = 05:00 UTC).
  check(
    "a las 22:00 de Bogotá del 11, el día empezó el 11 a las 05:00 UTC",
    startOfTodayInAppTimeZone(new Date("2026-10-12T03:00:00Z")).toISOString() === "2026-10-11T05:00:00.000Z",
  );
  check(
    "a la 01:00 de Bogotá del 12, el día empezó el 12 a las 05:00 UTC",
    startOfTodayInAppTimeZone(new Date("2026-10-12T06:00:00Z")).toISOString() === "2026-10-12T05:00:00.000Z",
  );
  check("el contraataque según la dificultad: fácil 1, media 2, difícil 3",
    COUNTERATTACK.questionsByDifficulty.EASY === 1 &&
    COUNTERATTACK.questionsByDifficulty.MEDIUM === 2 &&
    COUNTERATTACK.questionsByDifficulty.HARD === 3);
}

// ---------------------------------------------------------------------------
//  2. El PDF
// ---------------------------------------------------------------------------
async function probarPdf(): Promise<void> {
  console.log("\n2. El PDF");
  const pdfFile = { type: "application/pdf" };

  check("PDF clásico de 12 páginas → 12", contarPaginasPdf(pdfs.pdfSimple(12)) === 12);
  check("páginas dentro de un stream de objetos comprimido → 7", contarPaginasPdf(pdfs.pdfConObjStm(7)) === 7);
  check("sin /Count, se cuentan las hojas → 3", contarPaginasPdf(pdfs.pdfSoloHojas(3)) === 3);
  check("basura que empieza por %PDF- → ilegible", contarPaginasPdf(Buffer.from("%PDF-1.4\nnada por aquí")) === null);

  const ok40 = pdfs.pdfSimple(40);
  check("40 páginas → vale", comprobarPdf({ ...pdfFile, size: ok40.length }, ok40).ok);
  const mal41 = pdfs.pdfConObjStm(41);
  const r41 = comprobarPdf({ ...pdfFile, size: mal41.length }, mal41);
  check("41 páginas (en un stream de objetos) → más de 40", !r41.ok && r41.error === AGENT_ERRORS.pdfTooManyPages, r41);
  const r5mb = comprobarPdf({ ...pdfFile, size: 5 * 1024 * 1024 }, ok40);
  check("más de 4 MB → pesa demasiado", !r5mb.ok && r5mb.error === AGENT_ERRORS.pdfTooBig);
  const rTipo = comprobarPdf({ type: "text/plain", size: ok40.length }, ok40);
  check("tipo que no es application/pdf → no es un PDF", !rTipo.ok && rTipo.error === AGENT_ERRORS.pdfNotPdf);
  const falso = Buffer.from("hola, no soy un PDF");
  const rCabecera = comprobarPdf({ ...pdfFile, size: falso.length }, falso);
  check("sin la cabecera %PDF- → no es un PDF", !rCabecera.ok && rCabecera.error === AGENT_ERRORS.pdfNotPdf);
  const basura = Buffer.from("%PDF-1.4\nnada");
  const rIlegible = comprobarPdf({ ...pdfFile, size: basura.length }, basura);
  check("sin páginas que contar → ilegible", !rIlegible.ok && rIlegible.error === AGENT_ERRORS.pdfUnreadable);

  // Bombas de descompresión. La primera: 64 MB de ceros en ~64 KB.
  const bomba = pdfs.pdfConStreams(pdfs.streamBomba(64 * 1024 * 1024), 1);
  const rssAntes = process.memoryUsage().rss;
  const t0 = performance.now();
  const rBomba = comprobarPdf({ ...pdfFile, size: bomba.length }, bomba);
  const ms = performance.now() - t0;
  const crecio = (process.memoryUsage().rss - rssAntes) / (1024 * 1024);
  check(
    `bomba de 64 MB en ${Math.round(bomba.length / 1024)} KB → ilegible en ${Math.round(ms)} ms, memoria +${crecio.toFixed(1)} MB`,
    !rBomba.ok && rBomba.error === AGENT_ERRORS.pdfUnreadable && ms < 2000 && crecio < 40,
  );
  // Cinco streams de 7 MB: cada uno cabe en los 8 MB, pero juntos pasan de 32.
  const total = pdfs.pdfConStreams(pdfs.streamBomba(7 * 1024 * 1024), 5);
  check("5 streams de 7 MB (35 MB en total) → ilegible", contarPaginasPdf(total) === null);
  // 201 streams diminutos: más de los 200 que se intentan.
  const muchos = pdfs.pdfConStreams(pdfs.streamBomba(10), 201);
  check("201 streams de objetos → ilegible", contarPaginasPdf(muchos) === null);
  const doscientos = Buffer.concat([pdfs.pdfConStreams(pdfs.streamBomba(10), 199), pdfs.pdfSimple(2)]);
  check("199 streams y 2 páginas → se cuentan", contarPaginasPdf(doscientos) === 2);

  // La FormData, como la manda la tarjeta.
  const fd = (entries: Record<string, string | File>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.set(key, value);
    return data;
  };
  const texto = (r: Awaited<ReturnType<typeof leerEntrada>>) => (r.ok ? "ok" : r.error);
  check("texto vacío → pega tus apuntes", texto(await leerEntrada(fd({ kind: "TEXT", notes: "   " }))) === AGENT_ERRORS.emptyText);
  check(
    `más de ${AGENT.maxTextChars} caracteres → demasiado largo`,
    texto(await leerEntrada(fd({ kind: "TEXT", notes: "x".repeat(AGENT.maxTextChars + 1) }))) === AGENT_ERRORS.textTooLong,
  );
  const conCrlf = `${"x".repeat(10_000)}\r\n${"x".repeat(9_999)}`; // 20.001 tal cual, 20.000 contando \r\n como uno
  check("\\r\\n cuenta como un carácter (20.000 justos → vale)", texto(await leerEntrada(fd({ kind: "TEXT", notes: conCrlf }))) === "ok");
  check("modo inventado → error", texto(await leerEntrada(fd({ kind: "AUDIO" }))) !== "ok");
  check("PDF sin archivo → elige un PDF", texto(await leerEntrada(fd({ kind: "PDF" }))) === AGENT_ERRORS.noPdf);
  const archivo = (bytes: Buffer, type = "application/pdf") => new File([new Uint8Array(bytes)], "apuntes.pdf", { type });
  check("PDF de 3 páginas → vale", texto(await leerEntrada(fd({ kind: "PDF", pdf: archivo(pdfs.pdfSimple(3)) }))) === "ok");
  check(
    "PDF de 5 MB → pesa demasiado (sin leerlo)",
    texto(await leerEntrada(fd({ kind: "PDF", pdf: archivo(Buffer.alloc(5 * 1024 * 1024)) }))) === AGENT_ERRORS.pdfTooBig,
  );
  check(
    "archivo de texto con nombre .pdf → no es un PDF",
    texto(await leerEntrada(fd({ kind: "PDF", pdf: archivo(Buffer.from("hola"), "text/plain") }))) === AGENT_ERRORS.pdfNotPdf,
  );
}

// ---------------------------------------------------------------------------
//  3. Límite, concurrencia y máximo
// ---------------------------------------------------------------------------
const TEXT_INPUT = { kind: "TEXT" as const, text: "Apuntes de ejemplo sobre derivadas." };
const falla = (failure: "googleLimit" | "noResponse"): AgentGenerator => async () => ({ ok: false, failure });
const conRaw = (raw: unknown): AgentGenerator => async () => ({ ok: true, raw });

async function probarLimite(userId: string, otherId: string): Promise<void> {
  console.log("\n3. Límite diario, concurrencia y máximo");
  const subject = await prisma.subject.create({ data: { name: "Cálculo", userId } });

  // Un fallo no cuenta.
  const r429 = await invocarEscribaDe(userId, subject.id, TEXT_INPUT, falla("googleLimit"));
  check("429 → el límite de Google está agotado", !r429.ok && r429.error === AGENT_ERRORS.googleLimit, r429);
  const r5xx = await invocarEscribaDe(userId, subject.id, TEXT_INPUT, falla("noResponse"));
  check("5xx o timeout → Gemini no respondió", !r5xx.ok && r5xx.error === AGENT_ERRORS.noResponse, r5xx);
  const rVacia = await invocarEscribaDe(userId, subject.id, TEXT_INPUT, conRaw({ questions: [MC("Mala", { options: [] })] }));
  check("ninguna válida → no he encontrado texto", !rVacia.ok && rVacia.error === AGENT_ERRORS.noQuestions, rVacia);
  check("las tres fallidas quedan FAILED y no cuentan (quedan 3)",
    (await prisma.agentInvocation.count({ where: { userId, status: "FAILED" } })) === 3 &&
    (await invocacionesRestantes(userId)) === 3);
  check("nada se guardó al fallar", (await prisma.question.count({ where: { subjectId: subject.id } })) === 0);

  // Con éxito: AGENT, selladas, y la invocación OK.
  const r1 = await invocarEscribaDe(userId, subject.id, TEXT_INPUT);
  check("invocación con éxito → 4 preguntas (la inválida se descarta)", r1.ok && r1.created === 4, r1);
  const guardadas = await prisma.question.findMany({ where: { subjectId: subject.id } });
  check("todas AGENT y selladas", guardadas.length === 4 && guardadas.every((q) => q.source === "AGENT" && q.sealed));
  const inv = await prisma.agentInvocation.findFirst({ where: { userId, status: "OK" } });
  check("la invocación queda OK, con questionsCreated y finishedAt", inv?.questionsCreated === 4 && inv.finishedAt !== null && inv.inputKind === "TEXT");
  const columnas = Object.keys(inv ?? {}).sort().join(",");
  check("AgentInvocation no guarda apuntes ni nombre de archivo",
    columnas === "createdAt,finishedAt,id,inputKind,questionsCreated,status,subjectId,userId", columnas);

  // Repetidas del banco: el escriba vuelve a escribir una que ya está.
  const existente = guardadas[0].prompt;
  const rRep = await invocarEscribaDe(userId, subject.id, TEXT_INPUT, conRaw({
    questions: [MC(existente.toUpperCase()), MC("Una nueva de verdad")],
  }));
  check("la que ya estaba en el banco se descarta; la nueva se guarda", rRep.ok && rRep.created === 1, rRep);

  // Tercera con éxito y la cuarta, rechazada.
  check("tras 2 con éxito quedan 1", (await invocacionesRestantes(userId)) === 1);
  const r3 = await invocarEscribaDe(userId, subject.id, TEXT_INPUT);
  const r4 = await invocarEscribaDe(userId, subject.id, TEXT_INPUT);
  check("la tercera vale", r3.ok, r3);
  check("la cuarta → el escriba descansa", !r4.ok && r4.limit && r4.error === AGENT_ERRORS.limit, r4);
  check("la cuarta no crea fila", (await prisma.agentInvocation.count({ where: { userId } })) === 6);

  // Las de ayer no cuentan; una PENDING caducada tampoco (y se cierra).
  const otra = await prisma.subject.create({ data: { name: "Física", userId: otherId } });
  const inicioHoy = startOfTodayInAppTimeZone();
  await prisma.agentInvocation.createMany({
    data: [
      ...Array.from({ length: 3 }, () => ({
        userId: otherId, subjectId: otra.id, inputKind: "TEXT" as const, status: "OK" as const,
        createdAt: new Date(inicioHoy.getTime() - 60_000),
      })),
      { userId: otherId, subjectId: otra.id, inputKind: "PDF" as const, status: "PENDING" as const,
        createdAt: new Date(Date.now() - (AGENT.pendingExpiryMinutes + 1) * 60_000) },
    ],
  });
  check("3 de ayer y 1 PENDING caducada → quedan 3 hoy", (await invocacionesRestantes(otherId)) === 3);
  await invocarEscribaDe(otherId, otra.id, TEXT_INPUT);
  check("al invocar, la PENDING caducada pasa a FAILED",
    (await prisma.agentInvocation.count({ where: { userId: otherId, status: "PENDING" } })) === 0 &&
    (await prisma.agentInvocation.count({ where: { userId: otherId, status: "FAILED", inputKind: "PDF" } })) === 1);
  // Una PENDING reciente SÍ cuenta (puede estar en curso).
  await prisma.agentInvocation.create({
    data: { userId: otherId, subjectId: otra.id, inputKind: "TEXT", status: "PENDING", createdAt: new Date(Date.now() - 60_000) },
  });
  check("una PENDING de hace 1 minuto cuenta (quedan 1)", (await invocacionesRestantes(otherId)) === 1);
  await prisma.agentInvocation.deleteMany({ where: { userId: otherId } });

  // Concurrencia: 6 clics a la vez. El generador tarda un poco para que se
  // solapen de verdad.
  const lento: AgentGenerator = async (input) => {
    await sleep(300);
    return generarPreguntas(input);
  };
  const concurrente = await prisma.subject.create({ data: { name: "Concurrencia", userId: otherId } });
  const resultados = await Promise.all(
    Array.from({ length: 6 }, () => invocarEscribaDe(otherId, concurrente.id, TEXT_INPUT, lento)),
  );
  const oks = resultados.filter((r) => r.ok).length;
  const limites = resultados.filter((r) => !r.ok && r.limit).length;
  check(`6 a la vez → ${oks} con éxito y ${limites} rechazadas por el límite (3 y 3)`, oks === 3 && limites === 3, resultados);
  check("en la base, exactamente 3 OK",
    (await prisma.agentInvocation.count({ where: { userId: otherId, status: "OK" } })) === 3);

  // El máximo de 200.
  const llena = await prisma.subject.create({ data: { name: "Llena", userId: otherId } });
  await prisma.question.createMany({
    data: Array.from({ length: 200 }, (_, i) => ({
      subjectId: llena.id, type: "TRUE_FALSE" as const, prompt: `Relleno ${i}`, options: ["Verdadero", "Falso"], correctIndex: 0,
    })),
  });
  await prisma.agentInvocation.deleteMany({ where: { userId: otherId } });
  let llamadas = 0;
  const espia: AgentGenerator = async (input) => {
    llamadas++;
    return generarPreguntas(input);
  };
  const rLlena = await invocarEscribaDe(otherId, llena.id, TEXT_INPUT, espia);
  check("materia con 200 → error ANTES de llamar a Gemini",
    !rLlena.ok && rLlena.error === AGENT_ERRORS.subjectFull && llamadas === 0, { rLlena, llamadas });
  check("…y sin gastar invocación", (await prisma.agentInvocation.count({ where: { userId: otherId } })) === 0);
  await prisma.question.deleteMany({ where: { subjectId: llena.id, prompt: { in: ["Relleno 0", "Relleno 1"] } } });
  const r198 = await invocarEscribaDe(otherId, llena.id, TEXT_INPUT, espia);
  check("materia con 198 → solo se guardan 2 (recorte a 200)",
    r198.ok && r198.created === 2 && (await prisma.question.count({ where: { subjectId: llena.id } })) === 200, r198);
}

// ---------------------------------------------------------------------------
//  3b. El reintento del 503
// ---------------------------------------------------------------------------

// Respuestas falsas de Google, en orden. "red" = el fetch lanza (sin conexión).
type Falsa = { status: number; body?: unknown } | "red";
const exito = {
  status: 200,
  body: {
    candidates: [{
      finishReason: "STOP",
      content: { parts: [{ text: JSON.stringify({ questions: [MC("Tras el reintento A"), TF("Tras el reintento B")] }) }] },
    }],
  },
};
const no503 = { status: 503, body: { error: { code: 503, status: "UNAVAILABLE" } } };

// Un generador de verdad (crearGenerador) con un fetch falso que devuelve las
// respuestas en orden, una espera que no espera (apunta cuánto) y un reloj
// que se puede adelantar. Nada sale a la red.
function generadorFalso(respuestas: Falsa[], relojAlComprobar?: number) {
  const registro = { llamadas: 0, esperas: [] as number[] };
  let lecturasDelReloj = 0;
  const generar = crearGenerador({
    apiKey: "clave-de-prueba",
    model: "modelo-de-prueba",
    fetch: (async () => {
      const r = respuestas[registro.llamadas++];
      if (!r || r === "red") throw new TypeError("fetch failed");
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }) as typeof fetch,
    sleep: async (ms) => {
      registro.esperas.push(ms);
    },
    // La 1.ª lectura fija el plazo (t = 0); las siguientes, si se pide, dicen
    // que ya pasaron `relojAlComprobar` ms.
    now: () => (lecturasDelReloj++ === 0 ? 0 : (relojAlComprobar ?? 1_000)),
  });
  return { generar, registro };
}

async function probarReintento(userId: string): Promise<void> {
  console.log("\n3b. Reintento de Gemini ante un 503");
  const subject = await prisma.subject.create({ data: { name: "Reintentos", userId } });
  const estado = async () => ({
    ok: await prisma.agentInvocation.count({ where: { userId, status: "OK" } }),
    failed: await prisma.agentInvocation.count({ where: { userId, status: "FAILED" } }),
  });

  // 503 y después éxito: un solo reintento, tras esperar 2 s, y cuenta.
  const a = generadorFalso([no503, exito]);
  const rA = await invocarEscribaDe(userId, subject.id, TEXT_INPUT, a.generar);
  check("503 y luego éxito → se guardan las preguntas", rA.ok && rA.created === 2, rA);
  check(`…con 2 llamadas y una espera de ${GEMINI_RETRY.delayMs} ms`,
    a.registro.llamadas === 2 && a.registro.esperas.join() === String(GEMINI_RETRY.delayMs), a.registro);
  check("…y la invocación cuenta (1 OK, quedan 2)", (await estado()).ok === 1 && (await invocacionesRestantes(userId)) === 2);

  // 503 dos veces: no hay tercer intento, «Gemini no respondió» y no cuenta.
  const b = generadorFalso([no503, no503, exito]);
  const rB = await invocarEscribaDe(userId, subject.id, TEXT_INPUT, b.generar);
  check("503 dos veces → Gemini no respondió", !rB.ok && rB.error === AGENT_ERRORS.noResponse, rB);
  check("…con solo 2 llamadas (un único reintento)", b.registro.llamadas === 2, b.registro);
  check("…y no cuenta (FAILED, siguen quedando 2)", (await estado()).failed === 1 && (await invocacionesRestantes(userId)) === 2);

  // El código UNAVAILABLE también se reintenta, aunque el estado HTTP sea otro.
  const c = generadorFalso([{ status: 500, body: { error: { status: "UNAVAILABLE" } } }, exito]);
  const rC = await c.generar(TEXT_INPUT);
  check("código UNAVAILABLE con HTTP 500 → se reintenta y sale bien", rC.ok && c.registro.llamadas === 2, c.registro);

  // Lo que NO se reintenta.
  const d = generadorFalso([{ status: 429, body: { error: { status: "RESOURCE_EXHAUSTED" } } }, exito]);
  const rD = await d.generar(TEXT_INPUT);
  check("429 → no se reintenta (1 llamada) y es el límite de Google",
    !rD.ok && rD.failure === "googleLimit" && d.registro.llamadas === 1, { rD, registro: d.registro });
  const e = generadorFalso([{ status: 400, body: { error: { status: "INVALID_ARGUMENT" } } }, exito]);
  const rE = await e.generar(TEXT_INPUT);
  check("400 → no se reintenta (1 llamada)", !rE.ok && rE.failure === "unavailable" && e.registro.llamadas === 1, e.registro);
  const f = generadorFalso([{ status: 500, body: { error: { status: "INTERNAL" } } }, exito]);
  const rF = await f.generar(TEXT_INPUT);
  check("500 sin UNAVAILABLE → no se reintenta (1 llamada)", !rF.ok && rF.failure === "noResponse" && f.registro.llamadas === 1, f.registro);
  const g = generadorFalso(["red", exito]);
  const rG = await g.generar(TEXT_INPUT);
  check("fallo de red → no se reintenta (1 llamada)", !rG.ok && rG.failure === "noResponse" && g.registro.llamadas === 1, g.registro);

  // Sin tiempo: el 503 llega a los 34 s; tras esperar 2 s quedarían 9 s,
  // menos de los 10 s mínimos → no se reintenta.
  const h = generadorFalso([no503, exito], 34_000);
  const rH = await h.generar(TEXT_INPUT);
  check("503 a los 34 s (quedarían 9 s) → no se reintenta",
    !rH.ok && rH.failure === "noResponse" && h.registro.llamadas === 1 && h.registro.esperas.length === 0, h.registro);
  const i = generadorFalso([no503, exito], 33_000);
  const rI = await i.generar(TEXT_INPUT);
  check("503 a los 33 s (quedarían 10 s justos) → sí se reintenta", rI.ok && i.registro.llamadas === 2, i.registro);
}

// ---------------------------------------------------------------------------
//  4. Selladas: editar, revelar y retirar
// ---------------------------------------------------------------------------
const DAY = 24 * 60 * 60 * 1000;

async function vigiliaCerrada(userId: string, taskId: string) {
  const now = Date.now();
  return prisma.studySession.create({
    data: { taskId, userId, startedAt: new Date(now - 60_000), endsAt: new Date(now - 1000), completedAt: new Date(now - 500), durationMinutes: 1 },
  });
}

async function probarSelladas(userId: string, otherId: string): Promise<void> {
  console.log("\n4. Selladas: editar, revelar y retirar");
  const subject = await prisma.subject.create({ data: { name: "Química", userId } });
  const crear = (data: { prompt: string; source: "AGENT" | "MANUAL"; sealed: boolean; type?: "MULTIPLE_CHOICE" | "TRUE_FALSE" }) =>
    prisma.question.create({
      data: {
        subjectId: subject.id,
        type: data.type ?? "MULTIPLE_CHOICE",
        options: data.type === "TRUE_FALSE" ? ["Verdadero", "Falso"] : ["a", "b", "c", "d"],
        correctIndex: 0,
        explanation: "Porque sí.",
        prompt: data.prompt,
        source: data.source,
        sealed: data.sealed,
      },
    });
  const a1 = await crear({ prompt: "Del escriba 1", source: "AGENT", sealed: true });
  const manual = await crear({ prompt: "Manual", source: "MANUAL", sealed: false });
  const a2 = await crear({ prompt: "Del escriba 2", source: "AGENT", sealed: true, type: "TRUE_FALSE" });

  // La base no admite una MANUAL sellada.
  let rechazada = false;
  try {
    await crear({ prompt: "Manual sellada", source: "MANUAL", sealed: true });
  } catch {
    rechazada = true;
  }
  check("CHECK de la base: una MANUAL no puede estar sellada", rechazada);

  // Editar una sellada → no.
  const nueva = { type: "MULTIPLE_CHOICE" as const, prompt: "Cambiada", options: ["1", "2", "3", "4"], correctIndex: 1, explanation: null };
  const rEditar = await guardarEdicion(a1.id, nueva);
  const a1Despues = await prisma.question.findUniqueOrThrow({ where: { id: a1.id } });
  check("editar una sellada → rechazado y sin cambios", rEditar === "sealed" && a1Despues.prompt === "Del escriba 1");
  check("el mensaje lo dice", PREGUNTA_SELLADA.includes("sellada"));

  // Un contraataque a mano con: [a1, manual, genérica, a2].
  const task = await prisma.task.create({
    data: { name: "Jefe", subjectId: subject.id, dueDate: new Date(Date.now() + 30 * DAY), difficulty: "HARD", maxHp: 600, currentHp: 600, bossKey: "dragon-de-la-caverna" },
  });
  const vigilia = await vigiliaCerrada(userId, task.id);
  const ca = await prisma.counterattack.create({
    data: {
      studySessionId: vigilia.id,
      userId,
      items: [
        { ref: a1.id, order: [0, 1, 2, 3] },
        { ref: manual.id, order: [0, 1, 2, 3] },
        { ref: "generic:explicar-sin-apuntes", order: [0, 1] },
        { ref: a2.id, order: [0, 1] },
      ],
    },
  });

  const noContestada = await retirarPreguntaDe(userId, ca.id, 0);
  check("retirar una que aún no se ha contestado → no", noContestada !== null && !noContestada.ok, noContestada);

  const almas0 = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).souls;
  const r0 = await responderPreguntaDe(userId, ca.id, 0, 0);
  const a1Revelada = await prisma.question.findUniqueOrThrow({ where: { id: a1.id } });
  check("contestar la sellada la revela", r0?.ok === true && !a1Revelada.sealed, r0);
  const almas1 = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).souls;
  check("acertarla da sus almas (+15)", almas1 - almas0 === 15, { almas0, almas1 });

  const deOtro = await retirarPreguntaDe(otherId, ca.id, 0);
  check("retirar desde otro usuario → null (404)", deOtro === null);

  await responderPreguntaDe(userId, ca.id, 1, 0);
  const rManual = await retirarPreguntaDe(userId, ca.id, 1);
  check("retirar una MANUAL → no", rManual !== null && !rManual.ok && (await prisma.question.count({ where: { id: manual.id } })) === 1);
  await responderPreguntaDe(userId, ca.id, 2, 0);
  const rGenerica = await retirarPreguntaDe(userId, ca.id, 2);
  check("retirar una genérica → no", rGenerica !== null && !rGenerica.ok);
  const rFuera = await retirarPreguntaDe(userId, ca.id, 9);
  check("retirar un número fuera de rango → no", rFuera !== null && !rFuera.ok);

  const caAntes = await prisma.counterattack.findUniqueOrThrow({ where: { id: ca.id } });
  const almasAntes = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).souls;
  const rRetirar = await retirarPreguntaDe(userId, ca.id, 0);
  const caDespues = await prisma.counterattack.findUniqueOrThrow({ where: { id: ca.id } });
  const almas2 = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).souls;
  check("retirar la del escriba ya contestada → sí, y desaparece del banco",
    rRetirar?.ok === true && (await prisma.question.count({ where: { id: a1.id } })) === 0, rRetirar);
  check("las almas no cambian (ni las del usuario ni las del contraataque)",
    almas2 === almasAntes && caDespues.soulsDelta === caAntes.soulsDelta && caDespues.answered === caAntes.answered,
    { almasAntes, almas2, antes: caAntes.soulsDelta, despues: caDespues.soulsDelta });
  const otraVez = await retirarPreguntaDe(userId, ca.id, 0);
  check("retirarla otra vez → no (ya no existe)", otraVez !== null && !otraVez.ok);

  // Esquivar también revela; y se puede retirar con el contraataque ya terminado.
  await responderPreguntaDe(userId, ca.id, 3, null);
  const a2Revelada = await prisma.question.findUniqueOrThrow({ where: { id: a2.id } });
  check("esquivar la sellada también la revela", !a2Revelada.sealed);
  const caFin = await prisma.counterattack.findUniqueOrThrow({ where: { id: ca.id } });
  const rFin = await retirarPreguntaDe(userId, ca.id, 3);
  check("con el contraataque terminado, la última se puede retirar", caFin.finishedAt !== null && rFin?.ok === true, rFin);

  // Editar una del escriba YA revelada: se edita, sus intentos se borran y NO
  // se vuelve a sellar (por eso el sello es una columna).
  const a3 = await crear({ prompt: "Del escriba 3", source: "AGENT", sealed: false });
  await prisma.questionAttempt.create({ data: { questionId: a3.id, userId, correct: true, soulsDelta: 15 } });
  const rA3 = await guardarEdicion(a3.id, { ...nueva, prompt: "Del escriba 3, corregida" });
  const a3Despues = await prisma.question.findUniqueOrThrow({ where: { id: a3.id } });
  check("editar una del escriba revelada → se guarda, sigue AGENT y NO se vuelve a sellar",
    rA3 === "ok" && a3Despues.prompt === "Del escriba 3, corregida" && a3Despues.source === "AGENT" && !a3Despues.sealed);
  check("…y sus intentos se borran (es otra pregunta)", (await prisma.questionAttempt.count({ where: { questionId: a3.id } })) === 0);
}

// ---------------------------------------------------------------------------
//  5. El contraataque según la dificultad
// ---------------------------------------------------------------------------
async function probarDificultad(userId: string): Promise<void> {
  console.log("\n5. El contraataque según la dificultad");
  const conPreguntas = await prisma.subject.create({ data: { name: "Con 4 preguntas", userId } });
  await prisma.question.createMany({
    data: Array.from({ length: 4 }, (_, i) => ({
      subjectId: conPreguntas.id, type: "TRUE_FALSE" as const, prompt: `P${i}`, options: ["Verdadero", "Falso"], correctIndex: 0,
    })),
  });
  const vacia = await prisma.subject.create({ data: { name: "Vacía", userId } });
  const HP = { EASY: 200, MEDIUM: 400, HARD: 600 } as const;
  const BOSS = { EASY: "rata-de-las-cloacas", MEDIUM: "caballero-hueco", HARD: "liche-del-osario" } as const;

  for (const [subject, etiqueta] of [[conPreguntas, "del banco"], [vacia, "genéricas"]] as const) {
    for (const difficulty of ["EASY", "MEDIUM", "HARD"] as const) {
      const task = await prisma.task.create({
        data: { name: `${difficulty}`, subjectId: subject.id, dueDate: new Date(Date.now() + 30 * DAY), difficulty, maxHp: HP[difficulty], currentHp: HP[difficulty], bossKey: BOSS[difficulty] },
        select: { id: true, subjectId: true },
      });
      const now = Date.now();
      const vigilia = await prisma.studySession.create({
        data: { taskId: task.id, userId, startedAt: new Date(now - 60_000), endsAt: new Date(now - 1000), durationMinutes: 1 },
      });
      await asestarGolpeDe(userId, task);
      const ca = await prisma.counterattack.findUnique({ where: { studySessionId: vigilia.id } });
      const n = ca ? parseItems(ca.items).length : 0;
      const esperado = COUNTERATTACK.questionsByDifficulty[difficulty];
      check(`${difficulty} (${etiqueta}) → ${n} pregunta(s), se esperaban ${esperado}`, n === esperado);
      // Cerrarlo, para que el siguiente golpe no choque con nada.
      if (ca) await prisma.counterattack.update({ where: { id: ca.id }, data: { finishedAt: new Date() } });
    }
  }
}

// ---------------------------------------------------------------------------
//  6. El payload (--payload, con npm run dev encendido)
// ---------------------------------------------------------------------------
const BASE = "http://localhost:3000";

async function probarPayload(userId: string, email: string, password: string): Promise<void> {
  console.log("\n6. Ninguna sellada llega al navegador");
  const { randomBytes } = await import("node:crypto");
  // Dos marcas distintas: la de la revelada no puede contener la de la sellada.
  const marca = `SELLADA${randomBytes(4).toString("hex")}`;
  const marcaRevelada = `REVELADA${randomBytes(4).toString("hex")}`;
  const subject = await prisma.subject.create({ data: { name: "Payload", userId } });
  const sellada = await prisma.question.create({
    data: {
      subjectId: subject.id, type: "MULTIPLE_CHOICE", source: "AGENT", sealed: true,
      prompt: `${marca}-ENUNCIADO`, options: [`${marca}-OPC0`, `${marca}-OPC1`, `${marca}-OPC2`, `${marca}-OPC3`],
      correctIndex: 2, explanation: `${marca}-EXPLICACION`,
    },
  });
  await prisma.question.create({
    data: {
      subjectId: subject.id, type: "TRUE_FALSE", source: "AGENT", sealed: false,
      prompt: marcaRevelada, options: ["Verdadero", "Falso"], correctIndex: 0, explanation: "Visible.",
    },
  });

  // La cookie vive SOLO en memoria: ni se imprime ni se guarda.
  const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  check("inicio de sesión de la cuenta temporal", login.ok && cookie !== "", login.status);

  // El payload de React se pide como lo pide el navegador al navegar: con la
  // cabecera RSC: 1. Next 16 exige además un parámetro _rsc concreto y, si no
  // está, responde 307 hacia la misma ruta con él: se sigue SOLO esa
  // redirección (cualquier otra, como la de /login, cuenta como fallo).
  const pedir = async (path: string, rsc: boolean) => {
    const get = (url: string) =>
      fetch(`${BASE}${url}`, { headers: { Cookie: cookie, ...(rsc ? { RSC: "1" } : {}) }, redirect: "manual" });
    let response = await get(path);
    const location = response.headers.get("location");
    if (rsc && response.status === 307 && location?.includes("_rsc")) response = await get(location);
    return { status: response.status, body: await response.text() };
  };
  const rutas = [`/materias/${subject.id}`, `/materias/${subject.id}?editar=${sellada.id}`];
  for (const ruta of rutas) {
    for (const rsc of [false, true]) {
      const { status, body } = await pedir(ruta, rsc);
      const tipo = rsc ? "payload RSC" : "HTML";
      check(`${ruta.replace(subject.id, "<id>").replace(sellada.id, "<sellada>")} (${tipo}): 200`, status === 200, status);
      check(`  …sin ningún rastro de la sellada (${tipo})`, !body.includes(marca), body.indexOf(marca));
      check(`  …con la revelada (${tipo})`, body.includes(marcaRevelada));
      check(`  …con la tarjeta "Pregunta sellada" (${tipo})`, body.includes("Pregunta sellada"));
    }
  }

  await fetch(`${BASE}/api/auth/sign-out`, { method: "POST", headers: { Cookie: cookie, Origin: BASE } });
}

// ---------------------------------------------------------------------------
//  Ejecución
// ---------------------------------------------------------------------------
const EMAILS = ["probar-escriba@ember.test", "probar-escriba-otro@ember.test", "probar-escriba-reintento@ember.test"];
const conPayload = process.argv.includes("--payload");

// Por si una ejecución anterior se cortó a medias.
await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });

try {
  await probarValidacion();
  await probarPdf();
  const user = await prisma.user.create({
    data: { email: EMAILS[0], name: "Temporal del escriba", emailVerified: true, souls: 600, level: 2 },
  });
  const other = await prisma.user.create({ data: { email: EMAILS[1], name: "Otro temporal", emailVerified: true } });
  await probarLimite(user.id, other.id);
  const tercero = await prisma.user.create({ data: { email: EMAILS[2], name: "Temporal de los reintentos", emailVerified: true } });
  await probarReintento(tercero.id);
  await probarSelladas(user.id, other.id);
  await probarDificultad(user.id);

  if (conPayload) {
    // Una contraseña de usar y tirar para la cuenta temporal, como el seed.
    const { hashPassword } = await import("better-auth/crypto");
    const { randomBytes } = await import("node:crypto");
    const password = randomBytes(12).toString("hex");
    await prisma.account.create({
      data: { id: randomBytes(12).toString("hex"), accountId: user.id, providerId: "credential", userId: user.id, password: await hashPassword(password) },
    });
    await probarPayload(user.id, EMAILS[0], password);
  }
} catch (error) {
  fallos++;
  console.error("\nError inesperado:", error);
} finally {
  // En cascada: materias, preguntas, invocaciones, jefes, vigilias, sesiones...
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  const quedan = await prisma.user.count({ where: { email: { in: EMAILS } } });
  console.log(quedan === 0 ? "\nUsuarios temporales borrados." : "\n⚠ No se pudieron borrar los usuarios temporales.");
  await prisma.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} comprobación(es) fallida(s).`);
process.exitCode = fallos === 0 ? 0 : 1;
