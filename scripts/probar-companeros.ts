// Pruebas de los compañeros (Fase 4, parte D) contra la base LOCAL:
//   node --env-file=.env --import ./scripts/alias-hooks.mjs scripts/probar-companeros.ts
// Con --payload (y `npm run dev` en marcha) comprueba además el HTML y el
// payload de React de /companeros.
// Comprueba:
//   1. los códigos: formato, alfabeto, únicos, normalizar lo escrito, y el
//      relleno SQL de la migración (solo bytes enteramente aleatorios del
//      UUID, cada posición con los 32 símbolos, todos únicos);
//   2. las solicitudes: límite diario (cuentan los códigos que no existen, no
//      los mal escritos), mensajes que no delatan, duplicados en los dos
//      sentidos, a uno mismo, aceptar, rechazar (lápida), cancelar, quitar;
//   3. el máximo de 50 (en los dos lados);
//   4. la clasificación semanal: lunes a domingo en Bogotá, el cambio de
//      semana y el desempate;
//   5. la privacidad: sin showStats, solo el nombre y fuera de la
//      clasificación; las acciones solo con amistades propias;
//   6. (--payload) ni correos ni ids de otros usuarios en el HTML ni en el
//      payload, ni las estadísticas de quien no las comparte.
// Crea usuarios temporales y los borra al final (try/finally). Se niega a
// correr fuera de localhost.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { assertLocalDatabase } from "@/scripts/local-only";

assertLocalDatabase("probar-companeros");

const { prisma } = await import("@/lib/prisma");
const friends = await import("@/lib/friends");
const rules = await import("@/lib/friends-rules");
const { weekInAppTimeZone } = await import("@/lib/dates");
const { check, fallo, terminar, iniciarSesion, pedirPagina } = await import("@/scripts/probar-comun");

const { FRIEND_MESSAGES: M, enviarSolicitudDe: enviar, actuarSobreAmistadDe: actuar, loadCompaneros } = friends;
const PREFIJO = "probar-companeros";
const PAYLOAD = process.argv.includes("--payload");
const DAY = 86_400_000;
const tag = () => randomBytes(4).toString("hex");

async function usuario(nombre: string, extra: { showStats?: boolean; equippedRelic?: string } = {}) {
  return prisma.user.create({
    data: {
      // En minúsculas: Better Auth las pasa a minúsculas al entrar.
      email: `${PREFIJO}-${nombre.toLowerCase()}-${tag()}@ember.test`,
      name: nombre,
      emailVerified: true,
      friendCode: await friends.uniqueFriendCode(),
      ...extra,
    },
    select: { id: true, email: true, name: true, friendCode: true },
  });
}

const pareja = (a: string, b: string) =>
  prisma.friendship.findFirst({ where: { OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] } });

// ---------------------------------------------------------------------------
//  1. Códigos
// ---------------------------------------------------------------------------

