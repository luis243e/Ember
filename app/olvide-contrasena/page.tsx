import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { OlvideForm } from "./olvide-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña · Ember",
};

// Página estática: solo el formulario es componente de cliente.
export default function OlvideContrasenaPage() {
  return (
    <AuthLayout page="olvide">
      <OlvideForm />
    </AuthLayout>
  );
}
