import type { NextConfig } from "next";
const nextConfig: NextConfig = {
    serverExternalPackages: [
        "pdf-parse",
        "pdfjs-dist",
        "@napi-rs/canvas",
        "mammoth",
        "xlsx",
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
