// Pruebas del banco de preguntas contra la base LOCAL (Postgres de Docker).
// Ejecutar (después de npm run db:seed):
//   node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-preguntas.ts
// Comprueba:
//   1. las reglas de validarPregunta (sin base de datos);
//   2. preguntasParaContraataque: preguntas de la materia sin repetir, menos si
//      no hay tantas, genéricas si no hay ninguna, y rechazo de materias ajenas;
//   3. los CHECK que la migración banco_preguntas añadió a mano.
// Crea un usuario temporal para las pruebas y lo borra al final, también si
// alguna comprobación falla (try/finally). Se niega a correr fuera de localhost.
import { assertLocalDatabase } from "@/scripts/local-only";

// ANTES de importar nada que cree el cliente de Prisma (lib/prisma lo crea al
// cargarse). Por eso lo demás se importa con import() más abajo.
assertLocalDatabase("probar-preguntas");

const { prisma } = await import("@/lib/prisma");
const { preguntasParaContraataque } = await import("@/lib/questions/provider");
const { GENERIC_QUESTIONS } = await import("@/lib/questions/generic");
const { validarPregunta, MAX_PROMPT_LENGTH, MAX_OPTION_LENGTH, MAX_EXPLANATION_LENGTH } = await import(
  "@/lib/questions/validation"
);
type QuestionDraft = import("@/lib/questions/validation").QuestionDraft;

