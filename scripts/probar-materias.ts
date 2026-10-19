// Pruebas del nombre único de materia (pulido 2) contra la base LOCAL. No
// necesita el servidor:
//   node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-materias.ts
// Comprueba:
//   1. crear "Cálculo" y después " cálculo " (y "CÁLCULO", con espacios
//      repetidos dentro) → "Ya tienes una materia con ese nombre";
//   2. que "Calculo" (sin tilde) sí se puede: las tildes cuentan;
//   3. que el nombre se guarda normalizado y se validan vacío y largo;
//   4. renombrar a un nombre que ya tiene otra materia → el mismo mensaje;
//   5. renombrar a su mismo nombre, o cambiarle solo mayúsculas o espacios
//      ("cálculo" → "Cálculo"), funciona;
//   6. que dos usuarios distintos pueden tener el mismo nombre;
//   7. que renombrar una materia ajena (o que no existe) da "not-found" y no
//      la toca;
//   8. que el índice lo impone la BASE, también saltándose la app (INSERT
//      en crudo) y con dos creaciones a la vez;
//   9. que el índice simple de Question y el de Subject ya no existen.
// Crea usuarios temporales y los borra al final (try/finally). Se niega a
// correr fuera de localhost.
import { randomBytes } from "node:crypto";
import { assertLocalDatabase } from "@/scripts/local-only";

// ANTES de importar nada que cree el cliente de Prisma.
assertLocalDatabase("probar-materias");

const { prisma } = await import("@/lib/prisma");
const { createSubject, renameSubject, SUBJECT_ERRORS } = await import("@/lib/subjects");
const { check, fallo, terminar } = await import("@/scripts/probar-comun");

const PREFIJO = "probar-materias";
const DUP = SUBJECT_ERRORS.duplicate;

async function usuario(nombre: string) {
  return prisma.user.create({
    data: {
      email: `${PREFIJO}-${nombre}-${randomBytes(4).toString("hex")}@ember.test`,
      name: nombre,
      emailVerified: true,
    },
    select: { id: true },
  });
}

const materias = (userId: string) =>
  prisma.subject.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } });

const idDe = async (userId: string, name: string) =>
  (await prisma.subject.findFirstOrThrow({ where: { userId, name }, select: { id: true } })).id;

