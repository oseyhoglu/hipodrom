import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hipodrom — TJK Yarış Analiz Paneli",
  description: "TJK at yarışları için canlı AGF ve ganyan analiz paneli. Anlık oran takibi, değişim grafikleri ve altılı ganyan raporları.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <nav className="navbar">
          <Link href="/" className="navbar-brand">
            <span className="icon">🏇</span>
            Hipodrom
          </Link>
          <ul className="navbar-links">
            <li><Link href="/">Ana Sayfa</Link></li>
            <li><Link href="/ganyan">Ganyan Raporu</Link></li>
          </ul>
        </nav>
        {children}
      </body>
    </html>
  );
}
