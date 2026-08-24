import { spawn as spawnChildProcess } from "node:child_process";
import { Readable } from "node:stream";

import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PortEndpoint,
} from "@ai-sdk/harness";

import { AppleContainerSandboxError } from "./apple-container-sandbox-error.js";
import type { AppleContainerSandboxProcess } from "./apple-container-sandbox-process.js";
import type { AppleContainerSandboxSessionOptions } from "./apple-container-sandbox-session-options.js";
import { assertCommand } from "./assert-command.js";
import { assertPath } from "./assert-path.js";
import { assertSuccessfulResult } from "./assert-successful-result.js";
import { collectWebStream } from "./collect-web-stream.js";
import { createEnvArgs } from "./create-env-args.js";
import { createWorkingDirectoryArgs } from "./create-working-directory-args.js";
import { missingFileExitCode } from "./missing-file-exit-code.js";
import type { ReadFileOptions } from "./read-file-options.js";
import { runContainerCli } from "./run-container-cli.js";
import type { SandboxProcessOptions } from "./sandbox-process-options.js";
import { selectLineRange } from "./select-line-range.js";
import { waitForChildProcess } from "./wait-for-child-process.js";
import { writeContentToSandbox } from "./write-content-to-sandbox.js";
import type { WriteFileOptions } from "./write-file-options.js";

export class AppleContainerSandboxSession {
  readonly defaultWorkingDirectory: string;
  readonly description: string;
  readonly id: string;
  readonly image: string;
  readonly ports: ReadonlyArray<number>;

  #closed = false;
  #commandShell: string;
  #containerBinary: string;
  #cwd: string;
  #destroyPromise: Promise<void> | undefined;
  #env: Record<string, string>;
  #stopPromise: Promise<void> | undefined;

  constructor({
    commandShell,
    containerBinary,
    cwd,
    env,
    id,
    image,
    ports,
  }: AppleContainerSandboxSessionOptions) {
    this.#commandShell = commandShell;
    this.#containerBinary = containerBinary;
    this.#cwd = cwd;
    this.#env = env;
    this.defaultWorkingDirectory = cwd;
    this.id = id;
    this.image = image;
    this.ports = ports;
    this.description = [
      `Apple Container sandbox running image ${image}.`,
      `Default working directory: ${cwd}.`,
      `Commands execute through ${commandShell} -lc inside container ${id}.`,
    ].join("\n");
  }

