import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Cairo, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { I18nGate } from "@/components/bottle/i18n-gate";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Arabic body pairing — also carries clean Latin glyphs as a fallback so the
// UI stays legible even before Geist loads. Loaded as a variable font; weight
// is controlled via CSS.
const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

// Nostalgic soft serif for the display headings ("letter from the shore").
// Variable font; weight is set in CSS.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Message in a Bottle — cast a note into the sea",
  description:
    "An anonymous, calm space to cast a short message into the sea and receive one back. Dusk over water. Full Arabic / English support.",
  keywords: [
    "message in a bottle",
    "anonymous",
    "ocean",
    "Arabic",
    "English",
    "calm",
  ],
  authors: [{ name: "The Shore" }],
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Message in a Bottle",
    description: "Cast an anonymous note into the sea. Someone will find it.",
    siteName: "Message in a Bottle",
    type: "website",
  },
};

export const viewport: Viewport = {
  // Adaptive theme-color: the browser chrome / mobile address bar tints to
  // match the active palette. Light mode uses the soft sea-foam bg; dark
  // mode uses the deep ocean night bg. Both read as intentional.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1a1e" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cairo.variable} ${fraunces.variable} antialiased`}
      >
        {/* ThemeProvider (next-themes) injects a blocking pre-paint script
            that reads localStorage `theme` and applies the .dark class
            synchronously — no FOUC, no hydration mismatch (suppressHydration
            Warning on <html> silences the expected class diff). Default is
            system preference; manual choice persists across visits. */}
        <ThemeProvider>
          {/* I18nGate runs a client effect to apply the saved locale's
              lang/dir to <html> and to hydrate the translation store
              before first paint of locale-aware strings. */}
          <I18nGate>{children}</I18nGate>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
