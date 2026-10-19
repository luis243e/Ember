// Pruebas de las recompensas (Fase 4, parte C) contra la base LOCAL:
//   node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-recompensas.ts
// Con --payload (y `npm run dev` en marcha) comprueba además, en el HTML y
// en el payload de React de la batalla, que con el Ojo del escriba el
// navegador recibe cuál está tachada y NUNCA cuál es la correcta.
// Comprueba:
//   1. las reglas puras: elegibles, la oferta (3 distintas, de las
//      elegibles) y sus pesos medidos contra los exactos, el +25 %, el
//      escudo, la opción tachada, los hitos de llama y el Sello;
//   2. la victoria: crea la oferta (una por jefe, índice único) y la reliquia
//      del jefe UNA vez; elegir solo de la propia, solo lo ofrecido, una sola
//      vez, no lo activo, caducada no;
//   3. cada efecto aplicado y gastado en su transacción: Almas (golpe),
//      Escudo (respuesta), Lucidez y Ojo (al crear el contraataque), Sello
//      (al empezar la prueba), Chispa (al elegir);
//   4. que NINGUNA recompensa da golpes ni quita vida: la vida y las
//      vigilias solo cambian con los golpes;
//   5. los hitos de llama, una sola vez, y bestFlame;
//   6. el relleno de la migración fase4 (racha y reliquias) contra las reglas
//      de TypeScript, en una transacción que se deshace.
// Crea usuarios temporales y los borra al final (try/finally). Se niega a
// correr fuera de localhost.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { assertLocalDatabase } from "@/scripts/local-only";

assertLocalDatabase("probar-recompensas");

const { prisma } = await import("@/lib/prisma");
const game = await import("@/lib/game");
const { asestarGolpeDe, responderPreguntaDe } = await import("@/lib/battle");
const { comenzarPruebaDe, responderPruebaDe, parseTrialItems } = await import("@/lib/redemption-trial");
const { elegirBendicionDe, equiparReliquiaDe, REWARD_ERRORS, loadVictoryRewards } = await import("@/lib/rewards");
const { parseItems, toShownIndex } = await import("@/lib/questions/counterattack");
const { todayInAppTimeZone, todayDateInAppTimeZone } = await import("@/lib/dates");
const { check, fallo, terminar, iniciarSesion, pedirPagina } = await import("@/scripts/probar-comun");

type BlessingKey = import("@prisma/client").BlessingKey;
type Difficulty = import("@prisma/client").Difficulty;

const PREFIJO = "probar-recompensas";
const PAYLOAD = process.argv.includes("--payload");
const DAY = 86_400_000;
const sufijo = () => randomBytes(4).toString("hex");

// ---------------------------------------------------------------------------
//  Ayudas
// ---------------------------------------------------------------------------

// Un usuario con una materia y, si se pide, preguntas de opción múltiple del
// banco con una explicación única (para buscarla en el payload).
async function crearUsuario(opts: { souls?: number; questions?: number; embers?: number } = {}) {
  const tag = sufijo();
  const user = await prisma.user.create({
    data: {
      email: `${PREFIJO}-${tag}@ember.test`,
      name: `Prueba ${tag}`,
      emailVerified: true,
      souls: opts.souls ?? 700,
      level: game.levelForSouls(opts.souls ?? 700).level,
      embers: opts.embers ?? 0,
    },
    select: { id: true, email: true },
  });
  const subject = await prisma.subject.create({ data: { name: "Materia", userId: user.id } });
  for (let i = 0; i < (opts.questions ?? 0); i++) {
    await prisma.question.create({
      data: {
        subjectId: subject.id,
        type: "MULTIPLE_CHOICE",
        prompt: `Pregunta ${i} ${tag}`,
        options: [`Correcta ${i}`, `Falsa A ${i}`, `Falsa B ${i}`, `Falsa C ${i}`],
        correctIndex: 0,
        explanation: `explicacion-secreta-${tag}-${i}`,
      },
    });
  }
  return { ...user, subjectId: subject.id, tag };
}

async function crearJefe(subjectId: string, difficulty: Difficulty, bossKey?: string, hp?: number) {
  const max = game.maxHpFor(difficulty);
  return prisma.task.create({
    data: {
      name: `Jefe ${difficulty}`,
      subjectId,
      dueDate: new Date(Date.UTC(2031, 0, 1)),
      difficulty,
      maxHp: max,
      currentHp: hp ?? max,
      bossKey: bossKey ?? game.BOSSES_BY_DIFFICULTY[difficulty][0],
    },
    select: { id: true, subjectId: true },
  });
}

// Golpea: abre una vigilia ya terminada y asesta el golpe.
async function golpear(userId: string, task: { id: string; subjectId: string }) {
  const now = Date.now();
  await prisma.studySession.create({
    data: { taskId: task.id, userId, startedAt: new Date(now - 60_000), endsAt: new Date(now - 1000), durationMinutes: 25 },
  });
  return asestarGolpeDe(userId, task);
}

