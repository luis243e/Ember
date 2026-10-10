import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión · Ember",
};

// Solo el formulario es componente de cliente. Lee ?aviso=verificar, que pone
// requireUser() al echar una sesión sin el correo verificado.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { aviso } = await searchParams;

  return (
    <AuthLayout page="login">
      <LoginForm avisoVerificar={aviso === "verificar"} />
    </AuthLayout>
  );
}
