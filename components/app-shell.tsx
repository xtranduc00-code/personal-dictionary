"use client";
import { usePathname } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { MainScrollShell } from "@/components/main-scroll-shell";
import { AuthGate } from "@/components/auth-gate";
import { MeetPersistentLayer } from "@/components/meet/MeetPersistentLayer";
import { useMeetCall } from "@/lib/meet-call-context";
import { meetPathMatchesRoom } from "@/lib/meet-call-path";

/** Email links & OAuth return: no sidebar, no app chrome — same idea as `AUTH_FLOW_PUBLIC` in auth-gate. */
const STANDALONE_AUTH_PATHS = new Set(["/reset-password", "/auth/google/finish"]);

export function AppShell({ children }: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const { session, micPrecheckDone } = useMeetCall();
    const fullMeet =
        Boolean(session && micPrecheckDone && meetPathMatchesRoom(pathname, session.displayName));
    const isStandaloneAuth = Boolean(pathname && STANDALONE_AUTH_PATHS.has(pathname));

    /** Meet hub + in-call: light-first soft neutrals; dark: immersive shell */
    const isMeetShell = pathname === "/call" || pathname.startsWith("/call/");
    const mainClass = [
        "relative flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden",
        isStandaloneAuth ? "overflow-hidden" : "md:overflow-hidden",
        fullMeet && !isStandaloneAuth
            ? "bg-[#F6F7F9] p-0 text-[#111827] antialiased dark:bg-[#0a0a0b] dark:text-zinc-100"
            : isMeetShell && !isStandaloneAuth
                ? "bg-[#F6F7F9] px-4 py-6 text-[#111827] antialiased sm:px-6 md:px-8 md:py-7 dark:bg-[#0a0a0b] dark:p-0 dark:text-zinc-100 md:dark:p-1"
                : !isStandaloneAuth
                    ? "px-4 py-6 md:px-8 md:py-8"
                    : "",
    ].filter(Boolean).join(" ");
    return (<>
      {!isStandaloneAuth ? <SiteNav/> : null}
      <main className={mainClass}>
        {!isStandaloneAuth ? <MeetPersistentLayer/> : null}
        <AuthGate>
          <div className={fullMeet ? "hidden" : "contents"}>
            {isStandaloneAuth ? (<div className="fixed inset-0 z-[1] box-border flex items-center justify-center overflow-x-hidden overflow-y-auto bg-zinc-50 p-4 dark:bg-zinc-950">
              {children}
            </div>) : (<MainScrollShell>{children}</MainScrollShell>)}
          </div>
        </AuthGate>
      </main>
    </>);
}
