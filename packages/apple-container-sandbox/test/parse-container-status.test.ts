import { expect, test } from "vitest";

import type { ContainerCliResult } from "../src/container-cli-result.js";
import { type AppleContainerStatus, parseContainerStatus } from "../src/parse-container-status.js";

test.each([
  ["running", "running"],
  ["stopped", "stopped"],
] satisfies Array<[string, AppleContainerStatus]>)(
  "reads the %s state from Apple Container inspect output",
  (state, expected) => {
    const result: ContainerCliResult = {
      command: ["container", "inspect", "test-session"],
      exitCode: 0,
      stdout: Buffer.from(
        JSON.stringify([
          {
            id: "test-session",
            status: { state },
          },
        ]),
      ),
      stderr: Buffer.alloc(0),
    };

    expect(parseContainerStatus("test-session", result)).toBe(expected);
  },
);
