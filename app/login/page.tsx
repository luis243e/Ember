import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm, type AvisoLogin } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión · Ember",
};

// Los únicos valores de ?aviso= que se aceptan: "verificar" lo pone
// requireUser() al echar una sesión sin el correo verificado, y "contrasena"
// la acción de /restablecer-contrasena. Cualquier otro (o varios) se ignora:
// de la URL solo sale cuál de estos avisos pintar, nunca un texto.
const AVISOS: readonly AvisoLogin[] = ["verificar", "contrasena"];

function parseAviso(value: string | string[] | undefined): AvisoLogin | null {
  return AVISOS.find((aviso) => aviso === value) ?? null;
}

// Solo el formulario es componente de cliente.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { aviso } = await searchParams;

  return (
    <AuthLayout page="login">
      <LoginForm aviso={parseAviso(aviso)} />
    </AuthLayout>
  );
}
