import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "About — Ken Workspace",
    description: "About Ken Workspace and project ownership.",
};

export default function AboutPage() {
    return (<section className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
      <h1 className="text-2xl font-semibold">About Ken Workspace</h1>
      <p>
        Ken Workspace is an independent demo project built for learning and portfolio
        purposes.
      </p>
      <p>
        This website is not affiliated with, endorsed by, or connected to any real
        brand.
      </p>
      <p>
        The app includes productivity and English-learning tools such as notes,
        IELTS vocabulary notes, dictionary, IELTS practice, and optional integrations.
      </p>
    </section>);
}
