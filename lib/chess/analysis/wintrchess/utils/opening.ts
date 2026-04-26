// Adapted from WintrChess (GPL-3.0). Personal use only. See ../LICENSE.md.

let openingsDatabase: Record<string, string> | null = null;
let loadingPromise: Promise<Record<string, string>> | null = null;

/**
 * Lazily load the opening database from /data/chess-openings.json.
 * Caches in memory after first load.
 */
export async function loadOpenings(): Promise<Record<string, string>> {
  if (openingsDatabase) return openingsDatabase;
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetch("/data/chess-openings.json")
    .then((res) => {
      if (!res.ok) throw new Error("openings.json fetch failed");
      return res.json() as Promise<Record<string, string>>;
    })
    .then((db) => {
      openingsDatabase = db;
      return db;
    })
    .catch((err) => {
      loadingPromise = null;
      throw err;
    });

  return loadingPromise;
}

export function getOpeningName(fen: string): string | undefined {
  if (!openingsDatabase) return undefined;
  const fenPieces = fen.split(" ").at(0);
  if (!fenPieces) return undefined;
  return openingsDatabase[fenPieces];
}
