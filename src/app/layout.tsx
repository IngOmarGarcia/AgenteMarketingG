import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Plataforma de Estrategia",
  description: "Generación y seguimiento de estrategias de marketing.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        Sin clases de fondo ni de color: los pone `body` en globals.css, con el
        degradado animado y `var(--foreground)`. Aquí había un
        `bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100` que no
        pintaba nada —el shorthand `background` de esa regla resetea
        `background-color`, y el CSS sin capa gana a las utilidades de Tailwind,
        que van en `@layer utilities`— pero hacía creer lo contrario a quien
        leyera este fichero buscando por qué el fondo no se ve.
      */}
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
