"use client";

import Link from "next/link";
import { useActionState } from "react";
import { iniciarSesion } from "./actions";
import type { EstadoFormulario } from "@/app/registro/actions";

const estadoInicial: EstadoFormulario = { error: null };

export default function LoginPage() {
  const [estado, accion, enviando] = useActionState(iniciarSesion, estadoInicial);

  return (
    <main>
      <h1>Iniciar sesión</h1>
      <form action={accion}>
        <label htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" required />

        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" required />

        <button type="submit" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>
      {estado.error && <p role="alert">{estado.error}</p>}
      <p>
        ¿No tienes cuenta? <Link href="/registro">Regístrate</Link>
      </p>
    </main>
  );
}