async function probarCodigos() {
  console.log("\n1. Códigos de amigo");
  const { alphabet, length } = rules.FRIEND_CODE;
  check("el alfabeto tiene 32 símbolos distintos, sin 0, O, 1 ni I", alphabet.length === 32 && new Set(alphabet).size === 32 && !/[0O1I]/.test(alphabet));
  const codes = Array.from({ length: 20_000 }, () => friends.generateFriendCode());
  check("20.000 códigos de node:crypto: todos con el formato", codes.every(rules.isFriendCode));
  check("…y sin repetidos", new Set(codes).size === codes.length);
  const porPosicion = Array.from({ length }, (_, i) => new Set(codes.map((c) => c[i])));
  check("…y cada posición usa los 32 símbolos", porPosicion.every((s) => s.size === 32));
  check("normalizar: mayúsculas, sin espacios ni guiones", rules.normalizeFriendCode(" 7kq2-m9xd ") === "7KQ2M9XD" && rules.normalizeFriendCode("7k q2 - m9 xd") === "7KQ2M9XD");
  check("formato: no valen 0, O, 1, I ni 7 caracteres", !rules.isFriendCode("7KQ2M9X0") && !rules.isFriendCode("7KQ2M9XO") && !rules.isFriendCode("7KQ2M9X") && !rules.isFriendCode("7KQ2M9XI"));
  check("se enseña con guion", rules.formatFriendCode("7KQ2M9XD") === "7KQ2-M9XD");

  // El relleno SQL de la migración.
  const sql = readFileSync("prisma/migrations/20261019120000_fase4/migration.sql", "utf8");
  const fn = /-- friend-code:inicio\r?\n([\s\S]*?)-- friend-code:fin/.exec(sql)?.[1];
  if (!fn) return check("la migración tiene la función del código", false);
  const positions = /positions CONSTANT INT\[\] := ARRAY\[([\d,\s]+)\]/.exec(fn)?.[1].split(",").map((n) => Number(n.trim())) ?? [];
  // Un UUID v4: el byte 6 lleva la versión (4 bits fijos) y el byte 8 la
  // variante (2 fijos). Solo valen 0–5 y 9–15.
  const libres = new Set([0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 15]);
  check(`el SQL usa ${positions.length} bytes, todos enteramente aleatorios (${positions.join(", ")})`, positions.length === length && positions.every((p) => libres.has(p)) && new Set(positions).size === length);
  check("el SQL usa el mismo alfabeto", fn.includes(`'${alphabet}'`));
  class Deshacer extends Error {}
  let sqlCodes: string[] = [];
  let rellenoBien = false;
  let detalle: unknown;
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(fn.trim().replace(/;\s*$/, ""));
        const rows = await tx.$queryRawUnsafe<{ c: string }[]>("SELECT pg_temp.ember_friend_code() AS c FROM generate_series(1, 6000)");
        sqlCodes = rows.map((r) => r.c);
        // El relleno de verdad (el DO), con los códigos quitados a todos.
        const block = /^DO \$\$[\s\S]*?\$\$;/m.exec(sql)?.[0];
        if (!block) throw new Error("No está el bloque DO del relleno.");
        await tx.user.updateMany({ data: { friendCode: null } });
        await tx.$executeRawUnsafe(block.replace(/;\s*$/, ""));
        const users = await tx.user.findMany({ select: { friendCode: true } });
        rellenoBien = users.every((u) => u.friendCode && rules.isFriendCode(u.friendCode)) && new Set(users.map((u) => u.friendCode)).size === users.length;
        detalle = { usuarios: users.length };
        throw new Deshacer();
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    if (!(error instanceof Deshacer)) throw error;
  }
  check("6.000 códigos del SQL: todos con el formato del CHECK", sqlCodes.length === 6000 && sqlCodes.every(rules.isFriendCode));
  const sqlPorPosicion = Array.from({ length }, (_, i) => new Set(sqlCodes.map((c) => c[i])));
  check("…y cada posición usa los 32 símbolos (ningún bit fijo)", sqlPorPosicion.every((s) => s.size === 32), sqlPorPosicion.map((s) => s.size));
  check("el relleno da un código válido y único a cada usuario", rellenoBien, detalle);
  check("…y se deshizo", (await prisma.user.count({ where: { friendCode: null } })) === 0);
}

// ---------------------------------------------------------------------------
//  2. Solicitudes
// ---------------------------------------------------------------------------

