"use client";

import { useActionState } from "react";
import { ChevronDown, Swords } from "lucide-react";
import { invocarJefe, type EstadoInvocar } from "./actions";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonStyles } from "@/components/ui/button";
import { HpBar } from "@/components/ui/hp-bar";
import { TextField, labelStyles, selectStyles } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import {
  BLOCKS_BY_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  HP_PER_BLOCK,
  maxHpFor,
} from "@/lib/game";

type Props = {
  subjects: { id: string; name: string }[];
  // Hoy en Bogotá ("AAAA-MM-DD"), calculado en el servidor.
  today: string;
};

const estadoInicial: EstadoInvocar = {
  error: null,
  valores: { name: "", subjectId: "", dueDate: "", difficulty: "" },
};

// Ancho del formulario a partir del cual se pasa a la disposición de
// escritorio (materia y fecha en dos columnas, dificultades en tres y botones
// en fila). Es una consulta de CONTENEDOR (@container en el <form>): mira el
// ancho del formulario, no el de la ventana. 34rem = 544 px: en el Figma de
// escritorio el formulario mide 574 px por dentro y cada dificultad necesita
// unos 160 px para "6 bloques · 600 de vida". La clase completa se escribe
// tal cual en cada sitio (@min-[34rem]:...) porque Tailwind solo genera las
// clases que encuentra escritas enteras en el código.

export function InvocarJefeForm({ subjects, today }: Props) {
  const [estado, accion, enviando] = useActionState(invocarJefe, estadoInicial);
  const { valores } = estado;

  // Los defaultValue salen de lo último que devolvió la acción. Si hubo error,
  // React vacía el formulario y lo rellena con estos valores.
  return (
    <form action={accion} className="@container flex flex-col gap-5 md:gap-6">
      <TextField
        id="name"
        name="name"
        type="text"
        label="Nombre del jefe"
        maxLength={80}
        required
        defaultValue={valores.name}
      />

      <div className="flex flex-col gap-5 @min-[34rem]:flex-row @min-[34rem]:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label htmlFor="subjectId" className={labelStyles}>
            Materia
          </label>
          {/* relative: el chevron se coloca encima del <select>, a la
              derecha. pointer-events-none deja pasar el clic al select. */}
          <div className="relative">
            {/* React solo aplica el defaultValue de un <select> al montarlo.
                La key lo vuelve a montar cuando cambia la materia devuelta. */}
            <select
              key={valores.subjectId}
              id="subjectId"
              name="subjectId"
              required
              defaultValue={valores.subjectId}
              className={selectStyles}
            >
              <option value="" disabled>
                Elige una materia
              </option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              size={16}
              className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-smoke"
            />
          </div>
        </div>

        <TextField
          id="dueDate"
          name="dueDate"
          type="date"
          label="Fecha de entrega"
          min={today}
          required
          defaultValue={valores.dueDate}
          className="min-w-0 flex-1"
        />
      </div>

      {/* min-w-0: un <fieldset> mide por defecto al menos lo que su
          contenido, y podría salirse del formulario. */}
      <fieldset aria-describedby="difficulty-hint" className="min-w-0">
        <legend className={cn(labelStyles, "mb-2")}>Dificultad</legend>
        <div className="grid grid-cols-1 gap-2 @min-[34rem]:grid-cols-3 @min-[34rem]:gap-3">
          {DIFFICULTIES.map((difficulty) => {
            const label = DIFFICULTY_LABELS[difficulty];
            const hp = maxHpFor(difficulty);
            const details = `${BLOCKS_BY_DIFFICULTY[difficulty]} bloques · ${hp} de vida`;

            return (
              // La tarjeta entera es la etiqueta del radio. group y has-checked
              // pintan la tarjeta según si su radio está marcado.
              <label
                key={difficulty}
                className={cn(
                  "group relative flex flex-col gap-2.5 rounded-lg border border-line bg-night px-4 py-3.5 @min-[34rem]:p-4",
                  // La elegida: borde gold-bright de 2 px. El segundo píxel es
                  // un anillo interior, así la tarjeta no cambia de tamaño.
                  "has-checked:border-gold-bright has-checked:inset-ring has-checked:inset-ring-gold-bright",
                )}
              >
                {/* Radio de verdad (flechas, Espacio y aviso de "required"
                    funcionan solos), invisible y estirado sobre toda la
                    tarjeta: el clic en cualquier punto lo marca y el contorno
                    de foco rodea la tarjeta. aria-label da el nombre completo
                    ("Media, 4 bloques · 400 de vida"); el texto visible es
                    el mismo, sin la coma. */}
                <input
                  type="radio"
                  name="difficulty"
                  value={difficulty}
                  required
                  defaultChecked={valores.difficulty === difficulty}
                  aria-label={`${label}, ${details}`}
                  className="absolute inset-0 cursor-pointer appearance-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
                />
                <span className="flex items-center justify-between gap-x-3 gap-y-1 leading-[normal] @min-[34rem]:flex-col @min-[34rem]:items-start @min-[34rem]:gap-2.5">
                  <span className="font-display text-base font-bold text-parchment group-has-checked:text-gold-bright">
                    {label}
                  </span>
                  <span className="text-xs text-smoke">{details}</span>
                </span>
                <HpBar current={hp} max={hp} size="sm" />
              </label>
            );
          })}
        </div>
        <p id="difficulty-hint" className="mt-2 text-xs leading-[1.45] text-smoke">
          Cada bloque de estudio completo le quita {HP_PER_BLOCK} de vida al jefe.
        </p>
      </fieldset>

      {/* Se oculta mientras se envía: al volver a aparecer, el lector de
          pantalla lo anuncia aunque el mensaje sea el mismo. */}
      {estado.error && !enviando && <Alert>{estado.error}</Alert>}

      {/* En el HTML va primero el botón principal. En móvil se apilan así;
          en escritorio flex-row-reverse deja "Cancelar" a la izquierda. */}
      <div className="flex flex-col gap-3 @min-[34rem]:flex-row-reverse">
        <button
          type="submit"
          disabled={enviando}
          className={cn(buttonStyles(), "w-full @min-[34rem]:w-auto @min-[34rem]:flex-1")}
        >
          <Swords aria-hidden size={16} />
          {enviando ? "Invocando..." : "Invocar jefe"}
        </button>
        <ButtonLink href="/mazmorra" variant="ghost" className="w-full @min-[34rem]:w-auto">
          Cancelar
        </ButtonLink>
      </div>
    </form>
  );
}
