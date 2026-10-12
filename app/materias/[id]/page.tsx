import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Check, MessageCircleQuestion } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { loadRedemption } from "@/lib/redemption";
import { QUESTION_TYPE_LABELS, type QuestionDraft } from "@/lib/questions/validation";
import { invocacionesRestantes } from "@/lib/agent/invocation";
import { parseDateInput, todayInAppTimeZone } from "@/lib/dates";
import { reviewState, type ReviewState } from "@/lib/game";
import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/text";
import { AccionesPregunta } from "./acciones-pregunta";
import { AvisoEscriba, EscribaProvider } from "./escriba-context";
import { EscribaForm } from "./escriba-form";
import { BloquePregunta } from "./pregunta-form";

// Tiempo máximo de esta página y de TODAS sus Server Actions en Vercel (ver
// node_modules/next/dist/docs/.../route-segment-config/maxDuration.md). El
// escriba espera a Gemini hasta 45 s (AGENT.timeoutMs) y después guarda;
// 60 s deja margen. Con fluid compute el valor por defecto de Vercel ya es
// 300 s: esto deja escrito el tope que esperamos sin depender de él.
export const maxDuration = 60;

// La materia, solo si es del usuario. cache(): generateMetadata y la página
// la piden en la misma petición y así la base se consulta una vez.
const getSubject = cache((id: string, userId: string) =>
  prisma.subject.findFirst({ where: { id, userId }, select: { id: true, name: true } }),
);

export async function generateMetadata({ params }: PageProps<"/materias/[id]">): Promise<Metadata> {
  const user = await requireUser();
  const { id } = await params;
  const subject = await getSubject(id, user.id);
  return { title: subject ? `${subject.name} · Materias · Ember` : "Materias · Ember" };
}

// Lo que se cuenta de cada pregunta con sus intentos (QuestionAttempt).
type Stats = { total: number; aciertos: number; ultimaCorrecta: boolean };

// Estadísticas de todas las preguntas de la materia en UNA consulta: cuántas
// veces salió cada una, cuántas se acertó y si el último intento fue
// acertado. array_agg(... ORDER BY ...)[1] se queda con el más reciente. El
// combate (paso 2) es quien escribe los intentos; hasta entonces sale vacío.
// $queryRaw con plantilla: los ids viajan como parámetros, nunca pegados al SQL.
async function loadStats(subjectId: string, userId: string): Promise<Map<string, Stats>> {
  const rows = await prisma.$queryRaw<({ questionId: string } & Stats)[]>`
    SELECT a."questionId",
           COUNT(*)::int AS "total",
           (COUNT(*) FILTER (WHERE a."correct"))::int AS "aciertos",
           (array_agg(a."correct" ORDER BY a."createdAt" DESC, a."id" DESC))[1] AS "ultimaCorrecta"
    FROM "QuestionAttempt" a
    JOIN "Question" q ON q."id" = a."questionId"
    WHERE q."subjectId" = ${subjectId} AND a."userId" = ${userId}
    GROUP BY a."questionId"`;
  return new Map(rows.map(({ questionId, ...stats }) => [questionId, stats]));
}

// "Acertada 2 de 3 veces · Vuelve en 3 días". Lo del repaso va al final: si
// la fallaste ya lo dice el badge "Vuelve pronto", y una nueva no tiene fecha.
function statsText(stats: Stats | undefined, review: ReviewState): string {
  if (!stats) return "Aún no ha salido en un contraataque";
  const veces = stats.total === 1 ? "vez" : "veces";
  const ultima = stats.ultimaCorrecta ? "" : " · fallada en el último contraataque";
  return `Acertada ${formatNumber(stats.aciertos)} de ${formatNumber(stats.total)} ${veces}${ultima}${reviewText(review)}`;
}

function reviewText(review: ReviewState): string {
  if (review.kind === "due") return " · Toca repasar hoy";
  if (review.kind === "later") {
    return review.days === 1 ? " · Vuelve mañana" : ` · Vuelve en ${formatNumber(review.days)} días`;
  }
  return "";
}

// "21 preguntas, 9 de ellas selladas. Los jefes de esta materia te las harán
// al contraatacar."
function countText(count: number, sealed: number): string {
  if (count === 0) return "Aún no tiene preguntas.";
  const preguntas = count === 1 ? "1 pregunta" : `${formatNumber(count)} preguntas`;
  const selladas =
    sealed === 0
      ? ""
      : sealed === count
        ? count === 1
          ? ", sellada"
          : ", todas selladas"
        : `, ${formatNumber(sealed)} de ellas ${sealed === 1 ? "sellada" : "selladas"}`;
  return `${preguntas}${selladas}. Los jefes de esta materia te las harán al contraatacar.`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const shortDateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "long",
});