async function probarSolicitudes() {
  console.log("\n2. Solicitudes");
  const ana = await usuario("Ana");
  const beto = await usuario("Beto");
  const caro = await usuario("Caro");

  const propio = await enviar(ana.id, ana.friendCode!);
  check("a uno mismo: se dice", propio.ok && propio.message === M.own);
  const mal = await enviar(ana.id, "NO-VALE-0");
  check("mal escrito: error de formato", !mal.ok && mal.error === M.badFormat);
  let inventado = "";
  do inventado = friends.generateFriendCode(); while (await prisma.user.findUnique({ where: { friendCode: inventado } }));
  const noExiste = await enviar(ana.id, inventado);
  const existe = await enviar(ana.id, `  ${beto.friendCode!.toLowerCase().slice(0, 4)}-${beto.friendCode!.toLowerCase().slice(4)} `);
  check("un código que no existe y uno que sí: EL MISMO mensaje", noExiste.ok && existe.ok && noExiste.message === M.sent && existe.message === M.sent);
  check("…y lo escrito en minúsculas y con guion vale", (await pareja(ana.id, beto.id))?.status === "PENDING");
  const otraVez = await enviar(ana.id, beto.friendCode!);
  check("pedirlo otra vez: «ya le enviaste»", otraVez.ok && otraVez.message === M.alreadySent);
  check("…sin duplicar la fila", (await prisma.friendship.count({ where: { OR: [{ requesterId: ana.id }, { addresseeId: ana.id }] } })) === 1);
  let duplicada = false;
  try {
    await prisma.friendship.create({ data: { requesterId: beto.id, addresseeId: ana.id } });
  } catch {
    duplicada = true;
  }
  check("la base no deja la pareja al revés (índice único)", duplicada);
  let aSiMismo = false;
  try {
    await prisma.friendship.create({ data: { requesterId: ana.id, addresseeId: ana.id } });
  } catch {
    aSiMismo = true;
  }
  check("la base no deja ser compañero de uno mismo (CHECK)", aSiMismo);
  // Que Beto escriba el código de Ana: es decir que sí.
  const cruzada = await enviar(beto.id, ana.friendCode!);
  check("si el otro ya te lo pidió, escribir su código acepta", cruzada.ok && cruzada.message === M.accepted && (await pareja(ana.id, beto.id))?.status === "ACCEPTED");

  // Aceptar y rechazar desde la lista (por el id de la amistad).
  await enviar(caro.id, ana.friendCode!);
  const fCaro = (await pareja(ana.id, caro.id))!;
  check("quien envió no puede aceptarla por el otro (null = 404)", (await actuar(caro.id, fCaro.id, "accept")) === null);
  check("un extraño no puede tocarla (null = 404)", (await actuar(beto.id, fCaro.id, "decline")) === null);
  const rechazo = await actuar(ana.id, fCaro.id, "decline");
  check("rechazar: la fila queda como lápida (DECLINED)", rechazo?.ok === true && (await pareja(ana.id, caro.id))?.status === "DECLINED");
  const vistaCaro = await loadCompaneros(caro.id);
  const vistaAna = await loadCompaneros(ana.id);
  check("quien la envió la sigue viendo como pendiente (no se le dice que no)", vistaCaro.sent.length === 1 && vistaCaro.sent[0].code === ana.friendCode);
  check("quien la rechazó ya no la ve", vistaAna.received.length === 0);
  const reenvio = await enviar(caro.id, ana.friendCode!);
  check("volver a enviarla: mensaje genérico", reenvio.ok && reenvio.message === M.sent);
  check("…sin notificar otra vez (Ana sigue sin verla)", (await loadCompaneros(ana.id)).received.length === 0 && (await pareja(ana.id, caro.id))?.status === "DECLINED");
  const cancela = await actuar(caro.id, fCaro.id, "cancel");
  check("cancelarla: deja de verla, pero la lápida sigue", cancela?.ok === true && (await loadCompaneros(caro.id)).sent.length === 0 && (await pareja(ana.id, caro.id))?.status === "DECLINED");
  await enviar(caro.id, ana.friendCode!);
  check("enviarla otra vez tras cancelar: genérica, la ve pendiente de nuevo, y Ana no", (await loadCompaneros(caro.id)).sent.length === 1 && (await loadCompaneros(ana.id)).received.length === 0);
  const reabre = await enviar(ana.id, caro.friendCode!);
  check("solo quien rechazó la reabre, escribiendo el código del otro: compañeros", reabre.ok && reabre.message === M.accepted && (await pareja(ana.id, caro.id))?.status === "ACCEPTED");
  const quita = await actuar(ana.id, fCaro.id, "remove");
  check("quitar a un compañero borra la fila", quita?.ok === true && (await pareja(ana.id, caro.id)) === null);
  const deNuevo = await enviar(caro.id, ana.friendCode!);
  check("…y se puede volver a pedir", deNuevo.ok && deNuevo.message === M.sent && (await pareja(ana.id, caro.id))?.status === "PENDING");
  const pendiente = (await pareja(ana.id, caro.id))!;
  check("una pendiente no se «quita» (null)", (await actuar(ana.id, pendiente.id, "remove")) === null);
  const yaSon = await enviar(ana.id, beto.friendCode!);
  check("pedírselo a un compañero: «ya sois compañeros»", yaSon.ok && yaSon.message === M.alreadyFriends);
  return { ana, beto, caro };
}

