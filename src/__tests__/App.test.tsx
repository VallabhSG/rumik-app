import React from "react";
import { render } from "@testing-library/react-native";
import App from "../../App";

// Mock ConfigClient so the App smoke test doesn't make real network calls
jest.mock("../../src/services/config/ConfigClient", () => ({
  ConfigClient: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
    getFlag: jest.fn(() => false),
    getExperiment: jest.fn(() => "control"),
    getUrl: jest.fn((_, def) => def),
    isKillSwitchActive: jest.fn(() => false),
    getStatus: jest.fn(() => "ready"),
    subscribe: jest.fn(() => () => {}),
  })),
}));

jest.mock("../../src/services/ota/deviceId", () => ({
  getInstallId: jest.fn().mockResolvedValue("test-id"),
}));

jest.mock("../../src/hooks/useOtaUpdate", () => ({
  useOtaUpdate: jest.fn(() => ({
    status: "idle",
    error: null,
    download: jest.fn(),
    applyNow: jest.fn(),
  })),
}));

// Smoke test — ensures App renders without crashing
describe("App", () => {
  it("renders without crashing", () => {
    const { getByText } = render(<App />);
    expect(getByText("rumik")).toBeTruthy();
  });
});
