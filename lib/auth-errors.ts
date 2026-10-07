import type { APIError } from "better-auth/api";

// Mensajes en español para los errores de Better Auth. La clave es el campo
// `code` del error (error.body.code), que no cambia de un idioma a otro. Los
// códigos salen de better-auth 1.7.7: @better-auth/core/dist/error/codes.mjs,
// y son los que lanzan el registro y el login con correo.
const MESSAGES = new Map<string, string>([
  ["INVALID_EMAIL_OR_PASSWORD", "Correo o contraseña incorrectos."],
  ["USER_ALREADY_EXISTS", "Ya existe una cuenta con ese correo."],
  ["USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", "Ya existe una cuenta con ese correo."],
  // 8 y 128 son los límites por defecto de Better Auth (lib/auth.ts no los cambia).
  ["PASSWORD_TOO_SHORT", "La contraseña debe tener al menos 8 caracteres."],
  ["PASSWORD_TOO_LONG", "La contraseña no puede tener más de 128 caracteres."],
  ["INVALID_EMAIL", "El correo no es válido."],
  ["INVALID_PASSWORD", "La contraseña no es válida."],
  // Aún no ocurre: llegará cuando se active la verificación de correo.
  ["EMAIL_NOT_VERIFIED", "Tienes que verificar tu correo antes de entrar."],
]);

// Para cualquier otro código (fallos al crear el usuario o la sesión...) y
// para errores sin código.
const FALLBACK = "Algo salió mal. Inténtalo de nuevo.";

export function authErrorMessage(error: APIError): string {
  const code = error.body?.code;

  // VALIDATION_ERROR no lo lanza Better Auth sino better-call, al comprobar el
  // cuerpo con su esquema (en el registro, z.email()). No trae un código por
  // campo, solo un texto como "[body.email] Invalid email address", así que
  // miramos el texto para saber si el problema es el correo, el caso real
  // (alguien escribe "luis@gmail"). Si ese formato cambiara, saldría el
  // mensaje general de validación y nada se rompería.
  if (code === "VALIDATION_ERROR") {
    return error.body?.message?.includes("body.email")
      ? "El correo no es válido."
      : "Revisa el correo y la contraseña.";
  }

  return (code && MESSAGES.get(code)) || FALLBACK;
}