async function probarLimiteDiario() {
  console.log("\n2b. Límite de 20 solicitudes al día");
  const u = await usuario("Limite");
  for (let i = 0; i < 5; i++) await enviar(u.id, "MAL");
  check("los mal escritos no cuentan", (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).friendRequestCount === 0);
  const resultados = [];
  for (let i = 0; i < 21; i++) resultados.push(await enviar(u.id, friends.generateFriendCode()));
  check("20 intentos con códigos inventados: los 20 responden lo genérico", resultados.slice(0, 20).every((r) => r.ok && r.message === M.sent));
  check("el 21.º: límite del día", !resultados[20].ok && resultados[20].error === M.limit);
  const contador = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).friendRequestCount;
  check("el contador se queda en 20 (los inventados cuentan; el rechazado, no)", contador === 20, contador);
  await prisma.user.update({ where: { id: u.id }, data: { friendRequestDay: new Date(Date.now() - 2 * DAY) } });
  const manana = await enviar(u.id, friends.generateFriendCode());
  check("otro día, vuelve a empezar", manana.ok && (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).friendRequestCount === 1);
}

// ---------------------------------------------------------------------------
//  3. El máximo de 50
// ---------------------------------------------------------------------------

async function probarMaximo() {
  console.log("\n3. El máximo de 50 compañeros");
  const lleno = await usuario("Lleno");
  const otro = await usuario("Otro");
  const tercero = await usuario("Tercero");
  const t = tag();
  await prisma.user.createMany({
    data: Array.from({ length: 50 }, (_, i) => ({ email: `${PREFIJO}-relleno-${t}-${i}@ember.test`, name: `R${i}`, emailVerified: true })),
  });
  const relleno = await prisma.user.findMany({ where: { email: { startsWith: `${PREFIJO}-relleno-${t}-` } }, select: { id: true } });
  await prisma.friendship.createMany({ data: relleno.map((r) => ({ requesterId: lleno.id, addresseeId: r.id, status: "ACCEPTED" as const })) });
  const pide = await enviar(lleno.id, otro.friendCode!);
  check("con 50, no puede pedir más (lo dice: es suyo)", !pide.ok && pide.error === M.youAreFull);
  const leEnvian = await enviar(otro.id, lleno.friendCode!);
  check("si se lo piden, el otro recibe lo genérico (no se delata que está lleno)", leEnvian.ok && leEnvian.message === M.sent);
  const f = (await pareja(lleno.id, otro.id))!;
  const acepta = await actuar(lleno.id, f.id, "accept");
  check("con 50, no puede aceptar", acepta?.ok === false && acepta.error === M.youAreFull);
  // Una que él envió ANTES de llenarse: el otro no puede aceptarla.
  const vieja = await prisma.friendship.create({ data: { requesterId: lleno.id, addresseeId: tercero.id } });
  const aceptaTercero = await actuar(tercero.id, vieja.id, "accept");
  check("aceptar a quien ya tiene 50: no", aceptaTercero?.ok === false && aceptaTercero.error === M.theyAreFull);
  check("y nadie pasa de 50", (await prisma.friendship.count({ where: { status: "ACCEPTED", OR: [{ requesterId: lleno.id }, { addresseeId: lleno.id }] } })) === 50);
}

// ---------------------------------------------------------------------------
//  4. La clasificación semanal
// ---------------------------------------------------------------------------

