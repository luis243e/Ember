"use client";

import Link from "next/link";
import { Award } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type RefObject } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { REDEMPTION } from "@/lib/game";
import type { PublicQuestion } from "@/lib/questions/types";
import { formatNumber } from "@/lib/text";
import { FOCUS_RING, LETTERS, QuestionView, RevealedView } from "@/app/mazmorra/quiz-views";
import { comenzarPrueba, responderPrueba, type ResultadoPrueba, type TrialSummary } from "./actions";

// Lo que la página sabe de la misión (loadTrialStatus en
// lib/redemption-trial.ts), ya en datos simples. null = no hay misión activa.
export type TrialStatusData = {
  rule: "LEGACY" | "FEW_QUESTIONS" | "TRIAL";
  soulsAtStake: number;
  deadlineText: string;
  hoursLeft: number;
  attemptsLeft: number;
  subjectName: string;
  bankSize: number;
} | null;

// La pregunta que toca de la prueba abierta (loadOpenTrial). number empieza
// en 0. question null = se borró del banco a mitad de la prueba.
// passWith: los aciertos que bastan en esta prueba (3 si gastó el Sello).
export type TrialData = {
  id: string;
  number: number;
  total: number;
  correct: number;
  passWith: number;
  question: PublicQuestion | null;
};

type Answered = Extract<ResultadoPrueba, { ok: true }>;

const { questions: TOTAL, passWith: PASS } = REDEMPTION.trial;