const darBendicion = (userId: string, key: BlessingKey, usesLeft = game.BLESSINGS[key].uses || 1) =>
  prisma.blessing.create({ data: { userId, key, usesLeft } });
const usos = async (userId: string, key: BlessingKey) =>
  (await prisma.blessing.findUnique({ where: { userId_key: { userId, key } }, select: { usesLeft: true } }))?.usesLeft ?? 0;
const contraataqueAbierto = (userId: string) =>
  prisma.counterattack.findFirstOrThrow({
    where: { userId, finishedAt: null },
    select: { id: true, items: true, answered: true, bonusPerCorrect: true },
  });

// La opción MOSTRADA de la pregunta n del contraataque: la correcta o una
// incorrecta (que no esté tachada).
async function opcion(counter: { items: unknown }, n: number, which: "correct" | "wrong") {
  const item = parseItems(counter.items as never)[n];
  const q = await prisma.question.findUniqueOrThrow({ where: { id: item.ref }, select: { correctIndex: true } });
  const correct = toShownIndex(item.order, q.correctIndex);
  if (which === "correct") return correct;
  return [0, 1, 2, 3].find((i) => i !== correct && i !== item.struck)!;
}

// La vida y las vigilias de un usuario: lo que una recompensa NUNCA cambia.
async function vidaYVigilias(userId: string) {
  const [tasks, vigils] = await Promise.all([
    prisma.task.findMany({ where: { subject: { userId } }, select: { id: true, currentHp: true, status: true }, orderBy: { id: "asc" } }),
    prisma.studySession.count({ where: { userId } }),
  ]);
  return JSON.stringify({ tasks, vigils });
}

// ---------------------------------------------------------------------------
//  1. Reglas puras
// ---------------------------------------------------------------------------

function probarReglas() {
  console.log("\n1. Reglas puras");
  const el = (difficulty: Difficulty, extra: Partial<Parameters<typeof game.eligibleBlessings>[0]> = {}) =>
    game.eligibleBlessings({ difficulty, active: [], embers: 0, mission: null, ...extra });
  check("fácil: solo las 3 comunes", el("EASY").join() === "SOULS,ASH_SHIELD,LUCIDITY", el("EASY"));
  check("media: comunes y raras, sin la épica", el("MEDIUM").join() === "SOULS,ASH_SHIELD,LUCIDITY,EMBER_SPARK,SCRIBE_EYE");
  check("difícil: las 6", el("HARD").length === 6);
  check("lo activo no se ofrece", !el("HARD", { active: ["SOULS", "SCRIBE_EYE"] }).some((k) => k === "SOULS" || k === "SCRIBE_EYE"));
  check("con 2 brasas, sin Chispa", !el("HARD", { embers: 2 }).includes("EMBER_SPARK") && el("HARD", { embers: 1 }).includes("EMBER_SPARK"));
  check("Sello con misión TRIAL o sin misión", el("HARD", { mission: { rule: "TRIAL" } }).includes("REDEMPTION_SEAL") && el("HARD").includes("REDEMPTION_SEAL"));
  check("sin Sello con misión de 2 vigilias", !el("HARD", { mission: { rule: "LEGACY" } }).includes("REDEMPTION_SEAL") && !el("HARD", { mission: { rule: "FEW_QUESTIONS" } }).includes("REDEMPTION_SEAL"));

  // La oferta: 3 distintas de las elegibles, en muchas tiradas.
  let bien = true;
  for (let i = 0; i < 2000; i++) {
    for (const d of game.DIFFICULTIES) {
      const pool = el(d);
      const o = game.rollBlessingOffer(pool, Math.random);
      if (o.length !== 3 || new Set(o).size !== 3 || o.some((k) => !pool.includes(k))) bien = false;
    }
  }
  check("2.000 ofertas por dificultad: siempre 3 distintas y elegibles", bien);
  check("con 2 elegibles, 2; con 0, ninguna", game.rollBlessingOffer(["SOULS", "LUCIDITY"], Math.random).length === 2 && game.rollBlessingOffer([], Math.random).length === 0);
  check("random 0 saca primero la primera", game.rollBlessingOffer(["SOULS", "SCRIBE_EYE"], () => 0)[0] === "SOULS");

  // Pesos: lo medido (100.000 ofertas) contra lo exacto (docs).
  const medir = (d: Difficulty, f: (o: BlessingKey[]) => boolean) => {
    let n = 0;
    for (let i = 0; i < 100_000; i++) if (f(game.rollBlessingOffer(el(d), Math.random))) n++;
    return n / 1000;
  };
  const rara = (o: BlessingKey[]) => o.some((k) => game.BLESSINGS[k].rarity !== "common");
  const media = medir("MEDIUM", rara);
  const sello = medir("HARD", (o) => o.includes("REDEMPTION_SEAL"));
  const dificilRara = medir("HARD", rara);
  check(`media: alguna rara en el ${media} % (exacto 79,7; objetivo 75–85)`, Math.abs(media - 79.7) < 1);
  check(`difícil: el Sello en el ${sello} % (exacto 27,1; objetivo 25–30)`, Math.abs(sello - 27.1) < 1);
  check(`difícil: alguna rara o la épica en el ${dificilRara} % (exacto 85,4)`, Math.abs(dificilRara - 85.4) < 1);

  check("almas: +25 % hacia abajo (100 → 25, 7 → 1, 3 → 0)", game.soulsBlessingBonus(100) === 25 && game.soulsBlessingBonus(7) === 1 && game.soulsBlessingBonus(3) === 0);
  check("escudo: solo si de verdad restaba", game.ashShieldApplies(-5) && !game.ashShieldApplies(0) && !game.ashShieldApplies(15));
  let nuncaLaCorrecta = true;
  const vistas = new Set<number>();
  for (let i = 0; i < 3000; i++) {
    const order = [2, 0, 3, 1];
    const s = game.struckOptionFor(order, 3, (n) => Math.floor(Math.random() * n));
    if (order[s] === 3) nuncaLaCorrecta = false;
    vistas.add(s);
  }
  check("la tachada nunca es la correcta, y salen las 3 incorrectas", nuncaLaCorrecta && vistas.size === 3, [...vistas]);
  check("hitos de llama: se cruzan una vez", game.flameRelicsCrossed(6, 7).join() === "flame:7" && game.flameRelicsCrossed(7, 8).length === 0 && game.flameRelicsCrossed(29, 30).join() === "flame:30");
  check("Sello: 3 de 5 aprueba con passWith 3 y no con 4", game.trialPassed(3, 3) && !game.trialPassed(3));
  check("reliquias: 6 de jefe y 3 de llama, con título", game.RELIC_KEYS.length === 9 && game.RELIC_KEYS.every((k) => game.RELICS[k].title.length > 0));
  // Regla de oro, en el catálogo: ninguna habla de vigilia, vida o golpes
  // como algo que regale (las almas "en tus próximos golpes" se ganan
  // golpeando).
  check("ninguna bendición acorta la vigilia ni quita vida", game.BLESSING_KEYS.every((k) => !/vigilia|vida|daño/i.test(game.BLESSINGS[k].effect)));
}

