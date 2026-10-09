import { Notice } from "@/components/app/notice";
import type { RedemptionNotice as RedemptionNoticeData } from "@/lib/redemption";
import { formatNumber } from "@/lib/text";

// Avisos de la caída y de la misión de redención. Los datos los deduce
// loadRedemption() (lib/redemption.ts) de las fechas guardadas.
export function RedemptionNotice({ notice }: { notice: RedemptionNoticeData }) {
  switch (notice.kind) {
    case "fell":
      return (
        <Notice title={`Has caído ante ${fallenBosses(notice.bossName, notice.otherBosses)}.`}>
          No tenías almas que perder.
        </Notice>
      );
    case "recovered":
      return (
        <Notice tone="gold" title="Has recuperado tus almas.">
          {notice.souls === 1
            ? "+1 alma vuelve a ti."
            : `+${formatNumber(notice.souls)} almas vuelven a ti.`}
        </Notice>
      );
    case "vanished":
      return (
        <Notice title="Tus almas se han desvanecido.">
          {notice.reason === "expired"
            ? "El plazo de la misión terminó: "
            : "Volviste a caer antes de recuperarlas: "}
          {notice.souls === 1
            ? "el alma se perdió."
            : `las ${formatNumber(notice.souls)} almas se perdieron.`}
        </Notice>
      );
  }
}

// «El Parcial» o «El Parcial» y 2 jefes más. Lo usa también la tarjeta de la
// misión.
export function fallenBosses(bossName: string, otherBosses: number): string {
  if (otherBosses === 0) return `«${bossName}»`;
  return `«${bossName}» y ${otherBosses} ${otherBosses === 1 ? "jefe más" : "jefes más"}`;
}
