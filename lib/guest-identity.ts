const STORAGE_KEY = "livekit_guest_identity";

export function getOrCreateGuestIdentity(): string {
    if (typeof window === "undefined") {
        return `guest_${crypto.randomUUID().slice(0, 6)}`;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const fresh = `guest_${crypto.randomUUID().slice(0, 6)}`;
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
}
