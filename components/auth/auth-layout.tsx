import Link from "next/link";
import type { ReactNode } from "react";
import { cardStyles } from "@/components/ui/card";
import { cn } from "@/lib/cn";

type AuthPage = "login" | "registro" | "verificar" | "olvide" | "restablecer";

// Lo único que cambia entre las pantallas (Figma "LOGIN FINAL" y
// "REGISTRO FINAL"; las de verificar correo y contraseña olvidada no tienen
// marco y usan el fondo del login).
const PAGES: Record<
  AuthPage,
  { title: string; tagline: string; footer: string; footerLink: { href: string; label: string } }
> = {
  login: {
    title: "Iniciar sesión",
    tagline: "La llama no debe extinguirse",
    footer: "¿Primera vez junto al fuego?",
    footerLink: { href: "/registro", label: "Fórjate una cuenta." },
  },
  registro: {
    title: "Crear cuenta",
    tagline: "Fórjate como vigilante",
    footer: "¿Ya tienes cuenta?",
    footerLink: { href: "/login", label: "Vuelve al fuego." },
  },
  verificar: {
    title: "Verificar correo",
    tagline: "Confirma que la llama es tuya",
    footer: "¿Ya lo confirmaste?",
    footerLink: { href: "/login", label: "Vuelve al fuego." },
  },
  olvide: {
    title: "Recuperar contraseña",
    tagline: "Reaviva tu llama",
    footer: "¿La recordaste?",
    footerLink: { href: "/login", label: "Vuelve al fuego." },
  },
  restablecer: {
    title: "Crear contraseña nueva",
    tagline: "Forja una llave nueva",
    footer: "¿Ya tienes acceso?",
    footerLink: { href: "/login", label: "Vuelve al fuego." },
  },
};

// En "verificar", "olvide" y "restablecer" ninguna pestaña está marcada.
const TABS: { page: AuthPage; href: string; label: string }[] = [
  { page: "login", href: "/login", label: "Entrar" },
  { page: "registro", href: "/registro", label: "Registrarse" },
];

// El mismo contorno de foco que los botones (buttonStyles).
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright";

type AuthLayoutProps = {
  page: AuthPage;
  // El formulario: el único trozo de cliente de la pantalla.
  children: ReactNode;
};

// Fondo, logo, tarjeta, pestañas y pie compartidos por las pantallas de
// acceso.
export function AuthLayout({ page, children }: AuthLayoutProps) {
  const { title, tagline, footer, footerLink } = PAGES[page];
  // El fondo de luz cálida y el resplandor: todas menos registro.
  const warmLight = page !== "registro";

  return (
    <main
      className={cn(
        // overflow-x-clip recorta el resplandor, más ancho que un móvil, sin
        // crear scroll horizontal. El scroll vertical sigue funcionando.
        "relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-x-clip px-4 py-12 md:py-20",
        // Login: luz cálida que baja desde arriba (degradado radial). Las
        // medidas en % son las del Figma, iguales en 1440 y en 375.
        warmLight &&
          "bg-radial-[83.33%_55.56%_at_50%_-5.56%] from-ember-deep via-night-alt via-45% to-night",
      )}
    >
      {/* Registro: fuego a los dos lados. 64 px en móvil, 260 a 1440. */}
      {!warmLight && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-[clamp(64px,18vw,260px)] bg-linear-to-r from-ember/30 via-ember/9 via-35% to-ember/0"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-[clamp(64px,18vw,260px)] bg-linear-to-l from-ember/30 via-ember/9 via-35% to-ember/0"
          />
        </>
      )}

      {/* Marco punteado decorativo, solo desde md. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-8 hidden rounded-[4px] border border-dashed border-line md:block"
      />

      <div className="relative flex w-full max-w-[440px] flex-col items-center gap-7 md:gap-9">
        <h1 className="sr-only">{title}</h1>

        {/* isolate: el resplandor (-z-10) queda detrás del logo, pero no
            detrás del fondo de la página. */}
        <div className="relative isolate flex flex-col items-center gap-2">
          {warmLight && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[300px] w-[420px] -translate-x-1/2 -translate-y-1/2 bg-radial-[closest-side] from-ember/35 via-ember/7 via-50% to-ember/0 md:h-[420px] md:w-[640px]"
            />
          )}
          <Link
            href="/"
            className={cn(
              "rounded-sm font-logo text-[38px] leading-[normal] font-bold tracking-[6px] text-gold-bright md:text-[46px] md:tracking-[8px]",
              FOCUS_RING,
            )}
          >
            EMBER
          </Link>
          {/* Mismo estilo que Eyebrow, pero más pequeño en móvil. No se usa
              <Eyebrow className="text-[12px]...">: cn no resuelve conflictos y
              ganaría su text-[13px]. */}
          <p className="font-display text-[12px] leading-[normal] tracking-[3px] text-gold uppercase md:text-[13px] md:tracking-[4px]">
            {tagline}
          </p>
        </div>

        <div
          className={cn(
            cardStyles,
            "flex w-full flex-col gap-5 p-5 shadow-[0_12px_40px_rgb(0_0_0/0.5)] md:gap-6 md:p-8",
          )}
        >
          {/* Dos enlaces normales, no pestañas ARIA: cada uno es otra página. */}
          <nav aria-label="Acceso" className="flex h-11 rounded-md border border-line bg-night">
            {TABS.map((tab) => {
              const active = tab.page === page;
              return (
                <Link
                  key={tab.page}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-1 items-center justify-center rounded-[5px] text-[13px] leading-[normal] tracking-[1.5px] uppercase transition-colors",
                    FOCUS_RING,
                    active
                      ? "bg-gold font-bold text-night"
                      : "font-semibold text-smoke hover:text-parchment",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {children}

          {/* flex-wrap: en pantallas estrechas el enlace salta a otra línea,
              centrado. */}
          <p className="flex flex-wrap justify-center gap-x-1.5 gap-y-1 text-center text-[13px] leading-[normal]">
            <span className="text-smoke">{footer}</span>
            <Link
              href={footerLink.href}
              className={cn(
                "rounded-sm font-semibold text-gold-bright hover:underline",
                FOCUS_RING,
              )}
            >
              {footerLink.label}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
