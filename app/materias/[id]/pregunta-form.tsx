"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { crearPregunta, editarPregunta, type EstadoPregunta } from "./actions";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonStyles } from "@/components/ui/button";
import { cardStyles } from "@/components/ui/card";
import { inputStyles, labelStyles, textareaStyles } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import {
  MAX_EXPLANATION_LENGTH,
  MAX_OPTION_LENGTH,
  MAX_PROMPT_LENGTH,
  MAX_TOPIC_LENGTH,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  TRUE_FALSE_OPTIONS,
  type QuestionDraft,
} from "@/lib/questions/validation";

type BloqueProps = {
  subjectId: string;
  // La pregunta que se edita (?editar=<id>), ya convertida en borrador, o
  // null para crear una nueva.
  edicion: { id: string; valores: QuestionDraft } | null;
  // Abierto al cargar: si la materia no tiene preguntas o se está editando.
  abiertoInicial: boolean;
  // Los temas de las preguntas REVELADAS de la materia, para las sugerencias
  // del campo Tema (los de las selladas no salen del servidor).
  topics: string[];
};

const BORRADOR_VACIO: QuestionDraft = {
  type: "MULTIPLE_CHOICE",
  prompt: "",
  options: ["", "", "", ""],
  optionCount: 4,
  correctIndex: "",
  explanation: "",
  topic: "",
};

// Bloque plegable "Añadir pregunta a mano" (o "Editar pregunta"). Es un
// <details>: abre y cierra sin JavaScript. Su estado vive aquí y NO se
// recalcula con cada render del servidor: si se recalculara, guardar la
// primera pregunta de una materia lo cerraría de golpe (la materia ya
// tendría preguntas).
export function BloquePregunta({ subjectId, edicion, abiertoInicial, topics }: BloqueProps) {
  const [abierto, setAbierto] = useState(abiertoInicial);

  // Al pulsar "Editar" en otra tarjeta, cambia edicion.id y el bloque se
  // abre. Es el patrón de React para ajustar el estado cuando cambia una
  // prop: se compara durante el render con la última vista.
  const edicionId = edicion?.id ?? null;
  const [edicionVista, setEdicionVista] = useState(edicionId);
  if (edicionId !== edicionVista) {
    setEdicionVista(edicionId);
    if (edicionId) setAbierto(true);
  }

  return (
    <details
      id="formulario"
      open={abierto}
      onToggle={(event) => setAbierto(event.currentTarget.open)}
      // scroll-mt: al saltar a #formulario deja un margen arriba.
      className={cn(cardStyles, "group/bloque scroll-mt-6")}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-[10px] px-5 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright md:px-6 [&::-webkit-details-marker]:hidden">
        <span className="font-display text-[13px] leading-[normal] tracking-[4px] text-gold uppercase">
          {edicion ? "Editar pregunta" : "Añadir pregunta a mano"}
        </span>
        <ChevronDown
          aria-hidden
          size={18}
          className="shrink-0 text-smoke transition-transform group-open/bloque:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="px-5 pb-5 md:px-6 md:pb-6">
        {/* key: al pasar de crear a editar (o de una pregunta a otra), el
            formulario se vuelve a montar con los valores nuevos. */}
        <PreguntaForm key={edicionId ?? "nueva"} subjectId={subjectId} edicion={edicion} topics={topics} />
      </div>
    </details>
  );
}

