// Formato del reloj de la vigilia, compartido por el servidor (mensajes de
// error) y el navegador (la cuenta atrás).

// "mm:ss" a partir de los milisegundos que faltan. Redondea los segundos hacia
// arriba: con 24:59,4 por delante se lee 25:00, y 00:00 solo aparece cuando de
// verdad ha llegado la hora de fin.
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
