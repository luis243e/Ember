"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Pause, Swords } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { TaskStatus } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonStyles } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { HpBar } from "@/components/ui/hp-bar";
import { cn } from "@/lib/cn";
import { HP_PER_BLOCK } from "@/lib/game";
import { formatNumber } from "@/lib/text";
import {
  abandonarVigilia,
  asestarGolpe,
  comenzarVigilia,
  type ResultadoBatalla,
} from "./actions";
import { formatCountdown } from "./countdown";

type BatallaProps = {
  task: {
    id: string;
    name: string;
    subjectName: string;
    difficultyLabel: string;
    maxHp: number;
    currentHp: number;
    status: TaskStatus;
  };
  boss: { name: string; src: string };
  // Vigilia abierta contra ESTE jefe (endsAt en milisegundos), o null.
  vigil: { endsAt: number } | null;
  // Vigilia abierta contra OTRO jefe, o null. Las dos no pueden darse a la vez.
  otherVigil: { taskId: string; taskName: string } | null;
  durationMs: number;
  serverNow: number;
  summary: { vigils: number; minutes: number };
  // Almas guardadas del golpe final y de la victoria, o null.
  reward: { strikeSouls: number; victorySouls: number } | null;
};

// idle = sin vigilia; running = vigilia en curso; ready = cumplida, falta el
// golpe; defeated = el jefe ya cayó.
type Phase = "idle" | "running" | "ready" | "defeated";

const CLOCK_LABELS: Record<Phase, string> = {
  idle: "Próxima vigilia",
  running: "Vigilia en curso",
  ready: "Vigilia cumplida",
  defeated: "",
};

// El mismo contorno de foco que los botones (buttonStyles).
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";

