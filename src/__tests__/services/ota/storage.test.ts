import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../../../services/ota/storage';

// jest-expo auto-mocks AsyncStorage via the preset
beforeEach(() => jest.clearAllMocks());

describe('storage', () => {
  describe('install ID', () => {
    it('stores and retrieves an install ID', async () => {
      await storage.setInstallId('abc-123');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('ota:install_id', 'abc-123');

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('abc-123');
      const id = await storage.getInstallId();
      expect(id).toBe('abc-123');
    });
  });

  describe('session watchdog', () => {
    it('markSessionOpen writes JSON with version and timestamp', async () => {
      await storage.markSessionOpen('1.2.3');
      const [key, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
      expect(key).toBe('ota:session_open');
      const parsed = JSON.parse(value as string);
      expect(parsed.version).toBe('1.2.3');
      expect(typeof parsed.at).toBe('string');
    });

    it('clearSessionOpen removes the key', async () => {
      await storage.clearSessionOpen();
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('ota:session_open');
    });

    it('getSessionOpen returns null when no marker exists', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
      const result = await storage.getSessionOpen();
      expect(result).toBeNull();
    });

    it('getSessionOpen returns parsed marker when it exists', async () => {
      const mark = { version: '1.0.0', at: '2026-01-01T00:00:00.000Z' };
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(mark));
      const result = await storage.getSessionOpen();
      expect(result).toEqual(mark);
    });
  });

  describe('version bookkeeping', () => {
    it('sets and gets current version', async () => {
      await storage.setCurrentVersion('2.0.0');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('ota:current_version', '2.0.0');
    });

    it('sets and gets previous version', async () => {
      await storage.setPreviousVersion('1.9.0');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('ota:previous_version', '1.9.0');
    });
  });

  describe('launch records', () => {
    it('returns empty object when no records exist', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
      const records = await storage.getLaunchRecords();
      expect(records).toEqual({});
    });

    it('stores and retrieves launch records', async () => {
      const records = {
        '1.0.0': { version: '1.0.0', launchCount: 5, crashCount: 1, lastCrashAt: null },
      };
      await storage.setLaunchRecords(records);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'ota:launch_records',
        JSON.stringify(records),
      );

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(records));
      const retrieved = await storage.getLaunchRecords();
      expect(retrieved).toEqual(records);
    });
  });
});
