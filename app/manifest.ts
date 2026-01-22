import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
    return {
        id: "/",
        name: "KFC Workspace",
        short_name: "KFC",
        description: "All-in-one productivity app with flashcards, AI tools, and learning features.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#fafafa",
        theme_color: "#18181b",
        icons: [
            {
                src: "/pwa/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/pwa/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/pwa/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
    };
}
