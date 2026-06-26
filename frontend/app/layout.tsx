import type { Metadata } from "next";
import "./globals.css";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "cpak — Cross Platform Achievement Keeper",
  description: "Self-hosted trophy hunter for Steam, Xbox, PlayStation",
  icons: {
    icon: "/favicon.svg",
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
        <nav className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <Logo />
            <div className="flex gap-4 text-sm">
              <a href="/steam" className="hover:text-[var(--steam-accent)] transition">Steam</a>
              <a href="/xbox" className="hover:text-[var(--xbox-accent)] transition">Xbox</a>
              <a href="/playstation" className="hover:text-[var(--playstation-accent)] transition">PlayStation</a>
              <a href="/settings" className="hover:text-gray-300 transition">Settings</a>
            </div>
          </div>
        </nav>
        <main className="container mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
