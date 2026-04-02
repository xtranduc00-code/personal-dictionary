import { S3Client } from "@aws-sdk/client-s3";

let cached: S3Client | null = null;

function firstEnv(...names: string[]): string {
    for (const n of names) {
        const v = process.env[n]?.trim();
        if (v) {
            return v;
        }
    }
    return "";
}

function resolveEndpoint(): string {
    const explicit = firstEnv(
        "CLOUDFLARE_R2_ENDPOINT",
        "R2_ENDPOINT",
        "S3_ENDPOINT",
        "R2_S3_ENDPOINT",
        "CLOUDFLARE_S3_ENDPOINT",
    );
    if (explicit) {
        return explicit;
    }
    const accountId = firstEnv(
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_R2_ACCOUNT_ID",
        "R2_ACCOUNT_ID",
        "CLOUDFLARE_R2_ACCOUNT",
    );
    if (accountId) {
        return `https://${accountId}.r2.cloudflarestorage.com`;
    }
    return "";
}

export function getR2Client(): S3Client {
    if (cached) {
        return cached;
    }
    const endpoint = resolveEndpoint();
    const accessKeyId = firstEnv(
        "CLOUDFLARE_R2_ACCESS_KEY_ID",
        "R2_ACCESS_KEY_ID",
        "AWS_ACCESS_KEY_ID",
        "R2_ACCESS_KEY",
        "CLOUDFLARE_R2_ACCESS_KEY",
    );
    const secretAccessKey = firstEnv(
        "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
        "R2_SECRET_ACCESS_KEY",
        "AWS_SECRET_ACCESS_KEY",
        "R2_SECRET_KEY",
        "CLOUDFLARE_R2_SECRET_KEY",
    );
    if (!endpoint || !accessKeyId || !secretAccessKey) {
        throw new Error("R2_CLIENT_NOT_CONFIGURED");
    }
    cached = new S3Client({
        region: "auto",
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
    });
    return cached;
}

