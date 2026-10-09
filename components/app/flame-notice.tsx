import { Notice } from "@/components/app/notice";

// Aviso "La llama se ha extinguido". AppShell lo pone debajo de la cabecera
// cuando la llama está apagada pero había racha (flameState().extinguished).
// Desaparece solo al volver a golpear, porque la racha pasa a 1.
export function ExtinguishedFlameNotice() {
  return (
    <Notice title="La llama se ha extinguido.">Golpea hoy para volver a encenderla.</Notice>
  );
}
