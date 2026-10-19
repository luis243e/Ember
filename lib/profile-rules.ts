// Reglas del perfil que comparten el servidor y los formularios. Sin nada del
// servidor: se pueden importar desde un componente de cliente (para el
// maxLength de los campos, por ejemplo).
import { normalizeName } from "@/lib/text";

// El nombre de vigilante: de 2 a 40 caracteres, ya normalizado (sin espacios
// en los extremos ni repetidos dentro). Se cuentan CARACTERES (Array.from),
// no unidades de UTF-16: una "é" o un emoji cuentan como uno.
export const VIGILANTE_NAME = { min: 2, max: 40 } as const;

export const NAME_ERRORS = {
  tooShort: `El nombre de vigilante debe tener al menos ${VIGILANTE_NAME.min} caracteres.`,
  tooLong: `El nombre de vigilante no puede pasar de ${VIGILANTE_NAME.max} caracteres.`,
} as const;

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

// LA regla del nombre: la usan el registro (en el hook de lib/auth.ts), el
// perfil y el inicio de sesión con Google (que no falla: ver fitVigilanteName).
export function checkVigilanteName(raw: string): NameCheck {
  const name = normalizeName(raw);
  const length = Array.from(name).length;
  if (length < VIGILANTE_NAME.min) return { ok: false, error: NAME_ERRORS.tooShort };
  if (length > VIGILANTE_NAME.max) return { ok: false, error: NAME_ERRORS.tooLong };
  return { ok: true, name };
}

// Para los nombres que no escribe el usuario en un formulario (el de Google):
// en vez de rechazarlo, se ajusta. Normalizado y recortado a 40 caracteres;
// si queda con menos de 2, "Vigilante". El usuario lo puede cambiar después
// en el perfil.
export const FALLBACK_NAME = "Vigilante";

export function fitVigilanteName(raw: string | null | undefined): string {
  const chars = Array.from(normalizeName(raw ?? ""));
  const name = chars.slice(0, VIGILANTE_NAME.max).join("").trim();
  return Array.from(name).length >= VIGILANTE_NAME.min ? name : FALLBACK_NAME;
}

// Lo que hay que escribir para borrar la cuenta. Se compara tal cual (sin
// pasar a mayúsculas): escribirlo es la confirmación.
export const DELETE_CONFIRMATION = "BORRAR";

// Contraseñas: los límites de Better Auth (lib/auth.ts no los cambia), los
// mismos del registro y del restablecimiento.
export const PASSWORD_LIMITS = { min: 8, max: 128 } as const;

// Una sesión es "reciente" durante 24 horas desde que se abrió: lo mismo que
// el freshAge por defecto de Better Auth (lib/auth.ts no lo cambia). Crear una
// contraseña o borrar una cuenta sin contraseña la piden.
export const FRESH_SESSION_MS = 24 * 60 * 60 * 1000;

// Minutos que dura una vigilia, para las horas estudiadas del perfil. Son los
// 25 de la regla (VIGIL_MINUTES), no la duración real guardada: con la
// vigilia corta de pruebas saldrían horas de juguete.
export function hoursStudied(strikes: number, vigilMinutes: number): number {
  return Math.round((strikes * vigilMinutes) / 6) / 10;
}