// "Escrita por el escriba hoy", "ayer" o "el 3 de octubre", con los días de
// Colombia. Recibe "hoy" para que el componente no lea el reloj.
function writtenText(createdAt: Date, today: string): string {
  const created = parseDateInput(todayInAppTimeZone(createdAt));
  const now = parseDateInput(today);
  const days = created && now ? Math.round((now.getTime() - created.getTime()) / DAY_MS) : null;
  if (days === 0) return "Escrita por el escriba hoy";
  if (days === 1) return "Escrita por el escriba ayer";
  return `Escrita por el escriba el ${shortDateFormatter.format(createdAt)}`;
}

// Las preguntas del banco en DOS consultas. Las SELLADAS se piden solo con su
// id, su tipo y su fecha: su enunciado, sus opciones, su respuesta y su
// explicación no se leen de la base, así que no pueden acabar en el HTML ni en
// el payload de React por un descuido. Se juntan en el mismo orden de antes:
// la más nueva primero (id de desempate: dos creadas en el mismo milisegundo
// salen siempre igual).
async function loadQuestions(subjectId: string) {
  const [revealed, sealed] = await Promise.all([
    prisma.question.findMany({
      where: { subjectId, sealed: false },
      select: {
        id: true,
        type: true,
        source: true,
        prompt: true,
        options: true,
        correctIndex: true,
        explanation: true,
        reviewLevel: true,
        reviewDueAt: true,
        createdAt: true,
      },
    }),
    // Tampoco su repaso: de una sellada no se enseña nada de eso.
    prisma.question.findMany({
      where: { subjectId, sealed: true },
      select: { id: true, type: true, createdAt: true },
    }),
  ]);
  const questions = [
    ...revealed.map((question) => ({ ...question, sealed: false as const })),
    ...sealed.map((question) => ({ ...question, sealed: true as const })),
  ].sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
  // "Hoy" y "ahora" se toman aquí, fuera del componente: un componente de
  // React debe dar siempre lo mismo con los mismos datos.
  const now = new Date();
  return { questions, revealed, sealedCount: sealed.length, today: todayInAppTimeZone(now), now };
}

