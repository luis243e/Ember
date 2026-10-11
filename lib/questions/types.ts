// Tipo de las preguntas que reciben los contraataques. Va aparte para que
// generic.ts y provider.ts lo compartan sin importarse el uno al otro.
import type { QuestionType } from "@prisma/client";

// Una pregunta lista para el combate, con la respuesta: SOLO del servidor.
// El navegador nunca debe recibir correctIndex ni explanation antes de
// contestar (ver el comentario de preguntasParaContraataque en provider.ts).
export type BattleQuestion = {
  // id de la fila Question; null en las genéricas, que no están en la base.
  id: string | null;
  // GENERIC = autoevaluación de lib/questions/generic.ts.
  source: "MANUAL" | "AGENT" | "GENERIC";
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
};
