import type { NextConfig } from "next";
const nextConfig: NextConfig = {
    /** Ensure JSON under `data/` is bundled for API routes that read from disk. */
    outputFileTracingIncludes: {
        "/api/chess/puzzles/library": ["./data/chess-puzzles.json"],
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
            { protocol: "https", hostname: "lh3.googleusercontent.com", pathname: "/**" },
            { protocol: "https", hostname: "drive.google.com", pathname: "/**" },
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
        ],
    },
};
export default nextConfig;
