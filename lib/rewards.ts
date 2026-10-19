// Las recompensas: elegir una bendición de una oferta, equipar un título y lo
// que enseñan la victoria, el perfil, la mazmorra y la tarjeta del personaje.
//
// ⚠ SOLO del servidor, como lib/battle.ts: lee y escribe la base, y sus
// funciones confían en el userId que reciben. Las llaman las Server Actions
// (que antes comprueban la sesión), las páginas y scripts/probar-recompensas.ts.
//
// LAS REGLAS viven en lib/game.ts (BLESSINGS, RELICS, eligibleBlessings,
// blessingUsableNow…). La oferta se CREA en la victoria (lib/battle.ts) y las
// bendiciones se gastan donde actúan (lib/battle.ts y lib/redemption-trial.ts).
//
// ORDEN DE BLOQUEO (lib/locks.ts): elegir = usuario → misión (solo se lee) →
// oferta y bendiciones. Equipar = usuario.
import { cache } from "react";
import type { BlessingKey } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  BLESSINGS,
  blessingUsableNow,
  EMBER,
  isRelicKey,
  RELICS,
  type BlessingInfo,
  type RelicInfo,
  type RelicKey,
} from "@/lib/game";
import { bloquearMision, bloquearUsuario } from "@/lib/locks";

// ---------------------------------------------------------------------------
//  Elegir una bendición
// ---------------------------------------------------------------------------

export const REWARD_ERRORS = {
  chosen: "Ya elegiste una bendición de este jefe.",
  expired: "Esta recompensa caducó: tenías 7 días para elegirla.",
  notOffered: "Esa bendición no está entre las que te ofrece este jefe.",
  active: "Ya tienes esa bendición activa. Elige otra.",
  embersFull: `Ya tienes las ${EMBER.max} brasas: la Chispa no te daría ninguna. Elige otra.`,
  sealUseless: "El Sello solo sirve con una misión de redención con prueba (o sin misión). Elige otra.",
  notOwned: "Esa reliquia todavía no es tuya.",
} as const;

export type ResultadoEleccion = { ok: true; key: BlessingKey } | { ok: false; error: string };

// Elige `key` de la oferta `offerId`. null = la oferta no existe o es de otro
// usuario (la acción responde 404 sin distinguir). Todo se comprueba aquí, en
// el servidor, contra las opciones que se fijaron al vencer: no se puede
// elegir dos veces, ni algo que no se ofreció, ni de la oferta de otro.
// Lo que pudo cambiar desde la victoria (bendiciones activas, brasas, la
// misión) se vuelve a mirar: si ya no sirve, la oferta sigue pendiente.
export async function elegirBendicionDe(
  userId: string,
  offerId: string,
  key: BlessingKey,
  now: Date = new Date(),
): Promise<ResultadoEleccion | null> {
  return prisma.$transaction(
    async (tx): Promise<ResultadoEleccion | null> => {
      // El usuario primero: todas las ofertas y bendiciones de un usuario se
      // tocan con él bloqueado, así que dos pestañas eligiendo a la vez se
      // ponen en fila y la segunda ya ve la oferta elegida.
      const owner = await bloquearUsuario(tx, userId);
      const mission = await bloquearMision(tx, userId);
      const offer = await tx.blessingOffer.findFirst({
        where: { id: offerId, userId },
        select: { id: true, options: true, chosenKey: true, expiresAt: true },
      });
      if (!offer) return null;
      if (offer.chosenKey !== null) return { ok: false, error: REWARD_ERRORS.chosen };
      if (offer.expiresAt.getTime() <= now.getTime()) return { ok: false, error: REWARD_ERRORS.expired };
      if (!offer.options.includes(key)) return { ok: false, error: REWARD_ERRORS.notOffered };

      const state = {
        active: owner.blessings.map((b) => b.key),
        embers: owner.embers,
        // Una misión cuyo plazo ya pasó cuenta como ninguna (la revisión la
        // marcará), como en la victoria.
        mission: mission && now.getTime() < mission.deadline.getTime() ? mission : null,
      };
      if (!blessingUsableNow(key, state)) {
        if (state.active.includes(key)) return { ok: false, error: REWARD_ERRORS.active };
        if (key === "EMBER_SPARK") return { ok: false, error: REWARD_ERRORS.embersFull };
        return { ok: false, error: REWARD_ERRORS.sealUseless };
      }

      // La Chispa se aplica ya (+1 brasa, sin pasar del máximo: lo comprueba
      // blessingUsableNow y el CHECK de la base). Las demás quedan activas
      // con sus usos.
      if (key === "EMBER_SPARK") {
        await tx.user.update({ where: { id: userId }, data: { embers: owner.embers + 1 } });
      } else {
        await tx.blessing.create({ data: { userId, key, usesLeft: BLESSINGS[key].uses } });
      }
      await tx.blessingOffer.update({ where: { id: offer.id }, data: { chosenKey: key, chosenAt: now } });
      return { ok: true, key };
    },
    { timeout: 15_000, maxWait: 10_000 },
  );
}

