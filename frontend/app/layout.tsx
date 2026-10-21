import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { DemoInit } from "../components/DemoInit";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: "cpak - Cross Platform Achievement Keeper",
  description: "Self-hosted trophy hunter for Steam, Xbox, PlayStation",
  icons: {
    icon: `${basePath}/favicon.svg`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <DemoInit />
        <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <Link href="/" className="group">
              <h1 className="text-2xl font-black tracking-tight logo-text">
                <span className="logo-bracket">[</span>
                <span className="logo-gradient">cpak</span>
                <span className="logo-bracket">]</span>
              </h1>
            </Link>
            <div className="flex gap-4 text-sm overflow-x-auto no-scrollbar">
              <Link href="/steam" className="whitespace-nowrap hover:text-[var(--steam-accent)] transition">Steam</Link>
              <Link href="/xbox" className="whitespace-nowrap hover:text-[var(--xbox-accent)] transition">Xbox</Link>
              <Link href="/playstation" className="whitespace-nowrap hover:text-[var(--playstation-accent)] transition">PlayStation</Link>
              <Link href="/settings" className="whitespace-nowrap hover:text-gray-300 transition">Settings</Link>
            </div>
          </div>
        </nav>
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
