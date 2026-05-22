const BASE = 'https://api.deezer.com';

export interface DeezerTrack {
  id: number;
  title: string;
  artist: { id: number; name: string; picture_medium: string };
  album: { id: number; title: string; cover_medium: string };
  preview: string;
  duration: number;
}

async function fetchDeezer<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`);
    console.log(`[Deezer] ${path} → ${res.status}`);
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    if (json.error) {
      console.warn(`[Deezer] API error:`, JSON.stringify(json.error));
      return null;
    }
    return json as T;
  } catch (e) {
    console.warn(`[Deezer] fetch failed:`, e);
    return null;
  }
}

export async function getCharts(limit = 20): Promise<DeezerTrack[]> {
  const data = await fetchDeezer<{ data: DeezerTrack[] }>(
    `/chart/0/tracks?limit=${limit}`
  );
  return data?.data ?? [];
}

export async function searchTracks(query: string, limit = 30): Promise<DeezerTrack[]> {
  if (!query.trim()) return [];
  const data = await fetchDeezer<{ data: DeezerTrack[] }>(
    `/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  return data?.data ?? [];
}

export async function getArtistTracks(artistId: number, limit = 10): Promise<DeezerTrack[]> {
  const data = await fetchDeezer<{ data: DeezerTrack[] }>(
    `/artist/${artistId}/top?limit=${limit}`
  );
  return data?.data ?? [];
}