async function probarSemana() {
  console.log("\n4. La clasificación semanal (lunes a domingo, Bogotá)");
  // El lunes 12 de octubre de 2026 a las 00:00 de Bogotá = 05:00 UTC.
  const lunes = new Date("2026-10-12T05:00:00Z");
  const semana = weekInAppTimeZone(new Date("2026-10-18T22:00:00Z"));
  check("la semana del domingo 18 empieza el lunes 12 a las 00:00 de Bogotá", semana.start.getTime() === lunes.getTime() && semana.end.getTime() === lunes.getTime() + 7 * DAY);
  check("el lunes 19 a las 00:00 de Bogotá ya es la semana siguiente", weekInAppTimeZone(new Date("2026-10-19T05:00:00Z")).start.toISOString() === "2026-10-19T05:00:00.000Z");
  check("el domingo 18 a las 23:59 de Bogotá (04:59 UTC del 19) sigue en la del 12", weekInAppTimeZone(new Date("2026-10-19T04:59:00Z")).start.getTime() === lunes.getTime());

  const yo = await usuario("Yo");
  const bea = await usuario("Bea", { equippedRelic: "boss:dragon-de-la-caverna" });
  const cris = await usuario("Cris");
  const oculta = await usuario("Oculta", { showStats: false, equippedRelic: "boss:liche-del-osario" });
  for (const u of [bea, cris, oculta]) {
    await prisma.friendship.create({ data: { requesterId: yo.id, addresseeId: u.id, status: "ACCEPTED" } });
  }
  const subject = await prisma.subject.create({ data: { name: "M", userId: yo.id } });
  const task = await prisma.task.create({
    data: { name: "J", subjectId: subject.id, dueDate: new Date(Date.UTC(2031, 0, 1)), difficulty: "HARD", maxHp: 600, currentHp: 600, bossKey: "dragon-de-la-caverna" },
  });
  const golpe = (userId: string, iso: string) =>
    prisma.studySession.create({ data: { taskId: task.id, userId, startedAt: new Date(iso), endsAt: new Date(iso), completedAt: new Date(iso), durationMinutes: 25 } });
  // Bea: 2 golpes el sábado. Cris: 2 el domingo a las 23:30 (llega después).
  // Yo: 1 el lunes 19 a las 00:10 (semana siguiente). Oculta: 5 (no sale).
  await golpe(bea.id, "2026-10-17T15:00:00Z");
  await golpe(bea.id, "2026-10-18T04:00:00Z");
  await golpe(cris.id, "2026-10-19T04:20:00Z");
  await golpe(cris.id, "2026-10-19T04:30:00Z");
  await golpe(yo.id, "2026-10-19T05:10:00Z");
  for (let i = 0; i < 5; i++) await golpe(oculta.id, `2026-10-15T1${i}:00:00Z`);
  // Uno del domingo ANTERIOR a las 23:59 de Bogotá: no es de esta semana.
  await golpe(bea.id, "2026-10-12T04:59:00Z");

  const domingo = await loadCompaneros(yo.id, new Date("2026-10-19T04:59:00Z"));
  const orden = domingo.ranking.map((r) => `${r.name}:${r.strikes}`).join(" ");
  check("domingo 23:59: Bea 2, Cris 2 (empate: Bea llegó antes), yo 0", orden === "Bea:2 Cris:2 Yo:0", orden);
  check("…el golpe del domingo anterior a las 23:59 no cuenta", domingo.friends.find((f) => f.name === "Bea")?.stats?.weekStrikes === 2);
  check("…quien no comparte, fuera de la clasificación", !domingo.ranking.some((r) => r.name === "Oculta"));
  const lunes19 = await loadCompaneros(yo.id, new Date("2026-10-19T05:00:00Z"));
  // (El mío, de las 00:10, ya es de esta semana.)
  check("lunes 00:00: semana nueva, Bea y Cris vuelven a 0", lunes19.ranking.filter((r) => !r.isMe).every((r) => r.strikes === 0), lunes19.ranking);
  const lunesTarde = await loadCompaneros(yo.id, new Date("2026-10-19T06:00:00Z"));
  check("lunes 01:00: mi golpe de las 00:10 cuenta y voy primero", lunesTarde.ranking[0]?.name === "Yo" && lunesTarde.ranking[0].strikes === 1, lunesTarde.ranking);
  check("desempate a 0: por nombre", lunesTarde.ranking.slice(1).map((r) => r.name).join() === "Bea,Cris");
  check("las posiciones van 1, 2, 3", lunesTarde.ranking.map((r) => r.position).join() === "1,2,3");

  console.log("\n5. Privacidad");
  const vOculta = domingo.friends.find((f) => f.name === "Oculta");
  check("sin showStats: solo el nombre (stats null)", vOculta !== undefined && vOculta.stats === null);
  const vBea = domingo.friends.find((f) => f.name === "Bea");
  check("con showStats: título, nivel, llama y golpes", vBea?.stats?.title === "Matadragones" && vBea.stats.level === 1 && typeof vBea.stats.flame === "number");
  await friends.guardarPrivacidadDe(oculta.id, true);
  const tras = await loadCompaneros(yo.id, new Date("2026-10-19T04:59:00Z"));
  check("al activarlo, sale en la clasificación con sus 5 golpes", tras.ranking[0]?.name === "Oculta" && tras.ranking[0].strikes === 5);
  await friends.guardarPrivacidadDe(oculta.id, false);
  const sinNinguno = await loadCompaneros((await usuario("Sola")).id);
  check("con 0 compañeros, la clasificación está vacía (la página invita a compartir)", sinNinguno.ranking.length === 0 && sinNinguno.friends.length === 0);
  return { yo, bea, cris, oculta };
}

