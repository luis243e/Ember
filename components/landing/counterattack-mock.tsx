import { Check } from "lucide-react";
import Image from "next/image";
import { Reveal } from "@/components/landing/reveal";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { BESTIARY, COUNTERATTACK, bossImageSrc } from "@/lib/game";

// Jefe difícil: lanza 3 preguntas (COUNTERATTACK.questionsByDifficulty).
const BOSS = BESTIARY["dragon-de-la-caverna"];
const TOTAL = COUNTERATTACK.questionsByDifficulty.HARD;
const SOULS = COUNTERATTACK.souls.MULTIPLE_CHOICE.correct;

const LETTERS = ["A", "B", "C", "D"];
const QUESTION = "¿Qué orgánulo produce la mayor parte de la energía de la célula?";
const OPTIONS = ["Ribosoma", "Mitocondria", "Aparato de Golgi", "Lisosoma"];
const CORRECT = 1;

// La respuesta se marca cuando el panel ya apareció.
const ANSWER_CLASSES = "transition-[opacity,border-color,background-color] delay-700 duration-500";

// Maqueta del panel del contraataque ya contestado (Figma 105:2), con las
// clases de app/mazmorra/batalla/[id]/counterattack-panel.tsx. Al entrar en
// pantalla (Reveal) la correcta se enciende y las demás se apagan; en pending
// las cuatro se ven iguales, como antes de contestar. Sin JavaScript o con
// movimiento reducido ya aparece contestada.
// role="img": es un dibujo, no un formulario. El lector de pantalla oye la
// etiqueta y no las opciones sueltas.
// className: dónde va dentro de la rejilla de la sección (lg:order-first
// lg:justify-self-start).
export function CounterattackMock({ className }: { className?: string }) {
  return (
    <Reveal className={cn("w-full max-w-[560px] lg:max-w-[520px]", className)}>
      <div
        role="img"
        aria-label={`Ejemplo de contraataque: ${BOSS.article.toLowerCase()} ${BOSS.name.toLowerCase()} pregunta «${QUESTION}». La respuesta correcta, ${OPTIONS[CORRECT]}, da ${SOULS} almas.`}
        className="overflow-hidden rounded-[14px] border border-line bg-night shadow-[0_16px_48px_color-mix(in_oklab,var(--color-night)_80%,transparent)]"
      >
        {/* La guarida del dragón, fundida hacia el panel con una máscara: de
            opaco arriba a transparente abajo. */}
        <div className="relative h-24 [mask-image:linear-gradient(to_bottom,black_20%,transparent)] sm:h-28">
          <Image
            src={bossImageSrc(BOSS.key)}
            alt=""
            fill
            sizes="(min-width: 1024px) 520px, 100vw"
            className="object-cover opacity-60"
            style={{ objectPosition: "20% 40%" }}
          />
        </div>

        <div className="-mt-8 flex flex-col gap-4 px-5 pb-6 sm:px-7">
          <div className="relative flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
            <p className="font-display text-[13px] leading-[normal] tracking-[2px] text-ember uppercase">
              {BOSS.article} {BOSS.name} contraataca
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge className="px-2">Del agente</Badge>
              <p className="text-[13px] leading-[normal] font-semibold text-smoke">
                Pregunta 1 de {TOTAL}
              </p>
            </div>
          </div>

          <p className="text-lg leading-snug font-semibold text-parchment sm:text-xl">{QUESTION}</p>

          <ul className="flex flex-col gap-2.5">
            {OPTIONS.map((option, i) => {
              const good = i === CORRECT;
              return (
                <li
                  key={option}
                  className={cn(
                    "flex min-h-13 items-center gap-3.5 rounded-lg border-[1.5px] px-4 py-2.5",
                    ANSWER_CLASSES,
                    good
                      ? "border-gold-bright bg-gold/14 group-data-[reveal=pending]/reveal:border-line group-data-[reveal=pending]/reveal:bg-surface"
                      : "border-line bg-surface opacity-45 group-data-[reveal=pending]/reveal:opacity-100",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border font-display text-[13px] leading-none font-bold",
                      good ? "border-gold-bright text-gold-bright" : "border-gold text-gold",
                    )}
                  >
                    {LETTERS[i]}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-[15px] leading-snug text-parchment",
                      good && "font-semibold",
                    )}
                  >
                    {option}
                  </span>
                  {good && (
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 text-sm leading-[normal] font-semibold text-gold-bright",
                        ANSWER_CLASSES,
                        "group-data-[reveal=pending]/reveal:opacity-0",
                      )}
                    >
                      <Check size={14} />+{SOULS} almas
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <div
            className={cn(
              "flex flex-col gap-1.5 rounded-lg border border-line bg-surface px-4 py-3.5 leading-[normal]",
              ANSWER_CLASSES,
              "group-data-[reveal=pending]/reveal:opacity-0",
            )}
          >
            <p className="font-display text-[17px] font-bold text-gold-bright">¡Golpe parado!</p>
            <p className="text-sm leading-normal text-ash">
              La mitocondria hace la respiración celular, que produce casi todo el ATP de la célula.
            </p>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