// ---------------------------------------------------------------------------
//  2. La victoria, la oferta y la elección
// ---------------------------------------------------------------------------

async function probarVictoriaYOferta(ids: string[]) {
  console.log("\n2. La victoria crea la oferta y la reliquia; elegir se valida en el servidor");
  const u = await crearUsuario();
  const otro = await crearUsuario();
  ids.push(u.id, otro.id);
  const jefe = await crearJefe(u.subjectId, "EASY", "rata-de-las-cloacas", 100);
  const golpe = await golpear(u.id, jefe);
  check("el golpe vence al jefe", golpe.ok && golpe.defeated === true, golpe);
  const offer = await prisma.blessingOffer.findUnique({ where: { taskId: jefe.id } });
  check("oferta creada en la victoria: las 3 comunes, distintas", offer !== null && [...offer.options].sort().join() === "ASH_SHIELD,LUCIDITY,SOULS", offer?.options);
  check("caduca a los 7 días", offer !== null && Math.abs(offer.expiresAt.getTime() - offer.createdAt.getTime() - 7 * DAY) < 1000);
  check("la reliquia del jefe, en el resultado y en la base", golpe.ok && golpe.relicsEarned?.join() === "boss:rata-de-las-cloacas" && (await prisma.relic.count({ where: { userId: u.id } })) === 1, golpe.ok && golpe.relicsEarned);
  let duplicada = false;
  try {
    await prisma.blessingOffer.create({ data: { userId: u.id, taskId: jefe.id, options: ["SOULS"], expiresAt: new Date(Date.now() + DAY) } });
  } catch {
    duplicada = true;
  }
  check("una sola oferta por jefe (índice único)", duplicada);
  const final = await prisma.studySession.findFirstOrThrow({ where: { taskId: jefe.id }, orderBy: { completedAt: "desc" }, select: { completedAt: true } });
  const victoria = await loadVictoryRewards(u.id, { id: jefe.id, relicKey: "boss:rata-de-las-cloacas" }, final.completedAt);
  check("la victoria (al recargar) enseña la oferta y la reliquia de ESE golpe", victoria.offer?.cards.length === 3 && victoria.relic?.key === "boss:rata-de-las-cloacas");

  // Otro jefe con la misma criatura: la reliquia no se repite.
  const jefe2 = await crearJefe(u.subjectId, "EASY", "rata-de-las-cloacas", 100);
  const golpe2 = await golpear(u.id, jefe2);
  check("vencer otra vez a una rata no da otra reliquia", golpe2.ok && golpe2.relicsEarned === undefined && (await prisma.relic.count({ where: { userId: u.id } })) === 1);
  const victoria2 = await loadVictoryRewards(u.id, { id: jefe2.id, relicKey: "boss:rata-de-las-cloacas" }, (await prisma.studySession.findFirstOrThrow({ where: { taskId: jefe2.id }, select: { completedAt: true } })).completedAt);
  check("…y su victoria no enseña reliquia", victoria2.relic === null);

  const antes = await vidaYVigilias(u.id);
  check("de la oferta de OTRO usuario: null (404)", (await elegirBendicionDe(otro.id, offer!.id, "SOULS")) === null);
  const noOfrecida = await elegirBendicionDe(u.id, offer!.id, "SCRIBE_EYE");
  check("una que no se ofreció: rechazada", noOfrecida?.ok === false && noOfrecida.error === REWARD_ERRORS.notOffered);
  const bien = await elegirBendicionDe(u.id, offer!.id, "ASH_SHIELD");
  check("elegir una de las 3: activa con sus usos", bien?.ok === true && (await usos(u.id, "ASH_SHIELD")) === 2);
  const otraVez = await elegirBendicionDe(u.id, offer!.id, "SOULS");
  check("no se puede elegir dos veces", otraVez?.ok === false && otraVez.error === REWARD_ERRORS.chosen);
  const offer2 = await prisma.blessingOffer.findUniqueOrThrow({ where: { taskId: jefe2.id } });
  // offer2 se creó ANTES de elegir el Escudo, así que puede incluirlo; elegirlo
  // ahora se rechaza porque ya está activo.
  if (offer2.options.includes("ASH_SHIELD")) {
    const activo = await elegirBendicionDe(u.id, offer2.id, "ASH_SHIELD");
    check("…y elegir algo ya activo se rechaza (la oferta sigue pendiente)", activo?.ok === false && activo.error === REWARD_ERRORS.active);
  }
  await prisma.blessingOffer.update({ where: { id: offer2.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const caducada = await elegirBendicionDe(u.id, offer2.id, offer2.options.find((k) => k !== "ASH_SHIELD")!);
  check("una oferta caducada no se puede elegir", caducada?.ok === false && caducada.error === REWARD_ERRORS.expired);
  check("elegir no cambia la vida ni las vigilias", antes === (await vidaYVigilias(u.id)));

  // Una victoria con el Escudo activo: la oferta nueva no lo trae.
  const jefe3 = await crearJefe(u.subjectId, "EASY", "centinela-de-huesos", 100);
  await golpear(u.id, jefe3);
  const offer3 = await prisma.blessingOffer.findUniqueOrThrow({ where: { taskId: jefe3.id } });
  check("con el Escudo activo, la oferta del jefe fácil trae las otras 2 comunes", [...offer3.options].sort().join() === "LUCIDITY,SOULS", offer3.options);
  // Dos pestañas eligen a la vez de la misma oferta: el usuario bloqueado las
  // pone en fila y solo una gana.
  const [a, b] = await Promise.all([
    elegirBendicionDe(u.id, offer3.id, offer3.options[0]),
    elegirBendicionDe(u.id, offer3.id, offer3.options[1]),
  ]);
  const ganadoras = [a, b].filter((r) => r?.ok).length;
  const elegidas = await prisma.blessing.count({ where: { userId: u.id, key: { in: offer3.options } } });
  check("dos elecciones a la vez: una sola gana y la otra ve «ya elegiste»", ganadoras === 1 && [a, b].some((r) => r?.ok === false && r.error === REWARD_ERRORS.chosen) && elegidas === 1, { a, b, elegidas });

  // Títulos.
  check("equipar una reliquia que no tienes: no", (await equiparReliquiaDe(u.id, "boss:liche-del-osario")).ok === false);
  check("equipar la tuya: sí", (await equiparReliquiaDe(u.id, "boss:rata-de-las-cloacas")).ok && (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).equippedRelic === "boss:rata-de-las-cloacas");
  check("quitar el título", (await equiparReliquiaDe(u.id, null)).ok && (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).equippedRelic === null);
}

// ---------------------------------------------------------------------------
//  3. Cada efecto, aplicado y gastado en su transacción
// ---------------------------------------------------------------------------

async function probarAlmas(ids: string[]) {
  console.log("\n3a. Bendición de las almas: +25 % del golpe, 3 golpes");
  const u = await crearUsuario();
  ids.push(u.id);
  await darBendicion(u.id, "SOULS");
  const jefe = await crearJefe(u.subjectId, "HARD");
  for (let i = 1; i <= 3; i++) {
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).souls;
    const g = await golpear(u.id, jefe);
    const vigil = await prisma.studySession.findFirstOrThrow({ where: { taskId: jefe.id }, orderBy: { completedAt: "desc" } });
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).souls;
    const bonus = g.ok ? (g.blessingBonus ?? 0) : -1;
    const base = g.ok ? g.strikeSouls! - bonus : -1;
    check(
      `golpe ${i}: extra = 25 % hacia abajo de ${base} (${bonus}), guardado en la vigilia y sumado`,
      g.ok && bonus === game.soulsBlessingBonus(base) && vigil.soulsEarned === base + bonus && after - before === base + bonus,
      { g, soulsEarned: vigil.soulsEarned, delta: after - before },
    );
    check(`…le quedan ${3 - i} usos`, (await usos(u.id, "SOULS")) === 3 - i);
  }
  const g4 = await golpear(u.id, jefe);
  check("el cuarto golpe ya no lleva extra", g4.ok && g4.blessingBonus === undefined);
  const hp = (await prisma.task.findUniqueOrThrow({ where: { id: jefe.id } })).currentHp;
  check("la vida baja 100 por golpe, ni más ni menos", hp === 600 - 4 * 100, hp);

  console.log("\n3b. La de las almas no toca las de la victoria");
  await darBendicion(u.id, "SOULS");
  const jefeFinal = await crearJefe(u.subjectId, "MEDIUM", undefined, 100);
  const gv = await golpear(u.id, jefeFinal);
  const task = await prisma.task.findUniqueOrThrow({ where: { id: jefeFinal.id } });
  const base = gv.ok ? gv.strikeSouls! - (gv.blessingBonus ?? 0) : 0;
  check(
    "golpe final: el extra solo sobre el golpe; la victoria, en su rango y sin extra",
    gv.ok && (gv.blessingBonus ?? 0) === game.soulsBlessingBonus(base) && gv.victorySouls === task.victorySouls && task.victorySouls! >= 400 && task.victorySouls! <= 600,
    gv,
  );
}

async function probarContraataque(ids: string[]) {
  console.log("\n3c. Ojo del escriba y Lucidez: se gastan al CREAR el contraataque");
  const u = await crearUsuario({ souls: 700, questions: 4 });
  ids.push(u.id);
  await darBendicion(u.id, "SCRIBE_EYE");
  await darBendicion(u.id, "LUCIDITY");
  await darBendicion(u.id, "ASH_SHIELD");
  const jefe = await crearJefe(u.subjectId, "HARD");
  const g = await golpear(u.id, jefe);
  check("golpe sin vencer: hay contraataque", g.ok && !g.defeated);
  const counter = await contraataqueAbierto(u.id);
  const items = parseItems(counter.items as never);
  let tachadasBien = items.length === 3;
  for (const item of items) {
    const q = await prisma.question.findUniqueOrThrow({ where: { id: item.ref }, select: { correctIndex: true } });
    if (item.struck === undefined || item.order[item.struck] === q.correctIndex) tachadasBien = false;
  }
  check("cada pregunta de opción múltiple lleva una incorrecta tachada", tachadasBien, items);
  check("el Ojo y la Lucidez se gastaron al crearlo", (await usos(u.id, "SCRIBE_EYE")) === 0 && (await usos(u.id, "LUCIDITY")) === 0);
  check("la Lucidez quedó en el contraataque (+5 por acierto)", counter.bonusPerCorrect === 5);

  if (PAYLOAD) await probarPayloadOjo(u, jefe.id, items);

  const antes = await vidaYVigilias(u.id);
  const tachada = items[0].struck!;
  const s0 = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).souls;
  const rechazo = await responderPreguntaDe(u.id, counter.id, 0, tachada);
  check("contestar la opción tachada: rechazado, sin tocar nada", rechazo?.ok === false && (await prisma.counterattack.findUniqueOrThrow({ where: { id: counter.id } })).answered === 0);

  console.log("\n3d. Lucidez al acertar; Escudo al fallar; esquivar no gasta el escudo");
  const r1 = await responderPreguntaDe(u.id, counter.id, 0, await opcion(counter, 0, "correct"));
  const s1 = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).souls;
  check("acierto con Lucidez: 15 + 5 = 20 almas", r1?.ok === true && r1.soulsDelta === 20 && r1.lucidityBonus === 5 && s1 - s0 === 20, r1);
  const r2 = await responderPreguntaDe(u.id, counter.id, 1, null);
  check("esquivar: 0 almas y el escudo sigue con 2 usos", r2?.ok === true && r2.soulsDelta === 0 && !r2.shielded && (await usos(u.id, "ASH_SHIELD")) === 2, r2);
  const r3 = await responderPreguntaDe(u.id, counter.id, 2, await opcion(counter, 2, "wrong"));
  const s3 = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).souls;
  check("fallo con Escudo: 0 almas, «te protege», un uso menos", r3?.ok === true && r3.soulsDelta === 0 && r3.shielded === true && !r3.protectedByLevel && s3 === s1 && (await usos(u.id, "ASH_SHIELD")) === 1, r3);
  const intento = await prisma.questionAttempt.findFirst({ where: { userId: u.id }, orderBy: { createdAt: "desc" } });
  check("el intento queda con 0 almas", intento?.soulsDelta === 0 && intento.correct === false);
  check("el contraataque no cambia la vida ni las vigilias", antes === (await vidaYVigilias(u.id)));

  console.log("\n3e. Sin preguntas del banco, la Lucidez y el Ojo no se gastan");
  const v = await crearUsuario();
  ids.push(v.id);
  await darBendicion(v.id, "SCRIBE_EYE");
  await darBendicion(v.id, "LUCIDITY");
  const jefeV = await crearJefe(v.subjectId, "MEDIUM");
  await golpear(v.id, jefeV);
  const cv = await contraataqueAbierto(v.id);
  check("contraataque de genéricas: ni tachadas ni lucidez", parseItems(cv.items as never).every((i) => i.struck === undefined) && cv.bonusPerCorrect === 0);
  check("…y las dos bendiciones siguen activas", (await usos(v.id, "SCRIBE_EYE")) === 1 && (await usos(v.id, "LUCIDITY")) === 1);
}

