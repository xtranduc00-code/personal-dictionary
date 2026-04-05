/** Normalized row for the Daily News Guardian panel. */
export type GuardianListItem = {
  id: string;
  webTitle: string;
  webUrl: string;
  webPublicationDate: string;
  thumbnailUrl: string | null;
  trailText: string | null;
};
