import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getLiked,
  toggleLike,
  isLiked,
  pushRecent,
  getRecent,
} from "../../services/library";
import type { DeezerTrack } from "../../services/deezer";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

const USER = "user_clerk_123";
const mockTrack: DeezerTrack = {
  id: 1,
  title: "Neon Drift",
  artist: { id: 10, name: "Artist", picture_medium: "" },
  album: { id: 100, title: "Album", cover_medium: "" },
  preview: "https://example.com/p.mp3",
  duration: 30,
};

beforeEach(() => AsyncStorage.clear());

describe("liked tracks", () => {
  it("starts empty", async () => {
    expect(await getLiked(USER)).toEqual([]);
  });

  it("toggleLike adds a track", async () => {
    const liked = await toggleLike(USER, mockTrack);
    expect(liked).toBe(true);
    expect(await getLiked(USER)).toHaveLength(1);
  });

  it("toggleLike removes a liked track", async () => {
    await toggleLike(USER, mockTrack);
    const liked = await toggleLike(USER, mockTrack);
    expect(liked).toBe(false);
    expect(await getLiked(USER)).toHaveLength(0);
  });

  it("isLiked returns true after like", async () => {
    await toggleLike(USER, mockTrack);
    expect(await isLiked(USER, mockTrack.id)).toBe(true);
  });
});

describe("recently played", () => {
  it("pushRecent adds track to front", async () => {
    await pushRecent(USER, mockTrack);
    const recent = await getRecent(USER);
    expect(recent[0].id).toBe(mockTrack.id);
  });

  it("caps at 20 entries", async () => {
    for (let i = 0; i < 25; i++) {
      await pushRecent(USER, { ...mockTrack, id: i });
    }
    expect(await getRecent(USER)).toHaveLength(20);
  });
});
