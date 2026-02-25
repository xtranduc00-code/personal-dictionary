"use client";
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { useI18n } from "@/components/i18n-provider";
import MobileNavigation from "@gd/components/MobileNavigation";
import Header from "@gd/components/Header";
import DropZoneArea from "@gd/components/DropZoneArea";
import { TooltipProviderWrapper } from "@gd/components/providers/TooltipProviderWrapper";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, } from "@gd/components/ui/dialog";
import { Button } from "@gd/components/ui/button";
import { Cloud } from "lucide-react";
export function DriveLayoutClient({ children, }: {
    children: React.ReactNode;
}) {
    const { data: session, status } = useSession();
    const { t } = useI18n();
    const pathname = usePathname();
    const router = useRouter();
    const refreshSignOutDone = useRef(false);
    useEffect(() => {
        const err = (session as {
            error?: string;
        } | null)?.error;
        if (err === "RefreshTokenError" && !refreshSignOutDone.current) {
            refreshSignOutDone.current = true;
            void signOut({ redirect: false, callbackUrl: "/drive" });
        }
    }, [session]);
    if (status === "loading") {
        return (<div className="flex min-h-[280px] items-center justify-center rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900/40">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>);
    }
    if ((session as {
        error?: string;
    } | null)?.error === "RefreshTokenError") {
        return (<div className="flex min-h-[200px] items-center justify-center text-sm text-zinc-500">
        Refreshing session…
      </div>);
    }
    if (!session?.user) {
        const callbackUrl = typeof window !== "undefined"
            ? `${window.location.origin}${pathname}`
            : "/drive";
        return (<>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-6 py-10 text-center dark:border-zinc-700 dark:bg-zinc-900/20">
          <Cloud className="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-500"/>
          <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
            {t("driveConnectHint")}
          </p>
        </div>
        <Dialog open onOpenChange={(open) => {
                if (!open)
                    router.push("/dictionary");
            }}>
          <DialogContent className="border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900 sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="text-xl text-zinc-900 dark:text-zinc-100">
                {t("driveConnectDialogTitle")}
              </DialogTitle>
              <DialogDescription className="text-base text-zinc-600 dark:text-zinc-400">
                {t("driveConnectDialogBody")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              <Button type="button" className="h-12 w-full rounded-full bg-zinc-900 text-base font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white" onClick={() => signIn("google", { callbackUrl })}>
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {t("driveConnectDialogButton")}
              </Button>
              <button type="button" className="text-center text-sm text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:hover:text-zinc-300" onClick={() => router.push("/dictionary")}>
                Back to KFC
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </>);
    }
    const user = {
        fullName: session.user.name ?? "User",
        email: session.user.email ?? "",
        avatar: session.user.image ?? "/gdrive/assets/icons/logo-brand.svg",
        $id: session.user.id ?? "",
        accountId: session.user.email ?? "",
    };
    return (<TooltipProviderWrapper>
      <main className="drive-app-outer flex h-[calc(100dvh-6.5rem)] min-h-[360px] w-full min-w-0 max-w-full flex-col overflow-hidden overflow-x-hidden rounded-xl border border-zinc-200 bg-zinc-100/95 p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 sm:h-[calc(100dvh-7rem)] sm:p-3 md:h-[calc(100vh-8rem)] md:p-4">
        <div className="drive-inner-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
          <section className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-hidden overflow-x-hidden">
            <MobileNavigation {...user}/>
            <Header />
            <DropZoneArea>
              <div className="main-content drive-scroll-area">{children}</div>
            </DropZoneArea>
          </section>
        </div>
        <ToastContainer position="top-center" theme="colored" autoClose={4000} closeButton/>
      </main>
    </TooltipProviderWrapper>);
}
