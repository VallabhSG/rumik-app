import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { UpdateBanner } from "../../../components/UpdateBanner";
import * as useOtaUpdateModule from "../../../hooks/useOtaUpdate";

jest.mock("../../../hooks/useOtaUpdate");

const mockUseOtaUpdate = useOtaUpdateModule.useOtaUpdate as jest.Mock;

describe("UpdateBanner", () => {
  it("renders nothing when status is idle", () => {
    mockUseOtaUpdate.mockReturnValue({
      status: "idle",
      error: null,
      download: jest.fn(),
      applyNow: jest.fn(),
    });
    const { toJSON } = render(<UpdateBanner />);
    expect(toJSON()).toBeNull();
  });

  it("renders nothing when up-to-date", () => {
    mockUseOtaUpdate.mockReturnValue({
      status: "up-to-date",
      error: null,
      download: jest.fn(),
      applyNow: jest.fn(),
    });
    const { toJSON } = render(<UpdateBanner />);
    expect(toJSON()).toBeNull();
  });

  it("shows download button when available", () => {
    const download = jest.fn();
    mockUseOtaUpdate.mockReturnValue({
      status: "available",
      error: null,
      download,
      applyNow: jest.fn(),
    });
    const { getByText } = render(<UpdateBanner />);
    expect(getByText("Update available")).toBeTruthy();
    fireEvent.press(getByText("Download"));
    expect(download).toHaveBeenCalled();
  });

  it("shows spinner when downloading", () => {
    mockUseOtaUpdate.mockReturnValue({
      status: "downloading",
      error: null,
      download: jest.fn(),
      applyNow: jest.fn(),
    });
    const { getByText } = render(<UpdateBanner />);
    expect(getByText("Downloading update…")).toBeTruthy();
  });

  it("shows restart button when ready", () => {
    const applyNow = jest.fn();
    mockUseOtaUpdate.mockReturnValue({
      status: "ready",
      error: null,
      download: jest.fn(),
      applyNow,
    });
    const { getByText } = render(<UpdateBanner />);
    expect(getByText("Update ready")).toBeTruthy();
    fireEvent.press(getByText("Restart"));
    expect(applyNow).toHaveBeenCalled();
  });
});
