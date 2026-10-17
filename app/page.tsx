import Image from "next/image";
import Link from "next/link";
import {
  Dices,
  Flame,
  Info,
  Lock,
  Plus,
  Repeat,
  Shield,
  Sparkles,
  Swords,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { BestiaryStrip, BossCardMock } from "@/components/landing/boss-showcase";
import { CounterattackMock } from "@/components/landing/counterattack-mock";
import { Embers } from "@/components/landing/embers";
import { HeroVideo } from "@/components/landing/hero-video";
import { Reveal } from "@/components/landing/reveal";
import { VigilClock } from "@/components/landing/vigil-clock";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, cardStyles } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/cn";
import { bossImageSrc, type BossKey } from "@/lib/game";

// Margen lateral de todas las franjas: 100 px a 1440 deja 1240 de contenido.
const SECTION_X = "px-4 sm:px-6 lg:px-[100px]";

// Las secciones con ancla bajan 80 px más al saltar a ellas: lo que mide la
// cabecera fija, para que no tape el título.
const ANCHOR = "scroll-mt-20";

// Todo lo que dice esta página tiene que ser cierto HOY. Los números salen de
// lib/game.ts y lib/agent/rules.ts; si cambian allí, hay que revisar aquí.
const STATS = [
  { value: "25 min", label: "por golpe" },
  { value: "6 jefes", label: "en el bestiario" },
  { value: "3", label: "niveles de dificultad" },
  { value: "Gratis", label: "sin tarjeta" },
];

const STEPS = [
  {
    number: "01",
    title: "Invoca al jefe",
    description:
      "Cada entrega se convierte en un jefe. Eliges su dificultad y eso fija su vida: de 2 a 6 golpes.",
  },
  {
    number: "02",
    title: "Libra la vigilia",
    description:
      "Estudia 25 minutos seguidos. Al terminar asestas un golpe que le quita 100 de vida. No hay botón de «hecho»: hay que estudiar.",
  },
  {
    number: "03",
    title: "Resiste el contraataque",
    description:
      "Si sigue en pie, el jefe te pregunta sobre lo que estudias: de 1 a 3 preguntas según su dificultad. Acertar da almas; fallar puede quitarlas.",
  },
  {
    number: "04",
    title: "Derrótalo y crece",
    description:
      "Cuando su vida llega a cero, cae. Ganas almas, subes de nivel, y cada día que golpeas aviva tu llama.",
  },
];

// Lo que tarda la brasa en recorrer cada tramo de la línea de los pasos, y
// la espera antes del primero (que la lista termine de aparecer un poco).
const STEP_MS = 700;
const STEP_OFFSET_MS = 300;

const BOSS_POINTS = [
  "Fácil: 2 golpes · 200 de vida",
  "Media: 4 golpes · 400 de vida",
  "Difícil: 6 golpes · 600 de vida",
];

const VIGIL_POINTS = [
  "Bloques de 25 minutos, como un pomodoro",
  "Si abandonas, el jefe no recibe daño y tú no pierdes nada",
  "Una vigilia a la vez: no se pueden acumular",
];

const ESCRIBA_POINTS = [
  "Pega tu texto o sube un PDF, y el escriba escribe entre 3 y 15 preguntas.",
  "Llegan selladas: no las ves hasta que un jefe te las lanza en combate.",
  "Las que fallas vuelven pronto; las que aciertas, cada vez más espaciadas.",
  "Acierta todas las preguntas de un contraataque contra un jefe medio o difícil y ganas una brasa: si un día no estudias, protege tu llama. Puedes guardar hasta 2.",
];

