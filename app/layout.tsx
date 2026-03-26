import type { Metadata, Viewport } from "next";
import { Inter, Nunito } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { I18nProvider } from "@/components/i18n-provider";
import { ToastProvider } from "@/components/toast-provider";
import { AuthModalLazy } from "@/components/auth-modal-lazy";
import { AppShell } from "@/components/app-shell";
import { MeetCallProvider } from "@/lib/meet-call-context";
import { SeoJsonLd } from "@/components/seo-json-ld";
import { getSiteUrl } from "@/lib/site-url";
import { blockSearchIndexing } from "@/lib/search-indexing";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin", "vietnamese"],
    display: "swap",
    weight: ["400", "500", "600", "700"],
});

const nunito = Nunito({
    variable: "--font-nunito",
    subsets: ["latin", "vietnamese"],
    display: "swap",
    weight: ["400", "500", "600", "700"],
});

const SITE_NAME = "Ken Workspace";
const SITE_DESCRIPTION =
    "All-in-one productivity app with IELTS vocabulary notes, AI tools, and learning features.";
const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const hideFromSearch = blockSearchIndexing();

export const metadata: Metadata = {
    metadataBase: new URL(getSiteUrl()),
    title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    keywords: [
        "Ken Workspace",
        "productivity",
        "IELTS vocabulary",
        "vocabulary notes",
        "dictionary",
        "IELTS",
        "notes",
        "calendar",
        "AI learning",
    ],
    authors: [{ name: SITE_NAME, url: getSiteUrl() }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    formatDetection: { email: false, address: false, telephone: false },
    robots: hideFromSearch
        ? { index: false, follow: false, googleBot: { index: false, follow: false } }
        : {
              index: true,
              follow: true,
              googleBot: {
                  index: true,
                  follow: true,
                  "max-video-preview": -1,
                  "max-image-preview": "large",
                  "max-snippet": -1,
              },
          },
    alternates: { canonical: "/" },
    openGraph: {
        type: "website",
        locale: "en_US",
        alternateLocale: ["vi_VN"],
        url: "/",
        siteName: SITE_NAME,
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
        images: [
            {
                url: "/pwa/icon-512.png",
                width: 512,
                height: 512,
                alt: SITE_NAME,
            },
        ],
    },
    twitter: {
        card: "summary",
        title: SITE_NAME,
        description: SITE_DESCRIPTION,
        images: ["/pwa/icon-512.png"],
    },
    ...(googleVerification ? { verification: { google: googleVerification } } : {}),
    appleWebApp: {
        capable: true,
        title: SITE_NAME,
        statusBarStyle: "default",
    },
    icons: {
        icon: [
            { url: "/favicon.ico", sizes: "any" },
            { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
            { url: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
        apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180" }],
    },
};
export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#fafafa" },
        { media: "(prefers-color-scheme: dark)", color: "#18181b" },
    ],
};
export default function RootLayout({ children, }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${nunito.variable} font-sans antialiased`} suppressHydrationWarning>
        <SeoJsonLd />
        <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 md:h-screen md:overflow-hidden md:flex">
          <I18nProvider>
            <AuthProvider>
              <MeetCallProvider>
                <ToastProvider />
                <AuthModalLazy />
                <AppShell>{children}</AppShell>
              </MeetCallProvider>
            </AuthProvider>
          </I18nProvider>
        </div>
      </body>
    </html>);
}
