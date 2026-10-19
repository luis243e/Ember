// Reglas de los compañeros que comparten el servidor y los formularios. Sin
// nada del servidor: se pueden importar desde un componente de cliente.
//
// Compañeros = solo entre amigos, nada público: cada uno se añade con un
// código que el otro te da. Lo que ve un compañero: tu nombre y, si lo
// permites (User.showStats), tu título, nivel, llama y golpes de la semana.
// Nunca tu correo ni nada de tu banco de preguntas.

// 32 símbolos sin los que se confunden (0/O y 1/I): con 32, cada símbolo
// sale de 5 bits exactos de azar, sin sesgo. EL MISMO alfabeto que el CHECK y
// el relleno de la migración fase4: no cambiarlo.
export const FRIEND_CODE = {
  alphabet: "23456789ABCDEFGHJKLMNPQRSTUVWXYZ",
  length: 8,
} as const;

export const FRIENDS = {
  // Solicitudes con un código bien formado al día (de Colombia), existan o no.
  dailyRequests: 20,
  // Compañeros como mucho, de cada uno.
  maxFriends: 50,
} as const;

const CODE_PATTERN = new RegExp(`^[${FRIEND_CODE.alphabet}]{${FRIEND_CODE.length}}$`);

// Lo que escribe el usuario, como se guarda: en mayúsculas y sin espacios ni
// guiones ("7kq2-m9xd " → "7KQ2M9XD"). Se valida DESPUÉS.
export function normalizeFriendCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]+/g, "");
}

export function isFriendCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

// Para enseñarlo: "7KQ2-M9XD" (el guion solo se pinta: al introducirlo, se
// quita).
export function formatFriendCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// LA regla de la clasificación semanal: más golpes primero; con los mismos,
// quien llegó antes a esa cifra (su último golpe de la semana fue antes); y si
// aun así empatan, por nombre (y por una clave estable, para que el orden no
// cambie de una carga a otra).
export type RankingEntry = { strikes: number; lastStrikeAt: Date | null; name: string; key: string };

export function compareRanking(a: RankingEntry, b: RankingEntry): number {
  if (a.strikes !== b.strikes) return b.strikes - a.strikes;
  const at = a.lastStrikeAt?.getTime() ?? Infinity;
  const bt = b.lastStrikeAt?.getTime() ?? Infinity;
  if (at !== bt) return at - bt;
  const byName = a.name.localeCompare(b.name, "es");
  if (byName !== 0) return byName;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
