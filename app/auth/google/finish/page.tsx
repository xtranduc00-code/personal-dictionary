import type { Metadata } from "next";
import { Suspense } from "react";
import { GoogleOAuthFinishClient } from "./google-oauth-finish-client";
export const metadata: Metadata = {
    title: "Signing in — KFC Workspace",
    robots: { index: false, follow: false },
};
export default function GoogleOAuthFinishPage() {
    return (<div className="flex min-h-[40vh] flex-col items-center justify-center px-4 py-16">
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <GoogleOAuthFinishClient />
      </Suspense>
    </div>);
}
