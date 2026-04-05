"use client";

import { SpotifyDock } from "@/components/spotify/SpotifyDock";

/** Centers in the flex main column (`min-h-0` + `flex-1`) so the connect card fits one screen on md+ without extra scroll. */
export default function SpotifyPage() {
  return (
    <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center px-4 py-2 md:py-3">
      <SpotifyDock embedded />
    </div>
  );
}
