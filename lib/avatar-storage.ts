/** Shared avatar Storage layout (bucket + path). */
export const AVATAR_BUCKET = "avatars";
export const AVATAR_OBJECT_NAME = "avatar";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export function avatarObjectPath(userId: string): string {
    return `${userId}/${AVATAR_OBJECT_NAME}`;
}