// Pantalla de batalla (Figma "BATALLA FINAL": lista, vigilia en curso, golpe
// listo, victoria y móvil). Un solo árbol para móvil y escritorio: las
// consultas de contenedor (@2xl, 42rem) deciden si la banda, el reloj y el
// botón van encima de la escena o debajo.
export function Batalla({
  task,
  boss,
  vigil,
  otherVigil,
  durationMs,
  serverNow,
  summary,
  reward,
}: BatallaProps) {
  // Hora actual, siempre en la escala del SERVIDOR. Empieza en serverNow para
  // que el primer pintado del navegador coincida con el del servidor.
  const [now, setNow] = useState(serverNow);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Texto de la región viva: solo cambios de estado, nunca cada segundo.
  const [announcement, setAnnouncement] = useState("");
  const [confirming, setConfirming] = useState(false);
  // Golpes asestados en esta visita: su número reinicia el tajo, el "−100" y
  // el "+N almas" (las del último golpe, que da la acción).
  const [strikes, setStrikes] = useState(0);
  const [strikeSouls, setStrikeSouls] = useState(0);
  // Nivel alcanzado con el último golpe. Solo vive aquí, en el momento: al
  // recargar o con la siguiente acción desaparece.
  const [newLevel, setNewLevel] = useState<number | null>(null);
  const [hitting, setHitting] = useState(false);
  const [justDefeated, setJustDefeated] = useState(false);
  const paused = useSyncExternalStore(subscribePause, readPause, () => false);

  const endsAt = vigil?.endsAt ?? null;
  // Tras un refresh llega un serverNow más reciente que el último tic.
  const currentNow = Math.max(now, serverNow);
  const remaining = endsAt === null ? durationMs : endsAt - currentNow;

  const defeated = task.status === "DEFEATED";
  const phase: Phase = defeated
    ? "defeated"
    : endsAt === null
      ? "idle"
      : remaining > 0
        ? "running"
        : "ready";
  const showConfirm = confirming && phase === "running";
  // Otro jefe tiene la vigilia abierta: aquí no se puede comenzar.
  const blockedByOther = phase === "idle" && otherVigil !== null;

  // La cuenta atrás. No resta 1 a un contador: en cada tic recalcula lo que
  // falta a partir de las marcas de tiempo del servidor. Así no se desajusta
  // si la pestaña pasa a segundo plano (el navegador frena los temporizadores)
  // ni si el reloj del ordenador está mal puesto.
  useEffect(() => {
    if (endsAt === null) return;
    // Diferencia entre el reloj del servidor y el de este ordenador. Incluye
    // lo que tardó la página en llegar, así que el error solo puede RETRASAR
    // el cero, nunca adelantarlo: el golpe nunca se pide antes de tiempo.
    const offset = serverNow - Date.now();
    let wasRunning = endsAt - (Date.now() + offset) > 0;

    const tick = () => {
      const t = Date.now() + offset;
      setNow(t);
      if (wasRunning && t >= endsAt) {
        wasRunning = false;
        setAnnouncement("Vigilia cumplida. Ya puedes asestar el golpe.");
      }
    };
    const id = window.setInterval(tick, 250);
    // Al volver a la pestaña, actualizar al momento.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [endsAt, serverNow]);

  // Foco del paso de confirmación: al abrirlo va a "Seguir luchando" (la
  // opción segura); al cerrarlo vuelve al botón principal.
  const mainButtonRef = useRef<HTMLButtonElement>(null);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (showConfirm) stayButtonRef.current?.focus();
    else if (wasConfirming.current) mainButtonRef.current?.focus();
    wasConfirming.current = showConfirm;
  }, [showConfirm]);

  // Llama a una acción con solo el id de la tarea. La acción ya vuelve a
  // pintar la página (refresh), así que aquí solo hay mensajes y animación.
  function run(
    action: (taskId: string) => Promise<ResultadoBatalla>,
    onOk: (result: Extract<ResultadoBatalla, { ok: true }>) => void,
  ) {
    setError(null);
    setNewLevel(null);
    startTransition(async () => {
      const result = await action(task.id);
      setConfirming(false);
      if (result.ok) onOk(result);
      else setError(result.error);
    });
  }

  function handleMainClick() {
    // Ya hay una petición en camino: un segundo clic no manda otra.
    if (pending) return;
    if (phase === "idle") {
      run(comenzarVigilia, () =>
        setAnnouncement(`Vigilia comenzada. Dura ${durationText(durationMs)}.`),
      );
    } else if (phase === "running") {
      setConfirming(true);
    } else if (phase === "ready") {
      run(asestarGolpe, (result) => {
        const souls = result.strikeSouls ?? 0;
        setStrikes((n) => n + 1);
        setStrikeSouls(souls);
        setHitting(true);
        setNewLevel(result.newLevel ?? null);
        const levelText = result.newLevel ? ` Has alcanzado el nivel ${result.newLevel}.` : "";
        if (result.defeated) {
          setJustDefeated(true);
          setAnnouncement(
            `Abominación vencida. Ganas ${formatNumber(souls)} almas del golpe y ${formatNumber(result.victorySouls ?? 0)} por la victoria.${levelText}`,
          );
        } else {
          setAnnouncement(
            `Golpe asestado. Ganas ${formatNumber(souls)} almas. Al jefe le quedan ${result.currentHp} de ${task.maxHp} de vida.${levelText}`,
          );
        }
      });
    }
  }

  function handleAbandon() {
    run(abandonarVigilia, () =>
      setAnnouncement("Vigilia abandonada. El jefe no ha recibido daño."),
    );
  }

  const hint = otherVigil
    ? null
    : phase === "running"
      ? "La vigilia no se puede pausar. Si abandonas, el jefe no recibe daño."
      : phase === "ready"
        ? `Has resistido los ${durationText(durationMs)}. Asesta el golpe.`
        : `Cada vigilia dura ${durationText(durationMs)} y le quita ${HP_PER_BLOCK} de vida al jefe.`;

  return (
    // @container: los puntos de corte de esta pantalla miran su ancho.
    <div className="@container flex flex-1 flex-col">
      {/* Barra superior: sin barra lateral, es una pantalla de concentración. */}
      <header className="flex h-14 items-center justify-between gap-3 px-2 @2xl:h-16 @2xl:border-b @2xl:border-line @2xl:px-10">
        <Link
          href="/mazmorra"
          className={cn(
            "flex h-11 shrink-0 items-center gap-2 rounded-md px-2 text-sm leading-[normal] font-medium text-ash transition-colors hover:text-parchment",
            FOCUS_RING,
          )}
        >
          <ArrowLeft aria-hidden size={16} />
          <span className="@2xl:hidden">Mazmorra</span>
          <span className="hidden @2xl:inline">Volver a la mazmorra</span>
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          {/* En móvil la materia va bajo la escena, con el nombre. */}
          <p className="hidden truncate text-sm leading-[normal] text-smoke @2xl:block">
            {task.subjectName}
          </p>
          <Badge>{task.difficultyLabel}</Badge>
          {/* Pausa la respiración de la escena (WCAG 2.2.2). Con movimiento
              reducido no hay nada que pausar, así que no aparece. */}
          {!defeated && (
            <button
              type="button"
              aria-pressed={paused}
              aria-label="Pausar movimiento"
              title="Pausar movimiento"
              onClick={() => writePause(!paused)}
              className={cn(
                "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-ash transition-colors hover:text-parchment motion-reduce:hidden aria-pressed:text-gold-bright",
                FOCUS_RING,
              )}
            >
              <Pause aria-hidden size={18} />
            </button>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col @2xl:items-center @2xl:justify-center @2xl:gap-4 @2xl:px-6 @2xl:py-8">
        {/* Escena. En escritorio es un marco 16:9 con todo encima; en móvil,
            la imagen arriba y el resto debajo. El ancho máximo hace que quepa
            entera en la ventana sin desplazarse. */}
        <section
          aria-labelledby="nombre-jefe"
          className="relative w-full @2xl:aspect-video @2xl:max-w-[min(75rem,max(36rem,calc((100dvh_-_11rem)*16/9)))] @2xl:overflow-hidden @2xl:rounded-xl @2xl:border @2xl:border-line @2xl:bg-surface"
        >
          {/* La ilustración y sus efectos. Tres capas para que los
              movimientos no se pisen (cada uno usa su propio transform):
              respiración fuera, sacudida en medio, destello/gris dentro. */}
          <div className="relative aspect-video overflow-hidden bg-surface @2xl:absolute @2xl:inset-0 @2xl:aspect-auto">
            <div
              className={cn("absolute inset-0", !defeated && "motion-safe:animate-drift")}
              // La pausa va en línea y no como clase: el atajo "animation:" de
              // animate-drift va dentro de un @media que Tailwind escribe
              // después y devolvería animation-play-state a running.
              style={paused ? { animationPlayState: "paused" } : undefined}
            >
              <div
                className={cn("absolute inset-0", hitting && "motion-safe:animate-struck")}
                onAnimationEnd={(event) => {
                  if (event.animationName === "struck") setHitting(false);
                }}
              >
                <Image
                  src={boss.src}
                  alt={boss.name}
                  fill
                  preload
                  sizes="(min-width: 1248px) 1200px, 100vw"
                  className={cn(
                    "object-cover",
                    // El gris final queda fijo; la animación solo lleva hasta él.
                    defeated && "opacity-90 brightness-55 grayscale",
                    justDefeated && "motion-safe:animate-perish",
                  )}
                />
              </div>
            </div>

            {/* Viñeta suave: oscurece los bordes. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-radial from-transparent from-55% to-night/70"
            />

            {/* Tajo, "−100" y "+N almas". key: cada golpe crea elementos
                nuevos y la animación vuelve a empezar. Los dos números suben
                juntos. Con movimiento reducido el tajo no aparece y los
                números solo aparecen y se desvanecen. */}
            {strikes > 0 && (
              <div key={strikes} aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute top-1/2 left-[15%] h-1 w-[70%] rounded-full bg-linear-to-r from-transparent via-parchment to-transparent opacity-0 shadow-[0_0_18px_var(--color-ember)] motion-safe:animate-slash" />
                <div className="absolute top-[34%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 font-display leading-[normal] font-bold whitespace-nowrap opacity-0 [text-shadow:0_2px_12px_var(--color-night)] motion-safe:animate-rise motion-reduce:animate-fade-out">
                  <p className="text-4xl text-gold-bright @2xl:text-6xl">−{HP_PER_BLOCK}</p>
                  <p className="text-base tracking-[1px] text-parchment @2xl:text-[22px]">
                    +{formatNumber(strikeSouls)} almas
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Oscurece SOLO la esquina de la banda (night → transparente), para
              que el texto se lea sin tapar la escena. Medido contra las seis
              ilustraciones: el peor caso (liche a 768 px con un nombre de
              dos líneas) da 5,5:1 en la criatura dorada; con night/60 daba
              4,6:1. */}
          {!defeated && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 hidden h-3/5 w-3/5 bg-radial-[ellipse_at_top_left] from-night/92 via-night/75 via-40% to-transparent to-80% @2xl:block"
            />
          )}

          {/* Banda de vida. En escritorio, arriba a la izquierda y como mucho
              el 40 % del ancho: en las seis ilustraciones esa esquina no tiene
              ninguna cabeza. En la victoria solo queda para el lector de
              pantalla (el h1 de la página). */}
          <div
            className={
              defeated
                ? "sr-only"
                : "flex flex-col gap-5 px-4 pt-5 @2xl:absolute @2xl:top-0 @2xl:left-0 @2xl:w-2/5 @2xl:gap-3 @2xl:px-8 @2xl:pt-6"
            }
          >
            <div className="flex flex-col gap-1.5 leading-[normal] @2xl:gap-1">
              <Eyebrow className="@2xl:hidden">{task.subjectName}</Eyebrow>
              {/* Dos líneas como mucho sobre la escena; el texto completo
                  sigue en el HTML para el lector de pantalla. */}
              <h1
                id="nombre-jefe"
                className="font-display text-2xl font-bold wrap-anywhere text-parchment @2xl:line-clamp-2 @2xl:text-[22px]"
              >
                {task.name}
              </h1>
              <p className="text-[11px] font-semibold tracking-[1.5px] text-gold uppercase @2xl:text-xs">
                {boss.name}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="flex items-center justify-between leading-[normal]">
                <span className="text-[11px] font-medium tracking-[1px] text-smoke uppercase @2xl:text-ash">
                  Vida
                </span>
                <span className="text-[13px] font-semibold text-parchment @2xl:text-sm">
                  {task.currentHp} / {task.maxHp}
                </span>
              </p>
              <HpBar current={task.currentHp} max={task.maxHp} size="lg" />
            </div>
          </div>

          {/* Reloj y botón: abajo, uno a cada lado (escritorio) o apilados. */}
          {!defeated && (
            <div className="flex flex-col gap-5 px-4 pt-5 @2xl:absolute @2xl:inset-x-0 @2xl:bottom-0 @2xl:flex-row @2xl:items-end @2xl:justify-between @2xl:gap-4 @2xl:p-5">
              <div className="flex flex-col items-center gap-0.5 rounded-[10px] border border-line bg-surface px-5 pt-4.5 pb-3.5 leading-[normal] whitespace-nowrap @2xl:rounded-lg @2xl:bg-night/92 @2xl:px-5.5 @2xl:pt-3.5 @2xl:pb-3">
                <p className="font-display text-[13px] tracking-[2px] text-gold uppercase">
                  {CLOCK_LABELS[phase]}
                </p>
                {/* role="timer" no se anuncia solo: el lector lo lee si el
                    usuario llega a él, no cada segundo. */}
                <p
                  role="timer"
                  className="font-display text-6xl leading-none font-bold text-gold-bright tabular-nums"
                >
                  {formatCountdown(remaining)}
                </p>
              </div>

              {showConfirm ? (
                // Confirmación en dos pasos, dentro de la pantalla.
                <div
                  role="group"
                  aria-labelledby="pregunta-abandonar"
                  className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4 @2xl:bg-night/92"
                >
                  <p id="pregunta-abandonar" className="text-sm leading-[normal] text-parchment">
                    ¿Abandonar la vigilia? El jefe no recibirá daño.
                  </p>
                  <div className="flex flex-col gap-2 @md:flex-row">
                    <button
                      type="button"
                      onClick={handleAbandon}
                      disabled={pending}
                      className={cn(buttonStyles({ variant: "ghost", size: "md" }), "cursor-pointer")}
                    >
                      {pending ? "Abandonando…" : "Sí, abandonar"}
                    </button>
                    <button
                      ref={stayButtonRef}
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={pending}
                      className={cn(buttonStyles({ size: "md" }), "cursor-pointer")}
                    >
                      Seguir luchando
                    </button>
                  </div>
                </div>
              ) : (
                // Un solo <button> para los tres estados: cambia el texto pero
                // no el elemento, así el foco no se pierde al cambiar de fase.
                // Mientras espera la respuesta usa aria-disabled y no
                // disabled: un botón con el foco que pasa a disabled lo
                // pierde (se va a <body>). disabled solo cuando hay otra
                // vigilia abierta: ahí el botón no se puede usar.
                <button
                  ref={mainButtonRef}
                  type="button"
                  onClick={handleMainClick}
                  disabled={blockedByOther}
                  aria-disabled={pending || undefined}
                  className={cn(
                    buttonStyles({ variant: phase === "running" ? "ghost" : "primary" }),
                    "w-full cursor-pointer aria-disabled:cursor-wait aria-disabled:opacity-60 @2xl:w-auto",
                  )}
                >
                  {phase !== "running" && <Swords aria-hidden size={16} />}
                  {mainLabel(phase, pending)}
                </button>
              )}
            </div>
          )}

          {/* Victoria: el jefe en gris y el mensaje. Si acaba de caer, el
              mensaje aparece cuando termina la animación. */}
          {defeated && (
            <div
              className={cn(
                "flex flex-col items-center gap-4 px-4 py-8 text-center @2xl:absolute @2xl:inset-0 @2xl:justify-center @2xl:bg-night/72",
                justDefeated && "motion-safe:animate-reveal",
              )}
            >
              <Eyebrow>El jefe ha caído</Eyebrow>
              <h2 className="font-display text-[28px] leading-[normal] font-bold tracking-[2px] text-gold-bright uppercase @2xl:text-[40px] @2xl:tracking-[4px] @5xl:text-[56px]">
                Abominación vencida
              </h2>
              <p className="text-[15px] leading-normal wrap-anywhere text-ash @2xl:text-[17px]">
                {victorySentence(task.name, summary)}
              </p>
              {(reward || newLevel) && (
                <div className="flex flex-col items-center gap-1.5 leading-[normal]">
                  {/* En una línea con el punto en medio desde @md (28rem); en
                      pantallas más estrechas no cabe, y cada parte va en su
                      línea, sin punto. */}
                  {reward && (
                    <p className="text-[15px] font-semibold text-gold-bright @2xl:text-[17px]">
                      <span className="block whitespace-nowrap @md:inline">
                        +{formatNumber(reward.strikeSouls)} almas del golpe
                      </span>{" "}
                      <span className="hidden @md:inline">
                        <span className="mx-1">·</span>{" "}
                      </span>
                      <span className="block whitespace-nowrap @md:inline">
                        +{formatNumber(reward.victorySouls)} almas por la victoria
                      </span>
                    </p>
                  )}
                  {newLevel && <LevelUp level={newLevel} />}
                </div>
              )}
              <ButtonLink href="/mazmorra" className="mt-4">
                Volver a la mazmorra
              </ButtonLink>
            </div>
          )}
        </section>

        {/* Debajo de la escena: errores, aviso de otra vigilia o ayuda. */}
        {!defeated && (
          <div className="flex w-full flex-col gap-3 px-4 pt-5 pb-8 @2xl:max-w-3xl @2xl:items-center @2xl:p-0">
            {error && <Alert className="w-full @2xl:w-auto">{error}</Alert>}
            {/* Si el golpe fue el final, el nivel sale en la victoria: aquí
                no, ni en el instante en que llega la respuesta y la página
                aún no se ha repintado. */}
            {newLevel && !justDefeated && <LevelUp level={newLevel} />}
            {otherVigil && phase === "idle" && (
              <p className="text-center text-[13px] leading-normal text-ash">
                Ya tienes una vigilia en curso contra «{otherVigil.taskName}». Termínala o
                abandónala antes de empezar otra.{" "}
                <Link
                  href={`/mazmorra/batalla/${otherVigil.taskId}`}
                  className={cn(
                    "rounded-sm font-semibold text-gold-bright underline underline-offset-2",
                    FOCUS_RING,
                  )}
                >
                  Ir a esa batalla
                </Link>
              </p>
            )}
            {hint && (
              <p className="text-center text-[13px] leading-normal text-smoke">{hint}</p>
            )}
          </div>
        )}
      </main>

      {/* Región viva: anuncia los cambios de estado al lector de pantalla. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

// "HAS ALCANZADO EL NIVEL 8": en la victoria o, con un golpe normal, debajo
// de la escena.
function LevelUp({ level }: { level: number }) {
  return (
    <p className="text-center font-display text-sm leading-[normal] font-bold tracking-[3px] text-ember uppercase @2xl:text-base">
      Has alcanzado el nivel {level}
    </p>
  );
}

function mainLabel(phase: Phase, pending: boolean): string {
  if (phase === "running") return "Abandonar";
  if (phase === "ready") return pending ? "Asestando…" : "Asestar golpe";
  return pending ? "Comenzando…" : "Comenzar vigilia";
}

// "25 minutos"; con la vigilia corta de prueba, "20 segundos".
function durationText(ms: number): string {
  if (ms % 60_000 === 0) return plural(ms / 60_000, "minuto", "minutos");
  return plural(Math.round(ms / 1000), "segundo", "segundos");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// "El Parcial Final cayó tras 6 vigilias: 150 minutos de estudio."
function victorySentence(name: string, { vigils, minutes }: BatallaProps["summary"]): string {
  return `${name} cayó tras ${plural(vigils, "vigilia", "vigilias")}: ${plural(minutes, "minuto", "minutos")} de estudio.`;
}

// ---------------------------------------------------------------------------
//  "Pausar movimiento", recordado en localStorage.
//  useSyncExternalStore lee el valor guardado DESPUÉS de hidratar: en el
//  servidor y en el primer pintado usa false (getServerSnapshot), así que el
//  HTML coincide, y luego React vuelve a pintar con lo guardado.
// ---------------------------------------------------------------------------

const PAUSE_KEY = "ember:pausar-movimiento";
const pauseListeners = new Set<() => void>();
// Respaldo en memoria por si localStorage no está disponible (modo privado,
// datos bloqueados): el botón sigue funcionando, solo no se recuerda.
let pauseInMemory: boolean | null = null;

function subscribePause(listener: () => void) {
  pauseListeners.add(listener);
  return () => {
    pauseListeners.delete(listener);
  };
}

function readPause(): boolean {
  if (pauseInMemory !== null) return pauseInMemory;
  try {
    return localStorage.getItem(PAUSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePause(value: boolean) {
  pauseInMemory = value;
  try {
    localStorage.setItem(PAUSE_KEY, value ? "1" : "0");
  } catch {
    // Sin almacenamiento: queda solo en memoria.
  }
  pauseListeners.forEach((listener) => listener());
}
