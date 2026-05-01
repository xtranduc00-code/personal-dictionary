"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { MainScrollShell } from "@/components/main-scroll-shell";
import { AuthGate } from "@/components/auth-gate";
import { useMeetCall } from "@/lib/meet-call-context";
import { meetPathMatchesRoom } from "@/lib/meet-call-path";

const MeetPersistentLayer = dynamic(
  () => import("@/components/meet/MeetPersistentLayer").then((m) => m.MeetPersistentLayer),
  { ssr: false },
);
const YouTubeDock = dynamic(
  () => import("@/components/youtube-dock").then((m) => m.YouTubeDock),
  { ssr: false },
);

/** Password reset from email: no sidebar / minimal chrome — same idea as `AUTH_FLOW_PUBLIC` in auth-gate. */
const STANDALONE_AUTH_PATHS = new Set(["/reset-password"]);

export function AppShell({ children }: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const { session, micPrecheckDone } = useMeetCall();
    const fullMeet =
        Boolean(session && micPrecheckDone && meetPathMatchesRoom(pathname, session.displayName));
    const isStandaloneAuth = Boolean(pathname && STANDALONE_AUTH_PATHS.has(pathname));
    const pathSeg = pathname?.split("/").filter(Boolean) ?? [];
    const isWatchPartyRoom = pathSeg[0] === "watch" && pathSeg.length >= 2;
    const isDailyNewsRoute =
        pathname === "/news" ||
        (Boolean(pathname) && pathname.startsWith("/news/"));
    const isHubGreyShell = isDailyNewsRoute;
    const isPortfolioLanding =
        pathname === "/" || pathname === "/portfolio";
    const isChessPath =
        pathname === "/chess" || (Boolean(pathname) && pathname.startsWith("/chess/"));
    const noOuterMainPadding =
        !isStandaloneAuth && (fullMeet || isWatchPartyRoom);

    const isMeetShell =
        pathname === "/call" ||
        pathname.startsWith("/call/") ||
        pathname === "/watch" ||
        pathname.startsWith("/watch/");
    const mainClass = [
        "relative flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden",
        isStandaloneAuth ? "overflow-hidden" : "md:overflow-hidden",
        noOuterMainPadding
            ? "bg-[#F6F7F9] p-0 text-[#111827] antialiased dark:bg-[#0a0a0b] dark:text-zinc-100"
            : isPortfolioLanding && !isStandaloneAuth
                ? "p-0"
                : isMeetShell && !isStandaloneAuth
                ? "bg-[#F6F7F9] px-4 py-6 text-[#111827] antialiased sm:px-6 md:px-8 md:py-7 dark:bg-[#0a0a0b] dark:p-0 dark:text-zinc-100 md:dark:p-1"
                : isHubGreyShell && !isStandaloneAuth
                    ? "bg-[#F6F7F9] px-4 py-6 text-[#111827] antialiased sm:px-6 md:px-8 md:py-7 dark:bg-zinc-950 dark:text-zinc-100"
                : !isStandaloneAuth && isChessPath
                    ? "bg-zinc-50 px-4 py-4 text-zinc-900 antialiased md:px-6 md:py-5 dark:bg-zinc-950 dark:text-zinc-100"
                : !isStandaloneAuth
                    ? "px-4 py-6 md:px-8 md:py-8"
                    : "",
    ].filter(Boolean).join(" ");
    return (<>
      {!isStandaloneAuth ? <SiteNav/> : null}
      <main className={mainClass}>
        {!isStandaloneAuth ? <MeetPersistentLayer/> : null}
        {!isStandaloneAuth ? <YouTubeDock /> : null}
        <AuthGate>
          {/* Real flex box — not `display:contents` (Safari/mobile hit-testing bugs). */}
          <div
            className={
              fullMeet
                ? "hidden"
                : "flex min-h-0 w-full min-w-0 flex-1 flex-col"
            }
          >
            {isStandaloneAuth ? (<div className="fixed inset-0 z-[1] box-border flex items-center justify-center overflow-x-hidden overflow-y-auto bg-zinc-50 p-4 dark:bg-zinc-950">
              {children}
            </div>) : (
              <MainScrollShell>
                {children}
              </MainScrollShell>
            )}
          </div>
        </AuthGate>
      </main>
    </>);
}
