import { getCharts, searchTracks } from '../../services/deezer';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockTrack = {
  id: 1,
  title: 'Test Track',
  artist: { id: 10, name: 'Test Artist', picture_medium: 'https://example.com/pic.jpg' },
  album: { id: 100, title: 'Test Album', cover_medium: 'https://example.com/cover.jpg' },
  preview: 'https://example.com/preview.mp3',
  duration: 30,
};

beforeEach(() => mockFetch.mockReset());

describe('getCharts', () => {
  it('returns tracks from chart endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [mockTrack] }),
    });
    const tracks = await getCharts();
    expect(tracks).toHaveLength(1);
    expect(tracks[0].title).toBe('Test Track');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.deezer.com/chart/0/tracks?limit=20'
    );
  });

  it('returns empty array on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const tracks = await getCharts();
    expect(tracks).toEqual([]);
  });
});

describe('searchTracks', () => {
  it('returns tracks matching query', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [mockTrack] }),
    });
    const tracks = await searchTracks('synthwave');
    expect(tracks).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.deezer.com/search?q=synthwave&limit=30'
    );
  });

  it('returns empty array for empty query', async () => {
    const tracks = await searchTracks('');
    expect(tracks).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
