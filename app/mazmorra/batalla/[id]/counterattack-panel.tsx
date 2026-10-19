"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type RefObject } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { COUNTERATTACK, EMBER, type CounterattackKind } from "@/lib/game";
import type { PublicQuestion } from "@/lib/questions/types";
import { formatNumber } from "@/lib/text";
import { FOCUS_RING, LETTERS, QuestionView, RevealedView } from "@/app/mazmorra/quiz-views";
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
                    outcome={revealed.result.outcome}
                    correctIndex={revealed.result.correctIndex}
                    explanation={revealed.result.explanation}
                    verdict={VERDICTS[revealed.result.outcome]}
                    optionNote={soulsLabel(revealed.result.soulsDelta, revealed.result.protectedByLevel)}
                    dodgeNote={
                      revealed.result.outcome === "skipped"
                        ? "No cuenta: 0 almas."
                        : `${soulsLabel(revealed.result.soulsDelta, revealed.result.protectedByLevel)}. Esquivar ni da ni quita.`
                    }
                    newLevel={revealed.result.newLevel}
                    explanationRef={explanationRef}
                    // Retírala: solo en las del escriba que se acaban de
                    // contestar (las saltadas ya no existen). key: se reinicia
                    // con cada pregunta.
                    footerStart={
                      revealed.snapshot.question?.fromAgent && revealed.result.outcome !== "skipped" ? (
                        <RetirarPregunta
                          key={revealed.snapshot.number}
                          counterattackId={revealed.snapshot.id}
                          questionNumber={revealed.snapshot.number}
                        />
                      ) : null
                    }
                    nextLabel={revealed.result.summary ? "Ver resumen" : "Siguiente"}
                    onNext={next}
                  />
                ) : current.question ? (
                  <QuestionView
                    question={current.question}
                    pending={pending}
                    onAnswer={answer}
                    stakes={stakesLine(current.question.kind)}
                  />
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

// "Acertar +15 almas · Fallar −5", sacado de COUNTERATTACK (lib/game.ts).
function stakesLine(kind: CounterattackKind): string {
  const { correct, wrong } = COUNTERATTACK.souls[kind];
  if (kind === "GENERIC") return `Contesta con sinceridad · +${correct} almas`;
  return `Acertar +${correct} almas · Fallar −${Math.abs(wrong)}`;
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
//  El resumen (105:157)
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
      {summary.ember && <EmberResult ember={summary.ember} />}
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

// Lo que pasó con la brasa al acertar todas las del banco. Sin summary.ember
// (alguna fallada, esquivada, saltada o genérica) no se pinta nada.
//   earned → la píldora "Has ganado una brasa · N / 2" y para qué sirve;
//   full → la píldora "Tus brasas están completas · 2 / 2";
//   easy-boss → solo una línea pequeña: los fáciles no dan brasa.
// Son textos normales (el lector los lee al recorrer el diálogo); el punto
// es decorativo.
function EmberResult({ ember }: { ember: NonNullable<Summary["ember"]> }) {
  if (ember.outcome === "easy-boss") {
    return (
      <p className="text-xs leading-normal text-smoke">
        Contra jefes medios y difíciles, esto te daría una brasa.
      </p>
    );
  }
  const earned = ember.outcome === "earned";
  return (
    <div className="flex max-w-full flex-col items-center gap-2">
      {/* max-w-full y flex-wrap: a 320 px el texto baja de línea dentro de
          la píldora en vez de desbordar. */}
      <p className="flex max-w-full items-center gap-2 rounded-full border border-ember/50 bg-ember-deep px-3.5 py-1.5 text-[13px] leading-[normal] font-semibold text-ember">
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-ember shadow-[0_0_6px_var(--color-ember)]" />
        <span className="flex flex-wrap justify-center gap-x-1">
          <span>{earned ? "Has ganado una brasa" : "Tus brasas están completas"}</span>{" "}
          <span className="whitespace-nowrap">
            · {ember.embers} / {EMBER.max}
          </span>
        </span>
      </p>
      {earned && (
        <p className="text-xs leading-normal text-ash">
          Si un día no estudias, una brasa se consume y tu llama sigue encendida.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Piezas
// ---------------------------------------------------------------------------

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
