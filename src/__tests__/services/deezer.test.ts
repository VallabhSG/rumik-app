import { getCharts, searchTracks } from "../../services/deezer";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const itunesTrack = {
  kind: "song",
  trackId: 1,
  trackName: "Test Track",
  artistId: 10,
  artistName: "Test Artist",
  collectionId: 100,
  collectionName: "Test Album",
  artworkUrl100: "https://example.com/100x100bb.jpg",
  previewUrl: "https://example.com/preview.mp3",
  trackTimeMillis: 30000,
};

beforeEach(() => mockFetch.mockReset());

describe("getCharts", () => {
  it("returns tracks from iTunes top hits search", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [itunesTrack] }),
    });
    const tracks = await getCharts();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe("Test Track");
    expect(tracks[0].artist.name).toBe("Test Artist");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("itunes.apple.com/search?term=top+hits"),
    );
  });

  it("returns empty array on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const tracks = await getCharts();
    expect(tracks).toEqual([]);
  });

  it("skips tracks without a preview URL", async () => {
    const noPreview = { ...itunesTrack, previewUrl: undefined };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [noPreview, itunesTrack] }),
    });
    const tracks = await getCharts();
    expect(tracks).toHaveLength(1);
  });
});

describe("searchTracks", () => {
  it("returns tracks matching query", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [itunesTrack] }),
    });
    const tracks = await searchTracks("synthwave");
    expect(tracks).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("term=synthwave"),
    );
  });

  it("returns empty array for empty query", async () => {
    const tracks = await searchTracks("");
    expect(tracks).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("uses 400x400 artwork for cover_medium", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [itunesTrack] }),
    });
    const tracks = await searchTracks("test");
    expect(tracks[0].album.cover_medium).toContain("400x400bb");
  });
});