// --payload: el navegador recibe la tachada, nunca la correcta.
async function probarPayloadOjo(u: { id: string; email: string; tag: string }, taskId: string, items: { ref: string; order: number[]; struck?: number }[]) {
  console.log("\n3c'. El navegador, con el Ojo del escriba (HTML y payload)");
  const sesion = await iniciarSesion(prisma as never, u);
  try {
    for (const rsc of [false, true]) {
      const { status, body } = await pedirPagina(sesion.cookie, `/mazmorra/batalla/${taskId}`, rsc);
      const nombre = rsc ? "payload" : "HTML";
      check(`${nombre}: 200`, status === 200, status);
      check(`${nombre}: lleva la tachada de la pregunta que toca (struck ${items[0].struck})`, body.includes(`"struck":${items[0].struck}`) || body.includes(`struck&quot;:${items[0].struck}`) || body.includes(`\\"struck\\":${items[0].struck}`));
      check(`${nombre}: ni correctIndex ni explicaciones`, !/correctIndex/.test(body) && !body.includes(`explicacion-secreta-${u.tag}`));
      check(`${nombre}: ni el id de la pregunta`, !items.some((i) => body.includes(i.ref)));
    }
  } finally {
    await sesion.cerrar();
  }
}

async function probarSello(ids: string[]) {
  console.log("\n3f. Sello de redención: se gasta al empezar; bastan 3 de 5");
  const conSello = await prepararMision(ids, true);
  const p = await comenzarPruebaDe(conSello.id);
  const trial = p.ok ? await prisma.redemptionTrial.findUniqueOrThrow({ where: { id: p.trialId } }) : null;
  check("la prueba guarda passWith 3 y el Sello se gastó", trial?.passWith === 3 && (await usos(conSello.id, "REDEMPTION_SEAL")) === 0, trial?.passWith);
  const reabierta = await comenzarPruebaDe(conSello.id);
  check("retomarla no vuelve a gastar nada", reabierta.ok && p.ok && reabierta.trialId === p.trialId);
  const resultado = await contestarPrueba(conSello.id, trial!.id, 3);
  check("3 aciertos de 5 con el Sello: aprobada y las almas vuelven", resultado?.passed === true && resultado.passWith === 3, resultado);

  const sinSello = await prepararMision(ids, false);
  const p2 = await comenzarPruebaDe(sinSello.id);
  const r2 = p2.ok ? await contestarPrueba(sinSello.id, p2.trialId, 3) : null;
  check("sin Sello, 3 de 5 no basta (passWith 4)", r2?.passed === false && r2.passWith === 4, r2);
}

