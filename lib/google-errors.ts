// Lo que /login dice cuando la vuelta de Google no termina en una sesión.
// Better Auth redirige a /login?error=<código> (errorCallbackURL y
// onAPIError.errorURL en lib/auth.ts). De la URL solo se usa el código para
// elegir uno de estos textos, nunca se pinta: un código desconocido da el
// mensaje general. Sin nada del servidor: lo usan la página y el formulario.

// account_not_linked: ya existe una cuenta con ese correo y NO se vincula
// (Google no lo da por verificado, o la cuenta de Ember no lo está). OJO: el
// mensaje NUNCA pide "verifica tu correo". Si quien registró ese correo es un
// atacante con su propia contraseña, al dueño ya le llegó el enlace de
// verificación de ESA cuenta: si lo pulsa, la cuenta del atacante queda
// verificada, se vincula con Google y el atacante conserva su contraseña.
// "Olvidé mi contraseña" sí lo expulsa: cambia la contraseña, cierra todas
// las sesiones y verifica el correo.
export type GoogleErrorKind = "exists" | "unverified" | "cancelled" | "failed";

export function googleErrorKind(code: string | string[] | undefined): GoogleErrorKind | null {
  if (typeof code !== "string" || code === "") return null;
  switch (code) {
    case "account_not_linked":
    case "OAUTH_LINK_ERROR":
      return "exists";
    // El hook de lib/auth.ts no crea la cuenta si Google no da el correo por
    // verificado (GOOGLE_EMAIL_NOT_VERIFIED). unable_to_create_user, por si
    // Better Auth no pudiera crearla por otra razón.
    case "GOOGLE_EMAIL_NOT_VERIFIED":
    case "unable_to_create_user":
      return "unverified";
    case "access_denied":
      return "cancelled";
    default:
      return "failed";
  }
}

export const GOOGLE_ERRORS: Record<Exclude<GoogleErrorKind, "exists">, string> = {
  unverified:
    "Google no ha confirmado ese correo, así que no podemos crear tu cuenta con él. Regístrate con correo y contraseña.",
  cancelled: "Has cancelado el inicio de sesión con Google.",
  failed: "No se pudo completar el inicio de sesión con Google. Vuelve a intentarlo.",
};

// El de "exists" lleva un enlace: el formulario lo pinta con
// GOOGLE_EXISTS_TEXT y el enlace a /olvide-contrasena.
export const GOOGLE_EXISTS_TEXT = {
  before: "Ya existe una cuenta con este correo. Si no la creaste tú o no recuerdas la contraseña, usa",
  link: "Olvidé mi contraseña",
  after: ".",
} as const;
