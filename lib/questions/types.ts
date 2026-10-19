// Tipo de las preguntas que reciben los contraataques. Va aparte para que
// generic.ts y provider.ts lo compartan sin importarse el uno al otro.
import type { QuestionType } from "@prisma/client";
import type { CounterattackKind } from "@/lib/game";

// Una pregunta lista para el combate, con la respuesta: SOLO del servidor.
// El navegador nunca debe recibir correctIndex ni explanation antes de
// contestar (ver el comentario de preguntasParaContraataque en provider.ts).
export type BattleQuestion = {
  // id de la fila Question; null en las genéricas, que no están en la base.
  id: string | null;
  // Clave estable de las genéricas (lib/questions/generic.ts); null en las
  // del banco. Con id o key, el contraataque sabe qué pregunta salió.
  key: string | null;
  // GENERIC = autoevaluación de lib/questions/generic.ts.
  source: "MANUAL" | "AGENT" | "GENERIC";
  type: QuestionType;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  // La fallaste (o esquivaste) la última vez que salió: el contraataque la
  // marca como REPASO. Siempre false en las nuevas, las selladas y las
  // genéricas.
  review: boolean;
};

// Lo que el NAVEGADOR recibe de una pregunta del contraataque: el tipo (para
// la línea de lo que está en juego), el enunciado y las opciones ya en el
// orden mostrado. Ni id, ni correctIndex, ni explicación: esos solo viajan
// en la respuesta de la acción, DESPUÉS de contestar. Lo construye
// publicQuestion() (lib/questions/counterattack.ts).
export type PublicQuestion = {
  kind: CounterattackKind;
  // La escribió el escriba: el panel enseña "Del agente" y, después de
  // contestarla, el enlace para retirarla.
  fromAgent: boolean;
  // Vuelve después de fallarla: el panel enseña "Repaso". Solo el booleano:
  // ni el nivel ni la fecha salen del servidor.
  review: boolean;
  prompt: string;
  options: string[];
  // La opción MOSTRADA que tachó el Ojo del escriba (deshabilitada), o null.
  // Nunca dice cuál es la correcta.
  struck: number | null;
};
