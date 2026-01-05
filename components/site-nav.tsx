"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  History,
  LibraryBig,
  Menu,
  Mic,
  Moon,
  Phone,
  Sun,
  X,
} from "lucide-react";

const links = [
  { href: "/real-time-call", label: "Call Ken", icon: Phone },
  { href: "/", label: "Search", icon: BookOpen },
  { href: "/library", label: "Library", icon: LibraryBig },
  { href: "/history", label: "History", icon: History },
  { href: "/ielts-speaking", label: "IELTS Speaking", icon: Mic },
];

export function SiteNav() {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const nextIsDark = savedTheme ? savedTheme === "dark" : prefersDark;

    setIsDark(nextIsDark);
    document.documentElement.classList.toggle("dark", nextIsDark);
    document.documentElement.classList.toggle("dark-mode", nextIsDark);
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.classList.toggle("dark-mode", next);
    window.localStorage.setItem("theme", next ? "dark" : "light");
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? (
            <X className="h-4 w-4" />
          ) : (
            <Menu className="h-4 w-4" />
          )}
        </button>
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          KFC All-in-One
        </p>
        <button
          type="button"
          onClick={toggleTheme}
          className={[
            "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition",
            isDark
              ? "border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white"
              : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100",
          ].join(" ")}
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>
      ``
      {mobileOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/30"
            aria-label="Close navigation drawer"
          />
          <aside className="relative z-10 h-full w-72 border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-6 px-2">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                KFC All-in-One
              </h1>
            </div>
            <nav className="flex flex-col gap-2">
              {links.map((link) => {
                const active = pathname === link.href;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={[
                      "group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200",
                      active
                        ? "bg-zinc-100 text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex h-9 w-9 items-center justify-center rounded-xl transition",
                        active
                          ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                          : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
                      ].join(" ")}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
      <aside className="hidden h-screen w-72 shrink-0 border-r border-zinc-200/70 bg-zinc-50/80 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/80 md:flex md:overflow-y-auto">
        <div className="flex w-full flex-col px-4 py-5">
          <div className="mb-8 px-3">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                KFC All-in-One
              </h1>
              <button
                type="button"
                onClick={toggleTheme}
                className={[
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition",
                  isDark
                    ? "border-zinc-600 bg-zinc-100 text-zinc-900 hover:bg-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100",
                ].join(" ")}
                aria-label="Toggle dark mode"
              >
                {isDark ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
              Search words, save meaning, and build your own tiny library.
            </p>
          </div>

          <nav className="flex flex-col gap-2">
            {links.map((link) => {
              const active = pathname === link.href;
              const Icon = link.icon;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    "group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
                      : "text-zinc-500 hover:bg-white/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-9 w-9 items-center justify-center rounded-xl transition",
                      active
                        ? "bg-zinc-900 text-white dark:bg-zinc-200 dark:text-zinc-900"
                        : "bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200/80 group-hover:text-zinc-800 dark:bg-zinc-800 dark:text-zinc-400 dark:group-hover:bg-zinc-700 dark:group-hover:text-zinc-100",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" />
                  </span>

                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto px-3 pb-2">
            <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 dark:border-zinc-700 dark:bg-zinc-800/80">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Quick tip
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                Keep the UI simple: meaning, synonyms, antonyms, example.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
