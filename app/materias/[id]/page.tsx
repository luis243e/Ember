import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Check, MessageCircleQuestion } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { loadRedemption } from "@/lib/redemption";
import { QUESTION_TYPE_LABELS, type QuestionDraft } from "@/lib/questions/validation";
import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/text";
import { AccionesPregunta } from "./acciones-pregunta";
import { BloquePregunta } from "./pregunta-form";

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

function statsText(stats: Stats | undefined): string {
  if (!stats) return "Aún no ha salido en un contraataque";
  const veces = stats.total === 1 ? "vez" : "veces";
  const ultima = stats.ultimaCorrecta ? "" : " · fallada en el último contraataque";
  return `Acertada ${formatNumber(stats.aciertos)} de ${formatNumber(stats.total)} ${veces}${ultima}`;
}

function countText(count: number): string {
  if (count === 0) return "Aún no tiene preguntas.";
  const preguntas = count === 1 ? "1 pregunta" : `${formatNumber(count)} preguntas`;
  return `${preguntas}. Los jefes de esta materia te las harán al contraatacar.`;
}

export default async function MateriaPage({ params, searchParams }: PageProps<"/materias/[id]">) {
  const sessionUser = await requireUser();
  const { id } = await params;
  const { editar } = await searchParams;

  // De otro usuario o inexistente: 404, sin decir cuál de las dos.
  const subject = await getSubject(id, sessionUser.id);
  if (!subject) notFound();

  const [{ user, notices }, questions, stats] = await Promise.all([
    loadRedemption(sessionUser),
    // La más nueva primero. id de desempate: dos creadas en el mismo
    // milisegundo salen siempre en el mismo orden.
    prisma.question.findMany({
      where: { subjectId: subject.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        type: true,
        source: true,
        prompt: true,
        options: true,
        correctIndex: true,
        explanation: true,
      },
    }),
    loadStats(subject.id, sessionUser.id),
  ]);

  // ?editar=<id>: solo si es una pregunta de ESTA materia (ya están todas
  // cargadas). Un id ajeno, borrado o repetido (?editar=a&editar=b) se ignora
  // y queda el formulario de crear.
  const editada =
    typeof editar === "string" ? questions.find((question) => question.id === editar) : undefined;
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
      description={countText(questions.length)}
      back={{ href: "/materias", label: "Mis materias" }}
    >
      {/* Una columna hasta xl. Desde xl, dos: el banco (lo principal) a la
          izquierda y el formulario a la derecha. En el HTML el formulario va
          primero: en móvil se ve arriba (cerrado ocupa una línea) y el orden
          del teclado coincide en todos los tamaños. */}
      <div className="flex flex-col gap-7 xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-8">
        {/* sticky: en escritorio el formulario se queda a la vista al bajar
            por la lista (útil al editar una pregunta de abajo). */}
        <div className="min-w-0 xl:sticky xl:top-6 xl:col-start-2 xl:row-start-1">
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

          {questions.length === 0 ? (
            <EmptyState icon={<MessageCircleQuestion size={40} />} title="Aún no hay preguntas">
              Escribe la primera con el formulario. Mientras esta materia no tenga preguntas, sus
              jefes contraatacarán con preguntas de autoevaluación.
            </EmptyState>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {questions.map((question) => {
                  const questionStats = stats.get(question.id);
                  // Vuelve pronto: el último intento fue un fallo.
                  const vuelvePronto = questionStats !== undefined && !questionStats.ultimaCorrecta;
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
                        {question.source === "AGENT" && (
                          <Badge tone="muted">Del agente</Badge>
                        )}
                        {vuelvePronto && (
                          <Badge tone="ember">Vuelve pronto</Badge>
                        )}
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
                        stats={statsText(questionStats)}
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
    </AppShell>
  );
}