// comingSoon marca lo que todavía no existe en la app.
const FEATURES: {
  icon: LucideIcon;
  title: string;
  description: string;
  comingSoon: boolean;
}[] = [
  {
    icon: Flame,
    title: "La llama y la brasa",
    description:
      "Cada día que asestas un golpe, tu llama crece. Si un día no puedes, una brasa la protege; sin brasas, vuelve a empezar.",
    comingSoon: false,
  },
  {
    icon: Swords,
    title: "Combate real",
    description:
      "No marcas tareas como hechas: las derrotas estudiando. Cada golpe son 25 minutos que pasaron de verdad.",
    comingSoon: false,
  },
  {
    icon: Sparkles,
    title: "Almas y niveles",
    description:
      "Cada golpe, cada victoria y cada respuesta acertada te dan almas. Con ellas tu personaje sube hasta el nivel 50.",
    comingSoon: false,
  },
  {
    icon: Shield,
    title: "Misión de redención",
    description:
      "Si una entrega vence con el jefe en pie, pierdes las almas de tu nivel actual, pero nunca el nivel. Tienes 48 horas y 2 vigilias para recuperarlas.",
    comingSoon: false,
  },
  {
    icon: Repeat,
    title: "El repaso que vuelve",
    description:
      "Las preguntas que fallas vuelven pronto; las que dominas, cada vez más espaciadas. Así se queda lo que estudias.",
    comingSoon: false,
  },
  {
    icon: Dices,
    title: "Recompensas roguelike",
    description:
      "Tras cada combate, reliquias y bendiciones que adornan tu camino, nunca atajos para no estudiar.",
    comingSoon: true,
  },
];

