// Invocar al escriba: el límite diario, la llamada a Gemini y el guardado de
// las preguntas selladas.
//
// ⚠ SOLO del servidor, y confía en lo que recibe: la llama la Server Action
// invocarEscriba (app/materias/[id]/actions.ts), que antes comprueba la sesión
// y que la materia sea del usuario, y scripts/probar-escriba.ts.
//
// EL FLUJO, en tres tiempos:
//   1. RESERVAR. En una transacción: bloquear la fila del usuario, contar las
//      invocaciones de hoy que cuentan y, si queda alguna, crear una PENDING.
//      Con la fila bloqueada, dos clics a la vez se ponen en fila: el segundo
//      cuenta ya la PENDING del primero y nunca pasan de 3 entre los dos.
//   2. LLAMAR A GEMINI, FUERA de cualquier transacción. Tarda segundos: una
//      transacción abierta tanto tiempo tendría al usuario bloqueado (y el
//      golpe de la batalla, que también lo bloquea, esperando).
//   3. GUARDAR. En otra transacción: bloquear la materia, recortar al máximo
//      de 200, crear las preguntas (AGENT, selladas) y marcar la invocación
//      OK. Si algo falla por el camino, la invocación queda FAILED y no cuenta.
//
// ORDEN DE BLOQUEOS: la reserva bloquea SOLO el usuario; el guardado, SOLO la
// materia (como crearPregunta). Nunca los dos en la misma transacción, así
// que no pueden esperarse en círculo con la batalla (que bloquea tarea →
// vigilia → contraataque → usuario → misión) ni con el banco.
import { prisma } from "@/lib/prisma";
import { startOfTodayInAppTimeZone } from "@/lib/dates";
import { generarPreguntas, isAgentConfigured, type AgentGenerator, type AgentInput } from "@/lib/agent/gemini";
import type { EscribaRequest } from "@/lib/agent/input";
import { prepararPreguntas } from "@/lib/agent/questions";
import { preguntasParaRefuerzo } from "@/lib/agent/reinforce";
import { AGENT, AGENT_ERRORS } from "@/lib/agent/rules";
import { MAX_QUESTIONS_PER_SUBJECT } from "@/lib/questions/validation";
import type { Prisma } from "@prisma/client";

export type ResultadoEscriba =
  | { ok: true; created: number }
  // limit: el error es el del límite diario (la tarjeta enseña "El escriba
  // descansa" en vez de "no ha podido escribir").
  | { ok: false; error: string; limit: boolean };

const MINUTE_MS = 60 * 1000;

// Las invocaciones de hoy (día de Colombia) que cuentan para el límite: las OK
// y las PENDING recientes (una puede estar en curso). Una PENDING de hace más
// de AGENT.pendingExpiryMinutes cuenta como fallida.
function cuentanHoy(userId: string, now: Date): Prisma.AgentInvocationWhereInput {
  const expiry = new Date(now.getTime() - AGENT.pendingExpiryMinutes * MINUTE_MS);
  return {
    userId,
    createdAt: { gte: startOfTodayInAppTimeZone(now) },
    OR: [{ status: "OK" }, { status: "PENDING", createdAt: { gt: expiry } }],
  };
}

// Los temas de la materia que se le pasan al escriba para que los reutilice:
// los AGENT.maxTopicsSent más usados (con más preguntas), con un groupBy de
// Prisma: GROUP BY "topic" con COUNT(*), ordenado por ese recuento. Incluye
// los de las selladas: esto no sale hacia el navegador, solo hacia Gemini.
export async function temasParaElEscriba(subjectId: string): Promise<string[]> {
  const groups = await prisma.question.groupBy({
    by: ["topic"],
    where: { subjectId, topic: { not: null } },
    _count: { _all: true },
    orderBy: [{ _count: { topic: "desc" } }, { topic: "asc" }],
    take: AGENT.maxTopicsSent,
  });
  return groups.flatMap((group) => (group.topic === null ? [] : [group.topic]));
}

// Las que le quedan hoy, para la tarjeta ("Te quedan 2 de 3 invocaciones hoy").
export async function invocacionesRestantes(userId: string, now: Date = new Date()): Promise<number> {
  const used = await prisma.agentInvocation.count({ where: cuentanHoy(userId, now) });
  return Math.max(0, AGENT.dailyInvocations - used);
}

const fallo = (error: string, limit = false): ResultadoEscriba => ({ ok: false, error, limit });

