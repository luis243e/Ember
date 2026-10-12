"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type RefObject } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { COUNTERATTACK, type CounterattackKind } from "@/lib/game";
import type { PublicQuestion } from "@/lib/questions/types";
import { formatNumber } from "@/lib/text";
import { responderPregunta, retirarPregunta, type ResultadoRespuesta } from "./actions";

// La pregunta que toca, tal como llega del servidor (page.tsx). number empieza
// en 0. question null = se borró del banco a mitad del contraataque.
export type CounterattackData = {
  id: string;
  number: number;
  total: number;
  question: PublicQuestion | null;
};

type Answered = Extract<ResultadoRespuesta, { ok: true }>;
type Summary = NonNullable<Answered["summary"]>;

type CounterattackPanelProps = {
  // El contraataque sin terminar, o null.
  counterattack: CounterattackData | null;
  boss: { name: string; article: "El" | "La" };
  // Acaba de asestarse un golpe en esta visita: el panel espera a que suban
  // el "−100" y el "+N almas" antes de aparecer. Al recargar sale enseguida.
  afterStrike: boolean;
  // Avisa a la batalla de si el panel está abierto (para dejar el fondo
  // inerte y devolver el foco al cerrarlo).
  onOpenChange: (open: boolean) => void;
};

const LETTERS = ["A", "B", "C", "D"];

// El mismo contorno de foco que los botones (buttonStyles).
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";

// Panel del contraataque (Figma: "FASE 2 · contraataque", pregunta,
// respuesta correcta y resumen). Es un diálogo modal sobre la escena: la
// batalla de detrás queda inerte mientras está abierto.
//
// El navegador NO decide nada: manda "contesto la pregunta N con la opción
// mostrada X" y el servidor responde si acertó, cuál era la correcta (en el
// orden mostrado), la explicación y las almas. Hasta entonces, aquí no hay
// ni correcta ni explicación.
export function CounterattackPanel({
  counterattack,
  boss,
  afterStrike,
  onOpenChange,
}: CounterattackPanelProps) {
  const [pending, startTransition] = useTransition();
  // La pregunta contestada se queda fija hasta pulsar SIGUIENTE, aunque el
  // refresh() de la acción ya haya traído la siguiente en las props.
  const [revealed, setRevealed] = useState<{
    snapshot: CounterattackData;
    chosen: number | null;
    result: Answered;
  } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Región viva: el resultado de cada respuesta para el lector de pantalla.
  const [announcement, setAnnouncement] = useState("");

  const view = summary ? "summary" : revealed ? "revealed" : counterattack ? "question" : null;
  const current = revealed?.snapshot ?? counterattack;
  const open = view !== null;

  useEffect(() => {
    onOpenChange(open);
  }, [open, onOpenChange]);

  // Foco: al enunciado con cada pregunta nueva, a la explicación al contestar
  // y al título del resumen al terminar. tabIndex -1 en esos elementos: se
  // pueden enfocar desde el código sin entrar en el orden del Tab.
  const promptRef = useRef<HTMLHeadingElement>(null);
  const explanationRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const questionNumber = current?.number;
  useEffect(() => {
    if (view === "question") promptRef.current?.focus();
    else if (view === "revealed") explanationRef.current?.focus();
    else if (view === "summary") summaryRef.current?.focus();
  }, [view, questionNumber]);

  if (!open) return null;

  function answer(chosen: number | null) {
    // Ya hay una respuesta en camino: un segundo clic no manda otra.
    if (pending || !counterattack || revealed) return;
    const snapshot = counterattack;
    setError(null);
    startTransition(async () => {
      const result = await responderPregunta(snapshot.id, snapshot.number, chosen);
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
    if (revealed?.result.summary) setSummary(revealed.result.summary);
    setRevealed(null);
    setError(null);
  }

  // Teclas 1–4 (o 1–2): contestan la opción de ese número.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (view !== "question" || !counterattack?.question) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const n = Number(event.key);
    if (Number.isInteger(n) && n >= 1 && n <= counterattack.question.options.length) {
      event.preventDefault();
      answer(n - 1);
    }
  }

  const titleId = "contraataque-titulo";

  return (
    // Velo sobre toda la pantalla (night al 78 %). Si el panel no cabe en
    // alto (móvil), se desplaza el velo, nunca la página de detrás.
    <div
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto bg-night/78",
        afterStrike && "motion-safe:animate-[reveal_0.4s_ease-out_1.2s_both] motion-reduce:animate-counter-in-still",
      )}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onKeyDown={handleKeyDown}
          className={cn(
            "flex w-full max-w-[660px] flex-col rounded-[14px] border border-line bg-night-alt/97 px-5 py-6 shadow-[0_16px_48px_rgba(0,0,0,0.6)] @2xl:px-8",
            view === "summary" ? "items-center gap-3.5 text-center @2xl:py-9" : "gap-4.5 @2xl:py-7",
            afterStrike && "motion-safe:animate-counter-in",
          )}
        >
          {view === "summary" && summary ? (
            <SummaryView summary={summary} titleId={titleId} titleRef={summaryRef} onContinue={() => setSummary(null)} />
          ) : (
            current && (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2
                    id={titleId}
                    className="font-display text-[13px] leading-[normal] tracking-[2px] text-ember uppercase"
                  >
                    {boss.article} {boss.name} contraataca
                  </h2>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Repaso: vuelve porque la fallaste la última vez. */}
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
                    result={revealed.result}
                    explanationRef={explanationRef}
                    onNext={next}
                    retire={
                      // Solo en las del escriba que se acaban de contestar
                      // (las saltadas ya no existen).
                      revealed.snapshot.question?.fromAgent && revealed.result.outcome !== "skipped"
                        ? { counterattackId: revealed.snapshot.id, questionNumber: revealed.snapshot.number }
                        : null
                    }
                  />
                ) : current.question ? (
                  <QuestionView question={current.question} pending={pending} onAnswer={answer} />
                ) : (
                  // Se borró del banco a mitad del contraataque: al seguir,
                  // la acción la salta sin almas.
                  <>
                    <p className="text-sm leading-normal text-ash">
                      Se borró del banco a mitad del contraataque. No cuenta ni da almas.
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
            )
          )}

          <p role="status" className="sr-only">
            {announcement}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  La pregunta (105:2)
