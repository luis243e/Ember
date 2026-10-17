import Image from "next/image";
import { Reveal } from "@/components/landing/reveal";
import { Badge } from "@/components/ui/badge";
import { cardStyles } from "@/components/ui/card";
import { HpBar } from "@/components/ui/hp-bar";
import { cn } from "@/lib/cn";
import {
  BESTIARY,
  BOSSES_BY_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  HP_PER_BLOCK,
  bossImageSrc,
  maxHpFor,
} from "@/lib/game";

// El jefe de ejemplo es de dificultad media (400 de vida), como el ogro.
const EXAMPLE = BESTIARY["ogro-de-las-ruinas"];
const EXAMPLE_MAX = maxHpFor("MEDIUM");
const EXAMPLE_HP = EXAMPLE_MAX - HP_PER_BLOCK;

// El golpe llega cuando la tarjeta ya terminó de aparecer (700 ms).
const STRIKE_DELAY_MS = 700;

// Tarjeta de un jefe que recibe un golpe al entrar en pantalla: la barra
// pasa de 400 a 300 y sube un "−100". Todo sale de Reveal: en pending la
// barra está llena y el texto dice 400; sin atributo (sin JavaScript o con
// movimiento reducido) se ve ya el final, 300 / 400, sin ningún movimiento.
// className: dónde va dentro de la rejilla de la sección (lg:justify-self-end).
export function BossCardMock({ className }: { className?: string }) {
  return (
    <Reveal className={cn("w-full max-w-[440px]", className)}>
      <figure className={cn(cardStyles, "flex flex-col gap-4 rounded-xl p-5")}>
        <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-night-alt">
          {/* Debajo del pliegue: carga diferida (loading="lazy" es el valor
              por defecto). sizes = ancho real de la tarjeta menos su relleno. */}
          <Image
            src={bossImageSrc(EXAMPLE.key)}
            alt="El ogro de las ruinas: un ogro verde con un garrote de madera al hombro, entre muros en ruinas iluminados por antorchas."
            fill
            sizes="(min-width: 1024px) 400px, calc(100vw - 72px)"
            className="object-cover"
          />
          {/* El "−100" del golpe: el mismo movimiento que en la batalla. Sin
              animación no se ve (opacity-0): es solo adorno. */}
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center font-display text-4xl font-bold text-gold-bright opacity-0 [text-shadow:0_2px_12px_var(--color-night)] group-data-[reveal=shown]/reveal:motion-safe:animate-rise"
            style={{ animationDelay: `${STRIKE_DELAY_MS}ms` }}
          >
            −{HP_PER_BLOCK}
          </span>
        </div>

        <figcaption className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="font-display text-lg leading-[normal] font-bold">El Parcial Final</p>
              <p className="text-sm leading-[normal] text-ash">{EXAMPLE.name}</p>
            </div>
            <Badge>{DIFFICULTY_LABELS.MEDIUM}</Badge>
          </div>
          {/* El bloque que quita el golpe es el único vacío: en pending se
              pinta lleno y se apaga con la transición de HpBar. */}
          <HpBar
            current={EXAMPLE_HP}
            max={EXAMPLE_MAX}
            emptyClassName="delay-700 group-data-[reveal=pending]/reveal:bg-blood"
          />
          <div className="flex justify-between text-xs leading-[normal]">
            <span className="text-smoke">Vida</span>
            {/* Los dos números ocupan la misma celda de la rejilla y se
                cruzan con un fundido; el lector de pantalla lee el final. */}
            <span className="grid text-parchment">
              <span
                aria-hidden
                className="col-start-1 row-start-1 text-right transition-opacity delay-700 duration-500 group-data-[reveal=pending]/reveal:opacity-0"
              >
                {EXAMPLE_HP} / {EXAMPLE_MAX}
              </span>
              <span
                aria-hidden
                className="col-start-1 row-start-1 text-right opacity-0 transition-opacity delay-700 duration-500 group-data-[reveal=pending]/reveal:opacity-100"
              >
                {EXAMPLE_MAX} / {EXAMPLE_MAX}
              </span>
              <span className="sr-only">
                {EXAMPLE_HP} de {EXAMPLE_MAX}
              </span>
            </span>
          </div>
        </figcaption>
      </figure>
    </Reveal>
  );
}

// Los 6 jefes, en el orden de las dificultades: fácil, media, difícil.
const BESTIARY_ORDER = DIFFICULTIES.flatMap((difficulty) =>
  BOSSES_BY_DIFFICULTY[difficulty].map((key) => ({ boss: BESTIARY[key], difficulty })),
);

// Franja con todo el bestiario: miniatura, nombre y dificultad.
export function BestiaryStrip() {
  return (
    <div className="flex flex-col gap-5">
      <h3 className="font-display text-[13px] leading-[normal] tracking-[3px] text-gold uppercase">
        Los {BESTIARY_ORDER.length} jefes del bestiario
      </h3>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
        {BESTIARY_ORDER.map(({ boss, difficulty }, i) => (
          <li key={boss.key}>
            <Reveal delay={i * 80} className="flex flex-col gap-2.5">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-surface">
                {/* alt vacío: el nombre está escrito justo debajo, y
                    repetirlo solo haría que el lector de pantalla lo diga
                    dos veces. */}
                <Image
                  src={bossImageSrc(boss.key)}
                  alt=""
                  fill
                  sizes="(min-width: 1440px) 190px, (min-width: 1024px) 14vw, (min-width: 640px) 30vw, 45vw"
                  className="object-cover"
                  style={{ objectPosition: boss.thumbPosition }}
                />
              </div>
              <p className="font-display text-[15px] leading-tight font-bold">{boss.name}</p>
              <p className="text-xs leading-[normal] text-smoke">
                {DIFFICULTY_LABELS[difficulty]} · {maxHpFor(difficulty)} de vida
              </p>
            </Reveal>
          </li>
        ))}
      </ul>
    </div>
  );
}