// Una misión TRIAL con 1 intento y una materia de 5 preguntas.
async function prepararMision(ids: string[], sello: boolean) {
  const u = await crearUsuario({ questions: 5 });
  ids.push(u.id);
  const jefe = await crearJefe(u.subjectId, "EASY");
  await prisma.task.update({ where: { id: jefe.id }, data: { status: "FAILED", failedAt: new Date() } });
  await prisma.redemptionMission.create({
    data: { userId: u.id, taskId: jefe.id, soulsAtStake: 50, rule: "TRIAL", vigilsDone: 1, fellAt: new Date(), deadline: new Date(Date.now() + DAY) },
  });
  if (sello) await darBendicion(u.id, "REDEMPTION_SEAL");
  return u;
}

async function contestarPrueba(userId: string, trialId: string, aciertos: number) {
  let summary;
  for (let n = 0; n < 5; n++) {
    const t = await prisma.redemptionTrial.findUniqueOrThrow({ where: { id: trialId } });
    const item = parseTrialItems(t.items)[n];
    const q = await prisma.question.findUniqueOrThrow({ where: { id: item.ref }, select: { correctIndex: true } });
    const correct = toShownIndex(item.order, q.correctIndex);
    const r = await responderPruebaDe(userId, trialId, n, n < aciertos ? correct : (correct + 1) % 4);
    if (r?.ok && r.summary) summary = r.summary;
  }
  return summary;
}