// generar: la función que llama a Gemini; el script de pruebas pasa otra para
// simular respuestas y fallos sin gastar cuota.
// request: apuntes (TEXT, PDF) o REINFORCE. En el refuerzo, las preguntas
// falladas las elige aquí el servidor, ANTES de reservar: si no hay bastantes,
// el error no gasta invocación.
export async function invocarEscribaDe(
  userId: string,
  subjectId: string,
  request: EscribaRequest,
  generar: AgentGenerator = generarPreguntas,
  now: Date = new Date(),
): Promise<ResultadoEscriba> {
  if (!isAgentConfigured()) return fallo(AGENT_ERRORS.unavailable);

  // La materia llena: error ANTES de llamar a Gemini (y sin gastar cuota).
  // Se vuelve a comprobar al guardar, con la materia bloqueada.
  const total = await prisma.question.count({ where: { subjectId } });
  if (total >= MAX_QUESTIONS_PER_SUBJECT) return fallo(AGENT_ERRORS.subjectFull);

  // Lo que se le da al escriba. En el refuerzo, solo las preguntas elegidas
  // (como mucho 10) y sin la lista de temas de la materia: a Google no va
  // nada más que esas preguntas.
  let input: AgentInput;
  if (request.kind === "REINFORCE") {
    const refuerzo = await preguntasParaRefuerzo(userId, subjectId);
    if (refuerzo.candidates < AGENT.reinforce.minFailed) return fallo(AGENT_ERRORS.notEnoughFailed);
    input = { kind: "REINFORCE", questions: refuerzo.questions };
  } else {
    input = request;
  }
  const reinforce = input.kind === "REINFORCE";

  // 1. Reservar.
  const reserva = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    // Las PENDING caducadas se cierran como fallidas: así no se quedan
    // colgadas en el historial.
    const expiry = new Date(now.getTime() - AGENT.pendingExpiryMinutes * MINUTE_MS);
    await tx.agentInvocation.updateMany({
      where: { userId, status: "PENDING", createdAt: { lte: expiry } },
      data: { status: "FAILED", finishedAt: now },
    });
    const used = await tx.agentInvocation.count({ where: cuentanHoy(userId, now) });
    if (used >= AGENT.dailyInvocations) return null;
    return tx.agentInvocation.create({
      data: { userId, subjectId, inputKind: input.kind, status: "PENDING", createdAt: now },
      select: { id: true },
    });
    // maxWait: con varios clics a la vez, el último espera a que los demás
    // suelten al usuario (y puede necesitar una conexión nueva).
  }, { timeout: 15_000, maxWait: 10_000 });
  if (!reserva) return fallo(AGENT_ERRORS.limit, true);

  // Si algo sale mal a partir de aquí, la invocación no cuenta.
  const marcarFallida = () =>
    prisma.agentInvocation.updateMany({
      where: { id: reserva.id, status: "PENDING" },
      data: { status: "FAILED", finishedAt: new Date() },
    });

  try {
    // 2. Gemini, fuera de la transacción, con los temas que ya tiene la
    // materia para que los reutilice (salvo en el refuerzo).
    const result = await generar(input, reinforce ? undefined : { topics: await temasParaElEscriba(subjectId) });
    if (!result.ok) {
      await marcarFallida();
      return fallo(AGENT_ERRORS[result.failure]);
    }

    // 3. Guardar.
    type Guardado = { ok: true; created: number } | { ok: false; error: string };
    const guardado = await prisma.$transaction(async (tx): Promise<Guardado> => {
      // Bloquea la materia, como crearPregunta: con ella bloqueada, nadie
      // añade preguntas a la vez y el recorte a 200 es exacto.
      await tx.$queryRaw`SELECT 1 FROM "Subject" WHERE "id" = ${subjectId} FOR UPDATE`;
      const existing = await tx.question.findMany({ where: { subjectId }, select: { prompt: true, topic: true } });
      const room = MAX_QUESTIONS_PER_SUBJECT - existing.length;
      if (room <= 0) return { ok: false, error: AGENT_ERRORS.subjectFull };

      const { questions, discarded } = prepararPreguntas(
        result.raw,
        existing.map((question) => question.prompt),
        {
          existingTopics: existing.map((question) => question.topic),
          max: reinforce ? AGENT.reinforce.maxQuestions : AGENT.maxQuestions,
        },
      );
      if (discarded > 0) console.info("[escriba] preguntas descartadas", { discarded });
      const kept = questions.slice(0, room);
      if (kept.length === 0) return { ok: false, error: AGENT_ERRORS.noQuestions };

      // source y sealed los pone el servidor: lo del escriba nace SELLADO.
      await tx.question.createMany({
        data: kept.map((question) => ({ ...question, subjectId, source: "AGENT" as const, sealed: true })),
      });
      await tx.agentInvocation.update({
        where: { id: reserva.id },
        data: { status: "OK", questionsCreated: kept.length, finishedAt: new Date() },
      });
      return { ok: true, created: kept.length };
    }, { timeout: 15_000, maxWait: 10_000 });

    if (!guardado.ok) {
      await marcarFallida();
      return fallo(guardado.error);
    }
    return { ok: true, created: guardado.created };
  } catch (error) {
    // Un fallo inesperado (la base, por ejemplo). Sin detalles en el log: el
    // error de Prisma podría citar los datos.
    await marcarFallida().catch(() => {});
    console.error("[escriba] fallo inesperado", { name: error instanceof Error ? error.name : "unknown" });
    return fallo(AGENT_ERRORS.unavailable);
  }
}
