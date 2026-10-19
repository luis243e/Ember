"use client";

import { Check, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { PublicQuestion } from "@/lib/questions/types";

// Las piezas que comparten el panel del contraataque
// (batalla/[id]/counterattack-panel.tsx) y el de la prueba de redención
// (redencion/prueba-panel.tsx): la pregunta con sus opciones y la respuesta
// con la correcta y la explicación (Figma 105:2 y 105:77). Lo que cambia entre
// los dos (las almas, los títulos, "Retírala") llega por props.
//
// Ninguna de estas piezas decide nada: la correcta y la explicación llegan
// del servidor DESPUÉS de contestar.

export const LETTERS = ["A", "B", "C", "D"];

// El mismo contorno de foco que los botones (buttonStyles).
export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";

// correct / wrong / dodged; answered = una genérica contestada (no hay buena
// ni mala); skipped = la pregunta ya no existe y se salta.
export type QuizOutcome = "correct" | "wrong" | "dodged" | "answered" | "skipped";

// ---------------------------------------------------------------------------
//  La pregunta (105:2)
// ---------------------------------------------------------------------------

export function QuestionView({
  question,
  pending,
  onAnswer,
  stakes,
}: {
  question: PublicQuestion;
  pending: boolean;
  onAnswer: (chosen: number | null) => void;
  // La línea pequeña junto a "Esquivar": lo que está en juego.
  stakes: string;
}) {
  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {question.options.map((option, i) => (
          <li key={i}>
            {/* aria-disabled y no disabled mientras espera: un botón con el
                foco que pasa a disabled lo pierde (se va a <body>). */}
            <button
              type="button"
              onClick={() => onAnswer(i)}
              aria-disabled={pending || undefined}
              aria-keyshortcuts={String(i + 1)}
              className={cn(
                "flex min-h-14 w-full cursor-pointer items-center gap-3.5 rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-gold aria-disabled:cursor-wait",
                FOCUS_RING,
              )}
            >
              <Letter index={i} />
              <span className="min-w-0 flex-1 text-base leading-snug wrap-anywhere text-parchment">
                {option}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1">
        <button
          type="button"
          onClick={() => onAnswer(null)}
          aria-disabled={pending || undefined}
          className={cn(
            "-mx-2 flex h-11 cursor-pointer items-center rounded-md px-2 text-sm leading-[normal] font-semibold text-ash transition-colors hover:text-parchment aria-disabled:cursor-wait",
            FOCUS_RING,
          )}
        >
          Esquivar
        </button>
        <p className="text-xs leading-[normal] text-smoke">{stakes}</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
//  La respuesta (105:77 y su variante de fallo)
// ---------------------------------------------------------------------------

export function RevealedView({
  question,
  chosen,
  outcome,
  correctIndex,
  explanation,
  verdict,
  optionNote,
  dodgeNote,
  newLevel,
  explanationRef,
  footerStart,
  nextLabel,
  onNext,
}: {
  question: PublicQuestion | null;
  chosen: number | null;
  outcome: QuizOutcome;
  // La correcta EN EL ORDEN MOSTRADO; null en las genéricas y al saltar.
  correctIndex: number | null;
  explanation: string | null;
  // El título de la explicación ("¡Golpe parado!", "Correcta"...).
  verdict: { title: string; className: string };
  // Lo que se enseña junto a la opción elegida (las almas en el
  // contraataque); null = nada.
  optionNote: string | null;
  // Sin opción elegida (esquivar, saltada): la línea de la explicación.
  dodgeNote: string | null;
  newLevel?: number;
  explanationRef: RefObject<HTMLDivElement | null>;
  // A la izquierda del botón (en el contraataque, "Retírala").
  footerStart?: ReactNode;
  nextLabel: string;
  onNext: () => void;
}) {
  return (
    <>
      {question && (
        <ul className="flex flex-col gap-2.5">
          {question.options.map((option, i) => {
            const isCorrect = correctIndex === i;
            const isChosen = chosen === i;
            // En las genéricas no hay correcta: se marca en dorado la elegida.
            const good = isCorrect || (outcome === "answered" && isChosen);
            const bad = isChosen && outcome === "wrong";
            return (
              <li
                key={i}
                className={cn(
                  "flex min-h-14 items-center gap-3.5 rounded-lg border px-4 py-3",
                  good
                    ? "border-[1.5px] border-gold-bright bg-gold/14"
                    : bad
                      ? "border-[1.5px] border-blood bg-blood/12"
                      : "border-line bg-surface opacity-45",
                )}
              >
                <Letter index={i} bright={good} />
                <span
                  className={cn(
                    "min-w-0 flex-1 text-base leading-snug wrap-anywhere text-parchment",
                    (good || bad) && "font-semibold",
                  )}
                >
                  {option}
                  {/* Para el lector de pantalla, lo que dicen los colores. */}
                  {isCorrect && <span className="sr-only"> (respuesta correcta)</span>}
                  {isChosen && <span className="sr-only"> (tu respuesta)</span>}
                </span>
                {good && (
                  <span className="flex shrink-0 items-center gap-1.5 text-sm leading-[normal] font-semibold text-gold-bright">
                    <Check aria-hidden size={14} />
                    {isChosen && optionNote}
                  </span>
                )}
                {bad && (
                  <span className="flex shrink-0 items-center gap-1.5 text-right text-sm leading-[normal] font-semibold text-parchment">
                    <X aria-hidden size={14} />
                    {optionNote}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* La explicación: recibe el foco al contestar. */}
      <div
        ref={explanationRef}
        tabIndex={-1}
        className={cn(
          "flex flex-col gap-1.5 rounded-lg border border-line bg-surface px-4 py-3.5 leading-[normal]",
          FOCUS_RING,
        )}
      >
        <p className={cn("font-display text-[17px] font-bold", verdict.className)}>{verdict.title}</p>
        {chosen === null && dodgeNote && <p className="text-sm font-semibold text-parchment">{dodgeNote}</p>}
        {explanation && <p className="text-sm leading-normal wrap-anywhere text-ash">{explanation}</p>}
        {newLevel && (
          <p className="pt-1 font-display text-sm font-bold tracking-[3px] text-ember uppercase">
            Has alcanzado el nivel {newLevel}
          </p>
        )}
      </div>

      {/* Pie: lo de la izquierda (si lo hay) y el botón a la derecha. En
          móvil, uno encima del otro. */}
      <div className="flex flex-col gap-3 @md:flex-row @md:items-end @md:justify-between">
        {footerStart ?? <span aria-hidden />}
        <button
          type="button"
          onClick={onNext}
          className={cn(buttonStyles({ size: "md" }), "w-full shrink-0 cursor-pointer @md:w-auto")}
        >
          {nextLabel}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
//  Piezas
// ---------------------------------------------------------------------------

export function Letter({ index, bright = false }: { index: number; bright?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full border font-display text-[13px] leading-none font-bold",
        bright ? "border-gold-bright text-gold-bright" : "border-gold text-gold",
      )}
    >
      {LETTERS[index]}
    </span>
  );
}
