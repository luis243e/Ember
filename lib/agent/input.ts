// Lee y comprueba lo que la tarjeta del escriba envía en la FormData: el modo
// (kind) y los apuntes de texto o el PDF. SOLO del servidor. Lo que llega es
// de una petición que cualquiera puede fabricar: no se da nada por bueno.
//
// Los apuntes y el PDF solo existen aquí en memoria, el tiempo que dura la
// petición: no se guardan ni se registran en ningún log.
import type { AgentInput } from "@/lib/agent/gemini";
import { comprobarPdf } from "@/lib/agent/pdf";
import { AGENT, AGENT_ERRORS, normalizarApuntes } from "@/lib/agent/rules";

// Lo que pide la tarjeta: apuntes (texto o PDF) o reforzar. En el refuerzo
// NO llega ninguna pregunta: qué preguntas se mandan lo decide el servidor
// (lib/agent/reinforce.ts) al invocar.
export type EscribaRequest = Exclude<AgentInput, { kind: "REINFORCE" }> | { kind: "REINFORCE" };

export type EntradaLeida = { ok: true; input: EscribaRequest } | { ok: false; error: string };

export async function leerEntrada(formData: FormData): Promise<EntradaLeida> {
  const kind = formData.get("kind");

  if (kind === "TEXT") {
    const value = formData.get("notes");
    const text = typeof value === "string" ? normalizarApuntes(value).trim() : "";
    if (text === "") return { ok: false, error: AGENT_ERRORS.emptyText };
    if (text.length > AGENT.maxTextChars) return { ok: false, error: AGENT_ERRORS.textTooLong };
    return { ok: true, input: { kind: "TEXT", text } };
  }

  if (kind === "PDF") {
    const file = formData.get("pdf");
    // Un campo de texto o un archivo vacío no son un PDF.
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: AGENT_ERRORS.noPdf };
    // Antes de leer nada: un archivo que ya dice pesar demasiado no se copia
    // en un Buffer.
    if (file.size > AGENT.maxPdfBytes) return { ok: false, error: AGENT_ERRORS.pdfTooBig };
    const bytes = Buffer.from(await file.arrayBuffer());
    const check = comprobarPdf(file, bytes);
    if (!check.ok) return check;
    return { ok: true, input: { kind: "PDF", data: bytes } };
  }

  // Reforzar: nada más que el modo. Si la FormData trae otros campos
  // (preguntas, ids...), se ignoran.
  if (kind === "REINFORCE") return { ok: true, input: { kind: "REINFORCE" } };

  return { ok: false, error: "Elige si vas a pegar texto, subir un PDF o reforzar tus puntos débiles." };
}
