import webpush from "web-push";

let configured = false;

export function isWebPushConfigured(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subj =
    process.env.VAPID_SUBJECT?.trim() || "mailto:hello@kenworkspace.netlify.app";
  return Boolean(pub && priv && subj);
}

export function getVapidPublicKeyForClient(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

export function ensureWebPushConfigured(): void {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subj =
    process.env.VAPID_SUBJECT?.trim() || "mailto:hello@kenworkspace.netlify.app";
  if (!pub || !priv) {
    throw new Error("VAPID keys missing");
  }
  webpush.setVapidDetails(subj, pub, priv);
  configured = true;
}

export { webpush };
