import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Flame, Users } from "lucide-react";
import { AppShell } from "@/components/app/app-shell";
import { cardStyles } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { loadCompaneros } from "@/lib/friends";
import { FRIENDS, formatFriendCode } from "@/lib/friends-rules";
import { loadRedemption } from "@/lib/redemption";
import { requireUser } from "@/lib/session";
import { preloadCharacter } from "@/lib/rewards";
import { formatNumber } from "@/lib/text";
import { AnadirCompanero, BotonAmistad, CopiarCodigo } from "./formularios";

export const metadata: Metadata = {
  title: "Compañeros · Ember",
};

// Compañeros: solo entre amigos, nada público. De cada uno se ve el nombre y,
// si lo permite, su título, nivel, llama y golpes de la semana. Nunca el
// correo ni nada del banco de preguntas. Las filas se nombran por el id de la
// AMISTAD: en el HTML no hay ids de otros usuarios (lib/friends.ts).
export default async function CompanerosPage() {
  const sessionUser = await requireUser();
  // Las bendiciones de la tarjeta del personaje, en paralelo con lo demás
  // (AppShell recoge el resultado).
  preloadCharacter(sessionUser.id);

  const [{ user, notices }, data] = await Promise.all([loadRedemption(sessionUser), loadCompaneros(sessionUser.id)]);
  const code = formatFriendCode(data.code);
  const golpes = (n: number) => (n === 1 ? "1 golpe" : `${formatNumber(n)} golpes`);

  return (
    <AppShell
      active="companeros"
      user={user}
      notices={notices}
      title="Compañeros"
      description="Estudia junto a tus amigos: quién ha asestado más golpes esta semana."
    >
      <div className="flex max-w-[720px] flex-col gap-7 md:gap-8">
        <Section id="tu-codigo" title="Tu código">
          <div className="flex flex-col gap-3">
            <CopiarCodigo code={data.code} display={code} />
            <p className="text-sm leading-normal text-ash">
              Compártelo solo con quien quieras: con él te pueden enviar una solicitud.
              {data.showStats
                ? " Tus compañeros ven tu nombre, tu título, tu nivel, tu llama y tus golpes de la semana."
                : " Tus compañeros solo ven tu nombre (lo cambias en tu perfil)."}{" "}
              Nunca tu correo.
            </p>
          </div>
        </Section>

        <Section id="anadir" title="Añadir un compañero">
          <AnadirCompanero />
        </Section>

        {data.received.length > 0 && (
          <Section id="recibidas" title="Solicitudes recibidas">
            <ul className="flex flex-col divide-y divide-line">
              {data.received.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <p className="min-w-0 text-[15px] font-semibold wrap-anywhere text-parchment">{r.name}</p>
                  <div className="flex gap-2">
                    <BotonAmistad id={r.id} accion="decline" label="Rechazar" />
                    <BotonAmistad id={r.id} accion="accept" label="Aceptar" primary />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {data.sent.length > 0 && (
          <Section
            id="enviadas"
            title="Solicitudes enviadas"
            description="Se ve el código que escribiste: su nombre aparecerá cuando acepte."
          >
            <ul className="flex flex-col divide-y divide-line">
              {data.sent.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <p className="flex flex-col gap-0.5">
                    <span className="font-display text-[15px] font-bold tracking-[2px] text-parchment">
                      {formatFriendCode(s.code)}
                    </span>
                    <span className="text-xs text-smoke">Pendiente</span>
                  </p>
                  <BotonAmistad id={s.id} accion="cancel" label="Cancelar" />
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section id="semana" title="Clasificación de la semana" description="Golpes de lunes a domingo, en hora de Colombia.">
          {data.ranking.length === 0 ? (
            // Sin compañeros: una invitación a compartir el código (sin la
            // tarjeta de EmptyState: ya está dentro de una).
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Users aria-hidden size={36} className="text-smoke" />
              <p className="font-display text-lg font-bold text-parchment">Todavía estudias en solitario</p>
              <p className="max-w-[440px] text-[15px] leading-[1.5] text-ash">
                Comparte tu código <strong className="font-semibold whitespace-nowrap text-parchment">{code}</strong>{" "}
                con un amigo: en cuanto acepte, aquí veréis quién golpea más cada semana.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-2">
              {data.ranking.map((r) => (
                <li
                  key={r.key}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2.5",
                    r.isMe ? "border-gold/50 bg-gold/8" : "border-line bg-night",
                  )}
                >
                  <span className="w-7 shrink-0 text-center font-display text-lg font-bold text-gold">{r.position}</span>
                  <div className="flex min-w-0 flex-1 flex-col leading-snug">
                    <p className="truncate text-[15px] font-semibold text-parchment">
                      {r.name}
                      {r.isMe && <span className="font-normal text-ash"> (tú)</span>}
                    </p>
                    {r.title && <p className="truncate text-xs text-ash italic">{r.title}</p>}
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-parchment">{golpes(r.strikes)}</p>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section
          id="lista"
          title="Tus compañeros"
          description={`${formatNumber(data.friendCount)} de ${FRIENDS.maxFriends}.`}
        >
          {data.friends.length === 0 ? (
            <p className="text-sm leading-normal text-ash">Cuando alguien acepte tu solicitud, aparecerá aquí.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {data.friends.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col gap-0.5 leading-snug">
                    <p className="text-[15px] font-semibold wrap-anywhere text-parchment">{f.name}</p>
                    {f.stats ? (
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-ash">
                        {f.stats.title && <span className="italic">{f.stats.title}</span>}
                        <span>Nivel {f.stats.level}</span>
                        <span className="flex items-center gap-0.5">
                          <Flame aria-hidden size={12} className="text-ember" />
                          <span className="sr-only">Llama:</span> {f.stats.flame === 1 ? "1 día" : `${formatNumber(f.stats.flame)} días`}
                        </span>
                        <span>{golpes(f.stats.weekStrikes)} esta semana</span>
                      </p>
                    ) : (
                      <p className="text-xs text-smoke">No comparte sus estadísticas.</p>
                    )}
                  </div>
                  <BotonAmistad id={f.id} accion="remove" label="Quitar" confirm="¿Quitar?" />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </AppShell>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="font-display text-lg leading-[normal] font-bold text-gold-bright">
          {title}
        </h2>
        {description && <p className="text-sm leading-[1.5] text-smoke">{description}</p>}
      </div>
      <div className={cn(cardStyles, "@container p-5 md:p-6")}>{children}</div>
    </section>
  );
}
