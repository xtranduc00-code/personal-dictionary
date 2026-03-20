import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { blockSearchIndexing } from "@/lib/search-indexing";

type ChangeFreq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

/** Indexable tool and marketing routes (no auth-only or dynamic IDs). */
const PATHS: { path: string; changeFrequency: ChangeFreq; priority: number }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/profile", changeFrequency: "monthly", priority: 0.9 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.85 },
    { path: "/dictionary", changeFrequency: "weekly", priority: 0.95 },
    { path: "/study-kit", changeFrequency: "weekly", priority: 0.88 },
    { path: "/flashcards", changeFrequency: "weekly", priority: 0.9 },
    { path: "/library", changeFrequency: "weekly", priority: 0.85 },
    { path: "/calendar", changeFrequency: "weekly", priority: 0.85 },
    { path: "/translate", changeFrequency: "weekly", priority: 0.85 },
    { path: "/notes", changeFrequency: "weekly", priority: 0.8 },
    { path: "/history", changeFrequency: "weekly", priority: 0.75 },
    { path: "/listening", changeFrequency: "weekly", priority: 0.85 },
    { path: "/ielts-reading", changeFrequency: "weekly", priority: 0.85 },
    { path: "/ielts-writing", changeFrequency: "weekly", priority: 0.85 },
    { path: "/ielts-speaking", changeFrequency: "weekly", priority: 0.85 },
    { path: "/call", changeFrequency: "weekly", priority: 0.8 },
    { path: "/real-time-call", changeFrequency: "weekly", priority: 0.75 },
];

export default function sitemap(): MetadataRoute.Sitemap {
    if (blockSearchIndexing()) {
        return [];
    }
    const base = getSiteUrl().replace(/\/$/, "");
    const now = new Date();
    return PATHS.map(({ path, changeFrequency, priority }) => ({
        url: path === "/" ? base : `${base}${path}`,
        lastModified: now,
        changeFrequency,
        priority,
    }));
}
