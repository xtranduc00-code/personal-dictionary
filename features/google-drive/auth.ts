import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
const googleClientId = process.env.AUTH_GOOGLE_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    "";
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "";
if (!process.env.AUTH_SECRET && process.env.NEXTAUTH_SECRET) {
    process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET;
}
function resolveAuthBaseUrl(): string | undefined {
    if (process.env.NODE_ENV !== "production")
        return undefined;
    const raw = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "").trim();
    if (!raw)
        return undefined;
    if (/localhost|127\.0\.0\.1/i.test(raw)) {
        return undefined;
    }
    return raw.replace(/\/$/, "");
}
const baseUrl = resolveAuthBaseUrl();
export const { handlers, auth, signIn, signOut } = NextAuth({
    basePath: "/api/drive-auth",
    trustHost: true,
    ...(baseUrl ? { url: baseUrl } : {}),
    providers: [
        Google({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            checks: [],
            authorization: {
                params: {
                    scope: "openid email profile https://www.googleapis.com/auth/drive",
                    prompt: "consent",
                    access_type: "offline",
                    response_type: "code",
                },
            },
        }),
    ],
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
    callbacks: {
        async jwt({ token, account }) {
            if (account) {
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
                token.expiresAt = account.expires_at;
                return token;
            }
            const now = Date.now() / 1000;
            const expiresAt = token.expiresAt as number | undefined;
            const refreshToken = token.refreshToken as string | undefined;
            if (refreshToken && expiresAt != null && now >= expiresAt - 300) {
                try {
                    const res = await fetch("https://oauth2.googleapis.com/token", {
                        method: "POST",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        body: new URLSearchParams({
                            grant_type: "refresh_token",
                            client_id: googleClientId,
                            client_secret: googleClientSecret,
                            refresh_token: refreshToken,
                        }),
                    });
                    if (res.ok) {
                        const data = (await res.json()) as {
                            access_token: string;
                            expires_in?: number;
                        };
                        token.accessToken = data.access_token;
                        token.expiresAt = Math.floor(now) + (data.expires_in ?? 3600);
                        delete token.error;
                    }
                    else {
                        (token as {
                            error?: string;
                        }).error = "RefreshTokenError";
                    }
                }
                catch {
                    (token as {
                        error?: string;
                    }).error = "RefreshTokenError";
                }
            }
            return token;
        },
        async session({ session, token }) {
            return {
                ...session,
                accessToken: token.accessToken as string | undefined,
                expiresAt: token.expiresAt as number | undefined,
                error: (token as {
                    error?: string;
                }).error,
            };
        },
    },
    pages: {
        signIn: "/drive",
    },
});
