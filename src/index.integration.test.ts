import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  createAgentSession,
} from "@earendil-works/pi-coding-agent";
import type { Context } from "@earendil-works/pi-ai";
import {
  fauxAssistantMessage,
  fauxProvider,
} from "@earendil-works/pi-ai/providers/faux";

const ORIGINAL_GOAL = "ORIGINAL_GOAL: finish the deterministic task";
const CONTINUATION =
  "Continue the interrupted user task using the handoff context.";
const PRE_THRESHOLD = "PRE_THRESHOLD_TURN_COMPLETE";
const RESUMED = "ORIGINAL_GOAL_RESUMED";
const HANDOFF = "## Goal\nThe original goal is still active.";

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out after ${milliseconds}ms`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

const tempDirectories: string[] = [];

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline)
      throw new Error("Timed out waiting for runtime");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("wired decompression runtime", () => {
  it("compacts once and semantically resumes the interrupted goal", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-decompression-runtime-"));
    tempDirectories.push(cwd);
    await mkdir(join(cwd, ".pi"), { recursive: true });
    await writeFile(
      join(cwd, ".pi", "decompression.json"),
      JSON.stringify({ enabled: true, thresholdPercent: 1 }),
      "utf8",
    );

    const faux = fauxProvider({
      provider: "runtime-test",
      models: [
        {
          id: "runtime-test-model",
          contextWindow: 1_000,
          maxTokens: 100,
        },
      ],
    });
    const scriptedResponse = (context: Context) => {
      const contextText = JSON.stringify(context.messages);
      if (contextText.includes(CONTINUATION)) {
        return fauxAssistantMessage(RESUMED);
      }
      if (contextText.includes("You are writing a handoff document")) {
        return fauxAssistantMessage(HANDOFF);
      }
      return fauxAssistantMessage(PRE_THRESHOLD);
    };
    faux.setResponses(Array.from({ length: 10 }, () => scriptedResponse));

    const settingsManager = SettingsManager.inMemory(
      {
        compaction: { enabled: false, reserveTokens: 100, keepRecentTokens: 1 },
      },
      { projectTrusted: true },
    );
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: join(cwd, ".agent"),
      settingsManager,
      additionalExtensionPaths: [resolve("src/index.ts")],
    });
    await resourceLoader.reload();
    const modelRuntime = await ModelRuntime.create({
      authPath: join(cwd, ".agent", "auth.json"),
      modelsPath: null,
      refreshOnCreate: false,
    });
    modelRuntime.registerNativeProvider(faux.provider);

    const sessionManager = SessionManager.inMemory(cwd);
    const { session } = await createAgentSession({
      cwd,
      agentDir: join(cwd, ".agent"),
      modelRuntime,
      model: faux.getModel(),
      thinkingLevel: "off",
      resourceLoader,
      sessionManager,
      settingsManager,
      noTools: "all",
    });

    const events: string[] = [];
    const extensionErrors: string[] = [];
    const unsubscribe = session.subscribe((event) => {
      events.push(event.type);
    });
    const ui = {
      notify(message: string, type?: string) {
        if (type === "error") extensionErrors.push(message);
      },
      setStatus() {},
    };

    const previousWorkspace = process.env.AGENT_WORKSPACE;
    process.env.AGENT_WORKSPACE = cwd;
    try {
      await session.bindExtensions({
        mode: "rpc",
        uiContext: ui as never,
        commandContextActions: {
          waitForIdle: () => session.waitForIdle(),
        } as never,
        onError: (error) => extensionErrors.push(error.error),
      });
      await withTimeout(session.prompt(ORIGINAL_GOAL), 5_000);
      await withTimeout(
        waitUntil(() =>
          sessionManager
            .getEntries()
            .some(
              (entry) =>
                entry.type === "message" &&
                entry.message.role === "assistant" &&
                entry.message.content.some(
                  (block) => block.type === "text" && block.text === RESUMED,
                ),
            ),
        ),
        5_000,
      );

      const entries = sessionManager.getEntries();
      const messages = entries
        .filter((entry) => entry.type === "message")
        .map((entry) => entry.message);
      const text = (message: unknown): string => {
        if (typeof message !== "object" || message === null) return "";
        const content = (message as { content?: unknown }).content;
        if (typeof content === "string") return content;
        if (!Array.isArray(content)) return "";
        return content
          .filter(
            (block): block is { type: "text"; text: string } =>
              typeof block === "object" &&
              block !== null &&
              (block as { type?: unknown }).type === "text" &&
              typeof (block as { text?: unknown }).text === "string",
          )
          .map((block) => block.text)
          .join("\\n");
      };
      const originalIndex = messages.findIndex(
        (message) => message.role === "user" && text(message) === ORIGINAL_GOAL,
      );
      const preThresholdIndex = messages.findIndex(
        (message) =>
          message.role === "assistant" && text(message) === PRE_THRESHOLD,
      );
      const compactions = entries.filter(
        (entry) => entry.type === "compaction",
      );
      const compactionIndex = entries.findIndex(
        (entry) => entry.type === "compaction",
      );
      const preThresholdEntryIndex = entries.findIndex(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "assistant" &&
          text(entry.message) === PRE_THRESHOLD,
      );
      const continuationEntryIndex = entries.findIndex(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "user" &&
          text(entry.message) === CONTINUATION,
      );
      const resumedEntryIndex = entries.findIndex(
        (entry) =>
          entry.type === "message" &&
          entry.message.role === "assistant" &&
          text(entry.message) === RESUMED,
      );
      const thresholdCrossingIndex = events.indexOf("turn_end");
      const compactionStartIndex = events.indexOf("compaction_start");

      expect(originalIndex).toBeGreaterThanOrEqual(0);
      expect(preThresholdIndex).toBeGreaterThan(originalIndex);
      expect(compactions).toHaveLength(1);
      expect(preThresholdEntryIndex).toBeGreaterThanOrEqual(0);
      expect(compactionIndex).toBeGreaterThan(preThresholdEntryIndex);
      expect(continuationEntryIndex).toBeGreaterThan(compactionIndex);
      expect(resumedEntryIndex).toBeGreaterThan(continuationEntryIndex);
      expect(
        messages.filter(
          (message) =>
            message.role === "user" && text(message) === CONTINUATION,
        ),
      ).toHaveLength(1);
      expect(
        events.filter((event) => event === "compaction_start"),
      ).toHaveLength(1);
      expect(events.filter((event) => event === "compaction_end")).toHaveLength(
        1,
      );
      expect(
        events.slice(thresholdCrossingIndex + 1, compactionStartIndex),
      ).not.toContain("turn_start");
      expect(extensionErrors).toEqual([]);
    } finally {
      if (previousWorkspace === undefined) {
        delete process.env.AGENT_WORKSPACE;
      } else {
        process.env.AGENT_WORKSPACE = previousWorkspace;
      }
      unsubscribe();
      session.dispose();
    }
  }, 15_000);
});
