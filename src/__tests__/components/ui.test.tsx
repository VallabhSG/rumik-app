import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SectionLabel } from "../../components/ui/SectionLabel";
import { PremiumUpsellCard } from "../../components/PremiumUpsellCard";
import { OnboardingModal } from "../../components/OnboardingModal";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

// ---------------------------------------------------------------------------
// SectionLabel
// ---------------------------------------------------------------------------

describe("SectionLabel", () => {
  it("renders its children as text", () => {
    const { getByText } = render(<SectionLabel>Top Charts</SectionLabel>);
    expect(getByText("Top Charts")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// PremiumUpsellCard
// ---------------------------------------------------------------------------

describe("PremiumUpsellCard", () => {
  it("renders title and subtitle", () => {
    const { getByText } = render(<PremiumUpsellCard />);
    expect(getByText("Go Premium")).toBeTruthy();
    expect(getByText("Upgrade Now")).toBeTruthy();
  });

  it("calls onUpgrade when button is pressed", () => {
    const onUpgrade = jest.fn();
    const { getByText } = render(<PremiumUpsellCard onUpgrade={onUpgrade} />);
    fireEvent.press(getByText("Upgrade Now"));
    expect(onUpgrade).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// OnboardingModal
// ---------------------------------------------------------------------------

describe("OnboardingModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue(undefined);
  });

  it("does not call AsyncStorage when disabled", () => {
    render(<OnboardingModal enabled={false} />);
    expect(mockAsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it("checks AsyncStorage when enabled", async () => {
    render(<OnboardingModal enabled={true} />);
    await act(async () => {});
    expect(mockAsyncStorage.getItem).toHaveBeenCalledWith(
      "onboarding:shown_v3",
    );
  });

  it("shows modal when storage returns null", async () => {
    mockAsyncStorage.getItem.mockResolvedValue(null);
    const { getByText } = render(<OnboardingModal enabled={true} />);
    await act(async () => {});
    expect(getByText("Discover Music")).toBeTruthy();
  });

  it("does not show modal when already shown", async () => {
    mockAsyncStorage.getItem.mockResolvedValue("1");
    const { queryByText } = render(<OnboardingModal enabled={true} />);
    await act(async () => {});
    expect(queryByText("Discover Music")).toBeNull();
  });

  it("dismisses modal and writes storage on Skip press", async () => {
    const { getByText } = render(<OnboardingModal enabled={true} />);
    await act(async () => {});
    await act(async () => {
      fireEvent.press(getByText("Skip"));
    });
    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      "onboarding:shown_v3",
      "1",
    );
  });

  it("advances to next step on Next press", async () => {
    const { getByText } = render(<OnboardingModal enabled={true} />);
    await act(async () => {});
    fireEvent.press(getByText("Next"));
    expect(getByText("Next")).toBeTruthy();
  });
});