function PreguntaForm({ subjectId, edicion, topics }: Omit<BloqueProps, "abiertoInicial">) {
  const estadoInicial: EstadoPregunta = { error: null, valores: edicion?.valores ?? BORRADOR_VACIO };
  const [estado, accion, enviando] = useActionState(
    edicion ? editarPregunta : crearPregunta,
    estadoInicial,
  );
  const { valores } = estado;

  // El tipo elegido decide qué opciones se ven, así que vive en el estado de
  // React. Después de cada envío vuelve al que devolvió la acción (el mismo
  // patrón que en BloquePregunta).
  const [tipo, setTipo] = useState(valores.type);
  const [estadoVisto, setEstadoVisto] = useState(estado);
  if (estado !== estadoVisto) {
    setEstadoVisto(estado);
    setTipo(estado.valores.type);
  }
  const esVerdaderoFalso = tipo === "TRUE_FALSE";

  // Al entrar a editar, el foco va al enunciado: quien usa teclado o lector
  // de pantalla llega directo a lo que acaba de pedir.
  const enunciadoRef = useRef<HTMLTextAreaElement>(null);
  const editando = edicion !== null;
  useEffect(() => {
    if (editando) enunciadoRef.current?.focus();
  }, [editando]);

  // ¿Esta opción estaba marcada como correcta? Solo si el borrador era de
  // ese mismo tipo.
  const marcada = (type: string, index: number) =>
    valores.type === type && valores.correctIndex === String(index);

  // Los defaultValue salen de lo último que devolvió la acción: lo escrito si
  // hubo error, o vacío si se guardó. React vacía el formulario al terminar
  // la acción y lo rellena con ellos.
  return (
    <form action={accion} className="flex flex-col gap-5">
      {edicion ? (
        <input type="hidden" name="questionId" value={edicion.id} />
      ) : (
        <input type="hidden" name="subjectId" value={subjectId} />
      )}

      {/* Tipo: dos radios con aspecto de pestañas. */}
      <fieldset className="min-w-0">
        <legend className="sr-only">Tipo de pregunta</legend>
        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line">
          {QUESTION_TYPES.map((type) => (
            <label
              key={type}
              className="relative flex min-h-11 items-center justify-center px-2 py-2.5 text-center text-sm leading-tight text-ash transition-colors has-checked:bg-gold/12 has-checked:font-semibold has-checked:text-gold-bright"
            >
              {/* Radio de verdad, invisible y estirado sobre la pestaña: las
                  flechas del teclado cambian de tipo y el foco se ve. NO
                  controlado (defaultChecked, como los demás campos): al
                  terminar la acción, React reinicia el formulario y un radio
                  controlado volvería a su valor inicial sin que React lo
                  corrigiera, si el tipo no cambió. Con defaultChecked, el
                  reinicio lo deja en el tipo que devolvió la acción. */}
              <input
                type="radio"
                name="type"
                value={type}
                defaultChecked={valores.type === type}
                onChange={() => setTipo(type)}
                className="absolute inset-0 cursor-pointer appearance-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold-bright"
              />
              {QUESTION_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="prompt" className={labelStyles}>
          Pregunta
        </label>
        <textarea
          ref={enunciadoRef}
          id="prompt"
          name="prompt"
          rows={3}
          required
          maxLength={MAX_PROMPT_LENGTH}
          defaultValue={valores.prompt}
          className={textareaStyles}
        />
      </div>

      {/* Opción múltiple. Al elegir verdadero o falso se oculta Y se
          desactiva (disabled): sus campos no se envían ni se validan, pero
          lo escrito se conserva por si se vuelve a opción múltiple. */}
      <fieldset disabled={esVerdaderoFalso} hidden={esVerdaderoFalso} className="min-w-0">
        <legend className={cn(labelStyles, "mb-2")}>Opciones · marca la correcta</legend>
        <div className="flex flex-col gap-2.5">
          {valores.options.map((option, index) => (
            // group/opcion + has-checked: el campo de la correcta lleva borde
            // dorado. El grupo lleva nombre porque el <details> también es un
            // grupo (group/bloque) y contiene el radio del tipo, siempre
            // marcado: con un "group" sin nombre se pintarían las cuatro.
            <div key={index} className="group/opcion flex items-center gap-3">
              <input
                type="radio"
                // Solo el grupo visible lleva name: los radios con el mismo
                // name forman un grupo aunque estén en otro fieldset, y
                // marcar uno desmarcaría el del otro.
                name={esVerdaderoFalso ? undefined : "correctIndex"}
                value={index}
                required
                defaultChecked={marcada("MULTIPLE_CHOICE", index)}
                aria-label={`Marcar la opción ${index + 1} como correcta`}
                className={RADIO}
              />
              <input
                type="text"
                name="options"
                required
                maxLength={MAX_OPTION_LENGTH}
                defaultValue={option}
                aria-label={`Opción ${index + 1}`}
                className={cn(inputStyles, "min-w-0 flex-1 group-has-checked/opcion:border-gold-bright")}
              />
            </div>
          ))}
        </div>
      </fieldset>

      {/* Verdadero o falso: dos radios fijos. El servidor pone él mismo las
          opciones ["Verdadero", "Falso"]; aquí solo se elige la correcta. */}
      <fieldset disabled={!esVerdaderoFalso} hidden={!esVerdaderoFalso} className="min-w-0">
        <legend className={cn(labelStyles, "mb-2")}>Respuesta correcta</legend>
        <div className="flex flex-col gap-2.5">
          {TRUE_FALSE_OPTIONS.map((option, index) => (
            <label
              key={option}
              className="flex h-12 cursor-pointer items-center gap-3 rounded-md border border-line bg-night px-4 text-[15px] text-parchment has-checked:border-gold-bright"
            >
              <input
                type="radio"
                name={esVerdaderoFalso ? "correctIndex" : undefined}
                value={index}
                required
                defaultChecked={marcada("TRUE_FALSE", index)}
                className={RADIO}
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="explanation" className={labelStyles}>
          Explicación (opcional)
        </label>
        <textarea
          id="explanation"
          name="explanation"
          rows={2}
          maxLength={MAX_EXPLANATION_LENGTH}
          defaultValue={valores.explanation}
          className={textareaStyles}
        />
      </div>

      {/* Tema: texto libre con sugerencias (datalist) de los temas que ya
          tiene la materia. Si se escribe uno que ya existe con otras
          mayúsculas, el servidor lo guarda como ya estaba. */}
      <div className="flex flex-col gap-2">
        <label htmlFor="topic" className={labelStyles}>
          Tema (opcional)
        </label>
        <input
          id="topic"
          name="topic"
          type="text"
          list={topics.length > 0 ? "temas-materia" : undefined}
          maxLength={MAX_TOPIC_LENGTH}
          defaultValue={valores.topic ?? ""}
          aria-describedby="topic-ayuda"
          className={inputStyles}
        />
        {topics.length > 0 && (
          <datalist id="temas-materia">
            {topics.map((topic) => (
              <option key={topic} value={topic} />
            ))}
          </datalist>
        )}
        <p id="topic-ayuda" className="text-xs leading-[1.45] text-smoke">
          Por ejemplo, «Derivadas». Agrupa tus puntos débiles por tema.
        </p>
      </div>

      {/* Se oculta mientras se envía: al volver a aparecer, el lector de
          pantalla lo anuncia aunque el mensaje sea el mismo. */}
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}

      {edicion && (
        <p className="text-xs leading-[1.45] text-smoke">
          Si cambias la pregunta o sus opciones, sus estadísticas se reinician.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button type="submit" disabled={enviando} className={cn(buttonStyles({ size: "md" }), "w-full")}>
          {enviando ? "Guardando..." : edicion ? "Guardar cambios" : "Guardar pregunta"}
        </button>
        {edicion && (
          // Vuelve a la página sin ?editar=: el formulario pasa a crear.
          <ButtonLink href={`/materias/${subjectId}`} variant="ghost" size="md" className="w-full">
            Cancelar
          </ButtonLink>
        )}
      </div>
    </form>
  );
}

// Radio redondo: anillo gris; marcado, anillo dorado grueso con el centro
// oscuro (como en el Figma). 24 px y no 20: el mínimo cómodo para tocarlo.
const RADIO =
  "size-6 shrink-0 cursor-pointer appearance-none rounded-full border border-line bg-night transition-[border-width,border-color] checked:border-[7px] checked:border-gold-bright focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright motion-reduce:transition-none";
