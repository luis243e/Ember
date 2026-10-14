import Image from "next/image";
import { Flame } from "lucide-react";
import { cn } from "@/lib/cn";
import { levelForSouls, type FlameState } from "@/lib/game";
import { formatNumber } from "@/lib/text";

// Lo que hace falta del usuario de la sesión (requireUser() ya lo trae).
export type CharacterUser = {
  name: string;
  image?: string | null;
  souls: number;
};

type CharacterCardProps = {
  user: CharacterUser;
  // Estado de la llama (con las brasas), ya calculado con flameState() (lo hace AppShell una
  // sola vez para los dos bloques, el de escritorio y el de móvil).
  flame: FlameState;
  className?: string;
};

// Bloque del personaje (Figma "ALMAS Y NIVELES" y "LA LLAMA Y LA REDENCIÓN"):
// avatar, nombre con la llama a la derecha, nivel y barra de almas hacia el
// siguiente nivel. Componente de servidor: no manda JavaScript al navegador.
// El nivel se deduce de las almas con levelForSouls(), igual que en el
// servidor al golpear.
export function CharacterCard({ user, flame, className }: CharacterCardProps) {
  const { level, soulsIntoLevel, nextLevelCost } = levelForSouls(user.souls);
  const atMaxLevel = nextLevelCost === null;
  const percent = atMaxLevel ? 100 : (soulsIntoLevel / nextLevelCost) * 100;
  const soulsText = atMaxLevel
    ? "Nivel máximo"
    : `${formatNumber(soulsIntoLevel)} / ${formatNumber(nextLevelCost)} almas`;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-3.5",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {/* Decorativo (alt=""): el nombre ya está al lado. */}
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-gold bg-night font-display text-xl leading-none font-bold text-gold-bright">
          {user.image ? (
            // unoptimized: la foto vendrá de otro dominio (Google) y se
            // sirve tal cual, sin pasar por el optimizador de Next (que
            // exigiría declarar el dominio en next.config).
            <Image
              src={user.image}
              alt=""
              width={48}
              height={48}
              unoptimized
              className="size-full object-cover"
            />
          ) : (
            <span aria-hidden>{initialOf(user.name)}</span>
          )}
        </div>
        {/* min-w-0: sin esto, truncate no puede cortar dentro de un flex.
            flex-1: la columna llega hasta la de la llama, que queda a la
            derecha. */}
        <div className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[normal]">
          <p title={user.name} className="truncate text-[15px] font-semibold text-parchment">
            {user.name}
          </p>
          <p className="font-display text-xs font-bold tracking-[1.5px] text-gold uppercase">
            Nivel {level}
          </p>
        </div>
        {/* "llama y brasas" (104:2, nodo 105:221): la llama arriba y, debajo,
            las brasas, alineadas a la derecha. */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <FlameBadge flame={flame} />
          {flame.embers > 0 && <EmberChip embers={flame.embers} />}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {/* La barra es para el lector de pantalla: role="progressbar" con
            sus valores, y aria-valuetext lo dice en una frase. Por eso el
            texto de debajo, que repite lo mismo, va oculto para él. */}
        <div
          role="progressbar"
          aria-label="Almas para el siguiente nivel"
          aria-valuemin={0}
          aria-valuemax={atMaxLevel ? 1 : nextLevelCost}
          aria-valuenow={atMaxLevel ? 1 : soulsIntoLevel}
          aria-valuetext={
            atMaxLevel
              ? "Nivel máximo"
              : `${formatNumber(soulsIntoLevel)} de ${formatNumber(nextLevelCost)} almas para el nivel ${level + 1}`
          }
          className="h-2 w-full overflow-hidden rounded-sm bg-hp-empty"
        >
          {/* El ancho es un dato, no un estilo fijo: va en línea. */}
          <div className="h-full rounded-sm bg-gold-bright" style={{ width: `${percent}%` }} />
        </div>
        <p aria-hidden className="text-xs leading-[normal] font-medium text-ash">
          {soulsText}
        </p>
      </div>
    </div>
  );
}

// Colores de cada estado: icono y número. En peligro, la llama sigue siendo
// de ascua pero tenue (el 45 % del Figma) y el número pasa a gris claro.
// Protegida se distingue de un vistazo: la misma llama tenue, pero el número
// en ascua y un borde de ascua alrededor (el color de la brasa que la cubre).
const FLAME_COLORS: Record<FlameState["status"], { icon: string; number: string }> = {
  lit: { icon: "text-ember", number: "text-ember" },
  "at-risk": { icon: "text-ember/45", number: "text-ash" },
  protected: { icon: "text-ember/45", number: "text-ember" },
  out: { icon: "text-smoke", number: "text-smoke" },
};

// Lo que dice el lector de pantalla (y el title al pasar el ratón) en cada
// estado. Las brasas cambian el "en peligro" y explican el "protegida".
function flameStatusText(flame: FlameState): string {
  switch (flame.status) {
    case "lit":
      return "Encendida.";
    case "at-risk":
      return flame.embers > 0
        ? "En peligro: golpea hoy para mantenerla. Si no, una brasa la protegerá."
        : "En peligro: golpea hoy para mantener la llama.";
    case "protected":
      return flame.embersToSpend === 1
        ? "Protegida por una brasa: golpea hoy para mantenerla."
        : "Protegida por dos brasas: golpea hoy para mantenerla.";
    case "out":
      return "Apagada.";
  }
}

// La llama junto al nombre: icono y días seguidos. role="img" con aria-label
// hace que el lector de pantalla lea una frase entera ("Racha: 5 días.
// Encendida.") en vez del número suelto. En peligro y protegida lleva además
// title, que el ratón muestra al pasar por encima.
function FlameBadge({ flame }: { flame: FlameState }) {
  const colors = FLAME_COLORS[flame.status];
  const daysText = flame.days === 1 ? "1 día" : `${formatNumber(flame.days)} días`;
  const statusText = flameStatusText(flame);
  return (
    <p
      role="img"
      aria-label={`Racha: ${daysText}. ${statusText}`}
      title={flame.status === "at-risk" || flame.status === "protected" ? statusText : undefined}
      className={cn(
        "flex items-center gap-1 text-[13px] leading-[normal] font-semibold",
        // -mr: el borde no empuja el número hacia dentro; sigue alineado
        // con el de las brasas.
        flame.status === "protected" && "-my-px -mr-1.5 rounded-full border border-ember/60 px-1.5",
      )}
    >
      <Flame aria-hidden size={16} className={colors.icon} />
      <span className={colors.number}>{formatNumber(flame.days)}</span>
    </p>
  );
}

// Las brasas, debajo de la llama (105:218): un punto de ascua y cuántas hay.
// Solo se pinta con 1 o más. Como la llama, role="img" con una frase entera.
function EmberChip({ embers }: { embers: number }) {
  const label =
    embers === 1
      ? "1 brasa: protege tu llama si un día no estudias."
      : `${embers} brasas: protegen tu llama hasta ${embers} días sin estudiar.`;
  return (
    <p
      role="img"
      aria-label={label}
      title={label}
      className="flex items-center gap-[5px] text-[13px] leading-[normal] font-semibold text-parchment"
    >
      <span aria-hidden className="size-2 rounded-full bg-ember shadow-[0_0_6px_var(--color-ember)]" />
      <span>{formatNumber(embers)}</span>
    </p>
  );
}

// Primera letra del nombre, en mayúscula. Array.from separa por caracteres
// reales (una "É" o un emoji no se parten). Sin nombre, "?".
function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase("es") : "?";
}
