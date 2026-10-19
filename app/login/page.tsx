import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { GoogleButton } from "@/components/auth/google-button";
import { googleEnabled } from "@/lib/auth";
import { googleErrorKind } from "@/lib/google-errors";
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

// Solo los formularios son componentes de cliente. ?error= lo pone Better
// Auth al volver de Google sin sesión: también se compara con una lista de
// códigos conocidos (googleErrorKind) y el texto vive en el código.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { aviso, error } = await searchParams;

  return (
    <AuthLayout page="login">
      <div className="flex flex-col gap-5 md:gap-6">
        <LoginForm aviso={parseAviso(aviso)} googleError={googleErrorKind(error)} />
        {googleEnabled && <GoogleButton />}
      </div>
    </AuthLayout>
  );
}
