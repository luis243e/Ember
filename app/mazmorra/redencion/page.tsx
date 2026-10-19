import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { loadRedemption } from "@/lib/redemption";
import { loadOpenTrial, loadTrialStatus } from "@/lib/redemption-trial";
import { REDEMPTION } from "@/lib/game";
import { formatNumber } from "@/lib/text";
import { AppShell } from "@/components/app/app-shell";
import { PruebaPanel } from "./prueba-panel";

export const metadata: Metadata = {
  title: "Prueba de redención · Ember",
};

// La prueba de redención en su propia pantalla. SOLO lee: empezarla es la
// acción comenzarPrueba (un <form>), y contestarla, responderPrueba. Nunca
// redirige: si la misión se cumple al contestar la última, el panel sigue
// enseñando el resumen mientras la página se repinta sin misión.
export default async function RedencionPage() {
  const sessionUser = await requireUser();

  // La revisión de jefes vencidos (puede vencer la misión) y el estado de la
  // misión, en paralelo. Si la revisión cambió algo, el estado se vuelve a
  // leer.
  const [{ user, revised, notices }, firstRead] = await Promise.all([
    loadRedemption(sessionUser),
    loadTrialStatus(sessionUser.id),
  ]);
  const status = revised ? await loadTrialStatus(user.id) : firstRead;
  // La pregunta que toca, solo si hay una prueba abierta (una lectura más).
  const trial = status?.openTrialId ? await loadOpenTrial(user.id, status.openTrialId) : null;

  const { questions, passWith } = REDEMPTION.trial;
  const description =
    status?.rule === "TRIAL"
      ? `Acierta ${passWith} de ${questions} preguntas de «${status.subjectName}» y recuperas ${
          status.soulsAtStake === 1 ? "tu alma" : `tus ${formatNumber(status.soulsAtStake)} almas`
        }.`
      : "Te devuelve las almas que perdiste al caer ante un jefe.";

  return (
    <AppShell
      active="mazmorra"
      user={user}
      notices={notices}
      title="Prueba de redención"
      description={description}
      back={{ href: "/mazmorra", label: "Mi mazmorra" }}
    >
      <PruebaPanel
        status={
          status && {
            rule: status.rule,
            soulsAtStake: status.soulsAtStake,
            deadlineText: status.deadlineText,
            hoursLeft: status.hoursLeft,
            attemptsLeft: status.attemptsLeft,
            subjectName: status.subjectName,
            bankSize: status.bankSize,
          }
        }
        trial={trial}
      />
    </AppShell>
  );
}
