import Link from "next/link";
import {
  BookOpen,
  Dices,
  Flame,
  Plus,
  Shield,
  Sparkles,
  Swords,
  type LucideIcon,
} from "lucide-react";
import { HeroVideo } from "@/components/landing/hero-video";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, cardStyles } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { SectionHeading } from "@/components/ui/section-heading";
import { cn } from "@/lib/cn";

// Margen lateral de todas las franjas: 100 px a 1440 deja 1240 de contenido.
const SECTION_X = "px-4 sm:px-6 lg:px-[100px]";

const STATS = [
  { value: "25 min", label: "por bloque de estudio" },
  { value: "3", label: "niveles de dificultad" },
  { value: "∞", label: "materias y jefes" },
  { value: "Gratis", label: "para siempre" },
];

const STEPS = [
  {
    number: "01",
    title: "Invoca al jefe",
    description:
      "Cada tarea o entrega se convierte en un jefe. Eliges su dificultad y esa decisión define cuánta vida tiene.",
  },
  {
    number: "02",
    title: "Libra la vigilia",
    description:
      'Estudia en bloques de 25 minutos. Cada bloque completo es un golpe real: no hay botón de "hecho", hay que meter las horas.',
  },
  {
    number: "03",
    title: "Derrota y crece",
    description:
      "Al bajar su vida a cero, el jefe cae. Ganas almas, subes de nivel y mantienes viva tu racha: la llama.",
  },
];

const BOSS_POINTS = [
  "Fácil: 2 bloques · 200 de vida",
  "Media: 4 bloques · 400 de vida",
  "Difícil: 6 bloques · 600 de vida",
];

