import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar } from "lucide-react";
import type { Difficulty } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { cardStyles } from "@/components/ui/card";
import { HpBar } from "@/components/ui/hp-bar";
import { cn } from "@/lib/cn";
import { formatDueDate } from "@/lib/dates";
import { bossForTask, bossImageSrc, DIFFICULTY_LABELS } from "@/lib/game";

type BossCardProps = {
  task: {
    id: string;
    name: string;
    dueDate: Date;
    difficulty: Difficulty;
    bossKey: string;
    maxHp: number;
    currentHp: number;
    subject: { name: string };
  };
  // La primera tarjeta: su miniatura suele ser lo más grande al cargar (LCP),
  // así que se pide enseguida en vez de esperar a que entre en pantalla.
  eager?: boolean;
};

// Tarjeta de un jefe vivo en la mazmorra (Figma "tarjeta de jefe"). Va dentro
// de un <ul>, por eso es un <li>.
export function BossCard({ task, eager = false }: BossCardProps) {
  const boss = bossForTask(task);

  return (
    <li className={cn(cardStyles, "flex min-w-0 flex-col gap-4.5 p-5 md:p-6")}>
      {/* Miniatura: recorte de la ilustración de la batalla. Alto fijo (112
          px en móvil, 132 desde md); thumbPosition elige qué parte se ve para
          que no se corte la cabeza. El alt dice qué criatura es: el nombre de
          la tarea ya está en el texto. */}
      <div className="relative h-28 w-full overflow-hidden rounded-md border border-line bg-night md:h-[132px]">
        <Image
          src={bossImageSrc(boss.key)}
          alt={boss.name}
          fill
          loading={eager ? "eager" : undefined}
          // Ancho de la tarjeta: 1 columna, 2 desde lg y 3 desde xl.
          sizes="(min-width: 1280px) 30vw, (min-width: 1024px) 40vw, 100vw"
          className="object-cover"
          style={{ objectPosition: boss.thumbPosition }}
        />
      </div>

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

      <div className="flex items-center justify-between gap-3 border-t border-line pt-4 text-[13px] leading-[normal]">
        <p className="flex min-w-0 items-center gap-2 text-ash">
          <Calendar aria-hidden size={16} className="shrink-0 text-smoke" />
          {/* El icono no se lee: este texto aclara qué fecha es. */}
          <span className="sr-only">Entrega: </span>
          {formatDueDate(task.dueDate)}
        </p>
        {/* El ::after agranda la zona de clic a 44 px de alto sin cambiar el
            tamaño del pie. El texto oculto distingue un "Atacar" de otro. */}
        <Link
          href={`/mazmorra/batalla/${task.id}`}
          className="relative flex shrink-0 items-center gap-1 rounded-sm font-bold tracking-[1px] whitespace-nowrap text-gold-bright uppercase transition-colors after:absolute after:-inset-x-2 after:-inset-y-3.5 hover:text-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
        >
          Atacar<span className="sr-only"> a {task.name}</span>
          <ArrowRight aria-hidden size={14} />
        </Link>
      </div>
    </li>
  );
}
