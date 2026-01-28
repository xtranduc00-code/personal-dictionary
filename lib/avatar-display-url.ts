/** Same Storage path after overwrite → same URL → browser cache shows old bytes. Always append `?v=` so display URL differs from the raw stored URL and bumps refetch after `bumpAvatarDisplay()`. */
export function withAvatarCacheBust(url: string | null | undefined, rev: number): string | null {
    const u = url?.trim();
    if (!u)
        return null;
    const base = u.split("?")[0];
    return `${base}?v=${rev}`;
}
