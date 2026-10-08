// Helpers de texto compartidos.

// Números con separador de miles: 1234 → "1.234". Con "es-CO" y no con "es":
// el español genérico no agrupa los números de cuatro cifras ("1234"), y la
// app ya da por hecho Colombia (APP_TIME_ZONE en lib/dates.ts). Se crea una
// sola vez: crear un formateador es caro.
const numberFormat = new Intl.NumberFormat("es-CO");

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

// Quita los espacios de los extremos y junta los repetidos de dentro:
// "  Cálculo   II " → "Cálculo II". Se valida siempre DESPUÉS de normalizar.
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
