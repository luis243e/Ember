"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registrarse, type EstadoFormulario } from "./actions";

const estadoInicial: EstadoFormulario = { error: null };

export default function RegistroPage() {
  const [estado, accion, enviando] = useActionState(registrarse, estadoInicial);

  return (
    <main>
      <h1>Crear cuenta</h1>
      <form action={accion}>
        <label htmlFor="name">Nombre</label>
        <input id="name" name="name" type="text" required />

        <label htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" required />

        <label htmlFor="password">Contraseña (mínimo 8 caracteres)</label>
        <input id="password" name="password" type="password" minLength={8} required />

        <button type="submit" disabled={enviando}>
          {enviando ? "Creando..." : "Registrarse"}
        </button>
      </form>
      {estado.error && <p role="alert">{estado.error}</p>}
      <p>
        ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
      </p>
    </main>
  );
}