async function probarChispa(ids: string[]) {
  console.log("\n3g. Chispa de la hoguera: +1 brasa al elegirla, sin pasar de 2");
  const u = await crearUsuario({ embers: 1 });
  ids.push(u.id);
  const t1 = await crearJefe(u.subjectId, "MEDIUM");
  const t2 = await crearJefe(u.subjectId, "MEDIUM");
  await prisma.task.updateMany({ where: { id: { in: [t1.id, t2.id] } }, data: { status: "DEFEATED", currentHp: 0 } });
  const o1 = await prisma.blessingOffer.create({ data: { userId: u.id, taskId: t1.id, options: ["EMBER_SPARK", "SOULS", "SCRIBE_EYE"], expiresAt: new Date(Date.now() + DAY) } });
  const o2 = await prisma.blessingOffer.create({ data: { userId: u.id, taskId: t2.id, options: ["EMBER_SPARK", "SOULS", "SCRIBE_EYE"], expiresAt: new Date(Date.now() + DAY) } });
  const antes = await vidaYVigilias(u.id);
  const r = await elegirBendicionDe(u.id, o1.id, "EMBER_SPARK");
  const embers = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).embers;
  check("con 1 brasa: elegirla da la segunda, y no queda activa", r?.ok === true && embers === 2 && (await prisma.blessing.count({ where: { userId: u.id } })) === 0);
  const full = await elegirBendicionDe(u.id, o2.id, "EMBER_SPARK");
  check("con 2: se rechaza y la oferta sigue pendiente", full?.ok === false && full.error === REWARD_ERRORS.embersFull && (await prisma.blessingOffer.findUniqueOrThrow({ where: { id: o2.id } })).chosenKey === null);
  check("la Chispa no cambia la vida ni las vigilias", antes === (await vidaYVigilias(u.id)));
}