// ---------------------------------------------------------------------------

function QuestionView({
  question,
  pending,
  onAnswer,
}: {
  question: PublicQuestion;
  pending: boolean;
  onAnswer: (chosen: number | null) => void;
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
        <p className="text-xs leading-[normal] text-smoke">{stakesLine(question.kind)}</p>
      </div>
    </>
  );
}

// "Acertar +15 almas · Fallar −5", sacado de COUNTERATTACK (lib/game.ts).
function stakesLine(kind: CounterattackKind): string {
  const { correct, wrong } = COUNTERATTACK.souls[kind];
  if (kind === "GENERIC") return `Contesta con sinceridad · +${correct} almas`;
  return `Acertar +${correct} almas · Fallar −${Math.abs(wrong)}`;
}

// ---------------------------------------------------------------------------
//  La respuesta (105:77 y su variante de fallo)
// ---------------------------------------------------------------------------

function RevealedView({
  question,
  chosen,
  result,
  explanationRef,
  onNext,
  retire,
}: {
  question: PublicQuestion | null;
  chosen: number | null;
  result: Answered;
  explanationRef: RefObject<HTMLDivElement | null>;
  onNext: () => void;
  // La pregunta se puede retirar (es del escriba): con qué se pide.
  retire: { counterattackId: string; questionNumber: number } | null;
}) {
  const verdict = VERDICTS[result.outcome];
  // Las almas que se enseñan junto a la opción elegida, o en la explicación
  // si no se eligió ninguna (esquivar, pregunta saltada).
  const soulsText = soulsLabel(result.soulsDelta, result.protectedByLevel);

  return (
    <>
      {question && (
        <ul className="flex flex-col gap-2.5">
          {question.options.map((option, i) => {
            const isCorrect = result.correctIndex === i;
            const isChosen = chosen === i;
            // En las genéricas no hay correcta: se marca en dorado la elegida.
            const good = isCorrect || (result.outcome === "answered" && isChosen);
            const bad = isChosen && result.outcome === "wrong";
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
                    {isChosen && soulsText}
                  </span>
                )}
                {bad && (
                  <span className="flex shrink-0 items-center gap-1.5 text-right text-sm leading-[normal] font-semibold text-parchment">
                    <X aria-hidden size={14} />
                    {soulsText}
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
        {chosen === null && (
          <p className="text-sm font-semibold text-parchment">
            {result.outcome === "skipped" ? "No cuenta: 0 almas." : `${soulsText}. Esquivar ni da ni quita.`}
          </p>
        )}
        {result.explanation && (
          <p className="text-sm leading-normal wrap-anywhere text-ash">{result.explanation}</p>
        )}
        {result.newLevel && (
          <p className="pt-1 font-display text-sm font-bold tracking-[3px] text-ember uppercase">
            Has alcanzado el nivel {result.newLevel}
          </p>
        )}
      </div>

      {/* Pie: "Retírala" a la izquierda (solo del escriba) y SIGUIENTE a la
          derecha. En móvil, uno encima del otro. key: se reinicia con cada
          pregunta. */}
      <div className="flex flex-col gap-3 @md:flex-row @md:items-end @md:justify-between">
        {retire ? <RetirarPregunta key={retire.questionNumber} {...retire} /> : <span aria-hidden />}
        <button
          type="button"
          onClick={onNext}
          className={cn(buttonStyles({ size: "md" }), "w-full shrink-0 cursor-pointer @md:w-auto")}
        >
          {result.summary ? "Ver resumen" : "Siguiente"}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
//  Retirar una pregunta del escriba (108:84)
// ---------------------------------------------------------------------------

// "¿Está mal esta pregunta? Retírala". Pide confirmación en el propio pie
// (nada de confirm() del navegador) y la borra del banco. Las almas de esta
// respuesta no cambian. El navegador manda el contraataque y el número de
// pregunta; cuál es la pregunta lo sabe solo el servidor.
function RetirarPregunta({
  counterattackId,
  questionNumber,
}: {
  counterattackId: string;
  questionNumber: number;
}) {
  const [view, setView] = useState<"link" | "confirm" | "done">("link");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const linkRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  // Si el foco tiene que volver al enlace al cancelar (y no al montar).
  const backToLink = useRef(false);

  // El botón con el foco desaparece al cambiar de vista: el foco se lleva al
  // equivalente. Al confirmar, a "Cancelar" (lo seguro); al cancelar, al
  // enlace; al terminar, al aviso.
  useEffect(() => {
    if (view === "confirm") cancelRef.current?.focus();
    else if (view === "done") doneRef.current?.focus();
    else if (backToLink.current) {
      backToLink.current = false;
      linkRef.current?.focus();
    }
  }, [view]);

  function confirm() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await retirarPregunta(counterattackId, questionNumber);
        if (result.ok) setView("done");
        else setError(result.error);
      } catch {
        setError("No se ha podido retirar. Inténtalo de nuevo.");
      }
    });
  }

  if (view === "done") {
    return (
      <p
        ref={doneRef}
        tabIndex={-1}
        role="status"
        className={cn("rounded-sm text-[13px] leading-[normal] text-ash", FOCUS_RING)}
      >
        Retirada del banco. No volverá a salir.
      </p>
    );
  }

  if (view === "confirm") {
    return (
      <div className="flex min-w-0 flex-col gap-2.5 rounded-md border border-blood bg-blood/16 px-3.5 py-3">
        <p className="text-sm leading-[1.45] text-parchment">¿Retirar del banco? No volverá a salir.</p>
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={confirm}
            aria-disabled={pending || undefined}
            className={cn(
              "inline-flex h-11 cursor-pointer items-center rounded-md bg-blood px-4 text-sm leading-none font-semibold text-parchment transition-colors hover:bg-blood/80 aria-disabled:cursor-wait aria-disabled:opacity-60",
              FOCUS_RING,
            )}
          >
            {pending ? "Retirando..." : "Sí, retirar"}
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={() => {
              backToLink.current = true;
              setError(null);
              setView("link");
            }}
            className={cn(
              "inline-flex h-11 cursor-pointer items-center rounded-sm px-2 text-sm leading-none font-semibold text-ash transition-colors hover:text-parchment",
              FOCUS_RING,
            )}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      ref={linkRef}
      type="button"
      onClick={() => setView("confirm")}
      className={cn(
        "-mx-1 inline-flex min-h-11 cursor-pointer items-center self-start rounded-sm px-1 text-left text-[13px] leading-[normal] font-semibold text-ash underline underline-offset-2 transition-colors hover:text-parchment @md:self-auto",
        FOCUS_RING,
      )}
    >
      ¿Está mal esta pregunta? Retírala
    </button>
  );
}

const VERDICTS: Record<Answered["outcome"], { title: string; className: string }> = {
  correct: { title: "¡Golpe parado!", className: "text-gold-bright" },
  answered: { title: "Respuesta anotada", className: "text-gold-bright" },
  // ember y no blood: el rojo oscuro no se lee sobre el fondo.
  wrong: { title: "Te ha alcanzado", className: "text-ember" },
  dodged: { title: "Has esquivado", className: "text-parchment" },
  skipped: { title: "Pregunta saltada", className: "text-parchment" },
};

// ---------------------------------------------------------------------------
//  El resumen (105:157, sin la brasa: es el paso 4)
// ---------------------------------------------------------------------------

function SummaryView({
  summary,
  titleId,
  titleRef,
  onContinue,
}: {
  summary: Summary;
  titleId: string;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onContinue: () => void;
}) {
  const title =
    summary.correct === summary.total
      ? "Contraataque repelido"
      : summary.correct > 0
        ? "Contraataque resistido"
        : "El contraataque te ha alcanzado";
  return (
    <>
      <h2
        id={titleId}
        ref={titleRef}
        tabIndex={-1}
        className={cn(
          "rounded-sm font-display text-[13px] leading-[normal] tracking-[2px] text-ember uppercase",
          FOCUS_RING,
        )}
      >
        {title}
      </h2>
      <p className="font-display text-5xl leading-[normal] font-bold text-gold-bright @2xl:text-[56px]">
        {summary.correct} / {summary.total}
        <span className="sr-only"> preguntas superadas</span>
      </p>
      <p className="font-display text-[22px] leading-[normal] font-bold text-parchment">
        {soulsLabel(summary.souls, false)}
      </p>
      <button
        type="button"
        onClick={onContinue}
        className={cn(buttonStyles({ size: "md" }), "mt-1.5 cursor-pointer")}
      >
        Continuar
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
//  Piezas
// ---------------------------------------------------------------------------

function Letter({ index, bright = false }: { index: number; bright?: boolean }) {
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

// "+15 almas", "−5 almas", "0 almas" o, si el nivel absorbió la pérdida,
// "0 almas · tu nivel te protege" (o "−3 almas · …" si solo una parte).
function soulsLabel(delta: number, protectedByLevel: boolean): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const abs = Math.abs(delta);
  const text = `${sign}${formatNumber(abs)} ${abs === 1 ? "alma" : "almas"}`;
  return protectedByLevel ? `${text} · tu nivel te protege` : text;
}

// Lo que oye el lector de pantalla al contestar.
function resultSentence(result: Answered): string {
  const souls = soulsLabel(result.soulsDelta, result.protectedByLevel);
  const level = result.newLevel ? ` Has alcanzado el nivel ${result.newLevel}.` : "";
  const correct =
    result.correctIndex !== null ? ` La correcta era la ${LETTERS[result.correctIndex]}.` : "";
  switch (result.outcome) {
    case "correct":
      return `¡Golpe parado! Respuesta correcta: ${souls}.${level}`;
    case "answered":
      return `Respuesta anotada: ${souls}.${level}`;
    case "wrong":
      return `Te ha alcanzado. Respuesta incorrecta: ${souls}.${correct}`;
    case "dodged":
      return `Has esquivado: ${souls}.${correct}`;
    case "skipped":
      return "Pregunta saltada: ya no existe. No cuenta.";
  }
}
