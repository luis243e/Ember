import Link from "next/link";
import { BookOpen, LogOut, Swords, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cerrarSesion } from "@/app/mazmorra/actions";
import { CharacterCard, type CharacterUser } from "@/components/app/character-card";
import { ExtinguishedFlameNotice } from "@/components/app/flame-notice";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { todayInAppTimeZone } from "@/lib/dates";
import { flameState } from "@/lib/game";

type AppSection = "mazmorra" | "materias";

// Solo lo que existe hoy. /mazmorra/invocar cuenta como "mazmorra".
const NAV: { section: AppSection; href: string; label: string; icon: LucideIcon }[] = [
  { section: "mazmorra", href: "/mazmorra", label: "Mi mazmorra", icon: Swords },
  { section: "materias", href: "/materias", label: "Materias", icon: BookOpen },
];

// El mismo contorno de foco que los botones (buttonStyles).
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";

type AppShellProps = {
  // Sección activa de la navegación.
  active: AppSection;
  // El usuario de requireUser(): nombre, foto y almas del bloque del
  // personaje, y la racha guardada con el día del último golpe para la llama.
  user: CharacterUser & { flame: number; lastStrikeDay?: Date | null };
  // Cabecera de la página: título (h1) y subtítulo.
  title: string;
  description: string;
  children: ReactNode;
};

// Armazón de las páginas privadas (Figma "MAZMORRA FINAL", "INVOCAR FINAL" y
// "MATERIAS FINAL"): barra lateral desde md y barra superior con pestañas en
// móvil. NO comprueba la sesión: cada página llama antes a requireUser() y le
// pasa el usuario. El bloque del personaje ("ALMAS Y NIVELES") va bajo el
// logo en la barra lateral y bajo las pestañas en móvil.
export function AppShell({ active, user, title, description, children }: AppShellProps) {
  // La llama se calcula una vez al pintar, con el "hoy" de Colombia, y no se
  // escribe nada en la base: la racha guardada solo cambia al golpear.
  const flame = flameState(user.flame, user.lastStrikeDay ?? null, todayInAppTimeZone());

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* Escritorio: barra lateral. sticky + h-dvh la mantiene entera a la
          vista (con el botón de salir abajo) aunque la página se desplace. */}
      <header className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r border-line bg-night-alt px-4 pt-7 pb-5 md:flex">
        <div className="flex flex-col gap-8">
          <Logo className="ml-3 self-start text-2xl tracking-[4px]" />
          <CharacterCard user={user} flame={flame} />
          <nav aria-label="Principal" className="flex flex-col gap-1">
            {NAV.map(({ section, href, label, icon: Icon }) => {
              const isActive = section === active;
              return (
                <Link
                  key={section}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-md px-3 text-sm leading-[normal] transition-colors",
                    FOCUS_RING,
                    isActive
                      ? "bg-surface font-semibold text-gold-bright"
                      : "text-ash hover:text-parchment",
                  )}
                >
                  <Icon
                    aria-hidden
                    size={18}
                    className={cn("shrink-0", isActive ? "text-gold-bright" : "text-smoke")}
                  />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-line pt-4">
          <form action={cerrarSesion}>
            <button type="submit" className={cn(buttonStyles({ variant: "ghost", size: "sm" }), "w-full")}>
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>

      {/* Móvil: barra superior con el logo y el botón de salir, y debajo la
          navegación como pestañas de texto. */}
      <header className="bg-night-alt md:hidden">
        <div className="flex h-14 items-center justify-between pr-1.5 pl-4">
          <Logo className="text-xl tracking-[3px]" />
          <form action={cerrarSesion}>
            {/* Solo hay icono: aria-label le da el nombre que leerá el lector
                de pantalla. */}
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className={cn(
                "flex size-11 cursor-pointer items-center justify-center rounded-md text-ash transition-colors hover:text-parchment",
                FOCUS_RING,
              )}
            >
              <LogOut aria-hidden size={20} />
            </button>
          </form>
        </div>
        <nav aria-label="Principal" className="flex h-11 gap-6 border-b border-line px-4">
          {NAV.map(({ section, href, label }) => {
            const isActive = section === active;
            return (
              <Link
                key={section}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center border-b-2 text-sm leading-[normal] transition-colors",
                  FOCUS_RING,
                  isActive
                    ? "border-gold-bright font-semibold text-gold-bright"
                    : "border-transparent text-ash hover:text-parchment",
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Móvil: el bloque del personaje, debajo de las pestañas y ya sobre
          el fondo de la página. */}
      <div className="px-4 pt-4 md:hidden">
        <CharacterCard user={user} flame={flame} />
      </div>

      {/* min-w-0: sin esto, un contenido muy ancho estiraría la columna y
          aparecería scroll horizontal. */}
      <main className="min-w-0 flex-1">
        <div className="flex flex-col gap-1.5 px-4 pt-6 md:border-b md:border-line md:px-8 md:py-7 lg:px-12">
          {/* wrap-anywhere: un nombre de usuario largo y sin espacios se
              parte en varias líneas en vez de desbordar. */}
          <h1 className="font-display text-[22px] leading-[normal] font-bold wrap-anywhere text-parchment md:text-[26px]">
            {title}
          </h1>
          <p className="text-sm leading-[normal] text-smoke">{description}</p>
        </div>
        <div className="px-4 pt-6 pb-8 md:px-8 md:py-10 lg:px-12">
          {/* Aviso al entrar: justo debajo de la cabecera, antes del
              contenido de la página. */}
          {flame.extinguished && <ExtinguishedFlameNotice />}
          {children}
        </div>
      </main>
    </div>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/mazmorra"
      className={cn(
        "rounded-sm font-logo leading-[normal] font-bold text-gold-bright",
        FOCUS_RING,
        className,
      )}
    >
      EMBER
    </Link>
  );
}
