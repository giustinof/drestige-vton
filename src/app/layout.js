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
  title: "Drestige Hub",
  description: "Gestione catalogo e VTON",
};

// Blocca lo zoom su mobile e imposta il tema
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased selection:bg-black selection:text-white`}
    >
      <body className="min-h-full flex flex-col bg-white">{children}</body>
    </html>
  );
}