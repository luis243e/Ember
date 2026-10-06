"use client";

import { useActionState } from "react";
import { invocarJefe, type EstadoInvocar } from "./actions";
import {
  BLOCKS_BY_DIFFICULTY,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
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

export function InvocarJefeForm({ subjects, today }: Props) {
  const [estado, accion, enviando] = useActionState(invocarJefe, estadoInicial);
  const { valores } = estado;

  // Los defaultValue salen de lo último que devolvió la acción. Si hubo error,
  // React vacía el formulario y lo rellena con estos valores.
  return (
    <>
      <form action={accion}>
        <p>
          <label htmlFor="name">Nombre del jefe</label>
          <input
            id="name"
            name="name"
            type="text"
            maxLength={80}
            required
            defaultValue={valores.name}
          />
        </p>

        <p>
          <label htmlFor="subjectId">Materia</label>
          {/* React solo aplica el defaultValue de un <select> al montarlo. La
              key lo vuelve a montar cuando cambia la materia devuelta. */}
          <select
            key={valores.subjectId}
            id="subjectId"
            name="subjectId"
            required
            defaultValue={valores.subjectId}
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
        </p>

        <p>
          <label htmlFor="dueDate">Fecha de entrega</label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            min={today}
            required
            defaultValue={valores.dueDate}
          />
        </p>

        <fieldset>
          <legend>Dificultad</legend>
          {DIFFICULTIES.map((difficulty) => (
            <p key={difficulty}>
              <label>
                <input
                  type="radio"
                  name="difficulty"
                  value={difficulty}
                  required
                  defaultChecked={valores.difficulty === difficulty}
                />
                {`${DIFFICULTY_LABELS[difficulty]}: ${BLOCKS_BY_DIFFICULTY[difficulty]} bloques (${maxHpFor(difficulty)} de vida)`}
              </label>
            </p>
          ))}
        </fieldset>

        <button type="submit" disabled={enviando}>
          {enviando ? "Invocando..." : "Invocar"}
        </button>
      </form>
      {estado.error && <p role="alert">{estado.error}</p>}
    </>
  );
}
