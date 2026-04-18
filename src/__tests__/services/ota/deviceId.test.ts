/* eslint-disable @typescript-eslint/no-require-imports */
describe("getInstallId", () => {
  afterEach(() => {
    jest.resetModules();
  });

  it("generates and persists an ID on first call", async () => {
    jest.doMock("@react-native-async-storage/async-storage", () => ({
      __esModule: true,
      default: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
      },
    }));

    const AsyncStorage =
      require("@react-native-async-storage/async-storage").default;
    const { getInstallId } = require("../../../services/ota/deviceId");

    const id = await getInstallId();

    expect(typeof id).toBe("string");
    expect(id.length).toBe(32);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("ota:install_id", id);
  });

  it("returns the stored ID when one exists", async () => {
    jest.doMock("@react-native-async-storage/async-storage", () => ({
      __esModule: true,
      default: {
        getItem: jest.fn().mockResolvedValue("stored-id-xyz"),
        setItem: jest.fn().mockResolvedValue(undefined),
      },
    }));

    const AsyncStorage =
      require("@react-native-async-storage/async-storage").default;
    const { getInstallId } = require("../../../services/ota/deviceId");

    const id = await getInstallId();

    expect(id).toBe("stored-id-xyz");
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
