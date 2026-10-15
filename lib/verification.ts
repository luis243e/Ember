// Constantes de los enlaces que llegan por correo: el de verificación y el de
// restablecer la contraseña. Sin imports de servidor: las usan también las
// pantallas de cliente (/registro, /verificar-correo, /olvide-contrasena).

// Lo que dura el enlace. lib/auth.ts se lo pasa a Better Auth
// (emailVerification.expiresIn) y el correo y las pantallas lo dicen.
export const VERIFICATION_LINK_SECONDS = 60 * 60;

// Adónde vuelve el enlace, tanto si sale bien como si no: Better Auth usa el
// mismo callbackURL para los dos casos y, si falla, le añade ?error=CODIGO.
export const VERIFY_CALLBACK_PATH = "/verificar-correo";

// Segundos que el botón de reenviar espera entre envíos. Es solo la cuenta
// atrás de la pantalla: el límite de verdad está en lib/auth-emails.ts.
export const RESEND_WAIT_SECONDS = 60;

// Lo que dura el enlace para crear una contraseña nueva. lib/auth.ts se lo
// pasa a Better Auth (resetPasswordTokenExpiresIn).
export const RESET_LINK_SECONDS = 60 * 60;

// Adónde lleva ese enlace: Better Auth comprueba el token y redirige aquí con
// ?token=… (válido) o ?error=INVALID_TOKEN (no vale o caducó).
export const RESET_CALLBACK_PATH = "/restablecer-contrasena";

// "1 hora", "24 horas"... Sin argumento, lo que dura el de verificación.
export function linkDurationText(seconds: number = VERIFICATION_LINK_SECONDS): string {
  const hours = seconds / 3600;
  return hours === 1 ? "1 hora" : `${hours} horas`;
}
