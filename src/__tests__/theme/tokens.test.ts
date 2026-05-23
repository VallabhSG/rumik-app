import { Colors } from "../../theme/tokens";

describe("design tokens", () => {
  it("has all required color tokens", () => {
    expect(Colors.bg).toBeDefined();
    expect(Colors.accent).toBeDefined();
    expect(Colors.text).toBeDefined();
  });

  it("accent color is the slate blue", () => {
    expect(Colors.accent).toBe("#3d5a6e");
  });
});
