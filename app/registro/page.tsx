import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { googleEnabled } from "@/lib/auth";
import { RegistroForm } from "./registro-form";

export const metadata: Metadata = {
  title: "Crear cuenta · Ember",
};

// Página estática: solo los formularios son componentes de cliente. Si la
// vuelta de Google falla, Better Auth lleva a /login (que lo explica), nunca
// aquí: esta página no lee la URL.
export default function RegistroPage() {
  return (
    <AuthLayout page="registro">
      <RegistroForm google={googleEnabled} />
    </AuthLayout>
  );
}
