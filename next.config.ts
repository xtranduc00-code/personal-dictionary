import type { NextConfig } from "next";
const nextConfig: NextConfig = {
    /** Bundle the catalogue + word-list JSONs into the routes that read
     *  them from disk at runtime. The chess library itself moved to
     *  Supabase Postgres, so no SQLite files are bundled anymore. */
    outputFileTracingIncludes: {
        "/api/chess/themes": [
            "./data/themes.json",
            "./data/chess-puzzles.json",
        ],
        "/api/chess/themes/[key]": [
            "./data/themes.json",
            "./data/chess-puzzles.json",
            "./data/openings.json",
        ],
        "/api/chess/openings": [
            "./data/openings.json",
            "./data/chess-puzzles.json",
        ],
        "/api/chess/openings/[key]": [
            "./data/openings.json",
            "./data/chess-puzzles.json",
        ],
        "/api/chess/puzzles/library": [
            "./data/themes.json",
            "./data/openings.json",
        ],
        "/api/chess/puzzles/next": [
            "./data/themes.json",
            "./data/openings.json",
        ],
        "/api/search-suggestions": ["./data/common-words.json"],
    },
    /**
     * Keep serverless traces small on Netlify (faster packaging + less upload).
     */
    outputFileTracingExcludes: {
        "*": [
            "**/public/**",
            "**/public/stockfish.js",
            "**/stockfish.js",
            "**/stockfish.wasm",
            "**/stockfish.*.wasm",
            "**/node_modules/**/*.wasm",
            // Belt-and-suspenders: dev-only Lichess source files. Should
            // never be reachable now that the chess code path doesn't read
            // from `data/`, but excluding them costs nothing.
            "**/data/puzzles.sqlite",
            "**/data/puzzles.sqlite-shm",
            "**/data/puzzles.sqlite-wal",
            "**/data/puzzles-prod.sqlite",
            "**/data/progress.sqlite",
            "**/data/lichess_db_puzzle.csv",
            "**/data/lichess_db_puzzle.csv.zst",
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
        // pg has its own native binding (pg-native is optional, default is
        // pure JS, but we keep it external so webpack doesn't try to
        // bundle the connection-pool internals).
        "pg",
        "playwright-core",
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