const VIGIL_POINTS = [
  "Bloques tipo pomodoro de 25 minutos",
  "Abandonar a la mitad no hace daño",
  "Un bloque a la vez, sin trampas",
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
    title: "La llama",
    description:
      "Una racha diaria que premia la constancia. Rómpela y vuelve a empezar; mantenla y arde más fuerte.",
    comingSoon: false,
  },
  {
    icon: Swords,
    title: "Combate real",
    description:
      "No marcas tareas como hechas: las derrotas estudiando. El progreso es tuyo porque te lo ganaste.",
    comingSoon: false,
  },
  {
    icon: Sparkles,
    title: "Almas y niveles",
    description:
      "Cada jefe vencido te hace más fuerte. Tu personaje crece con cada hora que inviertes.",
    comingSoon: false,
  },
  {
    icon: Shield,
    title: "Misión de redención",
    description:
      "¿Un jefe te venció? Siempre hay una forma de recuperarte. El juego no te abandona cuando fallas.",
    comingSoon: false,
  },
  {
    icon: BookOpen,
    title: "Tus propias materias",
    description:
      "Sin catálogos cerrados. Creas tus materias y tus entregas reales, las de tu semestre.",
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
      "No. Un jefe solo cae con bloques de estudio reales, y el tiempo lo cuenta el servidor.",
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
        <Features />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

function SiteHeader() {
  return (
    // h-20 incluye el borde (border-box), como en el Figma: 80 px en total.
    <header className={cn("h-20 border-b border-line", SECTION_X)}>
      {/* En móvil los espacios son más cortos para que logo, "Entrar" y "Crear
          cuenta" quepan a 360 px sin invadir el margen. Desde md, como el Figma. */}
      <div className="mx-auto flex h-full max-w-[1240px] items-center justify-between gap-2 md:gap-4">
        <Link
          href="/"
          className="font-logo text-xl font-bold tracking-[3px] text-gold-bright md:text-2xl md:tracking-[4px]"
        >
          EMBER
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-3 text-sm md:gap-8">
          {/* En móvil solo quedan "Entrar" y "Crear cuenta". */}
          <ul className="hidden items-center gap-8 text-ash md:flex">
            <li>
              <a href="#como-funciona" className="hover:text-parchment">
                Cómo funciona
              </a>
            </li>
            <li>
              <a href="#mecanicas" className="hover:text-parchment">
                Mecánicas
              </a>
            </li>
            <li>
              <a href="#preguntas" className="hover:text-parchment">
                Preguntas
              </a>
            </li>
          </ul>
          <Link href="/login" className="font-semibold hover:text-gold-bright">
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
    <section
      className={cn("flex flex-col items-center gap-7 py-16 text-center md:py-[120px]", SECTION_X)}
    >
      <Eyebrow>La llama no debe extinguirse</Eyebrow>
      <h1 className="max-w-[900px] font-display text-[40px] leading-none font-bold sm:text-[56px] md:text-[72px]">
        <span className="block">No estudies.</span>
        <span className="block">Conquista.</span>
      </h1>
      <p className="max-w-[720px] text-lg leading-[1.5] text-ash md:text-xl">
        Cada tarea es un jefe. Cada hora de estudio, un golpe que lo derriba. Convierte tus
        entregas en un RPG y mantén la llama encendida hasta vencer.
      </p>
      <div className="flex w-full flex-col gap-4 pt-3 sm:w-auto sm:flex-row">
        <ButtonLink href="/registro">Comenzar la vigilia</ButtonLink>
        <ButtonLink href="#como-funciona" variant="ghost">
          Ver cómo funciona
        </ButtonLink>
      </div>
      <p className="text-[13px] leading-[normal] text-smoke">
        Gratis · Funciona con cualquier materia
      </p>
      <HeroVideo />
    </section>
  );
}

function Stats() {
  return (
    <section aria-label="Ember en cifras" className={cn("bg-night-alt py-11", SECTION_X)}>
      <ul className="mx-auto grid max-w-[680px] grid-cols-2 gap-x-6 gap-y-8 md:flex md:max-w-none md:justify-center md:gap-20">
        {STATS.map((stat) => (
          <li key={stat.label} className="flex flex-col items-center gap-1 text-center">
            <p className="font-display text-[34px] leading-[normal] font-bold text-gold-bright">
              {stat.value}
            </p>
            <p className="text-[13px] leading-[normal] text-smoke">{stat.label}</p>
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
      className={cn("flex flex-col items-center gap-6 py-16 md:py-[90px]", SECTION_X)}
    >
      <SectionHeading
        eyebrow="Cómo funciona"
        title="De la lista de tareas al campo de batalla"
        description="Tres pasos para que estudiar se sienta como avanzar en un juego."
      />
      <ol className="grid w-full max-w-[1188px] gap-6 pt-6 md:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.number}>
            <Card className="flex h-full flex-col gap-3.5 px-[30px] py-8 md:min-h-[240px]">
              {/* La lista ya numera los pasos; el número es solo visual. */}
              <p aria-hidden className="font-logo text-[28px] leading-[normal] font-bold text-gold">
                {step.number}
              </p>
              <h3 className="font-display text-[22px] leading-[normal] font-bold">{step.title}</h3>
              <p className="text-[15px] leading-[1.5] text-ash">{step.description}</p>
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BossMechanic() {
  return (
    <section id="mecanicas" className={cn("bg-night-alt py-16 md:py-[90px]", SECTION_X)}>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
        <MechanicText
          eyebrow="La mecánica central"
          titleLines={["Cada tarea es un jefe", "con vida propia"]}
          description="La dificultad que eliges al invocarlo fija su vida. Un jefe fácil cae en dos bloques; uno difícil exige seis. La única forma de bajar esa barra es estudiar de verdad."
          points={BOSS_POINTS}
        />
        {/* Maqueta de un jefe: role="img" la anuncia como una sola imagen. */}
        <div
          role="img"
          aria-label="Ejemplo de jefe: El Parcial Final, con 300 de 400 de vida"
          className="flex w-full max-w-[440px] flex-col gap-4 rounded-xl border border-line bg-surface p-7 lg:h-[300px] lg:w-[440px]"
        >
          {/* Hueco para el sprite del jefe: todavía no hay arte. */}
          <div className="flex h-[120px] items-center justify-center rounded-lg border border-dashed border-line bg-night-alt text-[11px] text-smoke">
            sprite del jefe
          </div>
          <p className="font-display text-lg leading-[normal] font-bold">El Parcial Final</p>
          <div className="flex h-4 gap-1">
            <span className="flex-1 rounded-[3px] bg-blood" />
            <span className="flex-1 rounded-[3px] bg-blood" />
            <span className="flex-1 rounded-[3px] bg-blood" />
            <span className="flex-1 rounded-[3px] bg-hp-empty" />
          </div>
          <div className="flex justify-between text-xs leading-[normal]">
            <span className="text-smoke">Vida</span>
            <span className="text-parchment">300 / 400</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function VigilMechanic() {
  return (
    <section className={cn("py-16 md:py-[90px]", SECTION_X)}>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
        <MechanicText
          eyebrow="El temporizador"
          titleLines={["El reloj corre en", "el servidor, no en ti"]}
          description="Enciendes una vigilia de 25 minutos y estudias. El golpe solo cuenta si de verdad pasó el tiempo: nada de saltarse las horas. Cierra la pestaña y vuelve; el contador sigue donde lo dejaste."
          points={VIGIL_POINTS}
        />
        {/* Maqueta del temporizador. El botón es de adorno, no hace nada. */}
        <div
          role="img"
          aria-label="Ejemplo de vigilia en curso: quedan 24:58"
          className="flex h-[320px] w-full max-w-[440px] flex-col items-center justify-center gap-3 rounded-xl border border-line bg-[radial-gradient(62.5%_62.5%_at_50%_50%,var(--color-ember-deep),var(--color-surface))] lg:w-[440px]"
        >
          <p className="font-display text-xs leading-[normal] text-ember uppercase">
            Vigilia en curso
          </p>
          <p className="font-display text-[72px] leading-[normal] font-bold text-gold-bright">
            24:58
          </p>
          <span className="flex h-12 w-[220px] items-center justify-center gap-2 rounded-md bg-gold text-sm font-bold text-night uppercase">
            <Swords aria-hidden className="size-4" />
            Atacar
          </span>
        </div>
      </div>
    </section>
  );
}

type MechanicTextProps = {
  eyebrow: string;
  // Cada línea es un renglón cuando la columna es ancha: apilada (md) o a 520 px
  // como en el Figma (xl). Entre 1024 y 1279 la columna es estrecha y el título
  // fluye seguido para no dejar una palabra sola. En móvil también fluye.
  titleLines: [string, string];
  description: string;
  points: string[];
};

function MechanicText({ eyebrow, titleLines, description, points }: MechanicTextProps) {
  return (
    // Sin shrink-0: entre 1024 y ~1224 px no caben 520 + 64 + 440 px, y este
    // bloque y la maqueta (lg:w-[440px]) encogen en proporción a su ancho en
    // vez de salirse por la derecha.
    <div className="flex flex-col gap-4 lg:w-[520px]">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="font-display text-[28px] leading-[1.15] font-bold md:text-[36px]">
        <span className="md:block lg:inline xl:block">{titleLines[0]}</span>{" "}
        <span className="md:block lg:inline xl:block">{titleLines[1]}</span>
      </h2>
      <p className="text-[17px] leading-[1.55] text-ash">{description}</p>
      <ul className="flex flex-col gap-2.5 pt-2">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-[15px] leading-[1.45] text-ash">
            {/* Rombo dibujado con CSS: un cuadrado girado 45°. */}
            <span aria-hidden className="mt-[7px] size-2 shrink-0 rotate-45 bg-gold" />
            {point}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Features() {
  return (
    <section className={cn("flex flex-col items-center gap-6 bg-night-alt py-16 md:py-[90px]", SECTION_X)}>
      <SectionHeading eyebrow="Por qué Ember" title="Lo que lo hace distinto" />
      <ul className="grid w-full max-w-[1240px] gap-6 pt-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <li key={feature.title}>
            <Card className="flex h-full flex-col gap-3 px-[26px] py-7 lg:min-h-[200px]">
              <div className="flex items-start justify-between gap-3">
                <feature.icon aria-hidden className="size-7 text-gold-bright" />
                {feature.comingSoon && <Badge>Próximamente</Badge>}
              </div>
              <h3 className="font-display text-[19px] leading-[normal] font-bold">
                {feature.title}
              </h3>
              <p className="text-sm leading-[1.5] text-ash">{feature.description}</p>
            </Card>
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
      className={cn("flex flex-col items-center gap-6 py-16 md:py-[90px]", SECTION_X)}
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
            <p className="pt-2 text-[15px] leading-[1.5] text-ash">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section
      className={cn("flex flex-col items-center gap-6 bg-night-alt py-20 md:py-[110px]", SECTION_X)}
    >
      <SectionHeading
        size="lg"
        eyebrow="Tu primera vigilia te espera"
        title="La llama no se encenderá sola."
        description="Crea tu cuenta, invoca a tu primer jefe y empieza a convertir el estudio en una historia que quieras terminar."
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
