import { fallenBosses } from "@/components/app/redemption-notice";
import { ButtonLink, buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDeadline } from "@/lib/dates";
import { REDEMPTION, VIGIL_MINUTES } from "@/lib/game";
import type { ActiveRedemption } from "@/lib/redemption";
import type { TrialStatus } from "@/lib/redemption-trial";
import { formatNumber } from "@/lib/text";
import { comenzarPrueba } from "./redencion/actions";

// Tarjeta "Misión de redención" (Figma "LLAMA Y REDENCIÓN · mazmorra",
// escritorio y móvil). Va encima de "Jefes vivos" mientras haya una misión
// activa. Componente de servidor: el plazo ya llega calculado (hoursLeft) y la
// fecha se escribe aquí, en hora de Colombia.
//
// Según la regla de la misión (lib/game.ts, REDEMPTION):
//   - TRIAL: qué hay que hacer en una frase, los intentos y el botón para
//     afrontar (o continuar) la prueba. Tiene que entenderse sin haber leído
//     nada antes;
//   - FEW_QUESTIONS y LEGACY: las vigilias, como siempre (FEW_QUESTIONS con
//     una línea que dice por qué no hay prueba).
// trial: la materia del jefe, su banco y la prueba abierta (loadTrialStatus).
// @container (en un envoltorio, porque una consulta de contenedor no se
// aplica al propio contenedor): el relleno, el título y la fila del progreso
// miran el ancho disponible, no el de la ventana.
export function RedemptionCard({ mission, trial }: { mission: ActiveRedemption; trial: TrialStatus | null }) {
  const { vigilsDone, vigilsRequired, hoursLeft } = mission;
  const deadline = formatDeadline(mission.deadline);
  const yourSouls = mission.soulsAtStake === 1 ? "tu alma" : `tus ${formatNumber(mission.soulsAtStake)} almas`;
  const vigils = vigilsRequired === 1 ? "1 vigilia" : `${vigilsRequired} vigilias`;
  const isTrial = mission.rule === "TRIAL";

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

        {isTrial ? (
          <>
            {/* La frase que lo explica todo: qué recuperas, qué hacer y hasta
                cuándo. Debajo, qué es cada cosa. */}
            <p className="text-[15px] leading-[1.45] text-parchment">
              Para recuperar {yourSouls}: completa una vigilia y supera la prueba de redención (
              {REDEMPTION.trial.passWith} de {REDEMPTION.trial.questions}) antes del {deadline}, hora de
              Colombia.
            </p>
            <p className="text-sm leading-[1.45] text-ash">
              Cada vigilia ({VIGIL_MINUTES} minutos de estudio contra cualquier jefe) te da un intento. La
              prueba son {REDEMPTION.trial.questions} preguntas de «{trial?.subjectName ?? "la materia del jefe"}»
              {" "}y se supera con {REDEMPTION.trial.passWith} aciertos.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-ash">
              {mission.soulsAtStake === 1
                ? "1 alma te espera"
                : `${formatNumber(mission.soulsAtStake)} almas te esperan`}{" "}
              donde caíste. Completa {vigils} contra cualquier jefe antes del {deadline}, hora de
              Colombia, para recuperarlas.
            </p>
            {mission.rule === "FEW_QUESTIONS" && (
              <p className="text-[13px] leading-[1.45] text-smoke">
                {trial ? `«${trial.subjectName}»` : "La materia del jefe"} tenía menos de{" "}
                {REDEMPTION.trial.questions} preguntas cuando caíste: por eso bastan {vigils}, sin prueba.
              </p>
            )}
          </>
        )}

        {/* Progreso y plazo: apilados en móvil, en una fila desde @lg. */}
        <div className="flex flex-col gap-2.5 pt-1.5 @lg:flex-row @lg:items-center @lg:gap-6">
          {isTrial ? (
            <p className="min-w-0 flex-1 text-[13px] font-semibold tracking-[1px] text-parchment uppercase">
              {mission.attemptsLeft === 1
                ? "1 intento disponible"
                : `${formatNumber(mission.attemptsLeft)} intentos disponibles`}
            </p>
          ) : (
            // El lector de pantalla lee la barra entera con aria-valuetext;
            // el texto de encima repite lo mismo, así que va oculto para él.
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
          )}
          {/* "h" se lee mal en voz alta: el lector oye "horas". */}
          <p className="shrink-0 text-sm font-semibold whitespace-nowrap text-ember">
            <span aria-hidden>{hoursLeft === 1 ? "Queda 1 h" : `Quedan ${hoursLeft} h`}</span>
            <span className="sr-only">{hoursLeft === 1 ? "Queda 1 hora" : `Quedan ${hoursLeft} horas`}</span>
          </p>
        </div>

        {isTrial && <TrialAction mission={mission} trial={trial} />}
      </section>
    </div>
  );
}

// Lo que se puede hacer ahora con la prueba: continuarla, afrontarla, o por
// qué todavía no.
function TrialAction({ mission, trial }: { mission: ActiveRedemption; trial: TrialStatus | null }) {
  if (trial?.openTrialId) {
    return (
      <div className="flex flex-col gap-2 pt-1.5 @lg:flex-row @lg:items-center @lg:gap-4">
        <ButtonLink href="/mazmorra/redencion" size="md" className="w-full @lg:w-auto">
          Continuar la prueba
        </ButtonLink>
        <p className="text-[13px] text-ash">Tienes una prueba a medias.</p>
      </div>
    );
  }
  if (trial && trial.bankSize < REDEMPTION.trial.questions) {
    return (
      <p className="pt-1.5 text-[13px] leading-[1.45] text-ember">
        «{trial.subjectName}» tiene ahora {formatNumber(trial.bankSize)}{" "}
        {trial.bankSize === 1 ? "pregunta" : "preguntas"} y la prueba necesita {REDEMPTION.trial.questions}.
        Añade alguna para poder afrontarla.
      </p>
    );
  }
  if (mission.attemptsLeft === 0) {
    return (
      <p className="pt-1.5 text-[13px] leading-[1.45] text-ash">
        Aún no tienes intentos: completa una vigilia contra cualquier jefe y vuelve aquí.
      </p>
    );
  }
  return (
    // Un <form> con la acción: funciona también sin JavaScript. Empezar gasta
    // el intento.
    <form action={comenzarPrueba} className="flex flex-col gap-2 pt-1.5 @lg:flex-row @lg:items-center @lg:gap-4">
      <button type="submit" className={cn(buttonStyles({ size: "md" }), "w-full cursor-pointer @lg:w-auto")}>
        Afrontar la prueba
      </button>
      <p className="text-[13px] text-ash">Empezarla gasta un intento.</p>
    </form>
  );
}
