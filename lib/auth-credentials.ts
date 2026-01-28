export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeEmail(raw: string): string {
    return raw.trim().toLowerCase();
}
export function emailValidationError(raw: string): string | null {
    const e = normalizeEmail(raw);
    if (!e) {
        return "Email is required";
    }
    if (e.length > EMAIL_MAX) {
        return "Email is too long";
    }
    if (!EMAIL_RE.test(e)) {
        return "Invalid email address";
    }
    return null;
}
/** True if identifier should be looked up as email (not username). */
export function isEmailLikeIdentifier(raw: string): boolean {
    return raw.trim().includes("@");
}
export function normalizeUsername(raw: string): string {
    return raw.trim().toLowerCase();
}
/** Server-side validation message (English). */
export function usernameValidationError(raw: string): string | null {
    const u = normalizeUsername(raw);
    if (!u) {
        return "Username is required";
    }
    if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) {
        return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters`;
    }
    if (!/^[a-z0-9_]+$/.test(u)) {
        return "Username may only use lowercase letters, digits, and underscores";
    }
    return null;
}
export function passwordValidationError(raw: unknown): string | null {
    if (raw == null || typeof raw !== "string") {
        return "Password is required";
    }
    if (raw.length < PASSWORD_MIN) {
        return `Password must be at least ${PASSWORD_MIN} characters`;
    }
    if (raw.length > PASSWORD_MAX) {
        return "Password is too long";
    }
    return null;
}
