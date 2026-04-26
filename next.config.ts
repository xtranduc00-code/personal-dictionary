import type { NextConfig } from "next";
const nextConfig: NextConfig = {
    /** Ensure data files are bundled for API routes that read from disk.
     *  `puzzles-prod.sqlite` is the small (~80 MB) sampled subset committed
     *  to the repo; the runtime falls back to the full local-only file when
     *  it exists. */
    outputFileTracingIncludes: {
        "/api/chess/puzzles/library": [
            "./data/puzzles-prod.sqlite",
            "./data/chess-puzzles.json",
            "./data/themes.json",
            "./data/openings.json",
        ],
        "/api/chess/puzzles/next": [
            "./data/puzzles-prod.sqlite",
            "./data/chess-puzzles.json",
            "./data/themes.json",
            "./data/openings.json",
        ],
        "/api/chess/puzzles/by-id": ["./data/puzzles-prod.sqlite"],
        "/api/chess/puzzles/[puzzleId]/attempt": ["./data/puzzles-prod.sqlite"],
        "/api/chess/progress": ["./data/puzzles-prod.sqlite"],
        "/api/chess/game-puzzles": ["./data/puzzles-prod.sqlite"],
        "/api/chess/game-puzzles/extract": ["./data/puzzles-prod.sqlite"],
        "/api/chess/game-puzzles/summary": ["./data/puzzles-prod.sqlite"],
        "/api/chess/themes": [
            "./data/puzzles-prod.sqlite",
            "./data/themes.json",
            "./data/chess-puzzles.json",
        ],
        "/api/chess/themes/[key]": [
            "./data/puzzles-prod.sqlite",
            "./data/themes.json",
            "./data/chess-puzzles.json",
            "./data/openings.json",
        ],
        "/api/chess/openings": [
            "./data/puzzles-prod.sqlite",
            "./data/openings.json",
            "./data/chess-puzzles.json",
        ],
        "/api/chess/openings/[key]": [
            "./data/puzzles-prod.sqlite",
            "./data/openings.json",
            "./data/chess-puzzles.json",
        ],
        "/api/search-suggestions": ["./data/common-words.json"],
    },
    /**
     * Keep serverless traces small on Netlify (faster packaging + less upload).
     * Static assets under `public/` are deployed separately; puzzle JSON lives in `data/`.
     */
    outputFileTracingExcludes: {
        "*": [
            "**/public/**",
            "**/public/stockfish.js",
            "**/stockfish.js",
            "**/stockfish.wasm",
            "**/stockfish.*.wasm",
            "**/node_modules/**/*.wasm",
        ],
    },
    serverExternalPackages: [
        "pdf-parse",
        "pdfjs-dist",
        "@napi-rs/canvas",
        "mammoth",
        "xlsx",
        "jsdom",
        "linkedom",
        "@mozilla/readability",
        // Native bindings — must not be webpacked.
        "better-sqlite3",
    ],
    turbopack: {},
    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "SAMEORIGIN" },
                ],
            },
        ];
    },
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "engnovate.com",
                pathname: "/wp-content/uploads/**",
            },
            { protocol: "https", hostname: "img.freepik.com", pathname: "/**" },
            { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
            { protocol: "https", hostname: "assets.app.engoo.com", pathname: "/**" },
            {
                protocol: "https",
                hostname: "ichef.bbci.co.uk",
                pathname: "/**",
            },
            { protocol: "https", hostname: "i.scdn.co", pathname: "/**" },
            { protocol: "https", hostname: "mosaic.scdn.co", pathname: "/**" },
        ],
    },
    experimental: {
        serverActions: { bodySizeLimit: "100mb" },
        optimizePackageImports: [
            "@radix-ui/react-slot",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-icons",
            "lucide-react",
            "date-fns",
            "date-fns-tz",
            "react-toastify",
            "@tiptap/react",
            "@tiptap/starter-kit",
            "@tiptap/pm",
        ],
    },
};
export default nextConfig;
