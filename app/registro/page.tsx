import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { RegistroForm } from "./registro-form";

export const metadata: Metadata = {
  title: "Crear cuenta · Ember",
};

// Página estática: solo el formulario es componente de cliente.
export default function RegistroPage() {
  return (
    <AuthLayout page="registro">
      <RegistroForm />
    </AuthLayout>
  );
}
