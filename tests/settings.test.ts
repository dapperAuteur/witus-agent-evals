import { describe, expect, it } from "vitest";
import { loadSettings, requireKey } from "../src/settings.js";

describe("settings", () => {
  it("loads known keys and ignores unrelated env noise", () => {
    const s = loadSettings({ ANTHROPIC_API_KEY: "sk-test", PATH: "/usr/bin" } as NodeJS.ProcessEnv);
    expect(s.ANTHROPIC_API_KEY).toBe("sk-test");
    expect(s.GOOGLE_API_KEY).toBeUndefined();
  });

  it("rejects an empty-string key rather than passing it downstream", () => {
    expect(() => loadSettings({ ANTHROPIC_API_KEY: "" } as NodeJS.ProcessEnv)).toThrow();
  });

  it("requireKey fails loudly, pointing at the operator task", () => {
    const s = loadSettings({} as NodeJS.ProcessEnv);
    expect(() => requireKey(s, "ANTHROPIC_API_KEY")).toThrow(/plans\/user-tasks\/01/);
    const withKey = loadSettings({ ANTHROPIC_API_KEY: "sk-test" } as NodeJS.ProcessEnv);
    expect(requireKey(withKey, "ANTHROPIC_API_KEY")).toBe("sk-test");
  });
});
