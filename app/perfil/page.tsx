import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { cardStyles } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { DIFFICULTIES, DIFFICULTY_LABELS } from "@/lib/game";
import { googleEnabled } from "@/lib/auth";
import { canUnlinkGoogle, loadAuthMethods, loadProfileStats, type AuthMethods, type ProfileStats } from "@/lib/profile";
import { loadRedemption } from "@/lib/redemption";
import { requireUser } from "@/lib/session";
import { loadRelicCollection, preloadCharacter } from "@/lib/rewards";
import { APP_TIME_ZONE } from "@/lib/dates";
import { formatNumber } from "@/lib/text";
import { BorrarCuentaForm } from "./borrar-cuenta-form";
import { ContrasenaForm } from "./contrasena-form";
import { DesvincularForm } from "./desvincular-form";
import { NombreForm } from "./nombre-form";
import { PrivacidadForm } from "./privacidad-form";
import { Reliquias } from "./reliquias";

export const metadata: Metadata = {
  title: "Perfil · Ember",
};

export default async function PerfilPage() {
  const sessionUser = await requireUser();
  // Las bendiciones de la tarjeta del personaje, en paralelo con lo demás
  // (AppShell recoge el resultado).
  preloadCharacter(sessionUser.id);

  // La revisión de jefes vencidos (con los avisos), las estadísticas y las
  // formas de entrar, en paralelo: un solo viaje de espera.
  const [{ user, notices }, stats, methods, collection] = await Promise.all([
    loadRedemption(sessionUser),
    loadProfileStats(sessionUser.id),
    loadAuthMethods(sessionUser.id),
    loadRelicCollection(sessionUser.id),
  ]);

  return (
    <AppShell
      active="perfil"
      user={user}
      notices={notices}
      title="Tu perfil"
      description="Tu nombre, tus hazañas y tu cuenta."
    >
      <div className="flex max-w-[720px] flex-col gap-7 md:gap-8">
        <ProfileSection id="vigilante" title="Tu vigilante">
          <NombreForm name={user.name} />
        </ProfileSection>

        <ProfileSection id="hazanas" title="Tus hazañas">
          <StatsList stats={stats} />
        </ProfileSection>

        <ProfileSection
          id="reliquias"
          title="Reliquias"
          description="Una por cada jefe del bestiario y por los hitos de tu llama. Solo adornan: equipa una como título."
        >
          <Reliquias
            relics={collection.relics.map((relic) => ({
              key: relic.key,
              name: relic.name,
              title: relic.title,
              how: relic.how,
              earnedText: relic.earnedAt ? `Conseguida el ${earnedFormatter.format(relic.earnedAt)}` : null,
            }))}
            equipped={collection.equipped}
          />
        </ProfileSection>

        <ProfileSection
          id="contrasena"
          title={methods.hasPassword ? "Contraseña" : "Crear una contraseña"}
          description={
            methods.hasPassword
              ? "Al cambiarla, se cierra tu sesión en los demás dispositivos."
              : "Entras con Google. Con una contraseña podrás entrar también con tu correo, y se cerrará tu sesión en los demás dispositivos."
          }
        >
          <ContrasenaForm hasPassword={methods.hasPassword} />
        </ProfileSection>

        <ProfileSection id="privacidad" title="Privacidad con tus compañeros">
          <PrivacidadForm showStats={stats.showStats} />
        </ProfileSection>

        <ProfileSection id="cuentas" title="Cuentas vinculadas">
          <LinkedAccounts methods={methods} />
        </ProfileSection>

        <ProfileSection
          id="peligro"
          title="Zona de peligro"
          tone="danger"
          description="Borrar tu cuenta es para siempre y no se puede deshacer."
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2 text-sm leading-[1.5] text-ash">
              <p>Se borrará todo lo tuyo, sin dejar copia:</p>
              <ul className="list-disc pl-5 marker:text-smoke">
                <li>tu personaje: nivel, almas, llama, brasas, bendiciones y reliquias;</li>
                <li>tus materias, con sus jefes, vigilias y misiones de redención;</li>
                <li>tus preguntas, tus respuestas, tus contraataques y tus pruebas;</li>
                <li>las invocaciones del escriba;</li>
                <li>tus compañeros y tus solicitudes;</li>
                <li>tus sesiones y tus formas de entrar (contraseña y Google).</li>
              </ul>
            </div>
            <BorrarCuentaForm hasPassword={methods.hasPassword} />
          </div>
        </ProfileSection>
      </div>
    </AppShell>
  );
}