const FAQS = [
  {
    question: "¿Necesito saber de videojuegos para usarlo?",
    answer:
      "No. Si sabes qué tienes que estudiar, ya sabes jugar. La capa de juego es solo la forma de verlo.",
  },
  {
    question: "¿Sirve para cualquier materia o carrera?",
    answer:
      "Sí. Tú creas tus materias y tus entregas, así que se adapta a lo que estés cursando.",
  },
  {
    question: "¿Puedo hacer trampa y marcar tareas como hechas?",
    answer:
      "No. Un jefe solo cae con vigilias completas, y el tiempo lo cuenta el servidor, no tu navegador.",
  },
  {
    question: "¿Qué hace la IA con mis apuntes?",
    answer:
      "Los envía a Google Gemini solo para escribir las preguntas. Ember guarda las preguntas, no tus apuntes. Aun así, no pegues datos personales.",
  },
  {
    question: "¿Qué pasa si un día no estudio?",
    answer:
      "Tu llama se apaga y la racha vuelve a empezar, salvo que tengas brasas: se gasta una por cada día que faltaste y la llama sigue.",
  },
  {
    question: "¿Y si se me pasa una entrega?",
    answer:
      "El jefe cae y te quita las almas de tu nivel actual, nunca el nivel. Tienes 48 horas para recuperarlas con 2 vigilias.",
  },
  {
    question: "¿Cuánto cuesta?",
    answer: "Nada. Ember es gratis.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Stats />
        <HowItWorks />
        <BossMechanic />
        <VigilMechanic />
        <Escriba />
        <Features />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

const NAV_LINKS = [
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#mecanicas", label: "Mecánicas" },
  { href: "#escriba", label: "El escriba" },
  { href: "#preguntas", label: "Preguntas" },
];

function SiteHeader() {
  return (
    // Fija arriba (sticky) y translúcida: lo que pasa por debajo al hacer
    // scroll se ve desenfocado (backdrop-blur). Es solo CSS, sin escuchar el
    // scroll. h-20 incluye el borde (border-box), como en el Figma: 80 px.
    <header
      className={cn(
        "sticky top-0 z-40 h-20 border-b border-line bg-night/80 backdrop-blur-md",
        SECTION_X,
      )}
    >
      {/* En móvil los espacios son más cortos para que logo, "Entrar" y "Crear
          cuenta" quepan a 360 px sin invadir el margen. Desde md, como el Figma. */}
      <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-2 md:gap-4">
        <Link
          href="/"
          className="rounded-sm font-logo text-xl font-bold tracking-[3px] text-gold-bright focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-bright max-[360px]:text-lg max-[360px]:tracking-[2px] md:text-2xl md:tracking-[4px]"
        >
          EMBER
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-3 text-sm md:gap-6 lg:gap-8">
          {/* Los cuatro enlaces solo caben desde lg; en móvil y tableta quedan
              "Entrar" y "Crear cuenta". */}
          <ul className="hidden items-center gap-6 text-ash lg:flex xl:gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-sm hover:text-parchment focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-bright"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            href="/login"
            className="rounded-sm font-semibold hover:text-gold-bright focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-bright"
          >
            Entrar
          </Link>
          {/* Las clases con variante (max-md:, max-[360px]:) van después de las
              base en el CSS, así que pisan el relleno y la letra del tamaño sm.
              Por debajo de 360 px ni los espacios bastan: se reduce la letra. */}
          <ButtonLink
            href="/registro"
            size="sm"
            className="max-md:px-3 max-[360px]:text-[13px] max-[360px]:tracking-[1px]"
          >
            Crear cuenta
          </ButtonLink>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    // relative + isolate: el fondo (-z-10) queda detrás del texto pero dentro
    // de la sección. overflow-hidden recorta el resplandor y los jefes, que
    // son más anchos que la pantalla, para que no haya scroll horizontal.
    <section
      className={cn(
        "relative isolate flex flex-col items-center gap-7 overflow-hidden py-16 text-center md:py-[120px]",
        SECTION_X,
      )}
    >
      <HeroBackdrop />
      <Eyebrow>La llama no debe extinguirse</Eyebrow>
      {/* Tres renglones, tres verbos. Sin animación de entrada: si el título
          empezara invisible, tardaría más en pintarse (LCP). Solo brilla. */}
      <h1 className="max-w-[900px] font-display text-[36px] leading-[1.05] font-bold min-[360px]:text-[40px] sm:text-[56px] md:text-[72px]">
        <span className="block">Estudia.</span>
        <span className="block">Golpea.</span>
        {/* Brillo fijo de base; con movimiento, además parpadea como una
            llama (motion-safe:animate-flame-glow pisa el text-shadow). */}
        <span className="block text-gold-bright [text-shadow:0_0_20px_color-mix(in_oklab,var(--color-ember)_40%,transparent)] motion-safe:animate-flame-glow motion-paused:[animation-play-state:paused]!">
          Conquista.
        </span>
      </h1>
      <p className="max-w-[720px] text-lg leading-[1.5] text-balance text-ash md:text-xl">
        Cada entrega es un jefe. Cada bloque de 25 minutos de estudio es un golpe que le quita
        vida. Termina tus tareas como quien se pasa un juego: jefe a jefe.
      </p>
      <div className="flex w-full flex-col gap-4 pt-3 sm:w-auto sm:flex-row">
        <ButtonLink href="/registro">Comenzar la vigilia</ButtonLink>
        <ButtonLink href="#como-funciona" variant="ghost">
          Ver cómo funciona
        </ButtonLink>
      </div>
      <p className="text-[13px] leading-[normal] text-smoke">Gratis · Para cualquier materia</p>
      <HeroVideo />
    </section>
  );
}

// Los dos jefes que llenan los laterales del hero desde lg. position = qué
// parte de la ilustración se ve (object-position); flip = voltearla para
// que mire hacia el centro.
const HERO_BOSSES: { key: BossKey; side: "left" | "right"; position: string; flip: boolean }[] = [
  { key: "dragon-de-la-caverna", side: "left", position: "12% 50%", flip: true },
  { key: "liche-del-osario", side: "right", position: "68% 40%", flip: false },
];

// Fondo del hero: resplandor de brasa, jefes tenues a los lados y brasas que
// suben. Todo decorativo: aria-hidden y pointer-events-none.
function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {/* Resplandor radial detrás del título. closest-side: el degradado
          termina justo en el borde del círculo. */}
      <div className="absolute top-0 left-1/2 aspect-square w-[min(1000px,160vw)] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-ember)_20%,transparent),transparent)]" />

      {HERO_BOSSES.map((boss) => (
        // Máscara de degradado: opaca junto al borde de la pantalla y
        // transparente hacia el centro, así el jefe se funde con el fondo y
        // no compite con el texto. Solo desde lg (hidden lg:block).
        <div
          key={boss.key}
          className={cn(
            "absolute top-0 hidden h-[780px] w-[40%] opacity-25 lg:block",
            boss.side === "left"
              ? "left-0 [mask-image:radial-gradient(ellipse_100%_75%_at_0%_45%,black_25%,transparent_75%)]"
              : "right-0 [mask-image:radial-gradient(ellipse_100%_75%_at_100%_45%,black_25%,transparent_75%)]",
          )}
        >
          {/* Diferida y con prioridad baja: no compite con el título ni con el
              video. sizes 1px por debajo de lg: aunque el navegador la
              pidiera estando oculta, bajaría la versión más pequeña. */}
          <Image
            src={bossImageSrc(boss.key)}
            alt=""
            fill
            loading="lazy"
            fetchPriority="low"
            sizes="(min-width: 1024px) 40vw, 1px"
            className={cn("object-cover", boss.flip && "-scale-x-100")}
            style={{ objectPosition: boss.position }}
          />
        </div>
      ))}

      {/* Las brasas nacen a la altura de los botones y suben por el título. */}
      <Embers preset="hero" rise={-520} className="bottom-auto h-[560px] md:h-[680px]" />
    </div>
  );
}

