const ITUNES = "https://itunes.apple.com";

export interface DeezerTrack {
  id: number;
  title: string;
  artist: { id: number; name: string; picture_medium: string };
  album: { id: number; title: string; cover_medium: string };
  preview: string;
  duration: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTrack(item: any): DeezerTrack | null {
  if (!item.previewUrl || item.kind !== "song") return null;
  const art = (item.artworkUrl100 as string | undefined) ?? "";
  return {
    id: item.trackId as number,
    title: item.trackName as string,
    artist: {
      id: (item.artistId as number) ?? 0,
      name: item.artistName as string,
      picture_medium: art,
    },
    album: {
      id: (item.collectionId as number) ?? 0,
      title: (item.collectionName as string) ?? "",
      cover_medium: art.replace("100x100bb", "400x400bb"),
    },
    preview: item.previewUrl as string,
    duration: Math.floor(((item.trackTimeMillis as number) ?? 30000) / 1000),
  };
}

async function fetchItunes(path: string): Promise<unknown[] | null> {
  try {
    const res = await fetch(`${ITUNES}${path}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: unknown[] };
    return json.results ?? null;
  } catch {
    return null;
  }
}

export async function getCharts(limit = 20): Promise<DeezerTrack[]> {
  const results = await fetchItunes(
    `/search?term=top+hits&media=music&entity=song&limit=${limit * 2}`,
  );
  if (!results) return [];
  return results
    .map(mapTrack)
    .filter((t): t is DeezerTrack => t !== null)
    .slice(0, limit);
}

export async function searchTracks(
  query: string,
  limit = 30,
): Promise<DeezerTrack[]> {
  if (!query.trim()) return [];
  const results = await fetchItunes(
    `/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`,
  );
  if (!results) return [];
  return results.map(mapTrack).filter((t): t is DeezerTrack => t !== null);
}

export async function getArtistTracks(
  artistId: number,
  limit = 10,
): Promise<DeezerTrack[]> {
  const results = await fetchItunes(
    `/lookup?id=${artistId}&entity=song&limit=${limit + 1}`,
  );
  if (!results) return [];
  return results
    .filter(
      (r: unknown) => (r as { wrapperType?: string }).wrapperType === "track",
    )
    .map(mapTrack)
    .filter((t): t is DeezerTrack => t !== null);
}