let fallos = 0;
function check(nombre: string, ok: boolean, detalle?: unknown): void {
  if (ok) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}`, detalle === undefined ? "" : detalle);
  }
}

// ---------------------------------------------------------------------------
//  1. Validación
// ---------------------------------------------------------------------------
function borrador(cambios: Partial<QuestionDraft> = {}): QuestionDraft {
  return {
    type: "MULTIPLE_CHOICE",
    prompt: "¿Cuál es la derivada de x²?",
    options: ["x", "2x", "x³ / 3", "2"],
    optionCount: 4,
    correctIndex: "1",
    explanation: "",
    ...cambios,
  };
}

function errorDe(draft: QuestionDraft): string | null {
  const result = validarPregunta(draft);
  return result.ok ? null : result.error;
}

function probarValidacion(): void {
  console.log("\n1. Validación");

  const buena = validarPregunta(
    borrador({ prompt: "  ¿Derivada?\r\nDe x²  ", options: ["  x ", "2x", "x³   /  3", "2"], explanation: "  " }),
  );
  check("opción múltiple válida", buena.ok);
  if (buena.ok) {
    check("enunciado sin espacios en los extremos y \\r\\n → \\n", buena.data.prompt === "¿Derivada?\nDe x²");
    check(
      "opciones normalizadas sin tocar símbolos ni mayúsculas",
      JSON.stringify(buena.data.options) === JSON.stringify(["x", "2x", "x³ / 3", "2"]),
      buena.data.options,
    );
    check("explicación vacía → null", buena.data.explanation === null);
  }

  const vf = validarPregunta(
    borrador({ type: "TRUE_FALSE", options: ["hack", "", "", ""], optionCount: 7, correctIndex: "0" }),
  );
  check(
    "verdadero o falso ignora las opciones enviadas",
    vf.ok && JSON.stringify(vf.data.options) === JSON.stringify(["Verdadero", "Falso"]),
    vf,
  );

  const errores: [string, QuestionDraft][] = [
    ["tipo inventado", borrador({ type: "ESSAY" })],
    ["enunciado vacío (solo espacios)", borrador({ prompt: "   \n  " })],
    ["enunciado de 501", borrador({ prompt: "a".repeat(MAX_PROMPT_LENGTH + 1) })],
    ["opción vacía", borrador({ options: ["x", " ", "x³ / 3", "2"] })],
    ["opción de 201", borrador({ options: ["x", "b".repeat(MAX_OPTION_LENGTH + 1), "c", "d"] })],
    ["opciones repetidas sin distinguir mayúsculas", borrador({ options: ["2x", "2X", "c", "d"] })],
    ["opciones repetidas por espacios", borrador({ options: ["x  y", "x y", "c", "d"] })],
    ["3 opciones enviadas", borrador({ optionCount: 3 })],
    ["5 opciones enviadas", borrador({ optionCount: 5 })],
    ["sin respuesta correcta", borrador({ correctIndex: "" })],
    ["correctIndex 4 en opción múltiple", borrador({ correctIndex: "4" })],
    ["correctIndex 2 en verdadero o falso", borrador({ type: "TRUE_FALSE", correctIndex: "2" })],
    ["correctIndex negativo", borrador({ correctIndex: "-1" })],
    ["correctIndex decimal", borrador({ correctIndex: "1.5" })],
    ["correctIndex no numérico", borrador({ correctIndex: "uno" })],
    ["explicación de 1001", borrador({ explanation: "e".repeat(MAX_EXPLANATION_LENGTH + 1) })],
  ];
  for (const [nombre, draft] of errores) {
    const error = errorDe(draft);
    check(`rechaza: ${nombre} → "${error}"`, error !== null);
  }

  check("enunciado de 500 exactos es válido", errorDe(borrador({ prompt: "a".repeat(MAX_PROMPT_LENGTH) })) === null);
  check(
    "explicación de 1000 exactos es válida",
    errorDe(borrador({ explanation: "e".repeat(MAX_EXPLANATION_LENGTH) })) === null,
  );
}

// ---------------------------------------------------------------------------
//  2. Proveedor
// ---------------------------------------------------------------------------
async function probarProveedor(tempSubjectId: string): Promise<void> {
  console.log("\n2. preguntasParaContraataque");

  const user = await prisma.user.findUnique({ where: { email: "prueba@ember.test" }, select: { id: true } });
  if (!user) throw new Error("Falta el usuario de prueba: ejecuta antes npm run db:seed.");
  const calculo = await prisma.subject.findFirst({ where: { userId: user.id, name: "Cálculo" } });
  const historia = await prisma.subject.findFirst({ where: { userId: user.id, name: "Historia" } });
  if (!calculo || !historia) throw new Error("Faltan las materias del seed.");
  const enCalculo = await prisma.question.count({ where: { subjectId: calculo.id } });

  const tres = await preguntasParaContraataque(user.id, calculo.id, 3);
  const ids = tres.map((q) => q.id);
  check("por defecto devuelve 3", tres.length === 3, tres.length);
  check("todas son MANUAL y con id", tres.every((q) => q.source === "MANUAL" && typeof q.id === "string"));
  check("sin repetir", new Set(ids).size === ids.length, ids);
  const deCalculo = await prisma.question.count({ where: { id: { in: ids as string[] }, subjectId: calculo.id } });
  check("todas son de la materia pedida", deCalculo === 3, deCalculo);
  check(
    "traen respuesta (solo servidor)",
    tres.every((q) => q.correctIndex >= 0 && q.correctIndex < q.options.length),
  );

  const muchas = await preguntasParaContraataque(user.id, calculo.id, 10);
  check(
    `pidiendo 10 con ${enCalculo} en la materia devuelve ${enCalculo}, sin repetir`,
    muchas.length === enCalculo && new Set(muchas.map((q) => q.id)).size === enCalculo,
    muchas.length,
  );

  // Al azar: en 40 sorteos de 3 entre 5 tiene que salir más de un orden.
  const ordenes = new Set<string>();
  for (let i = 0; i < 40; i++) {
    ordenes.add((await preguntasParaContraataque(user.id, calculo.id, 3)).map((q) => q.id).join(","));
  }
  check(`el orden cambia entre sorteos (${ordenes.size} distintos en 40)`, ordenes.size > 1);

  const genericas = await preguntasParaContraataque(user.id, historia.id, 3);
  check(
    "materia sin preguntas → 3 genéricas",
    genericas.length === 3 && genericas.every((q) => q.source === "GENERIC" && q.id === null),
    genericas,
  );
  check("genéricas sin repetir", new Set(genericas.map((q) => q.prompt)).size === 3);
  check(
    "las genéricas son Sí / No",
    genericas.every((q) => q.type === "TRUE_FALSE" && q.options.join("/") === "Sí/No"),
  );
  genericas[0].options.push("modificada");
  check(
    "cambiar lo devuelto no altera la lista de genéricas",
    GENERIC_QUESTIONS.every((q) => q.options.length === 2),
  );

  const todasGenericas = await preguntasParaContraataque(user.id, historia.id, 50);
  check(
    `pidiendo 50 genéricas devuelve las ${GENERIC_QUESTIONS.length} que hay`,
    todasGenericas.length === GENERIC_QUESTIONS.length,
  );

  const rechaza = async (nombre: string, run: () => Promise<unknown>) => {
    try {
      await run();
      check(nombre, false, "no lanzó error");
    } catch {
      check(nombre, true);
    }
  };
  await rechaza("rechaza la materia de otro usuario", () =>
    preguntasParaContraataque(user.id, tempSubjectId, 3),
  );
  await rechaza("rechaza una materia que no existe", () =>
    preguntasParaContraataque(user.id, "no-existe", 3),
  );
}

// ---------------------------------------------------------------------------
//  3. CHECK de la base
// ---------------------------------------------------------------------------
async function probarChecks(tempUserId: string, tempSubjectId: string): Promise<void> {
  console.log("\n3. CHECK de la base");

  const debeFallar = async (nombre: string, run: () => Promise<unknown>) => {
    try {
      await run();
      check(`la base rechaza: ${nombre}`, false, "se guardó");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      check(`la base rechaza: ${nombre}`, /check constraint|violates check/i.test(message), message.slice(-200));
    }
  };
  const base = { subjectId: tempSubjectId, prompt: "p", correctIndex: 0 };

  await debeFallar("opción múltiple con 3 opciones", () =>
    prisma.question.create({ data: { ...base, type: "MULTIPLE_CHOICE", options: ["a", "b", "c"] } }),
  );
  await debeFallar("verdadero o falso con 4 opciones", () =>
    prisma.question.create({ data: { ...base, type: "TRUE_FALSE", options: ["a", "b", "c", "d"] } }),
  );
  await debeFallar("correctIndex 4", () =>
    prisma.question.create({
      data: { ...base, type: "MULTIPLE_CHOICE", options: ["a", "b", "c", "d"], correctIndex: 4 },
    }),
  );
  await debeFallar("correctIndex 2 en verdadero o falso", () =>
    prisma.question.create({
      data: { ...base, type: "TRUE_FALSE", options: ["Verdadero", "Falso"], correctIndex: 2 },
    }),
  );
  await debeFallar("correctIndex negativo", () =>
    prisma.question.create({
      data: { ...base, type: "TRUE_FALSE", options: ["Verdadero", "Falso"], correctIndex: -1 },
    }),
  );
  await debeFallar("options NULL", () =>
    prisma.$executeRaw`
      INSERT INTO "Question" ("id", "subjectId", "type", "prompt", "options", "correctIndex", "updatedAt")
      VALUES ('check-null', ${tempSubjectId}, 'TRUE_FALSE', 'p', NULL, 0, now())`,
  );
  await debeFallar("una opción NULL dentro del array", () =>
    prisma.$executeRaw`
      INSERT INTO "Question" ("id", "subjectId", "type", "prompt", "options", "correctIndex", "updatedAt")
      VALUES ('check-null-item', ${tempSubjectId}, 'TRUE_FALSE', 'p', ARRAY['Verdadero', NULL], 0, now())`,
  );

  const valida = await prisma.question.create({
    data: { ...base, type: "TRUE_FALSE", options: ["Verdadero", "Falso"], correctIndex: 1 },
  });
  check("una pregunta válida sí se guarda", Boolean(valida.id));
  await debeFallar("chosenIndex negativo", () =>
    prisma.questionAttempt.create({
      data: { questionId: valida.id, userId: tempUserId, chosenIndex: -1, correct: false, soulsDelta: 0 },
    }),
  );
  const esquivada = await prisma.questionAttempt.create({
    data: { questionId: valida.id, userId: tempUserId, chosenIndex: null, correct: false, soulsDelta: 0 },
  });
  check("un intento esquivado (chosenIndex null) sí se guarda", Boolean(esquivada.id));

  await prisma.question.delete({ where: { id: valida.id } });
  const quedan = await prisma.questionAttempt.count({ where: { id: esquivada.id } });
  check("borrar la pregunta borra sus intentos (Cascade)", quedan === 0);
}

// ---------------------------------------------------------------------------
//  Ejecución
// ---------------------------------------------------------------------------
const TEMP_EMAIL = "probar-preguntas@ember.test";

// Por si una ejecución anterior se cortó a medias.
await prisma.user.deleteMany({ where: { email: TEMP_EMAIL } });
const tempUser = await prisma.user.create({
  data: { email: TEMP_EMAIL, name: "Temporal de pruebas", emailVerified: true },
});

try {
  const tempSubject = await prisma.subject.create({ data: { name: "Ajena", userId: tempUser.id } });
  probarValidacion();
  await probarProveedor(tempSubject.id);
  await probarChecks(tempUser.id, tempSubject.id);
} catch (error) {
  fallos++;
  console.error("\nError inesperado:", error);
} finally {
  // En cascada: su materia, sus preguntas y sus intentos.
  await prisma.user.deleteMany({ where: { email: TEMP_EMAIL } });
  const queda = await prisma.user.count({ where: { email: TEMP_EMAIL } });
  console.log(queda === 0 ? "\nUsuario temporal borrado." : "\n⚠ No se pudo borrar el usuario temporal.");
  await prisma.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} comprobación(es) fallida(s).`);
process.exitCode = fallos === 0 ? 0 : 1;
