import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import piCompactor from "./index.js";

it("wires the Pi adapter from the composition root", () => {
  const pi = {
    registerCommand: vi.fn(),
  } as unknown as ExtensionAPI;

  piCompactor(pi);

  expect(pi.registerCommand).toHaveBeenCalledOnce();
});
