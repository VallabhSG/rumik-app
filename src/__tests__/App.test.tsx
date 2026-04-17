import React from "react";
import { render } from "@testing-library/react-native";
import App from "../../App";

// Smoke test — ensures App renders without crashing
describe("App", () => {
  it("renders without crashing", () => {
    const { getByText } = render(<App />);
    expect(getByText("rumik")).toBeTruthy();
  });
});
