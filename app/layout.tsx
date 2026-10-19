import type { Metadata } from "next";
import { Cinzel, Cinzel_Decorative, Inter } from "next/font/google";
import { MOTION_SCRIPT } from "@/components/landing/motion-script";
import "./globals.css";

// Texto general. Es variable: trae todos los pesos en un solo archivo.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Títulos. También variable (400 a 900).
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
});

// Logo y numerales. No es variable: solo cargamos el Bold que usa el diseño.
const cinzelDecorative = Cinzel_Decorative({
  variable: "--font-cinzel-decorative",
  subsets: ["latin"],
  weight: "700",
});

export const metadata: Metadata = {
  title: "Ember",
  description:
    "Convierte tus entregas en jefes y cada bloque de 25 minutos de estudio en un golpe. Estudiar, pero como un RPG.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: el script del <head> puede añadir
    // data-motion="paused" a <html> antes de que React hidrate; así React
    // acepta ese atributo en vez de tratarlo como un error. Solo afecta a los
    // atributos de <html>, no a lo que va dentro.
    <html
      lang="es"
      className={`${inter.variable} ${cinzel.variable} ${cinzelDecorative.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* "Pausar animaciones" de la landing antes del primer pintado: ver
            components/landing/motion-script.ts. Es texto fijo (no depende de
            la petición), así que la landing sigue siendo estática. */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-night text-parchment">{children}</body>
    </html>
  );
}
