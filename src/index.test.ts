import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";
import piCompactor from "./index.js";

it("registers the compactor command on the extension api", () => {
  const pi = {
    registerCommand: vi.fn(),
    on: vi.fn(),
  } as unknown as ExtensionAPI;

  piCompactor(pi);

  expect(pi.registerCommand).toHaveBeenCalledWith("compactor", expect.anything());
});