export default async function MateriaPage({ params, searchParams }: PageProps<"/materias/[id]">) {
  const sessionUser = await requireUser();
  const { id } = await params;
  const { editar } = await searchParams;

  // De otro usuario o inexistente: 404, sin decir cuál de las dos.
  const subject = await getSubject(id, sessionUser.id);
  if (!subject) notFound();

  const [{ user, notices }, { questions, revealed, sealedCount, today, now }, stats, remaining] =
    await Promise.all([
      loadRedemption(sessionUser),
      loadQuestions(subject.id),
      loadStats(subject.id, sessionUser.id),
      invocacionesRestantes(sessionUser.id),
    ]);

  // ?editar=<id>: solo si es una pregunta REVELADA de ESTA materia (ya están
  // todas cargadas). Un id ajeno, borrado, repetido (?editar=a&editar=b) o de
  // una sellada se ignora y queda el formulario de crear: una sellada no se
  // edita, y el formulario la enseñaría.
  const editada =
    typeof editar === "string" ? revealed.find((question) => question.id === editar) : undefined;
  const edicion = editada
    ? {
        id: editada.id,
        valores: {
          type: editada.type,
          prompt: editada.prompt,
          // En verdadero o falso, los cuatro huecos de opción múltiple van
          // vacíos (por si al editar se cambia de tipo).
          options: editada.type === "MULTIPLE_CHOICE" ? editada.options : ["", "", "", ""],
          optionCount: 4,
          correctIndex: String(editada.correctIndex),
          explanation: editada.explanation ?? "",
        } satisfies QuestionDraft,
      }
    : null;

  return (
    <AppShell
      active="materias"
      user={user}
      notices={notices}
      title={subject.name}
      description={countText(questions.length, sealedCount)}
      back={{ href: "/materias", label: "Mis materias" }}
    >
      {/* Una columna hasta xl. Desde xl, dos: el banco (lo principal) a la
          izquierda y, a la derecha, la tarjeta del escriba y el formulario
          manual. En el HTML la columna derecha va primero: en móvil el
          escriba se ve arriba y el orden del teclado coincide en todos los
          tamaños. EscribaProvider: la tarjeta y el aviso de éxito (encima del
          banco) comparten estado. */}
      <EscribaProvider>
        <div className="flex flex-col gap-7 xl:grid xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start xl:gap-6">
          <div className="flex min-w-0 flex-col gap-4 xl:col-start-2 xl:row-start-1">
            <EscribaForm subjectId={subject.id} remaining={remaining} />
            {/* Plegado salvo si la materia está vacía o se está editando. */}
            <BloquePregunta
              subjectId={subject.id}
              edicion={edicion}
              abiertoInicial={questions.length === 0 || edicion !== null}
            />
          </div>

          <section
            aria-labelledby="banco"
            className="flex min-w-0 flex-col gap-3 xl:col-start-1 xl:row-start-1"
          >
            <Eyebrow id="banco">Banco de preguntas · {formatNumber(questions.length)}</Eyebrow>
            <AvisoEscriba />

            {questions.length === 0 ? (
              <EmptyState icon={<MessageCircleQuestion size={40} />} title="Aún no hay preguntas">
                Invoca al escriba con tus apuntes o escribe la primera a mano. Mientras esta materia no
                tenga preguntas, sus jefes contraatacarán con preguntas de autoevaluación.
              </EmptyState>
            ) : (
              <>
                <ul className="flex flex-col gap-3">
                  {questions.map((question) => {
                    if (question.sealed) {
                      return (
                        <TarjetaSellada
                          key={question.id}
                          id={question.id}
                          typeLabel={QUESTION_TYPE_LABELS[question.type]}
                          subjectName={subject.name}
                          written={writtenText(question.createdAt, today)}
                        />
                      );
                    }
                    const questionStats = stats.get(question.id);
                    // El repaso: "Vuelve pronto" si la fallaste (o esquivaste)
                    // la última vez, "Dominada" en el nivel 5 y cuándo vuelve
                    // en la línea de estadística.
                    const review = reviewState(question.reviewLevel, question.reviewDueAt, now);
                    const isEditing = question.id === edicion?.id;
                    return (
                      <li
                        key={question.id}
                        // Como cardStyles, pero con el borde dorado en la que se
                        // está editando (cn no resolvería border-line contra
                        // border-gold-bright).
                        className={cn(
                          "flex flex-col gap-3 rounded-[10px] border bg-surface px-5 py-4",
                          isEditing ? "border-gold-bright" : "border-line",
                        )}
                      >
                        <div className="flex flex-wrap gap-2">
                          <Badge>{QUESTION_TYPE_LABELS[question.type]}</Badge>
                          {question.source === "AGENT" && <Badge>Del agente</Badge>}
                          {review.kind === "failed" && (
                            <Badge tone="ember">Vuelve pronto</Badge>
                          )}
                          {review.mastered && <Badge>Dominada</Badge>}
                          {isEditing && <Badge tone="muted">Editando</Badge>}
                        </div>
                        {/* whitespace-pre-line: respeta los saltos de línea del
                            enunciado. wrap-anywhere: una palabra larga sin
                            espacios no desborda la tarjeta. */}
                        <p className="text-base leading-[1.4] font-semibold whitespace-pre-line wrap-anywhere text-parchment">
                          {question.prompt}
                        </p>
                        <p className="flex items-start gap-2 text-sm leading-[1.45] text-ash">
                          <Check aria-hidden size={16} className="mt-0.5 shrink-0 text-smoke" />
                          <span className="min-w-0 wrap-anywhere">
                            <span className="sr-only">Respuesta correcta: </span>
                            {question.options[question.correctIndex]}
                          </span>
                        </p>
                        <AccionesPregunta
                          questionId={question.id}
                          stats={statsText(questionStats, review)}
                          editHref={`/materias/${subject.id}?editar=${question.id}#formulario`}
                        />
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[13px] leading-[1.5] text-smoke">
                  Si una materia no tiene preguntas, sus jefes contraatacan con preguntas de
                  autoevaluación.
                </p>
              </>
            )}
          </section>
        </div>
      </EscribaProvider>
    </AppShell>
  );
}

// Una pregunta SELLADA del escriba (Figma 107:141): sin enunciado, sin
// opciones y sin respuesta, porque el servidor ni las ha leído. Solo se puede
// borrar.
function TarjetaSellada({
  id,
  typeLabel,
  subjectName,
  written,
}: {
  id: string;
  typeLabel: string;
  subjectName: string;
  written: string;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-[10px] border border-dashed border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap gap-2">
        <Badge>{typeLabel}</Badge>
        <Badge>Del agente</Badge>
        <Badge tone="smoke">Sellada</Badge>
      </div>
      <p className="text-[15px] leading-[1.4] font-semibold text-ash">Pregunta sellada</p>
      <p className="text-sm leading-[1.45] wrap-anywhere text-smoke">
        La descubrirás cuando un jefe de {subjectName} contraataque.
      </p>
      <AccionesPregunta questionId={id} stats={written} editHref={null} />
    </li>
  );
}
