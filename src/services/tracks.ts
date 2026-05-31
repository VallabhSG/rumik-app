const ITUNES = "https://itunes.apple.com";

export interface Track {
  id: number;
  title: string;
  artist: { id: number; name: string; picture_medium: string };
  album: { id: number; title: string; cover_medium: string };
  preview: string;
  duration: number;
}

interface RawItunesTrack {
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistId?: number;
  artistName?: string;
  collectionId?: number;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
}

function mapTrack(item: RawItunesTrack): Track | null {
  if (!item.previewUrl || item.kind !== "song") return null;
  const art = item.artworkUrl100 ?? "";
  return {
    id: item.trackId ?? 0,
    title: item.trackName ?? "",
    artist: {
      id: item.artistId ?? 0,
      name: item.artistName ?? "",
      picture_medium: art,
    },
    album: {
      id: item.collectionId ?? 0,
      title: item.collectionName ?? "",
      cover_medium: art.replace("100x100bb", "400x400bb"),
    },
    preview: item.previewUrl,
    duration: Math.floor((item.trackTimeMillis ?? 30000) / 1000),
  };
}

async function fetchItunes(path: string): Promise<RawItunesTrack[] | null> {
  try {
    const res = await fetch(`${ITUNES}${path}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: RawItunesTrack[] };
    return json.results ?? null;
  } catch {
    return null;
  }
}

export async function getCharts(limit = 20): Promise<Track[]> {
  const results = await fetchItunes(
    `/search?term=top+hits&media=music&entity=song&limit=${limit * 2}`,
  );
  if (!results) return [];
  return results
    .map(mapTrack)
    .filter((t): t is Track => t !== null)
    .slice(0, limit);
}

export async function searchTracks(
  query: string,
  limit = 30,
): Promise<Track[]> {
  if (!query.trim()) return [];
  const results = await fetchItunes(
    `/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${limit}`,
  );
  if (!results) return [];
  return results.map(mapTrack).filter((t): t is Track => t !== null);
}

export async function getArtistTracks(
  artistId: number,
  limit = 10,
): Promise<Track[]> {
  const results = await fetchItunes(
    `/lookup?id=${artistId}&entity=song&limit=${limit + 1}`,
  );
  if (!results) return [];
  return results
    .filter(
      (r: unknown) => (r as { wrapperType?: string }).wrapperType === "track",
    )
    .map(mapTrack)
    .filter((t): t is Track => t !== null);
}
