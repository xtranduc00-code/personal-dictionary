export function getGoogleAppOAuthCredentials(): {
    clientId: string;
    clientSecret: string;
} | null {
    const clientId = (process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID || "").trim();
    const clientSecret = (process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim();
    if (!clientId || !clientSecret) {
        return null;
    }
    return { clientId, clientSecret };
}

/** Base URL for Google OAuth redirect_uri (must match Google Cloud Console exactly). */
export function resolveGoogleOAuthOrigin(req: Request): string {
    const fromEnv = (process.env.AUTH_APP_OAUTH_ORIGIN || "").trim().replace(/\/$/, "");
    if (fromEnv) {
        return fromEnv;
    }
    return new URL(req.url).origin;
}
