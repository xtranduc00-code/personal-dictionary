import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { MainScrollShell } from "@/components/main-scroll-shell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "KFC All-in-One",
  description: "Search words, save meaning, and build your own tiny library.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 md:h-screen md:overflow-hidden md:flex">
          <SiteNav />
          <main className="flex-1 px-4 py-6 md:overflow-hidden md:px-8 md:py-8">
            <MainScrollShell>{children}</MainScrollShell>
          </main>
        </div>
      </body>
    </html>
  );
}