try {
  const ana = await usuario("ana");
  const beto = await usuario("beto");

  console.log("Crear:");
  check("crear «Cálculo»", (await createSubject(ana.id, "Cálculo")).ok);
  const repetidas = [" cálculo ", "CÁLCULO", "  cálculo  "];
  for (const nombre of repetidas) {
    const r = await createSubject(ana.id, nombre);
    check(`«${nombre}» choca: «${DUP}»`, !r.ok && r.error === DUP, r);
  }
  check("«Calculo» (sin tilde) sí se puede: las tildes cuentan", (await createSubject(ana.id, "Calculo")).ok);
  check("«  Física   II  » se guarda como «Física II»", (await createSubject(ana.id, "  Física   II  ")).ok);
  const r1 = await createSubject(ana.id, "física ii");
  check("«física ii» choca con «Física II»", !r1.ok && r1.error === DUP, r1);
  const vacio = await createSubject(ana.id, "   ");
  check("solo espacios → vacío", !vacio.ok && vacio.error === SUBJECT_ERRORS.empty, vacio);
  const largo = await createSubject(ana.id, "x".repeat(61));
  check("61 caracteres → demasiado largo", !largo.ok && largo.error === SUBJECT_ERRORS.tooLong, largo);
  check("60 caracteres → bien", (await createSubject(ana.id, "y".repeat(60))).ok);
  const deAna = (await materias(ana.id)).map((m) => m.name);
  check(
    "Ana tiene exactamente sus 4 materias, normalizadas",
    JSON.stringify(deAna) === JSON.stringify(["Calculo", "Cálculo", "Física II", "y".repeat(60)]),
    deAna,
  );

  console.log("Renombrar:");
  const calculo = await idDe(ana.id, "Cálculo");
  const fisica = await idDe(ana.id, "Física II");
  const r2 = await renameSubject(ana.id, fisica, "  CÁLCULO ");
  check("renombrar «Física II» a «  CÁLCULO » choca", r2 !== "not-found" && !r2.ok && r2.error === DUP, r2);
  check(
    "…y no la cambia",
    (await prisma.subject.findUnique({ where: { id: fisica }, select: { name: true } }))?.name === "Física II",
  );
  const mismo = await renameSubject(ana.id, calculo, "Cálculo");
  check("renombrar a su mismo nombre funciona", mismo !== "not-found" && mismo.ok, mismo);
  const minus = await renameSubject(ana.id, calculo, "cálculo");
  check("«Cálculo» → «cálculo» (solo mayúsculas) funciona", minus !== "not-found" && minus.ok, minus);
  const vuelta = await renameSubject(ana.id, calculo, "  Cálculo  ");
  check("«cálculo» → «  Cálculo  » (mayúsculas y espacios) funciona", vuelta !== "not-found" && vuelta.ok, vuelta);
  check(
    "…y se guarda «Cálculo»",
    (await prisma.subject.findUnique({ where: { id: calculo }, select: { name: true } }))?.name === "Cálculo",
  );
  const libre = await renameSubject(ana.id, fisica, "Química   orgánica");
  check("renombrar a un nombre libre funciona", libre !== "not-found" && libre.ok, libre);
  const vacioR = await renameSubject(ana.id, fisica, " ");
  check("renombrar a vacío → error", vacioR !== "not-found" && !vacioR.ok && vacioR.error === SUBJECT_ERRORS.empty);

  console.log("Dos usuarios:");
  check("Beto también puede tener «Cálculo»", (await createSubject(beto.id, "Cálculo")).ok);
  check("…y «química orgánica»", (await createSubject(beto.id, "química orgánica")).ok);
  const ajena = await renameSubject(beto.id, calculo, "Robada");
  check("Beto no puede renombrar la de Ana (not-found)", ajena === "not-found", ajena);
  check("…y la de Ana sigue igual", (await prisma.subject.findUnique({ where: { id: calculo } }))?.name === "Cálculo");
  check("una materia que no existe → not-found", (await renameSubject(ana.id, "no-existe", "X")) === "not-found");

  console.log("La base lo impone sola:");
  let crudo: unknown = null;
  try {
    await prisma.$executeRaw`INSERT INTO "Subject" (id, name, "userId") VALUES (${`crudo-${randomBytes(4).toString("hex")}`}, ${" CÁLCULO"}, ${ana.id})`;
  } catch (error) {
    crudo = error;
  }
  check("un INSERT en crudo con « CÁLCULO» también falla", crudo !== null);
  const aLaVez = await Promise.all(
    Array.from({ length: 5 }, (_, i) => createSubject(beto.id, i % 2 ? "Historia" : " historia")),
  );
  check(
    "5 creaciones a la vez de «Historia»: 1 se crea y 4 reciben el mensaje (ningún error)",
    aLaVez.filter((r) => r.ok).length === 1 && aLaVez.filter((r) => !r.ok && r.error === DUP).length === 4,
    aLaVez,
  );

  console.log("Índices:");
  const indices = await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE tablename IN ('Subject', 'Question') ORDER BY 1`;
  const nombres = indices.map((i) => i.indexname);
  check("existe Subject_userId_name_ci_key", nombres.includes("Subject_userId_name_ci_key"), nombres);
  check("ya no existe Subject_userId_idx", !nombres.includes("Subject_userId_idx"), nombres);
  check("ya no existe Question_subjectId_idx", !nombres.includes("Question_subjectId_idx"), nombres);
  check("sigue Question_subjectId_reviewDueAt_idx", nombres.includes("Question_subjectId_reviewDueAt_idx"), nombres);
} catch (error) {
  fallo();
  console.error("Error inesperado:", error);
} finally {
  await prisma.user.deleteMany({ where: { email: { startsWith: `${PREFIJO}-` } } });
  await prisma.$disconnect();
  terminar();
}
