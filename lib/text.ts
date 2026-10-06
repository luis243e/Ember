// Helpers de texto compartidos por los formularios.

// Quita los espacios de los extremos y junta los repetidos de dentro:
// "  Cálculo   II " → "Cálculo II". Se valida siempre DESPUÉS de normalizar.
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
