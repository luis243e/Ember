// Pruebas del contraataque contra la base LOCAL (Postgres de Docker).
// Ejecutar:
//   node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-contraataque.ts
// Comprueba:
//   1. las reglas sin base de datos: applySoulsDelta, el valor esperado de
//      contestar al azar, la permutación y la validación de items;
//   2. que el golpe crea el contraataque (uno por vigilia) y el golpe final no;
//   3. contestar: almas, permutación, intentos, esquivar, dos "pestañas" a la
//      vez, contestar tarde, el contraataque de otro usuario;
//   4. las genéricas (nunca restan, no escriben intentos);
//   5. el suelo del nivel, subir de nivel contestando y una pregunta borrada;
//   6. que una vigilia nueva cierra el contraataque sin terminar.
// Llama directamente al corazón de la batalla (lib/battle.ts), sin la capa de
// las Server Actions (que solo añade la sesión y el 404).
// Crea dos usuarios temporales y los borra al final, también si alguna
// comprobación falla (try/finally). Se niega a correr fuera de localhost.
import { assertLocalDatabase } from "@/scripts/local-only";

// ANTES de importar nada que cree el cliente de Prisma.
assertLocalDatabase("probar-contraataque");

const { prisma } = await import("@/lib/prisma");
const { asestarGolpeDe, comenzarVigiliaDe, responderPreguntaDe } = await import("@/lib/battle");
const { applySoulsDelta, COUNTERATTACK, counterattackSouls, levelForSouls, LEVEL_COSTS } = await import("@/lib/game");
const {
  buildItems,
  isPermutation,
  parseItems,
  publicQuestion,
  randomPermutation,
  resolveItem,
  toOriginalIndex,
  toShownIndex,
} = await import("@/lib/questions/counterattack");
const { GENERIC_QUESTIONS } = await import("@/lib/questions/generic");
type CounterattackItem = import("@/lib/questions/counterattack").CounterattackItem;
type ResultadoRespuesta = import("@/lib/battle").ResultadoRespuesta;

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: unknown): void {
  if (ok) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}`, detalle === undefined ? "" : detalle);
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
//  1. Reglas (sin base de datos)
// ---------------------------------------------------------------------------
function probarReglas(): void {
  console.log("\n1. Reglas");

  // El nivel 2 empieza en 500 almas y el 3 en 500 + 527 = 1027.
  const lvl2 = LEVEL_COSTS[0];
  const lvl3 = LEVEL_COSTS[0] + LEVEL_COSTS[1];
  check("applySoulsDelta: justo al inicio del nivel, restar no quita nada", same(applySoulsDelta(lvl2, -5), { souls: lvl2, applied: 0 }));
  check("applySoulsDelta: con margen, resta entera", same(applySoulsDelta(lvl2 + 100, -5), { souls: lvl2 + 95, applied: -5 }));
  check("applySoulsDelta: sin margen suficiente, resta solo hasta el inicio del nivel", same(applySoulsDelta(lvl2 + 3, -5), { souls: lvl2, applied: -3 }));
  check("applySoulsDelta: en el nivel 1 con 0 almas no baja de 0", same(applySoulsDelta(0, -10), { souls: 0, applied: 0 }));
  const max = LEVEL_COSTS.reduce((a, b) => a + b, 0);
  check("applySoulsDelta: en el nivel 50 no baja del umbral del 50", same(applySoulsDelta(max + 100, -500), { souls: max, applied: -100 }));
  for (const souls of [0, 7, lvl2, lvl2 + 1, lvl3 - 1, lvl3, 40_000, max + 50]) {
    for (const delta of [-5, -10, -1000]) {
      const after = applySoulsDelta(souls, delta).souls;
      if (levelForSouls(after).level !== levelForSouls(souls).level) {
        check(`applySoulsDelta(${souls}, ${delta}) baja de nivel`, false);
      }
    }
  }
  check("applySoulsDelta: ninguna resta baja de nivel (24 casos)", true);
  const sube = applySoulsDelta(lvl3 - 5, 15);
  check("applySoulsDelta: acertar puede subir de nivel", levelForSouls(sube.souls).level === 3 && sube.applied === 15);

  // Valor esperado de contestar al azar = 0.
  const mc = COUNTERATTACK.souls.MULTIPLE_CHOICE;
  const tf = COUNTERATTACK.souls.TRUE_FALSE;
  check(`al azar, opción múltiple da 0 de media (¼·${mc.correct} + ¾·${mc.wrong})`, mc.correct * 1 + mc.wrong * 3 === 0);
  check(`al azar, verdadero o falso da 0 de media (½·${tf.correct} + ½·${tf.wrong})`, tf.correct + tf.wrong === 0);
  check(
    "las genéricas nunca restan",
    counterattackSouls("GENERIC", "correct") > 0 && counterattackSouls("GENERIC", "wrong") > 0,
  );
  check(
    "esquivar da 0 en los tres tipos",
    (["MULTIPLE_CHOICE", "TRUE_FALSE", "GENERIC"] as const).every((k) => counterattackSouls(k, "dodged") === 0),
  );

  // La permutación: siempre válida, y la correcta cae en cada posición más o
  // menos el mismo número de veces (4000 sorteos: ~1000 por posición).
  const posiciones = [0, 0, 0, 0];
  let validas = true;
  let inversas = true;
  for (let i = 0; i < 4000; i++) {
    const order = randomPermutation(4);
    if (!isPermutation(order, 4)) validas = false;
    posiciones[toShownIndex(order, 0)]++;
    for (let shown = 0; shown < 4; shown++) {
      if (toShownIndex(order, toOriginalIndex(order, shown)) !== shown) inversas = false;
    }
  }
  check("randomPermutation da siempre permutaciones de 0..3", validas);
  check("toOriginalIndex y toShownIndex son inversas", inversas);
  check(
    `la opción 0 cae repartida en las 4 posiciones (${posiciones.join(" / ")})`,
    posiciones.every((n) => n > 850 && n < 1150),
  );
  const ejemplo = [2, 0, 3, 1];
  check(
    "traducción: con order [2,0,3,1], la mostrada A es la original 2 y la original 1 se muestra en D",
    toOriginalIndex(ejemplo, 0) === 2 && toShownIndex(ejemplo, 1) === 3,
  );

  // Validación de items.
  const rechaza = (nombre: string, json: unknown) => {
    try {
      parseItems(json as never);
      check(`parseItems rechaza ${nombre}`, false);
    } catch {
      check(`parseItems rechaza ${nombre}`, true);
    }
  };
  rechaza("null", null);
  rechaza("una lista vacía", []);
  rechaza("un order con repetidos", [{ ref: "x", order: [0, 0] }]);
  rechaza("un order de 3", [{ ref: "x", order: [0, 1, 2] }]);
  rechaza("un order con un 4 en 4 opciones", [{ ref: "x", order: [0, 1, 2, 4] }]);
  rechaza("una ref vacía", [{ ref: "", order: [0, 1] }]);
  rechaza("decimales", [{ ref: "x", order: [0.5, 1] }]);
  check("parseItems acepta uno bien formado", parseItems([{ ref: "x", order: [1, 0, 3, 2] }]).length === 1);

  const items = buildItems([
    { id: "mc", key: null, source: "MANUAL", type: "MULTIPLE_CHOICE", prompt: "", options: ["a", "b", "c", "d"], correctIndex: 0, explanation: null },
    { id: "tf", key: null, source: "MANUAL", type: "TRUE_FALSE", prompt: "", options: ["Verdadero", "Falso"], correctIndex: 0, explanation: null },
    GENERIC_QUESTIONS[0],
  ]);
  check("buildItems: la ref es el id, o generic:<clave>", items[0].ref === "mc" && items[2].ref === `generic:${GENERIC_QUESTIONS[0].key}`);
  check("buildItems: opción múltiple barajada (permutación de 4)", isPermutation(items[0].order, 4));
  check("buildItems: verdadero o falso y genéricas sin barajar", same(items[1].order, [0, 1]) && same(items[2].order, [0, 1]));
}

// ---------------------------------------------------------------------------
//  Ayudas para las pruebas con base de datos
// ---------------------------------------------------------------------------
const DAY = 24 * 60 * 60 * 1000;

// Una vigilia ya cumplida (su fin pasó), lista para el golpe.
async function vigiliaCumplida(userId: string, taskId: string) {
  const now = Date.now();
  return prisma.studySession.create({
    data: { taskId, userId, startedAt: new Date(now - 60_000), endsAt: new Date(now - 1000), durationMinutes: 1 },
  });
}

async function contraataqueDe(studySessionId: string) {
  return prisma.counterattack.findUnique({ where: { studySessionId } });
}

// La pregunta que toca y dónde se muestra su correcta (o una incorrecta).
async function preguntaQueToca(counterattackId: string) {
  const counter = await prisma.counterattack.findUniqueOrThrow({ where: { id: counterattackId } });
  const items = parseItems(counter.items);
  const item: CounterattackItem = items[counter.answered];
  const question = await resolveItem(prisma, item);
  if (!question) throw new Error("La pregunta que toca no existe.");
  const shownCorrect = toShownIndex(item.order, question.correctIndex);
  const shownWrong = (shownCorrect + 1) % item.order.length;
  return { counter, item, question, shownCorrect, shownWrong };
}

const soulsOf = async (userId: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { souls: true, level: true } }));

function ok(result: ResultadoRespuesta | null) {
  if (!result || !result.ok) throw new Error(`Se esperaba una respuesta aceptada: ${JSON.stringify(result)}`);
  return result;
}

// ---------------------------------------------------------------------------
//  2–6. Con base de datos
// ---------------------------------------------------------------------------
async function probarConBase(userId: string, otherUserId: string): Promise<void> {
  // Escenario: una materia con 3 preguntas (2 de opción múltiple y 1 de
  // verdadero o falso) y otra sin ninguna.
  const conPreguntas = await prisma.subject.create({ data: { name: "Con preguntas", userId } });
  const sinPreguntas = await prisma.subject.create({ data: { name: "Sin preguntas", userId } });
  const q = (data: { type: "MULTIPLE_CHOICE" | "TRUE_FALSE"; options: string[]; correctIndex: number }) =>
    prisma.question.create({
      data: { subjectId: conPreguntas.id, prompt: `¿${data.type}?`, explanation: "Porque sí.", ...data },
    });
  const preguntas = [
    await q({ type: "MULTIPLE_CHOICE", options: ["a", "b", "c", "d"], correctIndex: 2 }),
    await q({ type: "MULTIPLE_CHOICE", options: ["e", "f", "g", "h"], correctIndex: 0 }),
    await q({ type: "TRUE_FALSE", options: ["Verdadero", "Falso"], correctIndex: 1 }),
  ];
  const futuro = new Date(Date.now() + 30 * DAY);
  const tarea = (subjectId: string, difficulty: "EASY" | "HARD", hp: number) =>
    prisma.task.create({
      data: {
        name: `Jefe ${difficulty} ${hp}`,
        subjectId,
        dueDate: futuro,
        difficulty,
        maxHp: difficulty === "HARD" ? 600 : 200,
        currentHp: hp,
        bossKey: difficulty === "HARD" ? "dragon-de-la-caverna" : "rata-de-las-cloacas",
      },
      select: { id: true, subjectId: true },
    });
  const jefe = await tarea(conPreguntas.id, "HARD", 600);
  const casiMuerto = await tarea(conPreguntas.id, "EASY", 100);
  const jefeGenerico = await tarea(sinPreguntas.id, "EASY", 200);

  // -------------------------------------------------------------------------
  console.log("\n2. El golpe crea el contraataque");
  const v1 = await vigiliaCumplida(userId, jefe.id);
  const golpe1 = await asestarGolpeDe(userId, jefe);
  check("golpe aceptado y el jefe sigue vivo", golpe1.ok && golpe1.defeated === false, golpe1);
  const ca1 = await contraataqueDe(v1.id);
  check("hay un contraataque para esa vigilia", ca1 !== null);
  if (!ca1) throw new Error("Sin contraataque no se puede seguir.");
  const items1 = parseItems(ca1.items);
  check("con 3 preguntas, las de la materia", same(items1.map((i) => i.ref).sort(), preguntas.map((p) => p.id).sort()));
  const tfItem = items1.find((i) => i.ref === preguntas[2].id);
  check("verdadero o falso sin barajar", same(tfItem?.order, [0, 1]));
  check(
    "opción múltiple: permutación de 4",
    items1.filter((i) => i.ref !== preguntas[2].id).every((i) => isPermutation(i.order, 4)),
  );
  check("empieza en la pregunta 0, sin terminar", ca1.answered === 0 && ca1.finishedAt === null && ca1.userId === userId);
  try {
    await prisma.counterattack.create({ data: { studySessionId: v1.id, userId, items: [] } });
    check("el índice único impide un segundo contraataque para la misma vigilia", false);
  } catch {
    check("el índice único impide un segundo contraataque para la misma vigilia", true);
  }
  const pub = publicQuestion((await preguntaQueToca(ca1.id)).question, items1[0].order);
  check(
    "lo público solo lleva kind, prompt y options (ni id, ni correcta, ni explicación)",
    same(Object.keys(pub).sort(), ["kind", "options", "prompt"]),
    Object.keys(pub),
  );

  // -------------------------------------------------------------------------
  console.log("\n3. Contestar");
  const antes = await soulsOf(userId);

  // Pregunta 0: la correcta.
  const p0 = await preguntaQueToca(ca1.id);
  const r0 = ok(await responderPreguntaDe(userId, ca1.id, 0, p0.shownCorrect));
  const nominal0 = counterattackSouls(p0.question.kind, "correct");
  check(`acertar da ${nominal0} almas`, r0.outcome === "correct" && r0.soulsDelta === nominal0, r0);
  check("devuelve la correcta en el orden MOSTRADO", r0.correctIndex === p0.shownCorrect);
  check("devuelve la explicación después de contestar", r0.explanation === "Porque sí.");
  check("las almas del usuario suben", (await soulsOf(userId)).souls === antes.souls + nominal0);
  const a0 = await prisma.questionAttempt.findFirst({ where: { questionId: p0.question.questionId!, userId } });
  check(
    "intento: chosenIndex en el orden ORIGINAL, acertado, con la vigilia y las almas",
    a0?.chosenIndex === toOriginalIndex(p0.item.order, p0.shownCorrect) &&
      a0?.chosenIndex === p0.question.correctIndex &&
      a0?.correct === true &&
      a0?.studySessionId === v1.id &&
      a0?.soulsDelta === nominal0,
    a0,
  );

  // Pregunta 1: dos pestañas fallan a la vez (con opciones distintas).
  const p1 = await preguntaQueToca(ca1.id);
  const incorrectas = p1.item.order.map((_, i) => i).filter((i) => i !== p1.shownCorrect);
  const dosPestanas = await Promise.all([
    responderPreguntaDe(userId, ca1.id, 1, incorrectas[0]),
    responderPreguntaDe(userId, ca1.id, 1, incorrectas[1] ?? incorrectas[0]),
  ]);
  const aceptadas = dosPestanas.filter((r) => r?.ok);
  const rechazada = dosPestanas.find((r) => r && !r.ok);
  check("dos pestañas a la vez: solo cuenta una", aceptadas.length === 1, dosPestanas);
  check(
    "la otra recibe un error claro",
    rechazada !== undefined && rechazada !== null && !rechazada.ok && /ya se contestó/.test(rechazada.error),
    rechazada,
  );
  const nominal1 = counterattackSouls(p1.question.kind, "wrong");
  const r1 = aceptadas[0] as Extract<ResultadoRespuesta, { ok: true }>;
  check(`fallar resta ${-nominal1}`, r1.outcome === "wrong" && r1.soulsDelta === nominal1, r1);
  check("un solo intento para esa pregunta", (await prisma.questionAttempt.count({ where: { questionId: p1.question.questionId! } })) === 1);
  check("las almas bajan una sola vez", (await soulsOf(userId)).souls === antes.souls + nominal0 + nominal1);

  const repetida = await responderPreguntaDe(userId, ca1.id, 0, 0);
  check("contestar otra vez una pregunta ya contestada → error", repetida !== null && !repetida.ok, repetida);

  const otroUsuario = await responderPreguntaDe(otherUserId, ca1.id, 2, 0);
  check("el contraataque de otro usuario → null (la acción responde 404)", otroUsuario === null);
  check("un contraataque que no existe → null (404)", (await responderPreguntaDe(userId, "no-existe", 0, 0)) === null);
  const fuera = await responderPreguntaDe(userId, ca1.id, 2, 7);
  check("una opción que no existe → error", fuera !== null && !fuera.ok, fuera);

  // Pregunta 2: esquivar, y es la última.
  const p2 = await preguntaQueToca(ca1.id);
  const r2 = ok(await responderPreguntaDe(userId, ca1.id, 2, null));
  check("esquivar: 0 almas", r2.outcome === "dodged" && r2.soulsDelta === 0, r2);
  check("esquivar también enseña la correcta", r2.correctIndex === p2.shownCorrect);
  const a2 = await prisma.questionAttempt.findFirst({ where: { questionId: p2.question.questionId! } });
  check(
    "esquivar se registra: chosenIndex null, no acertada, 0 almas",
    a2?.chosenIndex === null && a2?.correct === false && a2?.soulsDelta === 0,
    a2,
  );
  check(
    "la última trae el resumen (1 de 3 y las almas totales)",
    same(r2.summary, { correct: 1, total: 3, souls: nominal0 + nominal1 }),
    r2.summary,
  );
  const ca1Fin = await prisma.counterattack.findUniqueOrThrow({ where: { id: ca1.id } });
  check(
    "el contraataque queda terminado con sus cuentas",
    ca1Fin.finishedAt !== null && ca1Fin.answered === 3 && ca1Fin.correctCount === 1 && ca1Fin.soulsDelta === nominal0 + nominal1,
    ca1Fin,
  );
  const tarde = await responderPreguntaDe(userId, ca1.id, 3, 0);
  check("contestar después de terminado → error", tarde !== null && !tarde.ok && /terminó/.test(tarde.error), tarde);

  // -------------------------------------------------------------------------
  console.log("\n2b. El golpe final no crea contraataque");
  const v2 = await vigiliaCumplida(userId, casiMuerto.id);
  const golpe2 = await asestarGolpeDe(userId, casiMuerto);
  check("el golpe derrota al jefe", golpe2.ok && golpe2.defeated === true, golpe2);
  check("y no hay contraataque", (await contraataqueDe(v2.id)) === null);

  // -------------------------------------------------------------------------
  console.log("\n4. Genéricas");
  const v3 = await vigiliaCumplida(userId, jefeGenerico.id);
  await asestarGolpeDe(userId, jefeGenerico);
  const ca3 = await contraataqueDe(v3.id);
  const items3 = ca3 ? parseItems(ca3.items) : [];
  check("materia sin preguntas → 3 genéricas", items3.length === 3 && items3.every((i) => i.ref.startsWith("generic:")), items3);
  if (!ca3) throw new Error("Sin contraataque genérico no se puede seguir.");
  const g0 = ok(await responderPreguntaDe(userId, ca3.id, 0, 0));
  const g1 = ok(await responderPreguntaDe(userId, ca3.id, 1, 1));
  const g2 = ok(await responderPreguntaDe(userId, ca3.id, 2, null));
  const gen = COUNTERATTACK.souls.GENERIC.correct;
  check(`"Sí" da +${gen}`, g0.outcome === "answered" && g0.soulsDelta === gen, g0);
  check(`"No" también da +${gen} (nunca resta)`, g1.outcome === "answered" && g1.soulsDelta === gen, g1);
  check("esquivar una genérica da 0", g2.outcome === "dodged" && g2.soulsDelta === 0, g2);
  check("en las genéricas no hay correcta", g0.correctIndex === null && g1.correctIndex === null && g2.correctIndex === null);
  check("las genéricas no escriben intentos", (await prisma.questionAttempt.count({ where: { studySessionId: v3.id } })) === 0);
  check("resumen: las contestadas cuentan como acierto", same(g2.summary, { correct: 2, total: 3, souls: gen * 2 }), g2.summary);

  // -------------------------------------------------------------------------
  console.log("\n5. Suelo del nivel, subir de nivel y pregunta borrada");
  const v4 = await vigiliaCumplida(userId, jefe.id);
  await asestarGolpeDe(userId, jefe);
  const ca4 = await contraataqueDe(v4.id);
  if (!ca4) throw new Error("Sin contraataque no se puede seguir.");
  const inicioNivel2 = LEVEL_COSTS[0];
  const inicioNivel3 = LEVEL_COSTS[0] + LEVEL_COSTS[1];

  // Justo al inicio del nivel 2: fallar no quita nada.
  await prisma.user.update({ where: { id: userId }, data: { souls: inicioNivel2, level: 2 } });
  const p40 = await preguntaQueToca(ca4.id);
  const r40 = ok(await responderPreguntaDe(userId, ca4.id, 0, p40.shownWrong));
  check(
    "fallar al inicio del nivel: 0 almas y 'tu nivel te protege'",
    r40.outcome === "wrong" && r40.soulsDelta === 0 && r40.protectedByLevel,
    r40,
  );
  const tras40 = await soulsOf(userId);
  check("las almas y el nivel no bajan", tras40.souls === inicioNivel2 && tras40.level === 2, tras40);
  const a40 = await prisma.questionAttempt.findFirst({ where: { studySessionId: v4.id, questionId: p40.question.questionId! } });
  check("el intento guarda las almas aplicadas (0)", a40?.soulsDelta === 0 && a40?.correct === false, a40);

  // A 5 almas del nivel 3: acertar sube de nivel.
  await prisma.user.update({ where: { id: userId }, data: { souls: inicioNivel3 - 5 } });
  const p41 = await preguntaQueToca(ca4.id);
  const r41 = ok(await responderPreguntaDe(userId, ca4.id, 1, p41.shownCorrect));
  const tras41 = await soulsOf(userId);
  check("acertar sube al nivel 3 y lo dice", r41.newLevel === 3, r41);
  check("User.level se escribe con levelForSouls", tras41.level === 3 && tras41.level === levelForSouls(tras41.souls).level, tras41);

  // Se borra la que toca: se salta sin almas ni intento.
  const p42 = await preguntaQueToca(ca4.id);
  await prisma.question.delete({ where: { id: p42.question.questionId! } });
  const r42 = ok(await responderPreguntaDe(userId, ca4.id, 2, 0));
  check("pregunta borrada → saltada, 0 almas", r42.outcome === "skipped" && r42.soulsDelta === 0, r42);
  check("y es la última: resumen sobre 3", r42.summary?.total === 3, r42.summary);
  check("las almas no cambian al saltar", (await soulsOf(userId)).souls === tras41.souls);

  // -------------------------------------------------------------------------
  console.log("\n6. Una vigilia nueva cierra el contraataque sin terminar");
  const v5 = await vigiliaCumplida(userId, jefe.id);
  await asestarGolpeDe(userId, jefe);
  const ca5 = await contraataqueDe(v5.id);
  check("contraataque nuevo, sin contestar", ca5 !== null && ca5.answered === 0 && ca5.finishedAt === null);
  const almasAntes = (await soulsOf(userId)).souls;
  const nueva = await comenzarVigiliaDe(userId, jefe.id);
  check("comenzar otra vigilia funciona", nueva.ok, nueva);
  const ca5Fin = ca5 ? await prisma.counterattack.findUniqueOrThrow({ where: { id: ca5.id } }) : null;
  check(
    "el contraataque queda cerrado sin contar las que faltaban",
    ca5Fin?.finishedAt !== null && ca5Fin?.answered === 0 && ca5Fin?.soulsDelta === 0,
    ca5Fin,
  );
  check("cerrar no cambia las almas", (await soulsOf(userId)).souls === almasAntes);
  if (ca5) {
    const cerrado = await responderPreguntaDe(userId, ca5.id, 0, 0);
    check("contestar un contraataque cerrado → error", cerrado !== null && !cerrado.ok, cerrado);
  }

  // Regresión: no se puede empezar una vigilia contra un jefe con la fecha pasada.
  const vencido = await prisma.task.create({
    data: {
      name: "Vencido",
      subjectId: conPreguntas.id,
      dueDate: new Date(Date.now() - 3 * DAY),
      difficulty: "EASY",
      maxHp: 200,
      currentHp: 200,
      bossKey: "rata-de-las-cloacas",
    },
  });
  const contraVencido = await comenzarVigiliaDe(userId, vencido.id);
  check("vigilia contra un jefe con la fecha pasada → rechazada", !contraVencido.ok, contraVencido);
}

// ---------------------------------------------------------------------------
//  Ejecución
// ---------------------------------------------------------------------------
const EMAILS = ["probar-contraataque@ember.test", "probar-contraataque-otro@ember.test"];

// Por si una ejecución anterior se cortó a medias.
await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });

try {
  probarReglas();
  const user = await prisma.user.create({
    data: { email: EMAILS[0], name: "Temporal de pruebas", emailVerified: true, souls: 600, level: 2 },
  });
  const other = await prisma.user.create({
    data: { email: EMAILS[1], name: "Otro temporal", emailVerified: true },
  });
  await probarConBase(user.id, other.id);
} catch (error) {
  fallos++;
  console.error("\nError inesperado:", error);
} finally {
  // En cascada: materias, jefes, vigilias, contraataques, preguntas e intentos.
  await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  const quedan = await prisma.user.count({ where: { email: { in: EMAILS } } });
  console.log(quedan === 0 ? "\nUsuarios temporales borrados." : "\n⚠ No se pudieron borrar los usuarios temporales.");
  await prisma.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} comprobación(es) fallida(s).`);
process.exitCode = fallos === 0 ? 0 : 1;
