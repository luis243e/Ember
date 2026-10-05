-- Activa Row Level Security (RLS) en las tablas nuevas de Better Auth.
-- Sin políticas, nadie puede leerlas ni escribirlas a través de la API
-- pública de Supabase (roles anon y authenticated). Prisma se conecta con el
-- rol "postgres", que se salta RLS, así que la app sigue funcionando.
-- No incluye _prisma_migrations: esa tabla no existe en la shadow database.
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Verification" ENABLE ROW LEVEL SECURITY;
