"use client";
import { usePathname } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { MainScrollShell } from "@/components/main-scroll-shell";
import { AuthGate } from "@/components/auth-gate";
import { MeetPersistentLayer } from "@/components/meet/MeetPersistentLayer";
import { SpotifyDock } from "@/components/spotify/SpotifyDock";
import { useMeetCall } from "@/lib/meet-call-context";
import { meetPathMatchesRoom } from "@/lib/meet-call-path";

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
    /** `/watch/:room` — full-bleed giống cuộc gọi full để video rộng tối đa */
    const isWatchPartyRoom = pathSeg[0] === "watch" && pathSeg.length >= 2;
    const isDailyNewsRoute =
        pathname === "/news" ||
        (Boolean(pathname) && pathname.startsWith("/news/"));
    const isSpotifyPage = pathname === "/spotify";
    const isHubGreyShell = isDailyNewsRoute || isSpotifyPage;
    /** Portfolio landing — full-bleed hero in main; Spotify via sidebar elsewhere. */
    const isPortfolioLanding =
        pathname === "/" || pathname === "/portfolio";
    /** `/spotify` uses an embedded player — don’t mount a second Web Playback instance. */
    const spotifyDockUnmount = pathname === "/spotify";
    /**
     * Home / portfolio: keep the floating dock mounted but invisible so leaving Spotify playing
     * and opening “/” or “/portfolio” doesn’t disconnect the SDK (unmount used to kill playback).
     */
    const spotifyDockVisuallyHidden = isPortfolioLanding;
    const noOuterMainPadding =
        !isStandaloneAuth && (fullMeet || isWatchPartyRoom);

    /** Meet hub + in-call: light-first soft neutrals; dark: immersive shell */
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
                    ? isSpotifyPage
                        ? "bg-[#F6F7F9] px-4 py-3 text-[#111827] antialiased sm:px-6 md:px-8 md:py-4 dark:bg-zinc-950 dark:text-zinc-100"
                        : "bg-[#F6F7F9] px-4 py-6 text-[#111827] antialiased sm:px-6 md:px-8 md:py-7 dark:bg-zinc-950 dark:text-zinc-100"
                : !isStandaloneAuth
                    ? "px-4 py-6 md:px-8 md:py-8"
                    : "",
    ].filter(Boolean).join(" ");
    return (<>
      {!isStandaloneAuth ? <SiteNav/> : null}
      <main className={mainClass}>
        {!isStandaloneAuth ? <MeetPersistentLayer/> : null}
        {!isStandaloneAuth && !spotifyDockUnmount ? (
          <SpotifyDock visuallyHidden={spotifyDockVisuallyHidden} />
        ) : null}
        <AuthGate>
          <div className={fullMeet ? "hidden" : "contents"}>
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
