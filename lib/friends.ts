// Los compañeros: el código de amigo, las solicitudes, la lista y la
// clasificación semanal.
//
// ⚠ SOLO del servidor, como lib/battle.ts: lee y escribe la base, y sus
// funciones confían en el userId que reciben. Las llaman las Server Actions
// de app/companeros/actions.ts (que antes comprueban la sesión), lib/auth.ts
// (el código de un usuario nuevo) y scripts/probar-companeros.ts.
//
// LAS REGLAS (alfabeto, límites, desempate) viven en lib/friends-rules.ts.
//
// PRIVACIDAD: nada de lo que sale de aquí hacia la página lleva el correo, el
// id de otro usuario ni nada de su banco de preguntas. Las filas se nombran
// por el id de la AMISTAD (Friendship.id): las acciones reciben ese id y
// comprueban aquí que la amistad es tuya. Sin showStats, de un compañero solo
// sale el nombre.
//
// QUÉ SE CUENTA Y QUÉ NO (para no delatar si un código existe): todo lo que
// depende del OTRO (que el código no exista, que te rechazara, que esté lleno)
// responde el mismo mensaje genérico. Solo se distingue lo que ya es tuyo: un
// código mal escrito, tu propio código, que ya sois compañeros, que ya le
// pediste, tu límite del día y tus 50 compañeros. La defensa contra probar
// códigos al azar es el límite: 20 intentos al día (existan o no) contra
// 32^8 ≈ 10^12 códigos.
//
// ORDEN DE BLOQUEO (lib/locks.ts): los dos usuarios en orden de id
// (bloquearUsuariosEnOrden) y después la fila de Friendship. Nunca dentro de la
// cadena de la batalla.
import { randomInt } from "node:crypto";
import { Prisma, type FriendshipStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayDateInAppTimeZone, todayInAppTimeZone, weekInAppTimeZone } from "@/lib/dates";
import { flameState, levelForSouls } from "@/lib/game";
import {
  compareRanking,
  FRIEND_CODE,
  FRIENDS,
  isFriendCode,
  normalizeFriendCode,
  type RankingEntry,
} from "@/lib/friends-rules";
import { titleOf } from "@/lib/rewards";

// ---------------------------------------------------------------------------
//  El código
// ---------------------------------------------------------------------------

// 8 símbolos al azar con node:crypto (randomInt no tiene sesgo).
export function generateFriendCode(): string {
  let code = "";
  for (let i = 0; i < FRIEND_CODE.length; i++) code += FRIEND_CODE.alphabet[randomInt(FRIEND_CODE.alphabet.length)];
  return code;
}

// Uno que nadie tenga todavía. Con 10^12 códigos, repetir es casi imposible;
// si pasara, se prueba otro. (El índice único es la garantía final.)
export async function uniqueFriendCode(db: Pick<typeof prisma, "user"> = prisma): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateFriendCode();
    const taken = await db.user.findUnique({ where: { friendCode: code }, select: { id: true } });
    if (!taken) return code;
  }
  throw new Error("No se encontró un código de amigo libre.");
}

// El código del usuario; si no lo tiene (una cuenta creada por el código de
// antes de la Fase 4 durante un despliegue), se le da ahora.
export async function ensureFriendCode(userId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { friendCode: true } });
    if (user.friendCode) return user.friendCode;
    try {
      // Solo si sigue sin código: dos pestañas a la vez no se pisan.
      await prisma.user.updateMany({ where: { id: userId, friendCode: null }, data: { friendCode: await uniqueFriendCode() } });
    } catch (error) {
      // Choque con el índice único (otro se lo llevó entre medias): otro.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  throw new Error("No se pudo asignar el código de amigo.");
}

// ---------------------------------------------------------------------------
//  Bloqueos
// ---------------------------------------------------------------------------

