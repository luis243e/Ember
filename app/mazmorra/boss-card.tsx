import { Calendar } from "lucide-react";
import type { Difficulty } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cardStyles } from "@/components/ui/card";
import { HpBar } from "@/components/ui/hp-bar";
import { SpriteSlot } from "@/components/ui/sprite-slot";
import { cn } from "@/lib/cn";
import { formatDueDate } from "@/lib/dates";
import { DIFFICULTY_LABELS } from "@/lib/game";

type BossCardProps = {
  task: {
    name: string;
    dueDate: Date;
    difficulty: Difficulty;
    maxHp: number;
    currentHp: number;
    subject: { name: string };
  };
};

// Tarjeta de un jefe vivo en la mazmorra (Figma "tarjeta de jefe"). Va dentro
// de un <ul>, por eso es un <li>. Cuando exista la batalla, aquí irá
// "Atacar".
export function BossCard({ task }: BossCardProps) {
  return (
    <li className={cn(cardStyles, "flex min-w-0 flex-col gap-4.5 p-5 md:p-6")}>
      <SpriteSlot />

      <Badge className="self-start">{DIFFICULTY_LABELS[task.difficulty]}</Badge>

      {/* wrap-anywhere: un nombre de 80 caracteres sin espacios se parte en
          varias líneas en vez de salirse de la tarjeta. */}
      <div className="flex flex-col gap-1.5 leading-[normal] wrap-anywhere">
        <h3 className="font-display text-xl font-bold text-parchment">{task.name}</h3>
        <p className="text-sm text-smoke">{task.subject.name}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="flex items-center justify-between leading-[normal]">
          <span className="text-[11px] font-medium tracking-[1px] text-smoke uppercase">Vida</span>
          <span className="text-[13px] font-semibold text-parchment">
            {task.currentHp} / {task.maxHp}
          </span>
        </p>
        <HpBar current={task.currentHp} max={task.maxHp} />
      </div>

      <p className="flex items-center gap-2 border-t border-line pt-4 text-[13px] leading-[normal] text-ash">
        <Calendar aria-hidden size={16} className="shrink-0 text-smoke" />
        {/* El icono no se lee: este texto aclara qué fecha es. */}
        <span className="sr-only">Entrega: </span>
        {formatDueDate(task.dueDate)}
      </p>
    </li>
  );
}
