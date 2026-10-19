import { Badge } from "@/components/ui/badge";
import { cardStyles } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/cn";
import type { WeakPoints } from "@/lib/questions/weak-points";
import { formatNumber } from "@/lib/text";

// El panel "Puntos débiles" de una materia, encima del banco. Componente de
// servidor: los datos llegan ya calculados (weakPoints en
// lib/questions/weak-points.ts) y solo de preguntas REVELADAS.
// @container: la fila de cada tema (nombre y "X de Y") mira el ancho del
// panel, no el de la ventana.
export function PuntosDebiles({ data }: { data: WeakPoints }) {
  return (
    <section aria-labelledby="puntos-debiles" className={cn(cardStyles, "@container flex flex-col gap-4 p-5 md:p-6")}>
      <Eyebrow id="puntos-debiles" className="tracking-[2px]">
        Puntos débiles
      </Eyebrow>

      {data.kind === "empty" ? (
        <p className="text-sm leading-normal text-ash">
          Aún no hay suficientes respuestas. Contesta algunos contraataques y aquí verás tus puntos
          débiles.
        </p>
      ) : (
        <>
          {/* La materia entera: el porcentaje grande y, debajo, de qué sale. */}
          <div className="flex flex-col gap-1">
            <p className="font-display text-[32px] leading-none font-bold text-gold-bright">
              {data.percent} %
              <span className="sr-only"> de aciertos</span>
            </p>
            <p className="text-sm leading-normal text-ash">
              de aciertos en {formatNumber(data.answers)} {data.answers === 1 ? "respuesta" : "respuestas"}
              {" · "}
              {data.mastered === 1 ? "1 pregunta dominada" : `${formatNumber(data.mastered)} preguntas dominadas`}
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="text-[13px] leading-[normal] font-semibold tracking-[1px] text-smoke uppercase">
              Por tema, de peor a mejor
            </h3>
            {data.topics.length === 0 ? (
              <p className="text-sm leading-normal text-ash">
                Ningún tema tiene todavía 3 respuestas.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.topics.map((topic) => (
                  <li key={topic.name ?? ""} className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span
                        className={cn(
                          "min-w-0 text-[15px] leading-snug font-semibold wrap-anywhere",
                          topic.name === null ? "text-ash italic" : "text-parchment",
                        )}
                      >
                        {topic.name ?? "Sin tema"}
                      </span>
                      <span className="text-sm leading-[normal] whitespace-nowrap text-ash">
                        {formatNumber(topic.correct)} de {formatNumber(topic.total)}
                        <span className="sr-only"> acertadas,</span> · {topic.percent} %
                      </span>
                    </div>
                    {/* La barra repite lo que ya dice el texto: decorativa. */}
                    <div aria-hidden className="h-2 w-full overflow-hidden rounded-[2px] bg-hp-empty">
                      <div className="h-full rounded-[2px] bg-gold-bright" style={{ width: `${topic.percent}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <h3 className="text-[13px] leading-[normal] font-semibold tracking-[1px] text-smoke uppercase">
              Las que más fallas
            </h3>
            {data.mostFailed.length === 0 ? (
              <p className="text-sm leading-normal text-ash">
                Ninguna pregunta acumula todavía 2 fallos.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.mostFailed.map((question) => (
                  <li
                    key={question.id}
                    className="flex flex-col gap-2 rounded-lg border border-line bg-night px-3.5 py-3 @md:flex-row @md:items-start @md:justify-between @md:gap-4"
                  >
                    <p className="min-w-0 text-sm leading-[1.45] whitespace-pre-line wrap-anywhere text-parchment">
                      {question.prompt}
                    </p>
                    <Badge tone="ember" className="self-start">
                      {question.fails} fallos
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