// Los usuarios, bloqueados en orden de id: dos solicitudes cruzadas (A pide a
// B y B a A a la vez) los piden en el mismo orden y se ponen en fila.
async function bloquearUsuariosEnOrden(tx: Prisma.TransactionClient, ids: string[]) {
  const rows = await tx.$queryRaw<
    { id: string; friendRequestDay: Date | null; friendRequestCount: number; friendCode: string | null }[]
  >`
    SELECT "id", "friendRequestDay", "friendRequestCount", "friendCode" FROM "User"
    WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;
  return new Map(rows.map((row) => [row.id, row]));
}

const acceptedOf = (tx: Prisma.TransactionClient, userId: string) =>
  tx.friendship.count({ where: { status: "ACCEPTED", OR: [{ requesterId: userId }, { addresseeId: userId }] } });

// La amistad entre dos (sea cual sea el sentido), o null.
const pairOf = (tx: Prisma.TransactionClient, a: string, b: string) =>
  tx.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    },
    select: { id: true, requesterId: true, status: true, hiddenByRequester: true },
  });

// ---------------------------------------------------------------------------
//  Enviar una solicitud
// ---------------------------------------------------------------------------

export const FRIEND_MESSAGES = {
  // El genérico: lo mismo si el código existe, si no, si te rechazó o si está
  // lleno. No delata nada del otro.
  sent: "Si ese código existe, le hemos enviado tu solicitud. Cuando la acepte, aparecerá en tu lista.",
  accepted: "Ya sois compañeros.",
  badFormat: `Un código de compañero tiene ${FRIEND_CODE.length} letras y números (sin 0, O, 1 ni I).`,
  own: "Ese es tu propio código: compártelo con quien quieras añadir.",
  alreadyFriends: "Ya sois compañeros.",
  alreadySent: "Ya le enviaste una solicitud. Espera a que la acepte.",
  limit: `Has llegado al límite de ${FRIENDS.dailyRequests} solicitudes por hoy. Vuelve mañana.`,
  youAreFull: `Ya tienes ${FRIENDS.maxFriends} compañeros, el máximo. Quita alguno para añadir otro.`,
  theyAreFull: "No se puede aceptar ahora: esa persona ya tiene el máximo de compañeros.",
  notFound: "Esa solicitud ya no existe.",
} as const;

export type ResultadoSolicitud = { ok: true; message: string } | { ok: false; error: string };

export async function enviarSolicitudDe(userId: string, rawCode: string, now: Date = new Date()): Promise<ResultadoSolicitud> {
  const code = normalizeFriendCode(rawCode);
  // Mal escrito: no cuenta para el límite (no es un intento de verdad).
  if (!isFriendCode(code)) return { ok: false, error: FRIEND_MESSAGES.badFormat };
  const today = todayDateInAppTimeZone(now);

  return prisma.$transaction(
    async (tx): Promise<ResultadoSolicitud> => {
      // Quién es el dueño del código: una lectura sin bloqueo. Después se
      // bloquean los dos usuarios en orden de id.
      const target = await tx.user.findUnique({ where: { friendCode: code }, select: { id: true } });
      const locked = await bloquearUsuariosEnOrden(tx, target && target.id !== userId ? [userId, target.id] : [userId]);
      const me = locked.get(userId);
      if (!me) return { ok: false, error: FRIEND_MESSAGES.notFound };

      // El límite del día: cuenta CADA intento bien formado, exista o no el
      // código. Al llegar a 20, ni se busca ni se cuenta más.
      const sameDay = me.friendRequestDay?.getTime() === today.getTime();
      const used = sameDay ? me.friendRequestCount : 0;
      if (used >= FRIENDS.dailyRequests) return { ok: false, error: FRIEND_MESSAGES.limit };
      await tx.user.update({ where: { id: userId }, data: { friendRequestDay: today, friendRequestCount: used + 1 } });

      if (me.friendCode === code) return { ok: true, message: FRIEND_MESSAGES.own };
      // No existe: el mismo mensaje que si existiera.
      if (!target || !locked.has(target.id)) return { ok: true, message: FRIEND_MESSAGES.sent };

      const pair = await pairOf(tx, userId, target.id);
      if (pair?.status === "ACCEPTED") return { ok: true, message: FRIEND_MESSAGES.alreadyFriends };
      if (pair && pair.requesterId === userId) {
        if (pair.status === "PENDING") return { ok: true, message: FRIEND_MESSAGES.alreadySent };
        // DECLINED: te rechazó. La lápida no se toca y no se le notifica de
        // nuevo; si la habías cancelado, vuelve a verse como pendiente (para
        // ti). Respuesta: la genérica.
        if (pair.hiddenByRequester) {
          await tx.friendship.update({ where: { id: pair.id }, data: { hiddenByRequester: false } });
        }
        return { ok: true, message: FRIEND_MESSAGES.sent };
      }
      if (pair) {
        // Él te lo pidió (pendiente) o le rechazaste (lápida): escribir SU
        // código es decir que sí. Solo quien rechazó puede reabrirla así.
        return aceptarEn(tx, pair.id, userId, target.id, now);
      }

      if ((await acceptedOf(tx, userId)) >= FRIENDS.maxFriends) return { ok: false, error: FRIEND_MESSAGES.youAreFull };
      await tx.friendship.create({ data: { requesterId: userId, addresseeId: target.id, createdAt: now } });
      return { ok: true, message: FRIEND_MESSAGES.sent };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}

// Acepta (con los dos usuarios ya bloqueados): nadie pasa de 50.
async function aceptarEn(
  tx: Prisma.TransactionClient,
  friendshipId: string,
  me: string,
  other: string,
  now: Date,
): Promise<ResultadoSolicitud> {
  if ((await acceptedOf(tx, me)) >= FRIENDS.maxFriends) return { ok: false, error: FRIEND_MESSAGES.youAreFull };
  if ((await acceptedOf(tx, other)) >= FRIENDS.maxFriends) return { ok: false, error: FRIEND_MESSAGES.theyAreFull };
  await tx.friendship.update({
    where: { id: friendshipId },
    data: { status: "ACCEPTED", respondedAt: now, hiddenByRequester: false },
  });
  return { ok: true, message: FRIEND_MESSAGES.accepted };
}

// ---------------------------------------------------------------------------
//  Contestar, cancelar y quitar (por el id de la AMISTAD)
// ---------------------------------------------------------------------------

export type AccionAmistad = "accept" | "decline" | "cancel" | "remove";

// null = esa amistad no existe o no es tuya en el papel que pide la acción
// (la acción responde 404 sin distinguir):
//   accept / decline: una solicitud PENDIENTE que te enviaron a ti;
//   cancel: una que enviaste tú (pendiente, o rechazada: entonces solo deja
//     de verse, la lápida sigue);
//   remove: un compañero aceptado (borra la fila: se puede volver a pedir).
export async function actuarSobreAmistadDe(
  userId: string,
  friendshipId: string,
  action: AccionAmistad,
  now: Date = new Date(),
): Promise<ResultadoSolicitud | null> {
  return prisma.$transaction(
    async (tx): Promise<ResultadoSolicitud | null> => {
      const f = await tx.friendship.findUnique({
        where: { id: friendshipId },
        select: { id: true, requesterId: true, addresseeId: true, status: true },
      });
      if (!f || (f.requesterId !== userId && f.addresseeId !== userId)) return null;
      const other = f.requesterId === userId ? f.addresseeId : f.requesterId;
      await bloquearUsuariosEnOrden(tx, [userId, other]);
      // Releída con los usuarios bloqueados: otra pestaña pudo cambiarla.
      const now2 = await tx.friendship.findUnique({ where: { id: f.id }, select: { status: true, hiddenByRequester: true } });
      if (!now2) return { ok: false, error: FRIEND_MESSAGES.notFound };
      const status: FriendshipStatus = now2.status;
      const iRequested = f.requesterId === userId;

      if (action === "accept" || action === "decline") {
        if (iRequested || status !== "PENDING") return null;
        if (action === "accept") return aceptarEn(tx, f.id, userId, other, now);
        await tx.friendship.update({ where: { id: f.id }, data: { status: "DECLINED", respondedAt: now } });
        return { ok: true, message: "Solicitud rechazada." };
      }
      if (action === "cancel") {
        if (!iRequested || status === "ACCEPTED") return null;
        if (status === "PENDING") await tx.friendship.delete({ where: { id: f.id } });
        else await tx.friendship.update({ where: { id: f.id }, data: { hiddenByRequester: true } });
        return { ok: true, message: "Solicitud cancelada." };
      }
      if (status !== "ACCEPTED") return null;
      await tx.friendship.delete({ where: { id: f.id } });
      return { ok: true, message: "Ya no sois compañeros." };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}

// ---------------------------------------------------------------------------
//  La página
// ---------------------------------------------------------------------------

// Lo que se enseña de un compañero si lo permite (showStats).
export type FriendStats = { title: string | null; level: number; flame: number; weekStrikes: number };

export type CompanerosData = {
  code: string;
  showStats: boolean;
  friendCount: number;
  // Solicitudes que te enviaron: el nombre de quien te la pide.
  received: { id: string; name: string }[];
  // Las que enviaste: el CÓDIGO que escribiste, no el nombre (hasta que
  // acepte, no se enseña de quién es). Las rechazadas se ven igual.
  sent: { id: string; code: string }[];
  friends: { id: string; name: string; stats: FriendStats | null }[];
  // Tú y los compañeros que comparten sus estadísticas, ya ordenados.
  ranking: { key: string; position: number; name: string; title: string | null; strikes: number; isMe: boolean }[];
};

const userView = {
  id: true,
  name: true,
  friendCode: true,
  showStats: true,
  souls: true,
  flame: true,
  lastStrikeDay: true,
  embers: true,
  equippedRelic: true,
} as const;

export async function loadCompaneros(userId: string, now: Date = new Date()): Promise<CompanerosData> {
  const code = await ensureFriendCode(userId);
  const [me, rows] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userView }),
    prisma.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: {
        id: true,
        requesterId: true,
        status: true,
        hiddenByRequester: true,
        createdAt: true,
        requester: { select: userView },
        addressee: { select: userView },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const accepted = rows.filter((r) => r.status === "ACCEPTED");
  const otherOf = (r: (typeof rows)[number]) => (r.requesterId === userId ? r.addressee : r.requester);

  // Los golpes de esta semana (lunes a domingo, Bogotá) tuyos y de los
  // compañeros que comparten: una sola consulta con GROUP BY.
  const { start, end } = weekInAppTimeZone(now);
  const sharing = accepted.map(otherOf).filter((u) => u.showStats);
  const groups = await prisma.studySession.groupBy({
    by: ["userId"],
    where: { userId: { in: [userId, ...sharing.map((u) => u.id)] }, completedAt: { gte: start, lt: end } },
    _count: { _all: true },
    _max: { completedAt: true },
  });
  const week = new Map(groups.map((g) => [g.userId, { strikes: g._count._all, last: g._max.completedAt }]));
  const today = todayInAppTimeZone(now);

  const statsOf = (u: (typeof rows)[number]["requester"]): FriendStats => ({
    title: titleOf(u.equippedRelic),
    level: levelForSouls(u.souls).level,
    flame: flameState(u.flame, u.lastStrikeDay, today, u.embers).days,
    weekStrikes: week.get(u.id)?.strikes ?? 0,
  });

  const entries: (RankingEntry & { title: string | null; isMe: boolean })[] = [
    { key: "me", name: me.name, title: titleOf(me.equippedRelic), isMe: true, strikes: week.get(userId)?.strikes ?? 0, lastStrikeAt: week.get(userId)?.last ?? null },
    ...accepted
      .filter((r) => otherOf(r).showStats)
      .map((r) => {
        const u = otherOf(r);
        return { key: r.id, name: u.name, title: titleOf(u.equippedRelic), isMe: false, strikes: week.get(u.id)?.strikes ?? 0, lastStrikeAt: week.get(u.id)?.last ?? null };
      }),
  ];
  entries.sort(compareRanking);

  return {
    code,
    showStats: me.showStats,
    friendCount: accepted.length,
    received: rows
      .filter((r) => r.status === "PENDING" && r.requesterId !== userId)
      .map((r) => ({ id: r.id, name: r.requester.name })),
    sent: rows
      .filter((r) => r.requesterId === userId && (r.status === "PENDING" || (r.status === "DECLINED" && !r.hiddenByRequester)))
      .map((r) => ({ id: r.id, code: r.addressee.friendCode ?? "" })),
    friends: accepted.map((r) => {
      const u = otherOf(r);
      return { id: r.id, name: u.name, stats: u.showStats ? statsOf(u) : null };
    }),
    // Solo con compañeros: sin ninguno, la página invita a compartir el código.
    ranking:
      accepted.length === 0
        ? []
        : entries.map((e, i) => ({ key: e.key, position: i + 1, name: e.name, title: e.title, strikes: e.strikes, isMe: e.isMe })),
  };
}

// El interruptor del perfil.
export async function guardarPrivacidadDe(userId: string, showStats: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { showStats } });
}
