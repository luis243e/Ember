// Constantes del enlace de verificación. Sin imports de servidor: las usan
// también las pantallas de cliente (/registro, /verificar-correo).

// Lo que dura el enlace. lib/auth.ts se lo pasa a Better Auth
// (emailVerification.expiresIn) y el correo y las pantallas lo dicen.
export const VERIFICATION_LINK_SECONDS = 60 * 60;

// Adónde vuelve el enlace, tanto si sale bien como si no: Better Auth usa el
// mismo callbackURL para los dos casos y, si falla, le añade ?error=CODIGO.
export const VERIFY_CALLBACK_PATH = "/verificar-correo";

// Segundos que el botón de reenviar espera entre envíos. Es solo la cuenta
// atrás de la pantalla: el límite de verdad está en lib/auth-emails.ts.
export const RESEND_WAIT_SECONDS = 60;

// "1 hora", "24 horas"...
export function linkDurationText(): string {
  const hours = VERIFICATION_LINK_SECONDS / 3600;
  return hours === 1 ? "1 hora" : `${hours} horas`;
}
