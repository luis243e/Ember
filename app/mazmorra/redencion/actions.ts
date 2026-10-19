"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { comenzarPruebaDe, responderPruebaDe, type ResultadoPrueba } from "@/lib/redemption-trial";

// Solo tipos: el componente de cliente puede importarlos de aquí sin cargar
// nada del servidor.
export type { ResultadoPrueba, TrialSummary } from "@/lib/redemption-trial";

// Como las de la batalla, estas acciones son la PUERTA: comprueban la sesión
// y llaman a lib/redemption-trial.ts, que hace las transacciones. Ninguna
// recibe un userId: sale siempre de la sesión.

// "Afrontar la prueba": empieza un intento (o retoma el abierto) y lleva a la
// prueba. Va en un <form> sin JavaScript de cliente. Pase lo que pase, se va a
// /mazmorra/redencion: si no se pudo empezar (sin intentos, plazo vencido,
// pocas preguntas), esa página lo explica con lo que hay en la base, sin
// pasar ningún texto por la URL.
export async function comenzarPrueba(): Promise<void> {
  const user = await requireUser();
  await comenzarPruebaDe(user.id);
  // redirect() funciona lanzando un error especial: va al final.
  redirect("/mazmorra/redencion");
}

// Contesta la pregunta questionNumber (la que el navegador está enseñando,
// empezando en 0) con la opción MOSTRADA chosenIndex, o la esquiva con null.
export async function responderPrueba(
  trialId: string,
  questionNumber: number,
  chosenIndex: number | null,
): Promise<ResultadoPrueba> {
  const user = await requireUser();
  // Llega de una petición que cualquiera puede fabricar: se comprueba el tipo
  // de cada cosa antes de usarla.
  if (typeof trialId !== "string") notFound();
  if (!Number.isInteger(questionNumber) || questionNumber < 0) {
    return { ok: false, error: "Esa pregunta no existe." };
  }
  if (chosenIndex !== null && !Number.isInteger(chosenIndex)) {
    return { ok: false, error: "Esa opción no existe." };
  }

  const resultado = await responderPruebaDe(user.id, trialId, questionNumber, chosenIndex);
  // No existe o es de otro: 404, sin distinguir los dos casos.
  if (!resultado) notFound();

  // La página vuelve a pintarse (la pregunta siguiente, las almas si aprobó).
  // El panel conserva la respuesta y el resumen en su estado.
  refresh();
  return resultado;
}
