import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión · Ember",
};

// Página estática: solo el formulario es componente de cliente.
export default function LoginPage() {
  return (
    <AuthLayout page="login">
      <LoginForm />
    </AuthLayout>
  );
}