// ---------------------------------------------------------------------------
//  5. Hitos de llama
// ---------------------------------------------------------------------------

async function probarHitosDeLlama(ids: string[]) {
  console.log("\n5. Hitos de llama: una vez, con bestFlame");
  const u = await crearUsuario();
  ids.push(u.id);
  const ayer = new Date(todayDateInAppTimeZone().getTime() - DAY);
  await prisma.user.update({ where: { id: u.id }, data: { flame: 6, bestFlame: 6, lastStrikeDay: ayer } });
  const jefe = await crearJefe(u.subjectId, "HARD");
  const g = await golpear(u.id, jefe);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
  check("de 6 a 7 días: la reliquia de 7 y bestFlame 7", g.ok && g.relicsEarned?.join() === "flame:7" && user.flame === 7 && user.bestFlame === 7, { g, flame: user.flame, best: user.bestFlame });
  const g2 = await golpear(u.id, jefe);
  check("otro golpe el mismo día: nada nuevo", g2.ok && g2.relicsEarned === undefined);
  // La llama se apaga y vuelve a llegar a 7: no se repite.
  await prisma.user.update({ where: { id: u.id }, data: { flame: 6, lastStrikeDay: ayer } });
  const g3 = await golpear(u.id, jefe);
  check("volver a llegar a 7 (con bestFlame 7): no se repite", g3.ok && g3.relicsEarned === undefined && (await prisma.relic.count({ where: { userId: u.id, key: "flame:7" } })) === 1);
}

// ---------------------------------------------------------------------------
//  6. El relleno de la migración
// ---------------------------------------------------------------------------

// Parte un bloque de SQL en sentencias, sin cortar dentro de $$…$$ ni de
// $fc$…$fc$ (las funciones) ni de los comentarios.
function sentencias(sql: string): string[] {
  const out: string[] = [];
  let actual = "";
  let dolar: string | null = null;
  for (const linea of sql.split(/\r?\n/)) {
    if (dolar === null && /^\s*--/.test(linea)) continue;
    actual += linea + "\n";
    for (const m of linea.matchAll(/\$[a-z]*\$/g)) dolar = dolar === null ? m[0] : dolar === m[0] ? null : dolar;
    if (dolar === null && /;\s*$/.test(linea)) {
      out.push(actual.trim());
      actual = "";
    }
  }
  if (actual.trim()) out.push(actual.trim());
  return out;
}

class Deshacer extends Error {}