// ---------------------------------------------------------------------------
//  6. HTML y payload
// ---------------------------------------------------------------------------

async function probarPayload(g: Awaited<ReturnType<typeof probarSemana>>) {
  console.log("\n6. /companeros en el HTML y en el payload");
  // Una solicitud recibida (para ver que no lleva el código de quien la
  // envía) y una enviada.
  const pide = await usuario("Pide");
  const recibe = await usuario("Recibe");
  await enviar(pide.id, g.yo.friendCode!);
  await enviar(g.yo.id, recibe.friendCode!);
  const sesion = await iniciarSesion(prisma as never, g.yo);
  try {
    const otros = [g.bea, g.cris, g.oculta, pide, recibe];
    for (const rsc of [false, true]) {
      const nombre = rsc ? "payload" : "HTML";
      const { status, body } = await pedirPagina(sesion.cookie, "/companeros", rsc);
      check(`${nombre}: 200`, status === 200, status);
      check(`${nombre}: ningún correo (ni el mío)`, ![g.yo, ...otros].some((u) => body.includes(u.email)) && !/@ember\.test/.test(body));
      check(`${nombre}: ningún id de otro usuario`, !otros.some((u) => body.includes(u.id)));
      check(`${nombre}: los nombres sí`, ["Bea", "Cris", "Oculta", "Pide"].every((n) => body.includes(n)));
      check(`${nombre}: el título de quien comparte sí; el de quien no, no`, body.includes("Matadragones") && !body.includes("Azote de liches"));
      check(`${nombre}: no lleva el código de quien te pide (solo su nombre)`, !body.includes(pide.friendCode!) && !body.includes(rules.formatFriendCode(pide.friendCode!)));
      check(`${nombre}: la enviada se ve por el código, no por el nombre`, body.includes(rules.formatFriendCode(recibe.friendCode!)) && !body.includes(">Recibe<"));
    }
  } finally {
    await sesion.cerrar();
  }
}

// ---------------------------------------------------------------------------

try {
  await probarCodigos();
  await probarSolicitudes();
  await probarLimiteDiario();
  await probarMaximo();
  const g = await probarSemana();
  if (PAYLOAD) await probarPayload(g);
} catch (error) {
  fallo();
  console.error("Error inesperado:", error);
} finally {
  await prisma.user.deleteMany({ where: { email: { startsWith: `${PREFIJO}-` } } });
  await prisma.$disconnect();
  terminar();
}
