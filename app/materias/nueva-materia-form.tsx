"use client";

import { useActionState } from "react";
import { crearMateria } from "./actions";
import type { EstadoFormulario } from "@/app/registro/actions";

const estadoInicial: EstadoFormulario = { error: null };

export function NuevaMateriaForm() {
  const [estado, accion, enviando] = useActionState(crearMateria, estadoInicial);

  return (
    <>
      <form action={accion}>
        <label htmlFor="name">Nueva materia</label>
        <input id="name" name="name" type="text" maxLength={60} required />

        <button type="submit" disabled={enviando}>
          {enviando ? "Creando..." : "Crear"}
        </button>
      </form>
      {estado.error && <p role="alert">{estado.error}</p>}
    </>
  );
}
