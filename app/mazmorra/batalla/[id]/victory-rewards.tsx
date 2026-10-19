"use client";

import Link from "next/link";
import { Check, Gem, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import type { BlessingKey } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { BLESSINGS, RARITY_LABELS, type BlessingRarity } from "@/lib/game";
import type { VictoryRewards as VictoryRewardsData } from "@/lib/rewards";
import { elegirBendicion } from "./actions";

// La rareza, en la etiqueta de la carta. La común en gris; la rara en oro; la
// épica en ascua.
const RARITY_TONES: Record<BlessingRarity, "muted" | "gold" | "ember"> = {
  common: "muted",
  rare: "gold",
  epic: "ember",
};

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";

// Las recompensas de la victoria, debajo de la escena: la reliquia (si este
// golpe la dio) y las cartas de bendición para elegir una. Las opciones las
// fijó el servidor al vencer; aquí solo se pintan y se manda cuál se elige
// (elegirBendicion, que lo valida todo). Ninguna recompensa da golpes ni
// quita vida: solo almas, brasas, una opción tachada o el mínimo de la prueba.
export function VictoryRewards({ victory }: { victory: VictoryRewardsData }) {
  const { offer, relic } = victory;
  if (!offer && !relic) return null;
  return (
    <div className="flex w-full flex-col gap-6 px-4 pt-6 pb-10 @2xl:max-w-5xl @2xl:px-0">
      {relic && (
        <section
          aria-labelledby="reliquia-conseguida"
          className="flex items-start gap-3.5 rounded-[10px] border border-gold/50 bg-gold/8 p-4"
        >
          <Gem aria-hidden size={22} className="mt-0.5 shrink-0 text-gold-bright" />
          <div className="flex min-w-0 flex-col gap-1 leading-normal">
            <h2 id="reliquia-conseguida" className="font-display text-[15px] font-bold text-gold-bright">
              Reliquia conseguida: {relic.name}
            </h2>
            <p className="text-sm text-ash">
              Te da el título «{relic.title}». Solo adorna: equípalo en tu{" "}
              <Link href="/perfil#reliquias" className={cn("rounded-sm font-semibold text-gold-bright underline", FOCUS_RING)}>
                perfil
              </Link>
              .
            </p>
          </div>
        </section>
      )}
      {offer && <BlessingOffer offer={offer} />}
    </div>
  );
}

function BlessingOffer({ offer }: { offer: NonNullable<VictoryRewardsData["offer"]> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<BlessingKey | null>(null);
  const chosenRef = useRef<HTMLParagraphElement>(null);
  const wasPending = useRef(offer.chosenKey === null);

  // Al elegir, las cartas desaparecen y el foco pasa a la confirmación (si
  // no, se iría a <body>).
  useEffect(() => {
    if (offer.chosenKey && wasPending.current) chosenRef.current?.focus();
    wasPending.current = offer.chosenKey === null;
  }, [offer.chosenKey]);

  function choose(key: BlessingKey) {
    if (pending) return;
    setError(null);
    setChoosing(key);
    startTransition(async () => {
      const result = await elegirBendicion(offer.id, key);
      if (!result.ok) setError(result.error);
      setChoosing(null);
    });
  }

  if (offer.chosenKey) {
    const chosen = BLESSINGS[offer.chosenKey];
    return (
      <section aria-labelledby="bendicion-elegida" className="flex flex-col gap-2">
        <h2 id="bendicion-elegida" className="font-display text-lg leading-[normal] font-bold text-gold-bright">
          Tu bendición
        </h2>
        <p
          ref={chosenRef}
          tabIndex={-1}
          role="status"
          className={cn("flex items-start gap-2 rounded-sm text-[15px] leading-normal text-parchment", FOCUS_RING)}
        >
          <Check aria-hidden size={18} className="mt-0.5 shrink-0 text-gold-bright" />
          <span>
            Has elegido <strong className="font-semibold">{chosen.name}</strong>: {chosen.effect}
          </span>
        </p>
      </section>
    );
  }

  if (offer.expired) {
    return (
      <p className="text-center text-sm leading-normal text-smoke">
        La recompensa de este jefe caducó: había 7 días para elegirla.
      </p>
    );
  }

  return (
    // @container: tres cartas en fila solo si caben (mira el ancho de esta
    // sección, no el de la ventana).
    <section aria-labelledby="elige-bendicion" className="@container flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2
          id="elige-bendicion"
          className="flex items-center gap-2 font-display text-lg leading-[normal] font-bold text-gold-bright"
        >
          <Sparkles aria-hidden size={18} className="shrink-0" />
          Elige una bendición
        </h2>
        <p className="text-sm leading-normal text-smoke">
          Solo una. Si sales sin elegir, te espera en la mazmorra durante 7 días.
        </p>
      </div>
      {error && !pending && <Alert>{error}</Alert>}
      <ul className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
        {offer.cards.map((card) => (
          <li key={card.key} className="flex">
            <div className="flex w-full flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
              <Badge tone={RARITY_TONES[card.rarity]} className="self-start">
                {RARITY_LABELS[card.rarity]}
              </Badge>
              <h3 className="font-display text-base leading-snug font-bold text-parchment">{card.name}</h3>
              <p className="flex-1 text-sm leading-normal text-ash">{card.effect}</p>
              {/* aria-disabled mientras espera: el botón conserva el foco. */}
              <button
                type="button"
                onClick={() => choose(card.key)}
                aria-disabled={pending || undefined}
                aria-label={`Elegir ${card.name} (${RARITY_LABELS[card.rarity].toLowerCase()}): ${card.effect}`}
                className={cn(
                  buttonStyles({ variant: "ghost", size: "sm" }),
                  "w-full cursor-pointer aria-disabled:cursor-wait aria-disabled:opacity-60",
                )}
              >
                {choosing === card.key ? "Eligiendo..." : "Elegir"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