// ---------------------------------------------------------------------------
//  Equipar un título
// ---------------------------------------------------------------------------

// key null = quitar el título. Solo una reliquia que se tenga.
export async function equiparReliquiaDe(
  userId: string,
  key: RelicKey | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    await bloquearUsuario(tx, userId);
    if (key !== null) {
      const owned = await tx.relic.findUnique({ where: { userId_key: { userId, key } }, select: { id: true } });
      if (!owned) return { ok: false as const, error: REWARD_ERRORS.notOwned };
    }
    await tx.user.update({ where: { id: userId }, data: { equippedRelic: key } });
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
//  Lecturas
// ---------------------------------------------------------------------------

// Una carta de bendición, ya con su nombre, rareza y efecto (todo del
// catálogo de lib/game.ts; de la base solo sale la clave).
export type BlessingCard = { key: BlessingKey } & BlessingInfo;

export function blessingCard(key: BlessingKey): BlessingCard {
  return { key, ...BLESSINGS[key] };
}

// El título equipado (su texto), o null. Solo si es una reliquia que existe.
export function titleOf(equippedRelic: string | null | undefined): string | null {
  return isRelicKey(equippedRelic) ? RELICS[equippedRelic].title : null;
}

// Lo que la tarjeta del personaje y la mazmorra necesitan en todas las
// páginas: las bendiciones activas y las ofertas pendientes (sin elegir y sin
// caducar), la más antigua primero. cache(): cada página lo pide al empezar
// (preloadCharacter) y AppShell lo espera después, con la misma promesa: así
// no añade un viaje en serie.
export type CharacterExtras = {
  blessings: { key: BlessingKey; name: string; short: string; effect: string; usesLeft: number }[];
  pendingOffers: { taskId: string; taskName: string }[];
};

export const loadCharacterExtras = cache(async (userId: string): Promise<CharacterExtras> => {
  const now = new Date();
  const [blessings, offers] = await Promise.all([
    prisma.blessing.findMany({ where: { userId }, select: { key: true, usesLeft: true }, orderBy: { createdAt: "asc" } }),
    prisma.blessingOffer.findMany({
      where: { userId, chosenKey: null, expiresAt: { gt: now } },
      select: { taskId: true, task: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    blessings: blessings.map((b) => ({
      key: b.key,
      name: BLESSINGS[b.key].name,
      short: BLESSINGS[b.key].short,
      effect: BLESSINGS[b.key].effect,
      usesLeft: b.usesLeft,
    })),
    pendingOffers: offers.map((o) => ({ taskId: o.taskId, taskName: o.task.name })),
  };
});

// Para empezar la lectura al principio de la página, en paralelo con lo
// demás (el resultado lo recoge AppShell).
export function preloadCharacter(userId: string): void {
  void loadCharacterExtras(userId).catch(() => {});
}

// La victoria: la oferta del jefe (pendiente, elegida o caducada) y la
// reliquia que dio ESE golpe (earnedAt = el instante de la vigilia final;
// lib/battle.ts las guarda con el mismo now).
export type VictoryRewards = {
  offer: {
    id: string;
    cards: BlessingCard[];
    chosenKey: BlessingKey | null;
    expired: boolean;
  } | null;
  relic: ({ key: RelicKey } & RelicInfo) | null;
};

export async function loadVictoryRewards(
  userId: string,
  task: { id: string; relicKey: RelicKey | null },
  finalStrikeAt: Date | null,
  now: Date = new Date(),
): Promise<VictoryRewards> {
  const [offer, relic] = await Promise.all([
    prisma.blessingOffer.findFirst({
      where: { taskId: task.id, userId },
      select: { id: true, options: true, chosenKey: true, expiresAt: true },
    }),
    task.relicKey && finalStrikeAt
      ? prisma.relic.findFirst({
          where: { userId, key: task.relicKey, earnedAt: finalStrikeAt },
          select: { key: true },
        })
      : null,
  ]);
  return {
    offer: offer
      ? {
          id: offer.id,
          cards: offer.options.map(blessingCard),
          chosenKey: offer.chosenKey,
          expired: offer.chosenKey === null && offer.expiresAt.getTime() <= now.getTime(),
        }
      : null,
    relic: relic && isRelicKey(relic.key) ? { key: relic.key, ...RELICS[relic.key] } : null,
  };
}

// La colección del perfil: todas las reliquias, conseguidas o no (en el
// orden del catálogo), y la equipada.
export async function loadRelicCollection(userId: string) {
  const [owned, user] = await Promise.all([
    prisma.relic.findMany({ where: { userId }, select: { key: true, earnedAt: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { equippedRelic: true } }),
  ]);
  const earned = new Map(owned.map((r) => [r.key, r.earnedAt]));
  return {
    relics: (Object.keys(RELICS) as RelicKey[]).map((key) => ({
      key,
      ...RELICS[key],
      earnedAt: earned.get(key) ?? null,
    })),
    equipped: isRelicKey(user.equippedRelic) && earned.has(user.equippedRelic) ? user.equippedRelic : null,
  };
}