// "19 de octubre de 2026", en hora de Colombia: el día en que se consiguió.
// Lo escribe el servidor (el ICU del navegador podría escribirlo distinto).
const earnedFormatter = new Intl.DateTimeFormat("es-CO", { timeZone: APP_TIME_ZONE, dateStyle: "long" });

// Una sección del perfil: título (h2), descripción opcional y su tarjeta.
// @container: los formularios de dentro ponen campo y botón en fila según el
// ancho de la tarjeta, no el de la ventana.
function ProfileSection({
  id,
  title,
  description,
  tone,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="font-display text-lg leading-[normal] font-bold text-gold-bright">
          {title}
        </h2>
        {description && <p className="text-sm leading-[1.5] text-smoke">{description}</p>}
      </div>
      {/* La de peligro, con el borde rojo: sin cardStyles, que ya pone
          border-line (cn no resuelve conflictos). */}
      <div
        className={cn(
          tone === "danger" ? "rounded-[10px] border border-blood/60 bg-surface" : cardStyles,
          "@container p-5 md:p-6",
        )}
      >
        {children}
      </div>
    </section>
  );
}

// Las formas de entrar: hoy solo Google (la contraseña tiene su sección).
// Desvincular solo aparece si hay otra forma de entrar.
function LinkedAccounts({ methods }: { methods: AuthMethods }) {
  const linked = methods.googleAccountId !== null;
  let text: string;
  if (linked) {
    text = canUnlinkGoogle(methods)
      ? "Puedes entrar con Google o con tu correo y contraseña."
      : "Es tu única forma de entrar. Para desvincularla, crea antes una contraseña.";
  } else {
    text = googleEnabled
      ? "Entra con «Continuar con Google» usando este mismo correo y se vinculará sola, si Google lo da por verificado."
      : "El inicio de sesión con Google no está disponible ahora mismo.";
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] leading-[normal] font-semibold text-parchment">Google</p>
        <p className={cn("text-[13px] leading-[normal] font-semibold", linked ? "text-gold" : "text-smoke")}>
          {linked ? "Vinculada" : "Sin vincular"}
        </p>
      </div>
      <p className="text-sm leading-[1.5] text-ash">{text}</p>
      {linked && canUnlinkGoogle(methods) && <DesvincularForm />}
    </div>
  );
}

// Las estadísticas como lista de términos y valores (<dl>): el lector de
// pantalla lee "Golpes asestados, 42".
function StatsList({ stats }: { stats: ProfileStats }) {
  const days = (n: number) => (n === 1 ? "1 día" : `${formatNumber(n)} días`);
  const items: { label: string; value: string; detail?: string }[] = [
    {
      label: "Jefes vencidos",
      value: formatNumber(stats.defeated),
      detail: DIFFICULTIES.map((d) => `${DIFFICULTY_LABELS[d]}: ${formatNumber(stats.defeatedByDifficulty[d])}`).join(" · "),
    },
    { label: "Golpes asestados", value: formatNumber(stats.strikes) },
    {
      label: "Horas estudiadas",
      value: `${formatNumber(stats.hours)} h`,
      detail: "Cada golpe, una vigilia de 25 minutos",
    },
    { label: "Racha más larga", value: days(stats.bestFlame) },
    { label: "Preguntas dominadas", value: formatNumber(stats.mastered) },
  ];
  return (
    <dl className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1 rounded-md border border-line bg-night px-4 py-3">
          <dt className="text-[13px] leading-[normal] font-medium text-ash">{item.label}</dt>
          <dd className="font-display text-[22px] leading-[normal] font-bold text-parchment">{item.value}</dd>
          {item.detail && <dd className="text-xs leading-[1.4] text-smoke">{item.detail}</dd>}
        </div>
      ))}
    </dl>
  );
}