async function probarRelleno(ids: string[]) {
  console.log("\n6. El relleno de la migración fase4 (racha y reliquias), contra TypeScript");
  const sql = readFileSync("prisma/migrations/20261019120000_fase4/migration.sql", "utf8");
  const relleno = /-- relleno:inicio\r?\n([\s\S]*?)-- relleno:fin/.exec(sql)?.[1];
  if (!relleno) return check("hay bloque de relleno en la migración", false);
  // Sin el paso 1 (códigos de amigo: lo prueba probar-companeros).
  const pasos = sentencias(relleno).filter((s) => !/ember_friend_code/.test(s));
  check("el relleno de racha y reliquias son 3 sentencias", pasos.length === 3, pasos.length);

  // Datos de prueba: un usuario con 8 días SEGUIDOS de golpes (hace 20 a 13
  // días), un hueco, y 3 días más; llama guardada 2. Tres jefes vencidos: una
  // rata, un fácil con bossKey inválida (sale por el id) y un ogro.
  const u = await crearUsuario();
  const w = await crearUsuario();
  ids.push(u.id, w.id);
  const jefe = await crearJefe(u.subjectId, "EASY", "rata-de-las-cloacas");
  const raro = await crearJefe(u.subjectId, "EASY", "no-existe");
  const ogro = await crearJefe(u.subjectId, "MEDIUM", "ogro-de-las-ruinas");
  await prisma.task.updateMany({ where: { id: { in: [jefe.id, raro.id, ogro.id] } }, data: { status: "DEFEATED", currentHp: 0 } });
  // A las 4:30 a. m. UTC (= 11:30 p. m. de Bogotá del día ANTERIOR): si el
  // relleno contara días en UTC, la serie se rompería.
  const hoy = todayDateInAppTimeZone();
  const dias = [20, 19, 18, 17, 16, 15, 14, 13, 10, 9, 8];
  for (const d of dias) {
    const at = new Date(hoy.getTime() - d * DAY + 4.5 * 3_600_000);
    await prisma.studySession.create({ data: { taskId: jefe.id, userId: u.id, startedAt: at, endsAt: at, completedAt: at, durationMinutes: 25 } });
  }
  await prisma.user.update({ where: { id: u.id }, data: { flame: 2 } });
  await prisma.user.update({ where: { id: w.id }, data: { flame: 31 } });

  // Lo que dicen las reglas de TypeScript, para TODOS los usuarios.
  const users = await prisma.user.findMany({ select: { id: true, flame: true } });
  const sesiones = await prisma.studySession.findMany({ where: { completedAt: { not: null } }, select: { userId: true, completedAt: true } });
  const tareas = await prisma.task.findMany({ where: { status: "DEFEATED" }, select: { id: true, difficulty: true, bossKey: true, subject: { select: { userId: true } } } });
  const esperado = new Map<string, { best: number; relics: Set<string> }>();
  for (const user of users) {
    const days = [...new Set(sesiones.filter((s) => s.userId === user.id).map((s) => todayInAppTimeZone(s.completedAt!)))].sort();
    let run = 0;
    let best = 0;
    let prev: number | null = null;
    for (const day of days) {
      const t = Date.parse(`${day}T00:00:00Z`);
      run = prev !== null && t - prev === DAY ? run + 1 : 1;
      best = Math.max(best, run);
      prev = t;
    }
    const bestFlame = Math.max(user.flame, best);
    const relics = new Set<string>(game.FLAME_MILESTONES.filter((m) => bestFlame >= m).map((m) => `flame:${m}`));
    for (const t of tareas.filter((t) => t.subject.userId === user.id)) relics.add(game.relicKeyForBoss(game.bossForTask(t).key));
    esperado.set(user.id, { best: bestFlame, relics });
  }
  check("el usuario de prueba: racha de 8 (no 11: hay un hueco), en hora de Bogotá", esperado.get(u.id)?.best === 8, esperado.get(u.id));

  let iguales = false;
  let detalle: unknown;
  try {
    await prisma.$transaction(
      async (tx) => {
        // Como antes de la migración: sin reliquias y sin racha guardada.
        await tx.relic.deleteMany({});
        await tx.user.updateMany({ data: { bestFlame: 0 } });
        for (const paso of pasos) await tx.$executeRawUnsafe(paso);
        const rows = await tx.user.findMany({ select: { id: true, bestFlame: true, relics: { select: { key: true } } } });
        const malos = rows.filter((r) => {
          const e = esperado.get(r.id)!;
          const got = new Set(r.relics.map((x) => x.key));
          return r.bestFlame !== e.best || got.size !== e.relics.size || [...e.relics].some((k) => !got.has(k));
        });
        iguales = malos.length === 0;
        detalle = { usuarios: rows.length, malos: malos.map((m) => ({ ...m, esperado: esperado.get(m.id) })) };
        throw new Deshacer();
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    if (!(error instanceof Deshacer)) throw error;
  }
  check("el SQL da la misma racha y las mismas reliquias que TypeScript, en todos los usuarios", iguales, detalle);
  const uR = esperado.get(u.id)!;
  // El de bossKey inválida sale por su id (puede coincidir con la rata).
  const porId = game.relicKeyForBoss(game.bossForTask({ id: raro.id, difficulty: "EASY", bossKey: "no-existe" }).key);
  check(
    "…incluido el jefe de bossKey inválida (por el id) y los hitos (8 → solo el de 7)",
    uR.relics.has(porId) && uR.relics.has("boss:rata-de-las-cloacas") && uR.relics.has("boss:ogro-de-las-ruinas") && uR.relics.has("flame:7") && !uR.relics.has("flame:30"),
    { relics: [...uR.relics], porId },
  );
  check("…y la llama guardada de 31 da los hitos de 7 y 30", [...esperado.get(w.id)!.relics].sort().join() === "flame:30,flame:7");
  check("la transacción del relleno se deshizo", (await prisma.relic.count({ where: { userId: { in: [u.id, w.id] } } })) === 0);
}

// ---------------------------------------------------------------------------

const ids: string[] = [];
try {
  probarReglas();
  await probarVictoriaYOferta(ids);
  await probarAlmas(ids);
  await probarContraataque(ids);
  await probarSello(ids);
  await probarChispa(ids);
  await probarHitosDeLlama(ids);
  await probarRelleno(ids);
} catch (error) {
  fallo();
  console.error("Error inesperado:", error);
} finally {
  await prisma.user.deleteMany({ where: { OR: [{ id: { in: ids } }, { email: { startsWith: `${PREFIJO}-` } }] } });
  await prisma.$disconnect();
  terminar();
}
