// Los bloqueos de fila que comparten la batalla (lib/battle.ts) y la prueba de
// redención (lib/redemption-trial.ts). SOLO del servidor.
//
// ORDEN DE BLOQUEO, en TODAS las transacciones de la app:
//   tarea → vigilia → contraataque / prueba → usuario → misión → pregunta.
// Quien no necesite alguna fila se la salta, pero nunca cambia el orden: así
// dos peticiones simultáneas se ponen en fila en vez de esperarse la una a la
// otra para siempre (interbloqueo). Los caminos, uno por uno:
//   - comenzar una vigilia: tarea → vigilia (la crea) → contraataque (cierra
//     el que quedara abierto);
//   - asestar el golpe: tarea → vigilia → usuario → misión;
//   - contestar el contraataque: contraataque → usuario → pregunta;
//   - retirar una pregunta: contraataque → pregunta;
//   - la revisión de jefes vencidos (lib/redemption.ts): tareas (por id) →
//     usuario → misión. NO toca las pruebas: una prueba abierta de una misión
//     que ya no está activa simplemente se ignora;
//   - empezar la prueba: usuario → misión, y después crea la fila de la
//     prueba (una fila nueva nadie más puede bloquearla hasta el COMMIT);
//   - contestar la prueba: prueba → usuario → misión → pregunta;
//   - editar o borrar una pregunta: solo la pregunta;
//   - el banco y el guardado del escriba: solo la materia (Subject, fuera de
//     la cadena: nadie de la cadena la bloquea); la reserva del escriba: solo
//     el usuario.
//
// ⚠ Las claves foráneas también bloquean. Al CREAR una fila que apunta a otra
// (un QuestionAttempt apunta a User y a Question), Postgres comprueba que la
// otra exista con un bloqueo FOR KEY SHARE sobre ella, y ese bloqueo espera a
// quien la tenga con FOR UPDATE. Por eso, quien crea un QuestionAttempt
// bloquea ANTES al usuario (FOR UPDATE): si no, tendría la pregunta y
// esperaría al usuario, al revés que el orden (ver responderPreguntaDe).
//
// Todas las funciones usan $queryRaw con plantilla: los ids viajan como
// parámetros, nunca pegados al SQL.
import type { Prisma, RedemptionRule } from "@prisma/client";

// La fila del usuario, bloqueada hasta el final de la transacción, con lo que
// hace falta para calcular almas, nivel, llama y brasas. Con la fila
// bloqueada nadie más puede cambiar esos valores, así que se calculan en el
// código y se escriben de una vez.
export async function bloquearUsuario(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<
    { souls: number; level: number; flame: number; lastStrikeDay: Date | null; embers: number }[]
  >`
    SELECT "souls", "level", "flame", "lastStrikeDay", "embers" FROM "User"
    WHERE "id" = ${userId} FOR UPDATE`;
  return rows[0];
}

// La misión de redención ACTIVA del usuario, bloqueada, o undefined si no
// tiene. Va después del usuario: la revisión de jefes vencidos la crea y la
// resuelve con el usuario ya bloqueado.
export async function bloquearMision(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<
    {
      id: string;
      taskId: string;
      rule: RedemptionRule;
      vigilsDone: number;
      trialsUsed: number;
      deadline: Date;
      soulsAtStake: number;
    }[]
  >`
    SELECT "id", "taskId", "rule", "vigilsDone", "trialsUsed", "deadline", "soulsAtStake"
    FROM "RedemptionMission"
    WHERE "userId" = ${userId} AND "status" = 'ACTIVE' FOR UPDATE`;
  return rows[0];
}
