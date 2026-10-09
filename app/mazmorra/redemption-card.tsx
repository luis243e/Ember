import { fallenBosses } from "@/components/app/redemption-notice";
import { cn } from "@/lib/cn";
import type { ActiveRedemption } from "@/lib/redemption";
import { formatNumber } from "@/lib/text";

// Tarjeta "Misión de redención" (Figma "LLAMA Y REDENCIÓN · mazmorra",
// escritorio y móvil). Va encima de "Jefes vivos" mientras haya una misión
// activa. Componente de servidor: el plazo ya llega calculado (hoursLeft).
// @container (en un envoltorio, porque una consulta de contenedor no se aplica
// al propio contenedor): el relleno, el título y la fila del progreso miran el
// ancho disponible, no el de la ventana (a 768 px, con la barra lateral, hay
// menos sitio que a 640).
export function RedemptionCard({ mission }: { mission: ActiveRedemption }) {
  const { vigilsDone, vigilsRequired, hoursLeft } = mission;
  const souls =
    mission.soulsAtStake === 1
      ? "1 alma te espera"
      : `${formatNumber(mission.soulsAtStake)} almas te esperan`;
  const vigils = vigilsRequired === 1 ? "1 vigilia" : `${vigilsRequired} vigilias`;

  return (
    <div className="@container">
      <section
        aria-labelledby="mision-redencion"
        className="flex flex-col gap-2.5 rounded-xl border border-ember/45 bg-ember-deep p-[18px] leading-[normal] @lg:px-6 @lg:py-5"
      >
        <p className="font-display text-[13px] tracking-[2px] text-ember uppercase">
          Misión de redención
        </p>
        {/* wrap-anywhere: un nombre de 80 caracteres sin espacios se parte. */}
        <h2
          id="mision-redencion"
          className="font-display text-lg font-bold wrap-anywhere text-parchment @lg:text-[22px]"
        >
          Has caído ante {fallenBosses(mission.bossName, mission.otherBosses)}
        </h2>
        <p className="text-sm text-ash">
          {souls} donde caíste. Completa {vigils} contra cualquier jefe antes de que se agote el
          plazo para recuperarlas.
        </p>

        {/* Progreso y plazo: apilados en móvil, en una fila desde @lg. */}
        <div className="flex flex-col gap-2.5 pt-1.5 @lg:flex-row @lg:items-center @lg:gap-6">
          {/* El lector de pantalla lee la barra entera con aria-valuetext; el
              texto de encima repite lo mismo, así que va oculto para él. */}
          <div
            role="progressbar"
            aria-label="Vigilias de la misión de redención"
            aria-valuemin={0}
            aria-valuemax={vigilsRequired}
            aria-valuenow={vigilsDone}
            aria-valuetext={`${vigilsDone} de ${vigils}`}
            className="flex min-w-0 flex-1 flex-col gap-1.5"
          >
            <p
              aria-hidden
              className="text-[11px] font-semibold tracking-[1px] whitespace-nowrap text-smoke uppercase"
            >
              {vigilsDone} / {vigils}
            </p>
            {/* Un segmento por vigilia, como la barra de vida. */}
            <div className="flex h-2 w-full gap-1">
              {Array.from({ length: vigilsRequired }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    "min-w-0 flex-1 rounded-[2px]",
                    i < vigilsDone ? "bg-gold-bright" : "bg-hp-empty",
                  )}
                />
              ))}
            </div>
          </div>
          {/* "h" se lee mal en voz alta: el lector oye "horas". */}
          <p className="shrink-0 text-sm font-semibold whitespace-nowrap text-ember">
            <span aria-hidden>
              {hoursLeft === 1 ? "Queda 1 h" : `Quedan ${hoursLeft} h`}
            </span>
            <span className="sr-only">
              {hoursLeft === 1 ? "Queda 1 hora" : `Quedan ${hoursLeft} horas`}
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}