function Stats() {
  return (
    <section aria-label="Ember en cifras" className={cn("bg-night-alt py-11", SECTION_X)}>
      <ul className="mx-auto grid max-w-[680px] grid-cols-2 gap-x-6 gap-y-8 md:flex md:max-w-none md:justify-center md:gap-20">
        {STATS.map((stat, i) => (
          <li key={stat.label}>
            <Reveal delay={i * 100} className="flex flex-col items-center gap-1 text-center">
              <p className="font-display text-[34px] leading-[normal] font-bold text-gold-bright">
                {stat.value}
              </p>
              <p className="text-[13px] leading-[normal] text-smoke">{stat.label}</p>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className={cn("flex flex-col items-center gap-6 py-16 md:py-[90px]", ANCHOR, SECTION_X)}
    >
      <SectionHeading
        eyebrow="Cómo funciona"
        title="De la lista de tareas al campo de batalla"
        description="Cuatro pasos para que estudiar se sienta como avanzar en un juego."
      />
      {/* En vertical hasta xl (número a la izquierda, tarjeta a la derecha);
          desde xl, cuatro columnas con el número encima. A 1024 cuatro
          columnas dejarían tarjetas de 188 px: demasiado estrechas. */}
      <Reveal className="w-full max-w-[720px] pt-6 xl:max-w-[1188px]">
        <ol className="grid gap-6 xl:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.number} className="relative flex gap-4 xl:flex-col xl:items-center">
              {i < STEPS.length - 1 && <StepLink index={i} />}
              {/* El número se enciende cuando llega la brasa. La lista ya
                  numera los pasos: el número es solo visual. */}
              <span
                aria-hidden
                className="relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-gold bg-night font-logo text-xl leading-none font-bold text-gold transition-colors duration-500 group-data-[reveal=pending]/reveal:border-line group-data-[reveal=pending]/reveal:text-smoke"
                style={{ transitionDelay: `${STEP_OFFSET_MS + i * STEP_MS}ms` }}
              >
                {step.number}
              </span>
              <Card className="flex flex-1 flex-col gap-3 px-6 py-6 xl:w-full xl:min-h-[250px] xl:px-[26px] xl:py-7">
                <h3 className="font-display text-[22px] leading-[normal] font-bold">
                  {step.title}
                </h3>
                <p className="text-[15px] leading-[1.5] text-pretty text-ash">{step.description}</p>
              </Card>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}

// Tramo de línea entre el número de un paso y el del siguiente, con la brasa
// que lo recorre. Las medidas salen del círculo (56 px, centro a 28) y del
// hueco entre pasos (24 px):
//   - vertical (móvil a lg): baja desde el borde inferior del círculo hasta
//     el borde superior del siguiente: 100 % del paso + 24 − 56 = 100 % − 32.
//   - horizontal (xl): va del borde derecho del círculo (50 % + 28) al
//     izquierdo del siguiente, que está a 100 % + 24 + 50 % − 28: otra vez
//     100 % − 32 de ancho.
// --line-from y --travel dicen a las animaciones en qué eje moverse.
function StepLink({ index }: { index: number }) {
  const delay = `${STEP_OFFSET_MS + index * STEP_MS}ms`;
  return (
    <div
      aria-hidden
      className="absolute top-14 left-[27px] h-[calc(100%-32px)] w-0.5 bg-line [--line-from:1_0] [--travel:0_100%] xl:top-[27px] xl:left-[calc(50%+28px)] xl:h-0.5 xl:w-[calc(100%-32px)] xl:[--line-from:0_1] xl:[--travel:100%_0]"
    >
      {/* El relleno dorado: vacío en pending, se llena al aparecer y lleno
          del todo sin animación. */}
      <div
        className="absolute inset-0 origin-top bg-gold group-data-[reveal=pending]/reveal:[scale:var(--line-from)] group-data-[reveal=shown]/reveal:motion-safe:animate-line-fill xl:origin-left"
        style={{ animationDelay: delay }}
      />
      {/* La brasa: una capa del tamaño del tramo que se desplaza su propio
          largo (translate en %), con el punto en su esquina. Invisible salvo
          mientras viaja. */}
      <div
        className="absolute inset-0 opacity-0 group-data-[reveal=shown]/reveal:motion-safe:animate-ember-travel"
        style={{ animationDelay: delay }}
      >
        <span className="absolute -top-[5px] -left-[5px] size-3 rounded-full bg-gold-bright shadow-[0_0_10px_3px_var(--color-ember)]" />
      </div>
    </div>
  );
}

function BossMechanic() {
  return (
    <section
      id="mecanicas"
      className={cn("bg-night-alt py-16 md:py-[90px]", ANCHOR, SECTION_X)}
    >
      <div className="mx-auto flex max-w-[1240px] flex-col gap-16">
        <div className={MECHANIC_GRID}>
          <MechanicText
            eyebrow="El bestiario"
            titleLines={["Cada tarea es un jefe", "con vida propia"]}
            description="La dificultad que eliges al invocarlo fija su vida y decide quién te espera. Un jefe fácil cae en dos golpes; uno difícil exige seis. La única forma de bajar esa barra es estudiar."
            points={BOSS_POINTS}
          />
          <BossCardMock className="lg:justify-self-end" />
        </div>
        <BestiaryStrip />
      </div>
    </section>
  );
}

function VigilMechanic() {
  return (
    <section className={cn("py-16 md:py-[90px]", SECTION_X)}>
      <div className={cn("mx-auto max-w-[1240px]", MECHANIC_GRID)}>
        <MechanicText
          eyebrow="La vigilia"
          titleLines={["El tiempo lo cuenta", "el servidor: nadie", "puede saltárselo"]}
          description="Enciendes una vigilia de 25 minutos y estudias. El golpe solo se puede asestar cuando el tiempo ha pasado de verdad, y el reloj no se pausa: si cierras la pestaña, sigue contando."
          points={VIGIL_POINTS}
        />
        {/* Maqueta del temporizador. El reloj corre de verdad (VigilClock);
            el botón es de adorno y está bloqueado, como en la app hasta que
            la vigilia llega a 00:00. */}
        <Reveal className="w-full max-w-[440px] lg:justify-self-end">
          <div
            role="img"
            aria-label="Ejemplo de vigilia en curso: el reloj cuenta hacia atrás desde 25 minutos y el botón «Asestar golpe» sigue bloqueado hasta llegar a 00:00."
            className="flex h-[320px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-line bg-[radial-gradient(62.5%_62.5%_at_50%_50%,var(--color-ember-deep),var(--color-surface))]"
          >
            <p className="font-display text-xs leading-[normal] text-ember uppercase">
              Vigilia en curso
            </p>
            <VigilClock className="font-display text-[64px] leading-[normal] font-bold text-gold-bright sm:text-[72px]" />
            <span className="flex h-12 w-[220px] items-center justify-center gap-2 rounded-md border border-line bg-surface text-sm font-bold tracking-[1.5px] text-smoke uppercase">
              <Lock className="size-4" />
              Asestar golpe
            </span>
            <p className="text-xs leading-[normal] text-smoke">Se desbloquea en 00:00</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Escriba() {
  return (
    <section
      id="escriba"
      className={cn("bg-night-alt py-16 md:py-[90px]", ANCHOR, SECTION_X)}
    >
      {/* La maqueta va a la izquierda desde lg (lg:order-first) para
          alternar con las secciones de arriba. En móvil el texto va primero. */}
      <div className={cn("mx-auto max-w-[1240px]", MECHANIC_GRID)}>
        <MechanicText
          eyebrow="El escriba"
          titleLines={["Tus apuntes se", "convierten en batalla"]}
          description="Dale tus apuntes al escriba y escribirá las preguntas con las que el jefe te contraatacará."
          points={ESCRIBA_POINTS}
        >
          <p className="flex items-start gap-2 pt-2 text-[13px] leading-[1.45] text-smoke">
            <Info aria-hidden className="mt-px size-4 shrink-0" />
            El escriba usa Google Gemini. No pegues datos personales.
          </p>
        </MechanicText>
        <CounterattackMock className="lg:order-first lg:justify-self-start" />
      </div>
    </section>
  );
}

// Rejilla de las tres secciones con texto y maqueta (bestiario, vigilia,
// escriba): una columna en móvil; desde lg, dos columnas iguales que ocupan
// todo el ancho (1240 px a 1440). Cada maqueta se pega al borde exterior de
// su columna con justify-self (end a la derecha, start a la izquierda), así
// las tres llegan al margen como el resto de la página.
const MECHANIC_GRID = "grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16";

type MechanicTextProps = {
  eyebrow: string;
  // Cada línea es un renglón cuando la columna es ancha: apilada (md) o en
  // su columna desde xl (unos 510 px a 1280). Entre 1024 y 1279 la columna es
  // estrecha (unos 380 px) y el título fluye seguido para no dejar una
  // palabra sola. En móvil también fluye.
  titleLines: string[];
  description: string;
  points: string[];
  // Lo que va debajo de los puntos (la nota del escriba).
  children?: ReactNode;
};

function MechanicText({ eyebrow, titleLines, description, points, children }: MechanicTextProps) {
  return (
    // Ocupa su columna de la rejilla (MECHANIC_GRID).
    <div className="flex flex-col gap-4">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-display text-[28px] leading-[1.15] font-bold md:text-[36px]">
        {titleLines.map((line, i) => (
          <span key={line}>
            {i > 0 && " "}
            <span className="md:block lg:inline xl:block">{line}</span>
          </span>
        ))}
      </h2>
      {/* text-pretty: el navegador evita dejar una palabra sola en el último
          renglón de los párrafos largos. */}
      <p className="text-[17px] leading-[1.55] text-pretty text-ash">{description}</p>
      <ul className="flex flex-col gap-2.5 pt-2">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-[15px] leading-[1.45] text-pretty text-ash">
            {/* Rombo dibujado con CSS: un cuadrado girado 45°. */}
            <span aria-hidden className="mt-[7px] size-2 shrink-0 rotate-45 bg-gold" />
            {point}
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

function Features() {
  return (
    <section className={cn("flex flex-col items-center gap-6 py-16 md:py-[90px]", SECTION_X)}>
      <SectionHeading eyebrow="Por qué Ember" title="Lo que lo hace distinto" />
      <ul className="grid w-full max-w-[1240px] gap-6 pt-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, i) => (
          // El retraso va en Reveal (que solo aparece) y no en la tarjeta: si
          // no, también retrasaría el brillo al pasar el ratón.
          <li key={feature.title}>
            <Reveal delay={(i % 3) * 100} className="h-full">
              {/* Al pasar el ratón: borde y brillo dorados y, con movimiento,
                  sube 4 px. Las tarjetas no son enlaces: es solo adorno. */}
              <Card className="flex h-full flex-col gap-3 px-[26px] py-7 transition-[border-color,box-shadow,translate] duration-300 hover:border-gold/60 hover:shadow-[0_0_28px_-6px_color-mix(in_oklab,var(--color-gold)_45%,transparent)] motion-safe:hover:-translate-y-1 lg:min-h-[200px]">
                <div className="flex items-start justify-between gap-3">
                  <feature.icon aria-hidden className="size-7 text-gold-bright" />
                  {feature.comingSoon && <Badge>Próximamente</Badge>}
                </div>
                <h3 className="font-display text-[19px] leading-[normal] font-bold">
                  {feature.title}
                </h3>
                <p className="text-sm leading-[1.5] text-pretty text-ash">{feature.description}</p>
              </Card>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Faq() {
  return (
    <section
      id="preguntas"
      className={cn(
        "flex flex-col items-center gap-6 bg-night-alt py-16 md:py-[90px]",
        ANCHOR,
        SECTION_X,
      )}
    >
      <SectionHeading eyebrow="Preguntas frecuentes" title="Antes de encender la hoguera" />
      <div className="flex w-full max-w-[820px] flex-col gap-3.5 pt-5">
        {FAQS.map((faq) => (
          // <details> abre y cierra sin JavaScript. "group" deja que el + gire
          // cuando la pregunta está abierta (group-open:).
          <details key={faq.question} className={cn(cardStyles, "group px-7 py-[22px]")}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm text-[17px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-bright [&::-webkit-details-marker]:hidden">
              {faq.question}
              <Plus
                aria-hidden
                className="size-[22px] shrink-0 text-gold transition-transform group-open:rotate-45 motion-reduce:transition-none"
              />
            </summary>
            <p className="pt-2 text-[15px] leading-[1.5] text-pretty text-ash">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section
      className={cn(
        "relative isolate flex flex-col items-center gap-6 overflow-hidden py-20 md:py-[110px]",
        SECTION_X,
      )}
    >
      {/* Resplandor más intenso que el del hero, que respira despacio, y
          brasas que suben desde abajo. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 aspect-square w-[min(900px,150vw)] -translate-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-ember)_30%,transparent),color-mix(in_oklab,var(--color-ember-deep)_60%,transparent)_55%,transparent)] motion-safe:animate-glow-breathe motion-paused:[animation-play-state:paused]!" />
        <Embers preset="cta" rise={-420} />
      </div>
      <SectionHeading
        size="lg"
        eyebrow="Tu primera vigilia te espera"
        title="La llama no se encenderá sola."
        description="Crea tu cuenta, invoca a tu primer jefe y asesta tu primer golpe hoy."
      />
      <div className="pt-3">
        <ButtonLink href="/registro">Crear mi cuenta</ButtonLink>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className={cn("border-t border-line", SECTION_X)}>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-4 py-9 text-[13px] leading-[normal] text-smoke sm:h-[99px] sm:flex-row sm:items-center sm:justify-between sm:py-0">
        <div className="flex flex-col gap-1.5">
          <p className="font-logo text-lg leading-[normal] font-bold tracking-[3px] text-gold-bright">
            EMBER
          </p>
          <p>Estudiar, pero como un RPG.</p>
        </div>
        <p>Un proyecto de Luis Meza · 2026</p>
      </div>
    </footer>
  );
}
