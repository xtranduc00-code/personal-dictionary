type Entry<T> = { expires: number; data: T };

const listCache = new Map<string, Entry<unknown>>();
const lessonCache = new Map<string, Entry<unknown>>();

const LIST_TTL_MS = 30 * 60 * 1000;
const LESSON_TTL_MS = 24 * 60 * 60 * 1000;

export function getCachedEngooList<T>(key: string): T | null {
  const e = listCache.get(key);
  if (!e || Date.now() > e.expires) {
    if (e) listCache.delete(key);
    return null;
  }
  return e.data as T;
}

export function setCachedEngooList<T>(key: string, data: T): void {
  listCache.set(key, { expires: Date.now() + LIST_TTL_MS, data });
}

export function getCachedEngooLesson<T>(key: string): T | null {
  const e = lessonCache.get(key);
  if (!e || Date.now() > e.expires) {
    if (e) lessonCache.delete(key);
    return null;
  }
  return e.data as T;
}

export function setCachedEngooLesson<T>(key: string, data: T): void {
  lessonCache.set(key, { expires: Date.now() + LESSON_TTL_MS, data });
}
