import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { CopyRow } from "../../../components/ui/CopyRow";

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockSetStringAsync = jest.requireMock("expo-clipboard").setStringAsync as jest.Mock;

describe("CopyRow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("renders the label", () => {
    const { getByText } = render(<CopyRow label="User ID" value="abc-123" />);
    expect(getByText("User ID")).toBeTruthy();
  });

  it("truncates value longer than 16 characters", () => {
    const { getByText } = render(
      <CopyRow label="Install ID" value="abc-def-ghi-jkl-mno" />,
    );
    expect(getByText(/abc-def-ghi-jkl-…/)).toBeTruthy();
  });

  it("shows em-dash for empty value", () => {
    const { getByText } = render(<CopyRow label="Install ID" value="" />);
    expect(getByText(/—/)).toBeTruthy();
  });

  it("shows 'tap to copy' initially", () => {
    const { getByText } = render(<CopyRow label="User ID" value="abc-123" />);
    expect(getByText(/tap to copy/)).toBeTruthy();
  });

  it("calls Clipboard.setStringAsync with the full value on press", async () => {
    const { getByText } = render(<CopyRow label="User ID" value="abc-123" />);
    await act(async () => {
      fireEvent.press(getByText("User ID"));
    });
    expect(mockSetStringAsync).toHaveBeenCalledWith("abc-123");
  });

  it("calls Alert.alert with the value on press", async () => {
    const { getByText } = render(<CopyRow label="User ID" value="abc-123" />);
    await act(async () => {
      fireEvent.press(getByText("User ID"));
    });
    expect(Alert.alert).toHaveBeenCalledWith("Copied", "abc-123");
  });

  it("shows '✓ copied' feedback after pressing", async () => {
    const { getByText } = render(<CopyRow label="User ID" value="abc-123" />);
    await act(async () => {
      fireEvent.press(getByText("User ID"));
    });
    await waitFor(() => {
      expect(getByText(/✓ copied/)).toBeTruthy();
    });
  });

  it("resets to 'tap to copy' after 2 seconds", async () => {
    jest.useFakeTimers();
    const { getByText } = render(<CopyRow label="User ID" value="abc-123" />);
    await act(async () => {
      fireEvent.press(getByText("User ID"));
    });
    await waitFor(() => expect(getByText(/✓ copied/)).toBeTruthy());
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    await waitFor(() => expect(getByText(/tap to copy/)).toBeTruthy());
    jest.useRealTimers();
  });
});
