import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { defaultLocale, direction } from "../locale";
import "./globals.css";

/** Variable names must stay aligned with src/theme.css */

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Scriora",
  description:
    "Open-source AI social growth OS. Schedule with truth. Grow from evidence. The human stays in control.",
  icons: {
    icon: "/scriora-mark.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang={defaultLocale}
      dir={direction(defaultLocale)}
      className={`${display.variable} ${body.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
