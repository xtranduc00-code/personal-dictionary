import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Spotify",
  description: "Spotify Web Playback — Ken Workspace",
};

export default function SpotifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
