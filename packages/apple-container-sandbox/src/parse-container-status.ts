import { AppleContainerSandboxError } from "./apple-container-sandbox-error.js";
import type { ContainerCliResult } from "./container-cli-result.js";

export type AppleContainerStatus = "running" | "stopped";

export function parseContainerStatus(
  containerId: string,
  result: ContainerCliResult,
): AppleContainerStatus {
  let inspection: unknown;

  try {
    inspection = JSON.parse(result.stdout.toString("utf8"));
  } catch (cause) {
    throw invalidInspection(containerId, result, "returned invalid JSON", cause);
  }

  const container = Array.isArray(inspection) ? inspection[0] : inspection;
  const status = readStatus(container)?.toLowerCase();

  if (status === "running") {
    return "running";
  }

  if (status === "stopped" || status === "exited") {
    return "stopped";
  }

  throw invalidInspection(
    containerId,
    result,
    status == null ? "did not include a container status" : `reported unsupported status ${status}`,
  );
}

function readStatus(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of ["status", "state"] as const) {
    const candidate = value[key];

    if (typeof candidate === "string") {
      return candidate;
    }

    if (isRecord(candidate)) {
      for (const nestedKey of ["status", "state"] as const) {
        const nestedCandidate = candidate[nestedKey];

        if (typeof nestedCandidate === "string") {
          return nestedCandidate;
        }
      }
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}

function invalidInspection(
  containerId: string,
  result: ContainerCliResult,
  detail: string,
  cause?: unknown,
): AppleContainerSandboxError {
  return new AppleContainerSandboxError(
    `Failed to inspect Apple Container sandbox ${containerId}: container inspect ${detail}.`,
    {
      cause,
      command: result.command,
      exitCode: result.exitCode,
      stderr: result.stderr.toString("utf8"),
    },
  );
}
