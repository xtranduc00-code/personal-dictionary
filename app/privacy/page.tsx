import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy — Ken Workspace",
    description: "Privacy policy for Ken Workspace.",
};

export default function PrivacyPage() {
    return (<section className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p>Last updated: March 2026</p>
      <p>
        Ken Workspace is a demo project. We collect the minimum data needed to provide
        account and app features (for example: username, email, notes, vocabulary
        word lists, and settings).
      </p>
      <p>
        Third-party services may be used for specific features (for example Google OAuth,
        Supabase, OpenAI, LiveKit). Their own privacy policies apply to those services.
      </p>
      <p>
        We do not sell personal data. You may request account data removal by contacting
        the project owner.
      </p>
    </section>);
}