  async readFile({
    path,
    abortSignal,
  }: ReadFileOptions): Promise<ReadableStream<Uint8Array> | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });

    if (bytes == null) {
      return null;
    }

    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }

  async readBinaryFile({ path, abortSignal }: ReadFileOptions): Promise<Uint8Array | null> {
    assertPath(path);
    this.#assertOpen();

    const result = await runContainerCli(
      this.#containerBinary,
      [
        "exec",
        this.id,
        "/bin/sh",
        "-c",
        [
          'if [ ! -e "$1" ]; then exit 66; fi',
          'if [ -d "$1" ]; then exit 1; fi',
          'cat -- "$1"',
        ].join("; "),
        "sh",
        path,
      ],
      { abortSignal },
    );

    if (result.exitCode === missingFileExitCode) {
      return null;
    }

    assertSuccessfulResult("read file from sandbox", result);
    return new Uint8Array(result.stdout);
  }

  async readTextFile({
    path,
    abortSignal,
    encoding = "utf-8",
    startLine,
    endLine,
  }: ReadFileOptions & {
    encoding?: string;
    startLine?: number;
    endLine?: number;
  }): Promise<string | null> {
    const bytes = await this.readBinaryFile({ path, abortSignal });

    if (bytes == null) {
      return null;
    }

    const text = new TextDecoder(encoding).decode(bytes);

    if (startLine == null && endLine == null) {
      return text;
    }

    return selectLineRange(text, startLine, endLine);
  }

  async writeFile({
    path,
    content,
    abortSignal,
  }: WriteFileOptions<ReadableStream<Uint8Array>>): Promise<void> {
    assertPath(path);
    this.#assertOpen();

    const result = await runContainerCli(
      this.#containerBinary,
      [
        "exec",
        "--interactive",
        this.id,
        "/bin/sh",
        "-c",
        'mkdir -p -- "$(dirname -- "$1")" && cat > "$1"',
        "sh",
        path,
      ],
      { abortSignal, stdin: content },
    );

    assertSuccessfulResult("write file to sandbox", result);
  }

  async writeBinaryFile({
    path,
    content,
    abortSignal,
  }: WriteFileOptions<Uint8Array>): Promise<void> {
    await writeContentToSandbox(this, { path, content, abortSignal });
  }

  async writeTextFile({
    path,
    content,
    abortSignal,
    encoding = "utf-8",
  }: WriteFileOptions<string> & {
    encoding?: string;
  }): Promise<void> {
    await this.writeBinaryFile({
      path,
      content: Buffer.from(content, encoding as BufferEncoding),
      abortSignal,
    });
  }

  async spawn({
    command,
    workingDirectory = this.#cwd,
    env,
    abortSignal,
  }: SandboxProcessOptions): Promise<AppleContainerSandboxProcess> {
    assertCommand(command);
    this.#assertOpen();

    const cliArgs = [
      "exec",
      ...createEnvArgs({ ...this.#env, ...env }),
      ...createWorkingDirectoryArgs(workingDirectory),
      this.id,
      this.#commandShell,
      "-lc",
      command,
    ];

    const child = spawnChildProcess(this.#containerBinary, cliArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const waitPromise = waitForChildProcess(child, abortSignal, [
      this.#containerBinary,
      ...cliArgs,
    ]);

    return {
      stdout: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      stderr: Readable.toWeb(child.stderr) as ReadableStream<Uint8Array>,
      wait: () => waitPromise,
      kill: async () => {
        child.kill("SIGTERM");
        await waitPromise.catch(() => {});
      },
    };
  }

  async run(options: SandboxProcessOptions): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }> {
    const process = await this.spawn(options);
    const [stdout, stderr, { exitCode }] = await Promise.all([
      collectWebStream(process.stdout),
      collectWebStream(process.stderr),
      process.wait(),
    ]);

    return {
      exitCode,
      stdout: new TextDecoder().decode(stdout),
      stderr: new TextDecoder().decode(stderr),
    };
  }

  async getPortUrl(options: { port: number; protocol?: "http" | "https" | "ws" }): Promise<string> {
    return (await this.getPortEndpoint(options)).url;
  }

  async getPortEndpoint(options: {
    port: number;
    protocol?: "http" | "https" | "ws";
  }): Promise<HarnessV1PortEndpoint> {
    if (!this.ports.includes(options.port)) {
      throw new HarnessCapabilityUnsupportedError({
        message: `Apple Container sandbox session ${this.id} does not expose port ${options.port}.`,
      });
    }

    return { url: `${options.protocol ?? "http"}://127.0.0.1:${options.port}` };
  }

  restricted(): ReturnType<HarnessV1NetworkSandboxSession["restricted"]> {
    return {
      description: this.description,
      readFile: (options) => this.readFile(options),
      readBinaryFile: (options) => this.readBinaryFile(options),
      readTextFile: (options) => this.readTextFile(options),
      writeFile: (options) => this.writeFile(options),
      writeBinaryFile: (options) => this.writeBinaryFile(options),
      writeTextFile: (options) => this.writeTextFile(options),
      spawn: (options) => this.spawn(options),
      run: (options) => this.run(options),
    };
  }

  readonly stop = (): Promise<void> => {
    if (this.#destroyPromise != null) {
      return this.#destroyPromise;
    }

    if (this.#stopPromise != null) {
      return this.#stopPromise;
    }

    this.#closed = true;
    this.#stopPromise = this.#stopContainer();
    return this.#stopPromise;
  };

  readonly destroy = (): Promise<void> => {
    if (this.#destroyPromise != null) {
      return this.#destroyPromise;
    }

    this.#closed = true;
    this.#destroyPromise = this.#destroyContainer();
    return this.#destroyPromise;
  };

  async #stopContainer(): Promise<void> {
    const result = await runContainerCli(this.#containerBinary, ["stop", this.id]);
    assertSuccessfulResult("stop sandbox container", result);
  }

  async #destroyContainer(): Promise<void> {
    this.#stopPromise ??= this.#stopContainer();
    await this.#stopPromise.catch(() => {});

    const remove = await runContainerCli(this.#containerBinary, ["delete", "--force", this.id]);
    assertSuccessfulResult("delete sandbox container", remove);
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw new AppleContainerSandboxError(`Sandbox container ${this.id} is closed.`);
    }
  }
}
