"use client";

import { Check, Gem, Lock } from "lucide-react";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { buttonStyles } from "@/components/ui/button";
import { labelStyles } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import type { RelicKey } from "@/lib/game";
import { equiparReliquia, type EstadoPerfil } from "./actions";

const estadoInicial: EstadoPerfil = { error: null, done: false };

export type RelicView = {
  key: RelicKey;
  name: string;
  title: string;
  how: string;
  // Ya formateada en el servidor (o null si falta).
  earnedText: string | null;
};

// La colección de reliquias: las conseguidas con su título y las que faltan
// en silueta (se ve cómo conseguirlas, no su nombre). Debajo, elegir el
// título que aparece bajo el nombre en la tarjeta del personaje. Solo
// adornan: ninguna da nada en el juego.
export function Reliquias({ relics, equipped }: { relics: RelicView[]; equipped: RelicKey | null }) {
  const [estado, accion, enviando] = useActionState(equiparReliquia, estadoInicial);
  const owned = relics.filter((r) => r.earnedText !== null);

  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-3">
        {relics.map((relic) => {
          const earned = relic.earnedText !== null;
          return (
            <li
              key={relic.key}
              className={cn(
                "flex items-start gap-3 rounded-md border px-4 py-3",
                earned ? "border-gold/40 bg-night" : "border-line border-dashed bg-night/50",
              )}
            >
              {earned ? (
                <Gem aria-hidden size={20} className="mt-0.5 shrink-0 text-gold-bright" />
              ) : (
                <Lock aria-hidden size={20} className="mt-0.5 shrink-0 text-smoke" />
              )}
              <div className="flex min-w-0 flex-col gap-1 leading-snug">
                {earned ? (
                  <>
                    <p className="text-sm font-semibold text-parchment">{relic.name}</p>
                    <p className="text-xs text-gold">Título: {relic.title}</p>
                    <p className="text-xs text-smoke">{relic.earnedText}</p>
                  </>
                ) : (
                  <>
                    {/* En silueta: el nombre no se ve hasta conseguirla. */}
                    <p className="text-sm font-semibold text-smoke">
                      <span aria-hidden>? ? ?</span>
                      <span className="sr-only">Reliquia por conseguir</span>
                    </p>
                    <p className="text-xs text-ash">{relic.how}</p>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {owned.length === 0 ? (
        <p className="text-sm leading-normal text-ash">
          Vence a tu primer jefe para conseguir una reliquia y su título.
        </p>
      ) : (
        <form action={accion} className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className={cn(labelStyles, "mb-2")}>Título bajo tu nombre</legend>
            {/* Radios nativos: teclado y lector funcionan sin JavaScript. */}
            {[{ key: "none", title: "Sin título" }, ...owned].map((option) => (
              <label
                key={option.key}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-night px-3 text-sm text-parchment has-checked:border-gold"
              >
                <input
                  type="radio"
                  name="relic"
                  value={option.key}
                  defaultChecked={(equipped ?? "none") === option.key}
                  className="size-4 accent-gold"
                />
                {option.title}
              </label>
            ))}
          </fieldset>
          {estado.error && !enviando && <Alert>{estado.error}</Alert>}
          {estado.done && !enviando && (
            <Alert tone="info" icon={Check}>
              Título guardado.
            </Alert>
          )}
          <button
            type="submit"
            disabled={enviando}
            className={cn(buttonStyles({ variant: "ghost", size: "md" }), "w-full @sm:w-auto @sm:self-start")}
          >
            {enviando ? "Guardando..." : "Equipar título"}
          </button>
        </form>
      )}
    </div>
  );
}
