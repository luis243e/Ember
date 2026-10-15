import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { EnlaceInvalido } from "./enlace-invalido";
import { RestablecerForm } from "./restablecer-form";

export const metadata: Metadata = {
  title: "Crear contraseña nueva · Ember",
};

// Aquí llega el enlace del correo (RESET_CALLBACK_PATH). Antes, Better Auth
// ha comprobado el token: si vale, redirige con ?token=…; si no existe o
// caducó, con ?error=INVALID_TOKEN. Lo que no comprueba aquí (un token ya
// usado al recargar) lo rechaza la acción al enviar.
export default async function RestablecerContrasenaPage({
  searchParams,
}: PageProps<"/restablecer-contrasena">) {
  const { token, error } = await searchParams;
  const valido = typeof token === "string" && token !== "" && error === undefined;

  return (
    <AuthLayout page="restablecer">
      {valido ? <RestablecerForm token={token} /> : <EnlaceInvalido />}
    </AuthLayout>
  );
}