// El panel de la prueba de redención: el MISMO panel que el contraataque
// (quiz-views.tsx), pero en su propia pantalla y no como diálogo sobre la
// batalla. Como allí, el navegador no decide nada: manda "pregunta N, opción
// mostrada X" y el servidor contesta si acertó, cuál era la correcta (en el
// orden mostrado) y la explicación.
//
// La respuesta y el resumen viven en el estado de este componente: la acción
// repinta la página (refresh) y la pregunta siguiente, o la misión ya
// cumplida, llegan en las props, pero lo que se está leyendo no cambia hasta
// pulsar "Siguiente".
export function PruebaPanel({ status, trial }: { status: TrialStatusData; trial: TrialData | null }) {
  const [pending, startTransition] = useTransition();
  const [revealed, setRevealed] = useState<{ snapshot: TrialData; chosen: number | null; result: Answered } | null>(
    null,
  );
  const [summary, setSummary] = useState<TrialSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // "Intentarlo de nuevo" vuelve a esta misma página con una prueba NUEVA:
  // React conserva este componente, así que el resumen de la anterior se
  // olvida aquí, al ver un id distinto. Cuando la prueba termina, trial pasa
  // a null y el resumen se queda. (El patrón de React para ajustar el estado
  // cuando cambia una prop: se compara durante el render con la última vista.)
  const [seenTrialId, setSeenTrialId] = useState(trial?.id ?? null);
  if ((trial?.id ?? null) !== seenTrialId) {
    setSeenTrialId(trial?.id ?? null);
    if (trial) {
      setSummary(null);
      setRevealed(null);
      setError(null);
    }
  }

  const view = summary ? "summary" : revealed ? "revealed" : trial ? "question" : "idle";
  const current = revealed?.snapshot ?? trial;

  // Foco: al enunciado con cada pregunta, a la explicación al contestar y al
  // título del resumen al terminar (tabIndex -1: enfocables desde el código,
  // fuera del orden del Tab).
  const promptRef = useRef<HTMLHeadingElement>(null);
  const explanationRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const questionNumber = current?.number;
  useEffect(() => {
    if (view === "question") promptRef.current?.focus();
    else if (view === "revealed") explanationRef.current?.focus();
    else if (view === "summary") summaryRef.current?.focus();
  }, [view, questionNumber]);

  function answer(chosen: number | null) {
    // Ya hay una respuesta en camino: un segundo clic no manda otra.
    if (pending || !trial || revealed) return;
    const snapshot = trial;
    setError(null);
    startTransition(async () => {
      const result = await responderPrueba(snapshot.id, snapshot.number, chosen);
      if (!result.ok) {
        // Por ejemplo, otra pestaña contestó primero: el refresh() de la
        // acción ya trae la pregunta que toca ahora.
        setError(result.error);
        setAnnouncement(result.error);
        return;
      }
      setRevealed({ snapshot, chosen, result });
      setAnnouncement(resultSentence(result));
    });
  }

  function next() {
    const done = revealed?.result.summary;
    if (done) {
      setSummary(done);
      // El lector oye el resultado, no la última respuesta.
      setAnnouncement(
        done.passed
          ? `Prueba superada: ${done.correct} de ${done.total}. Recuperas ${formatNumber(done.recoveredSouls)} almas.`
          : `Prueba no superada: ${done.correct} de ${done.total}.`,
      );
    }
    setRevealed(null);
    setError(null);
  }

  // Teclas 1–4 (o 1–2): contestan la opción de ese número.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (view !== "question" || !trial?.question) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const n = Number(event.key);
    if (Number.isInteger(n) && n >= 1 && n <= trial.question.options.length) {
      event.preventDefault();
      answer(n - 1);
    }
  }

  const titleId = "prueba-titulo";

  return (
    // @container: los puntos de corte del panel (los mismos @md y @2xl que
    // en la batalla) miran su ancho.
    <div className="@container">
      <section
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
        className={cn(
          "mx-auto flex w-full max-w-[660px] flex-col rounded-[14px] border border-line bg-night-alt/97 px-5 py-6 shadow-[0_16px_48px_rgba(0,0,0,0.6)] @2xl:px-8",
          view === "summary" ? "items-center gap-3.5 text-center @2xl:py-9" : "gap-4.5 @2xl:py-7",
        )}
      >
        {view === "summary" && summary ? (
          <SummaryView summary={summary} titleId={titleId} titleRef={summaryRef} />
        ) : view === "idle" || !current ? (
          <IdleView status={status} titleId={titleId} />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2
                id={titleId}
                className="font-display text-[13px] leading-[normal] tracking-[2px] text-ember uppercase"
              >
                Prueba de redención
              </h2>
              <div className="flex flex-wrap items-center gap-2.5">
                {current.question?.review && (
                  <Badge tone="ember" className="px-2">
                    Repaso
                  </Badge>
                )}
                {current.question?.fromAgent && <Badge className="px-2">Del agente</Badge>}
                <p className="text-[13px] leading-[normal] font-semibold text-smoke">
                  Pregunta {current.number + 1} de {current.total}
                </p>
              </div>
            </div>

            {/* El Sello de redención actúa aquí: se gastó al empezar la
                prueba, que guarda cuántos aciertos bastan. */}
            {current.passWith < PASS && <SealLine passWith={current.passWith} />}

            <h3
              ref={promptRef}
              tabIndex={-1}
              className={cn(
                "rounded-sm text-xl leading-snug font-semibold wrap-anywhere text-parchment @2xl:text-[22px]",
                FOCUS_RING,
              )}
            >
              {current.question?.prompt ?? "Esta pregunta ya no existe."}
            </h3>

            {error && <Alert>{error}</Alert>}

            {view === "revealed" && revealed ? (
              <RevealedView
                question={revealed.snapshot.question}
                chosen={revealed.chosen}
                outcome={revealed.result.outcome}
                correctIndex={revealed.result.correctIndex}
                explanation={revealed.result.explanation}
                verdict={VERDICTS[revealed.result.outcome]}
                optionNote={null}
                dodgeNote={
                  revealed.result.outcome === "skipped"
                    ? "Se borró del banco: no cuenta como acierto."
                    : "Esquivar cuenta como fallo."
                }
                newLevel={revealed.result.summary?.newLevel}
                explanationRef={explanationRef}
                nextLabel={revealed.result.summary ? "Ver resultado" : "Siguiente"}
                onNext={next}
              />
            ) : current.question ? (
              <QuestionView
                question={current.question}
                pending={pending}
                onAnswer={answer}
                stakes={`Necesitas ${current.passWith} de ${TOTAL} · llevas ${current.correct} ${current.correct === 1 ? "acierto" : "aciertos"}`}
              />
            ) : (
              // Se borró del banco a mitad de la prueba: al seguir, la acción
              // la salta (no cuenta como acierto).
              <>
                <p className="text-sm leading-normal text-ash">
                  Se borró del banco a mitad de la prueba. No cuenta como acierto.
                </p>
                <button
                  type="button"
                  onClick={() => answer(null)}
                  aria-disabled={pending || undefined}
                  className={cn(
                    buttonStyles({ size: "md" }),
                    "w-full cursor-pointer self-end aria-disabled:cursor-wait aria-disabled:opacity-60 @md:w-auto",
                  )}
                >
                  Siguiente
                </button>
              </>
            )}
          </>
        )}

        <p role="status" className="sr-only">
          {announcement}
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Sin prueba abierta: qué toca ahora
// ---------------------------------------------------------------------------

function IdleView({ status, titleId }: { status: TrialStatusData; titleId: string }) {
  const title = (
    <h2 id={titleId} className="font-display text-[13px] leading-[normal] tracking-[2px] text-ember uppercase">
      Prueba de redención
    </h2>
  );
  const back = (
    <ButtonLink href="/mazmorra" variant="ghost" size="md" className="w-full @md:w-auto @md:self-start">
      Volver a la mazmorra
    </ButtonLink>
  );

  // Sin misión, o con una que se cumple con vigilias: aquí no hay nada que hacer.
  if (!status || status.rule !== "TRIAL") {
    return (
      <>
        {title}
        <p className="text-base leading-normal text-parchment">
          {status
            ? `Tu misión de redención no tiene prueba: se cumple con ${REDEMPTION.vigilsRequired} vigilias.`
            : "No tienes ninguna prueba de redención pendiente."}
        </p>
        <p className="text-sm leading-normal text-ash">
          La prueba aparece cuando un jefe te vence y su materia tiene al menos {TOTAL} preguntas.
        </p>
        {back}
      </>
    );
  }

  const souls = status.soulsAtStake === 1 ? "tu alma" : `tus ${formatNumber(status.soulsAtStake)} almas`;
  const canStart = status.attemptsLeft > 0 && status.bankSize >= TOTAL;
  return (
    <>
      {title}
      <p className="text-base leading-normal text-parchment">
        {TOTAL} preguntas de «{status.subjectName}». Acierta {PASS} y recuperas {souls}. Después de cada
        una verás la correcta y por qué.
      </p>
      <Deadline text={status.deadlineText} hoursLeft={status.hoursLeft} />
      {status.bankSize < TOTAL ? (
        <p className="text-sm leading-normal text-ember">
          «{status.subjectName}» tiene ahora {formatNumber(status.bankSize)}{" "}
          {status.bankSize === 1 ? "pregunta" : "preguntas"} y la prueba necesita {TOTAL}. Añade alguna
          en{" "}
          <Link href="/materias" className={cn("rounded-sm font-semibold underline underline-offset-2", FOCUS_RING)}>
            Materias
          </Link>{" "}
          para afrontarla.
        </p>
      ) : status.attemptsLeft === 0 ? (
        <p className="text-sm leading-normal text-ash">
          No tienes intentos. Completa una vigilia contra cualquier jefe y ganarás uno.
        </p>
      ) : (
        <p className="text-sm leading-normal text-ash">
          {status.attemptsLeft === 1 ? "Tienes 1 intento" : `Tienes ${status.attemptsLeft} intentos`}.
          Empezar la prueba gasta uno; si no la superas, otra vigilia te da otro.
        </p>
      )}
      <div className="flex flex-col gap-3 @md:flex-row @md:items-center">
        {canStart && (
          // Un <form> con la acción: funciona también sin JavaScript.
          <form action={comenzarPrueba}>
            <button type="submit" className={cn(buttonStyles({ size: "md" }), "w-full cursor-pointer @md:w-auto")}>
              Afrontar la prueba
            </button>
          </form>
        )}
        {back}
      </div>
    </>
  );
}

// "Plazo: hasta el lunes 20 de octubre a las 3:15 p. m., hora de Colombia ·
// Quedan 31 h". El texto de la fecha lo escribe el servidor.
function Deadline({ text, hoursLeft }: { text: string; hoursLeft: number }) {
  return (
    <p className="text-sm leading-normal font-semibold text-ember">
      Plazo: hasta el {text}, hora de Colombia ·{" "}
      <span aria-hidden>{hoursLeft === 1 ? "Queda 1 h" : `Quedan ${hoursLeft} h`}</span>
      <span className="sr-only">{hoursLeft === 1 ? "Queda 1 hora" : `Quedan ${hoursLeft} horas`}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------
//  El resumen
// ---------------------------------------------------------------------------

function SummaryView({
  summary,
  titleId,
  titleRef,
}: {
  summary: TrialSummary;
  titleId: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const souls = summary.recoveredSouls === 1 ? "1 alma" : `${formatNumber(summary.recoveredSouls)} almas`;
  return (
    <>
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className={cn("rounded-sm font-display text-[13px] leading-[normal] tracking-[2px] text-ember uppercase", FOCUS_RING)}
      >
        {summary.passed ? "Prueba superada" : "Prueba no superada"}
      </h2>
      <p className="font-display text-5xl leading-[normal] font-bold text-gold-bright @2xl:text-[56px]">
        {summary.correct} / {summary.total}
        <span className="sr-only"> aciertos</span>
      </p>
      {summary.passWith < PASS && <SealLine passWith={summary.passWith} />}

      {summary.passed ? (
        <>
          <p className="font-display text-[22px] leading-snug font-bold text-parchment">
            Redención cumplida: recuperas {souls}
          </p>
          {summary.newLevel && (
            <p className="font-display text-sm font-bold tracking-[3px] text-ember uppercase">
              Has alcanzado el nivel {summary.newLevel}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-[17px] leading-snug font-semibold text-parchment">
            No ha bastado ({summary.correct} de {summary.total}).{" "}
            {summary.attemptsLeft > 0
              ? `${summary.attemptsLeft === 1 ? "Te queda 1 intento" : `Te quedan ${summary.attemptsLeft} intentos`}: puedes volver a intentarlo.`
              : "Completa otra vigilia para intentarlo de nuevo."}
          </p>
          <Deadline text={summary.deadlineText} hoursLeft={summary.hoursLeft} />
          {summary.failedPrompts.length > 0 && (
            <div className="flex w-full flex-col gap-2 text-left">
              <h3 className="text-[13px] leading-[normal] font-semibold tracking-[1px] text-smoke uppercase">
                Repasa antes del siguiente intento
              </h3>
              <ul className="flex flex-col gap-2">
                {summary.failedPrompts.map((prompt, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-line bg-surface px-3.5 py-3 text-sm leading-[1.45] whitespace-pre-line wrap-anywhere text-parchment"
                  >
                    {prompt}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="mt-1.5 flex w-full flex-col items-center gap-3 @md:flex-row @md:justify-center">
        {!summary.passed && summary.attemptsLeft > 0 && (
          <form action={comenzarPrueba} className="w-full @md:w-auto">
            <button type="submit" className={cn(buttonStyles({ size: "md" }), "w-full cursor-pointer")}>
              Intentarlo de nuevo
            </button>
          </form>
        )}
        <ButtonLink
          href="/mazmorra"
          variant={!summary.passed && summary.attemptsLeft > 0 ? "ghost" : "primary"}
          size="md"
          className="w-full @md:w-auto"
        >
          Volver a la mazmorra
        </ButtonLink>
      </div>
    </>
  );
}

const VERDICTS: Record<Answered["outcome"], { title: string; className: string }> = {
  correct: { title: "¡Correcta!", className: "text-gold-bright" },
  // ember y no blood: el rojo oscuro no se lee sobre el fondo.
  wrong: { title: "Incorrecta", className: "text-ember" },
  dodged: { title: "Has esquivado", className: "text-parchment" },
  skipped: { title: "Pregunta saltada", className: "text-parchment" },
};

// Lo que oye el lector de pantalla al contestar.
function resultSentence(result: Answered): string {
  const correct = result.correctIndex !== null ? ` La correcta era la ${LETTERS[result.correctIndex]}.` : "";
  switch (result.outcome) {
    case "correct":
      return "¡Correcta!";
    case "wrong":
      return `Incorrecta.${correct}`;
    case "dodged":
      return `Has esquivado: cuenta como fallo.${correct}`;
    case "skipped":
      return "Pregunta saltada: ya no existe. No cuenta como acierto.";
  }
}

// "Sello de redención: bastan 3 de 5". Sale en la prueba que lo gastó (se
// gasta al empezarla y la prueba guarda passWith).
function SealLine({ passWith }: { passWith: number }) {
  return (
    <p className="flex items-center gap-2 text-[13px] leading-[normal] font-semibold text-gold">
      <Award aria-hidden size={15} className="shrink-0" />
      Sello de redención: bastan {passWith} de {TOTAL}.
    </p>
  );
}
