import Image from "next/image";
import { cn } from "@/lib/cn";
import { levelForSouls } from "@/lib/game";
import { formatNumber } from "@/lib/text";

// Lo que hace falta del usuario de la sesión (requireUser() ya lo trae).
export type CharacterUser = {
  name: string;
  image?: string | null;
  souls: number;
};

type CharacterCardProps = {
  user: CharacterUser;
  className?: string;
};

// Bloque del personaje (Figma "ALMAS Y NIVELES"): avatar, nombre, nivel y
// barra de almas hacia el siguiente nivel. Componente de servidor: no manda
// JavaScript al navegador. El nivel se deduce de las almas con
// levelForSouls(), igual que en el servidor al golpear.
export function CharacterCard({ user, className }: CharacterCardProps) {
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
        {/* min-w-0: sin esto, truncate no puede cortar dentro de un flex. */}
        <div className="flex min-w-0 flex-col gap-[3px] leading-[normal]">
          <p title={user.name} className="truncate text-[15px] font-semibold text-parchment">
            {user.name}
          </p>
          <p className="font-display text-xs font-bold tracking-[1.5px] text-gold uppercase">
            Nivel {level}
          </p>
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

// Primera letra del nombre, en mayúscula. Array.from separa por caracteres
// reales (una "É" o un emoji no se parten). Sin nombre, "?".
function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase("es") : "?";
}
