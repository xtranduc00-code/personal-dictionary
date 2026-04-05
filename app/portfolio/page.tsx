import { permanentRedirect } from "next/navigation";

/** Bookmarks to `/portfolio` land on the same home as `/`. */
export default function PortfolioPage() {
  permanentRedirect("/");
}
