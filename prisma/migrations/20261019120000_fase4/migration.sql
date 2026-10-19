-- CreateEnum
CREATE TYPE "BlessingKey" AS ENUM ('SOULS', 'ASH_SHIELD', 'LUCIDITY', 'EMBER_SPARK', 'SCRIBE_EYE', 'REDEMPTION_SEAL');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterTable
ALTER TABLE "Counterattack" ADD COLUMN     "bonusPerCorrect" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RedemptionTrial" ADD COLUMN     "passWith" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bestFlame" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "equippedRelic" TEXT,
ADD COLUMN     "friendCode" TEXT,
ADD COLUMN     "friendRequestCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "friendRequestDay" TIMESTAMP(3),
ADD COLUMN     "showStats" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Blessing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" "BlessingKey" NOT NULL,
    "usesLeft" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blessing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlessingOffer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "options" "BlessingKey"[],
    "chosenKey" "BlessingKey",
    "chosenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlessingOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Relic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "hiddenByRequester" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Blessing_userId_key_key" ON "Blessing"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "BlessingOffer_taskId_key" ON "BlessingOffer"("taskId");

-- CreateIndex
CREATE INDEX "BlessingOffer_userId_idx" ON "BlessingOffer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Relic_userId_key_key" ON "Relic"("userId", "key");

-- CreateIndex
CREATE INDEX "Friendship_requesterId_idx" ON "Friendship"("requesterId");

-- CreateIndex
CREATE INDEX "Friendship_addresseeId_idx" ON "Friendship"("addresseeId");

-- CreateIndex
CREATE UNIQUE INDEX "User_friendCode_key" ON "User"("friendCode");

-- AddForeignKey
ALTER TABLE "Blessing" ADD CONSTRAINT "Blessing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlessingOffer" ADD CONSTRAINT "BlessingOffer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlessingOffer" ADD CONSTRAINT "BlessingOffer_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relic" ADD CONSTRAINT "Relic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Añadido a mano (Prisma 6 no gestiona los CHECK ni los índices sobre
-- expresiones: no están en schema.prisma y Prisma no los borrará).
-- ---------------------------------------------------------------------------

-- Racha más larga y contador de solicitudes: nunca negativos.
ALTER TABLE "User"
  ADD CONSTRAINT "User_bestFlame_check" CHECK ("bestFlame" >= 0),
  ADD CONSTRAINT "User_friendRequestCount_check" CHECK ("friendRequestCount" >= 0),
  -- 8 caracteres del alfabeto FRIEND_CODE (lib/friends.ts): sin 0, O, 1 ni I.
  ADD CONSTRAINT "User_friendCode_check"
    CHECK ("friendCode" IS NULL OR "friendCode" ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$');

-- Aciertos para aprobar la prueba: de 1 a 5 (4 normal, 3 con el Sello).
ALTER TABLE "RedemptionTrial"
  ADD CONSTRAINT "RedemptionTrial_passWith_check" CHECK ("passWith" BETWEEN 1 AND 5);

-- La Lucidez da almas extra por acierto: nunca negativas.
ALTER TABLE "Counterattack"
  ADD CONSTRAINT "Counterattack_bonusPerCorrect_check" CHECK ("bonusPerCorrect" >= 0);

-- Una bendición agotada se borra: nunca queda con 0 usos.
ALTER TABLE "Blessing"
  ADD CONSTRAINT "Blessing_usesLeft_check" CHECK ("usesLeft" >= 1);

-- La oferta: de 1 a 3 opciones (OJO: un array de Prisma admite NULL y un
-- CHECK con resultado NULL pasa, por eso el IS NOT NULL); la elegida es una
-- de ellas; elegida y fecha, las dos o ninguna.
ALTER TABLE "BlessingOffer"
  ADD CONSTRAINT "BlessingOffer_options_check"
    CHECK ("options" IS NOT NULL AND cardinality("options") BETWEEN 1 AND 3),
  ADD CONSTRAINT "BlessingOffer_chosen_check"
    CHECK ("chosenKey" IS NULL OR "chosenKey" = ANY ("options")),
  ADD CONSTRAINT "BlessingOffer_chosenAt_check"
    CHECK (("chosenKey" IS NULL) = ("chosenAt" IS NULL));

-- Compañeros: nadie lo es de sí mismo, y una sola fila por pareja sea cual
-- sea el sentido (A→B y B→A chocan en este índice).
ALTER TABLE "Friendship"
  ADD CONSTRAINT "Friendship_not_self_check" CHECK ("requesterId" <> "addresseeId");
CREATE UNIQUE INDEX "Friendship_pair_key"
  ON "Friendship" (LEAST("requesterId", "addresseeId"), GREATEST("requesterId", "addresseeId"));

-- Tablas nuevas: RLS en la MISMA migración (la API pública de Supabase no
-- puede leerlas ni un instante). Sin políticas: Prisma entra como postgres.
ALTER TABLE "Blessing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlessingOffer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Relic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Friendship" ENABLE ROW LEVEL SECURITY;

-- relleno:inicio
-- Cuatro rellenos para las cuentas que ya existían. scripts/probar-recompensas
-- y scripts/probar-companeros los repiten en una transacción que se deshace y
-- los comparan con sus reglas de TypeScript.

-- 1. Códigos de amigo. Los nuevos los genera node:crypto (lib/friends.ts); en
-- una migración no hay node, así que aquí salen del generador criptográfico
-- de Postgres (gen_random_uuid usa pg_strong_random). Un UUID v4 tiene bits
-- FIJOS: la versión en el byte 6 y la variante en el byte 8. Solo se usan
-- bytes enteramente aleatorios (0–5 y 9–10). El alfabeto tiene 32 símbolos:
-- "byte & 31" toma los 5 bits bajos de un byte uniforme, así que cada
-- símbolo sale con la misma probabilidad. La función vive en pg_temp: solo
-- existe durante esta sesión y no queda en el esquema.
-- friend-code:inicio
CREATE FUNCTION pg_temp.ember_friend_code() RETURNS TEXT AS $fc$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  positions CONSTANT INT[] := ARRAY[0, 1, 2, 3, 4, 5, 9, 10];
  bytes BYTEA := uuid_send(gen_random_uuid());
  code TEXT := '';
  i INT;
BEGIN
  FOREACH i IN ARRAY positions LOOP
    code := code || substr(alphabet, (get_byte(bytes, i) & 31) + 1, 1);
  END LOOP;
  RETURN code;
END
$fc$ LANGUAGE plpgsql VOLATILE;
-- friend-code:fin

DO $$
DECLARE
  u RECORD;
  candidate TEXT;
BEGIN
  FOR u IN SELECT "id" FROM "User" WHERE "friendCode" IS NULL ORDER BY "id" LOOP
    LOOP
      candidate := pg_temp.ember_friend_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE "friendCode" = candidate);
    END LOOP;
    UPDATE "User" SET "friendCode" = candidate WHERE "id" = u."id";
  END LOOP;
