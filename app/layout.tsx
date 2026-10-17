import type { Metadata } from "next";
import { Cinzel, Cinzel_Decorative, Inter } from "next/font/google";
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
    <html
      lang="es"
      className={`${inter.variable} ${cinzel.variable} ${cinzelDecorative.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-night text-parchment">{children}</body>
    </html>
  );
}
