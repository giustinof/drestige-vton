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

export const metadata = {
  title: "Drestige V-TON",
  description: "Gestione catalogo e Virtual Try-On",
  // 1. DICHIARAZIONE DEL MANIFEST (FONDAMENTALE PER ANDROID/CHROME)
  manifest: "/manifest.json",
  // 2. DICHIARAZIONE PER INSTALLAZIONE SU IOS/SAFARI
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent", // Si fonde meglio col nostro nuovo sfondo scuro
    title: "Drestige V-TON",
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#09090b', // Aggiornato al nero del nuovo design
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased selection:bg-indigo-500 selection:text-white`}
    >
      <head>
        {/* 3. ICONA PER LA HOME DI IOS */}
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className="min-h-full flex flex-col bg-[#09090b] text-white">
        {children}
      </body>
    </html>
  );
}