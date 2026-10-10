import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/components/auth/auth-layout";
import { ReenviarEnlace } from "@/components/auth/reenviar-enlace";
import { Alert } from "@/components/ui/alert";
import { verificationLinkMessage } from "@/lib/auth-errors";

export const metadata: Metadata = {
  title: "Verificar correo · Ember",
};

// Aquí vuelve el enlace del correo (VERIFY_CALLBACK_PATH). Better Auth ya ha
// verificado el correo y abierto la sesión antes de redirigir; si algo falló,
// llega ?error=CODIGO (TOKEN_EXPIRED, INVALID_TOKEN...).
export default async function VerificarCorreoPage({ searchParams }: PageProps<"/verificar-correo">) {
  const { error } = await searchParams;

  // Sin error: correo verificado y sesión abierta. A la mazmorra (que, con
  // requireUser(), lo vuelve a comprobar).
  if (typeof error !== "string") redirect("/mazmorra");

  return (
    <AuthLayout page="verificar">
      <div className="flex flex-col gap-5">
        <Alert>{verificationLinkMessage(error)}</Alert>
        <ReenviarEnlace label="Enviar otro enlace" />
      </div>
    </AuthLayout>
  );
}
