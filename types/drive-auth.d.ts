import "next-auth";
declare module "next-auth" {
    interface Session {
        accessToken?: string;
        expiresAt?: number;
        error?: "RefreshTokenError";
    }
}
