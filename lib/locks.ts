// Los bloqueos de fila que comparten la batalla (lib/battle.ts), la prueba de
// redención (lib/redemption-trial.ts) y las recompensas (lib/rewards.ts).
// SOLO del servidor.
//
// ORDEN DE BLOQUEO, en TODAS las transacciones de la app:
//   tarea → vigilia → contraataque / prueba → usuario → misión
//     → [filas propias del usuario: oferta, bendiciones, reliquias] → pregunta.
// Quien no necesite alguna fila se la salta, pero nunca cambia el orden: así
// dos peticiones simultáneas se ponen en fila en vez de esperarse la una a la
// otra para siempre (interbloqueo).
//
// Las FILAS PROPIAS (BlessingOffer, Blessing, Relic y User.equippedRelic) no
// se bloquean una a una: se crean, cambian o borran SIEMPRE con la fila del
// usuario ya bloqueada, y ese bloqueo las pone en fila. Nunca se tocan sin
// él. Las claves foráneas de las nuevas apuntan a User (bloqueado) y, la
// oferta, a Task (bloqueada en el golpe que vence).
//
// Los caminos, uno por uno:
//   - comenzar una vigilia: tarea → vigilia (la crea) → contraataque (cierra
//     el que quedara abierto);
//   - asestar el golpe: tarea → vigilia → usuario → misión → bendiciones (gasta
//     la de las almas) → reliquias (hitos de llama y, al vencer, la del jefe)
//     → oferta (la crea, al vencer). Las bendiciones activas llegan en el
//     mismo SELECT del usuario (bloquearUsuario);
//   - crear el contraataque (fuera del golpe, en su propia transacción):
//     usuario → (crea la fila del contraataque, nueva: nadie más puede
//     bloquearla) → bendiciones (gasta la Lucidez y el Ojo);
//   - contestar el contraataque: contraataque → usuario → bendiciones (gasta
//     el Escudo) → pregunta;
//   - retirar una pregunta: contraataque → pregunta;
//   - la revisión de jefes vencidos (lib/redemption.ts): tareas (por id) →
//     usuario → misión. NO toca las pruebas ni las recompensas: una prueba
//     abierta de una misión que ya no está activa simplemente se ignora;
//   - empezar la prueba: usuario → misión → bendiciones (gasta el Sello), y
//     después crea la fila de la prueba (una fila nueva nadie más puede
//     bloquearla hasta el COMMIT);
//   - contestar la prueba: prueba → usuario → misión → pregunta (el Sello ya
//     se gastó al empezar: la prueba guarda passWith);
//   - elegir una bendición (lib/rewards.ts): usuario → misión (solo se lee,
//     para el Sello) → oferta y bendiciones (y User.embers con la Chispa);
//   - equipar un título: usuario;
//   - editar o borrar una pregunta: solo la pregunta;
//   - el banco y el guardado del escriba: solo la materia (Subject, fuera de
//     la cadena: nadie de la cadena la bloquea); la reserva del escriba: solo
//     el usuario;
//   - compañeros (lib/friends.ts): los dos usuarios, en orden de id, y
//     después la fila de Friendship. Nunca dentro de la cadena de la batalla
//     ni con otra fila de ella;
//   - borrar la cuenta (lib/profile.ts): el DELETE del usuario lo bloquea y
//     baja por la cascada hasta las tareas, al revés que el golpe. Si chocan,
//     Postgres aborta uno (40P01) y el borrado se reintenta una vez.
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
import type { BlessingKey, Prisma, RedemptionRule } from "@prisma/client";

// Una bendición activa, tal como la devuelve bloquearUsuario.
export type ActiveBlessing = { key: BlessingKey; usesLeft: number };

// La fila del usuario, bloqueada hasta el final de la transacción, con lo que
// hace falta para calcular almas, nivel, llama y brasas, y sus bendiciones
// activas. Con la fila bloqueada nadie más puede cambiar esos valores (ni
// las bendiciones, que solo se tocan con el usuario bloqueado), así que se
// calculan en el código y se escriben de una vez. Las bendiciones van en el
// MISMO viaje (una subconsulta): el golpe y la respuesta no pagan otro.
// FOR UPDATE solo bloquea la fila de User, no las de Blessing.
export async function bloquearUsuario(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<
    {
      souls: number;
      level: number;
      flame: number;
      lastStrikeDay: Date | null;
      embers: number;
      bestFlame: number;
      blessings: ActiveBlessing[];
    }[]
  >`
    SELECT u."souls", u."level", u."flame", u."lastStrikeDay", u."embers", u."bestFlame",
      COALESCE(
        (SELECT json_agg(json_build_object('key', b."key", 'usesLeft', b."usesLeft"))
         FROM "Blessing" b WHERE b."userId" = u."id"),
        '[]'::json
      ) AS "blessings"
    FROM "User" u
    WHERE u."id" = ${userId} FOR UPDATE OF u`;
  return rows[0];
}

// Gasta un uso de una bendición activa: con el último, la fila se borra (el
// índice único por usuario y tipo deja que se vuelva a ofrecer). SOLO con el
// usuario ya bloqueado (bloquearUsuario), en la misma transacción que la usa.
export async function gastarBendicion(tx: Prisma.TransactionClient, userId: string, blessing: ActiveBlessing) {
  if (blessing.usesLeft <= 1) {
    await tx.blessing.deleteMany({ where: { userId, key: blessing.key } });
  } else {
    await tx.blessing.update({
      where: { userId_key: { userId, key: blessing.key } },
      data: { usesLeft: blessing.usesLeft - 1 },
    });
  }
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
