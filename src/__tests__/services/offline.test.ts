import AsyncStorage from "@react-native-async-storage/async-storage";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFileExists = jest.fn();
const mockFileDelete = jest.fn();
const mockDirExists = jest.fn();
const mockDirCreate = jest.fn();
const mockDownloadAsync = jest.fn().mockResolvedValue(undefined);
const mockCreateDownloadResumable = jest.fn();

jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation(() => ({
    get exists() {
      return mockFileExists();
    },
    delete: mockFileDelete,
  })),
  Directory: jest.fn().mockImplementation(() => ({
    get exists() {
      return mockDirExists();
    },
    create: mockDirCreate,
  })),
}));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  createDownloadResumable: (...args: unknown[]) => {
    mockCreateDownloadResumable(...args);
    return { downloadAsync: mockDownloadAsync };
  },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

const mockTrack = {
  id: 123,
  title: "Test Track",
  preview: "https://cdn.deezer.com/preview/123.mp3",
  artist: { id: 1, name: "Test Artist" },
  album: { id: 1, title: "Test Album", cover_medium: "https://cdn/cover.jpg" },
};

function mockStoredMeta(meta: Record<number, unknown>) {
  mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(meta));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import {
  downloadTrack,
  isDownloaded,
  getLocalUri,
  removeDownload,
  getAllDownloads,
} from "../../services/offline";

describe("offline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDirExists.mockReturnValue(true);
    mockFileExists.mockReturnValue(false);
    mockDownloadAsync.mockResolvedValue(undefined);
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  describe("downloadTrack", () => {
    it("creates the offline dir if it does not exist", async () => {
      mockDirExists.mockReturnValue(false);
      await downloadTrack(mockTrack);
      expect(mockDirCreate).toHaveBeenCalled();
    });

    it("skips dir creation if dir already exists", async () => {
      mockDirExists.mockReturnValue(true);
      await downloadTrack(mockTrack);
      expect(mockDirCreate).not.toHaveBeenCalled();
    });

    it("calls createDownloadResumable with correct URL and path", async () => {
      await downloadTrack(mockTrack);
      expect(mockCreateDownloadResumable).toHaveBeenCalledWith(
        mockTrack.preview,
        expect.stringContaining(`${mockTrack.id}.mp3`),
        {},
        expect.any(Function),
      );
    });

    it("calls downloadAsync", async () => {
      await downloadTrack(mockTrack);
      expect(mockDownloadAsync).toHaveBeenCalled();
    });

    it("saves metadata to AsyncStorage after download", async () => {
      await downloadTrack(mockTrack);
      const saved = JSON.parse(
        (mockAsyncStorage.setItem as jest.Mock).mock.calls[0][1],
      );
      expect(saved[mockTrack.id]).toMatchObject({
        id: mockTrack.id,
        title: mockTrack.title,
        artist: mockTrack.artist.name,
        cover: mockTrack.album.cover_medium,
      });
    });

    it("calls onProgress callback during download", async () => {
      const onProgress = jest.fn();
      await downloadTrack(mockTrack, onProgress);
      // Extract the progress callback passed to createDownloadResumable
      const progressCb = mockCreateDownloadResumable.mock.calls[0][3];
      progressCb({ totalBytesWritten: 50, totalBytesExpectedToWrite: 100 });
      expect(onProgress).toHaveBeenCalledWith(0.5);
    });

    it("does not call onProgress when totalBytesExpectedToWrite is 0", async () => {
      const onProgress = jest.fn();
      await downloadTrack(mockTrack, onProgress);
      const progressCb = mockCreateDownloadResumable.mock.calls[0][3];
      progressCb({ totalBytesWritten: 0, totalBytesExpectedToWrite: 0 });
      expect(onProgress).not.toHaveBeenCalled();
    });

    it("merges with existing metadata", async () => {
      const existing = {
        999: { id: 999, title: "Old", artist: "Old", cover: "", localUri: "x", downloadedAt: "" },
      };
      mockStoredMeta(existing);
      await downloadTrack(mockTrack);
      const saved = JSON.parse(
        (mockAsyncStorage.setItem as jest.Mock).mock.calls[0][1],
      );
      expect(saved[999]).toBeDefined();
      expect(saved[mockTrack.id]).toBeDefined();
    });
  });

  describe("isDownloaded", () => {
    it("returns false when track not in metadata", async () => {
      expect(await isDownloaded(123)).toBe(false);
    });

    it("returns false when metadata exists but file does not", async () => {
      mockStoredMeta({ 123: { id: 123, localUri: "file:///docs/offline/123.mp3" } });
      mockFileExists.mockReturnValue(false);
      expect(await isDownloaded(123)).toBe(false);
    });

    it("returns true when metadata exists and file exists", async () => {
      mockStoredMeta({ 123: { id: 123, localUri: "file:///docs/offline/123.mp3" } });
      mockFileExists.mockReturnValue(true);
      expect(await isDownloaded(123)).toBe(true);
    });

    it("returns false when AsyncStorage throws", async () => {
      mockAsyncStorage.getItem.mockRejectedValueOnce(new Error("storage error"));
      expect(await isDownloaded(123)).toBe(false);
    });
  });

  describe("getLocalUri", () => {
    it("returns null when track not in metadata", async () => {
      expect(await getLocalUri(123)).toBeNull();
    });

    it("returns null when file does not exist", async () => {
      mockStoredMeta({ 123: { id: 123, localUri: "file:///docs/offline/123.mp3" } });
      mockFileExists.mockReturnValue(false);
      expect(await getLocalUri(123)).toBeNull();
    });

    it("returns localUri when file exists", async () => {
      const uri = "file:///docs/offline/123.mp3";
      mockStoredMeta({ 123: { id: 123, localUri: uri } });
      mockFileExists.mockReturnValue(true);
      expect(await getLocalUri(123)).toBe(uri);
    });
  });

  describe("removeDownload", () => {
    it("does nothing when track not in metadata", async () => {
      await removeDownload(123);
      expect(mockFileDelete).not.toHaveBeenCalled();
    });

    it("deletes the file when it exists", async () => {
      mockStoredMeta({ 123: { id: 123, localUri: "file:///docs/offline/123.mp3" } });
      mockFileExists.mockReturnValue(true);
      await removeDownload(123);
      expect(mockFileDelete).toHaveBeenCalled();
    });

    it("skips file deletion when file does not exist", async () => {
      mockStoredMeta({ 123: { id: 123, localUri: "file:///docs/offline/123.mp3" } });
      mockFileExists.mockReturnValue(false);
      await removeDownload(123);
      expect(mockFileDelete).not.toHaveBeenCalled();
    });

    it("removes track from metadata and saves", async () => {
      mockStoredMeta({ 123: { id: 123, localUri: "file:///docs/offline/123.mp3" } });
      mockFileExists.mockReturnValue(true);
      await removeDownload(123);
      const saved = JSON.parse(
        (mockAsyncStorage.setItem as jest.Mock).mock.calls[0][1],
      );
      expect(saved[123]).toBeUndefined();
    });
  });

  describe("getAllDownloads", () => {
    it("returns empty array when no downloads", async () => {
      expect(await getAllDownloads()).toEqual([]);
    });

    it("returns all stored metadata values", async () => {
      const meta = {
        1: { id: 1, title: "A", artist: "X", cover: "", localUri: "", downloadedAt: "" },
        2: { id: 2, title: "B", artist: "Y", cover: "", localUri: "", downloadedAt: "" },
      };
      mockStoredMeta(meta);
      const result = await getAllDownloads();
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(expect.arrayContaining([1, 2]));
    });
  });
});
