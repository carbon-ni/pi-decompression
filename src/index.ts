import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPiCompactor } from "./infra/pi-extension.js";

export default function piCompactor(pi: ExtensionAPI): void {
  registerPiCompactor(pi);
}
