import { describe, expect, it } from "vitest";
import { mergeWorkspaceStreamText } from "./stream-text-buffer";

describe("mergeWorkspaceStreamText", () => {
  it("accepts cumulative deltas", () => {
    expect(mergeWorkspaceStreamText("给出", "给出优化方案")).toBe("给出优化方案");
  });

  it("appends incremental chunks without dropping shorter text", () => {
    expect(mergeWorkspaceStreamText("给出", "优化")).toBe("给出优化");
    expect(mergeWorkspaceStreamText("给出优化", "方案")).toBe("给出优化方案");
  });

  it("deduplicates repeated and overlapping chunks", () => {
    expect(mergeWorkspaceStreamText("hello world", "world")).toBe("hello world");
    expect(mergeWorkspaceStreamText("hello wor", "world")).toBe("hello world");
  });
});