END
$$;

-- 2. Racha más larga: una COTA INFERIOR, nunca más de lo que hubo. Las
-- brasas de antes no dejaron rastro, así que solo se cuenta lo seguro: la
-- llama guardada (flame conserva la última racha aunque se apagara) o la
-- mayor serie de días de Colombia seguidos con al menos un golpe (una serie
-- de N días seguidos con golpe es, como mínimo, una llama de N).
-- completedAt se guarda en UTC sin zona: AT TIME ZONE 'UTC' lo marca como
-- UTC y AT TIME ZONE 'America/Bogota' lo pasa a la hora de Colombia.
WITH days AS (
  SELECT DISTINCT "userId",
    (("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Bogota')::date AS day
  FROM "StudySession"
  WHERE "completedAt" IS NOT NULL
), islands AS (
  -- Días seguidos dan la misma diferencia día − número de fila.
  SELECT "userId", day - (ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY day))::int AS island
  FROM days
), longest AS (
  SELECT "userId", MAX(len)::int AS run
  FROM (SELECT "userId", island, COUNT(*) AS len FROM islands GROUP BY "userId", island) runs
  GROUP BY "userId"
)
UPDATE "User" u
SET "bestFlame" = GREATEST(u."flame", COALESCE(l.run, 0))
FROM (SELECT "id" FROM "User") ids
LEFT JOIN longest l ON l."userId" = ids."id"
WHERE u."id" = ids."id";

-- 3. Reliquias de jefe: una por cada jefe del bestiario ya vencido. El jefe
-- de cada tarea se lee como bossForTask() (lib/game.ts): su bossKey si es de
-- su dificultad y, si no, el de la posición (código del último carácter del
-- id) módulo 2. La fecha, la de su último golpe (el de la victoria).
INSERT INTO "Relic" ("id", "userId", "key", "earnedAt")
SELECT gen_random_uuid()::text, won."userId", 'boss:' || won.boss, MIN(won.at)
FROM (
  SELECT s."userId",
    CASE WHEN t."bossKey" = ANY (opts.list) THEN t."bossKey"
         ELSE opts.list[(ascii(right(t."id", 1)) % 2) + 1] END AS boss,
    COALESCE(
      (SELECT MAX(ss."completedAt") FROM "StudySession" ss WHERE ss."taskId" = t."id"),
      CURRENT_TIMESTAMP
    ) AS at
  FROM "Task" t
  JOIN "Subject" s ON s."id" = t."subjectId"
  CROSS JOIN LATERAL (
    SELECT CASE t."difficulty"
      WHEN 'EASY' THEN ARRAY['centinela-de-huesos', 'rata-de-las-cloacas']
      WHEN 'MEDIUM' THEN ARRAY['ogro-de-las-ruinas', 'caballero-hueco']
      ELSE ARRAY['dragon-de-la-caverna', 'liche-del-osario']
    END AS list
  ) opts
  WHERE t."status" = 'DEFEATED'
) won
GROUP BY won."userId", won.boss;

-- 4. Hitos de llama (7, 30 y 100 días): solo con la racha DEMOSTRABLE del
-- paso 2. Nadie recibe uno que no ganó; quien tuvo una racha salvada por
-- brasas puede quedarse sin él hasta que vuelva a cruzar el umbral.
INSERT INTO "Relic" ("id", "userId", "key", "earnedAt")
SELECT gen_random_uuid()::text, u."id", 'flame:' || m.days, CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN (VALUES (7), (30), (100)) AS m(days)
WHERE u."bestFlame" >= m.days;
-- relleno:fin
