# Requirements

## Runtime

- Consumers must run Node.js 22 or newer.
- Consumers must use ESM imports for the published package entry point.
- Hosts must provide the Apple Container CLI as `container`, unless a custom
  `containerBinary` option is supplied.
- Sandbox images must be Docker-compatible and provide `/bin/sh` plus the
  configured command shell, when different.

## Packaging

- Package source must be TypeScript in `src`.
- `tsc` must emit the package entry point and declarations to `dist`.
- Published package exports must point to `dist/index.js` and
  `dist/index.d.ts`.
- Published package dependencies must include `@ai-sdk/harness`.
- Published package metadata must declare the MIT license and point repository,
  homepage, and bug URLs at `https://github.com/lgrammel/apple-container-sandbox`.
- Package versioning, release notes, npm publishing, and release tags must be
  managed with Changesets.

## Sandbox API

- `createAppleContainerSandbox(options?)` must return a sandbox named
  `apple-container-sandbox`.
- Returned sandboxes must implement the AI SDK `HarnessV1SandboxProvider`
  contract with specification version `harness-sandbox-v1`.
- The sandbox must preserve the supplied options object.
- Supported option fields are `commandShell`, `image`, `cwd`, `env`,
  `containerBinary`, `containerArgs`, `memory`, `mounts`, `ports`, and
  `name`.
- `commandShell` defaults to `/bin/sh`.
- `image` defaults to `alpine:latest`.
- `cwd` defaults to `/workspace`.
- `memory`, when supplied, must be passed to `container create` with
  `--memory`.
- `mounts`, when supplied, must be passed to `container create` with
  `--mount type=bind`.
- Mount `hostPath` values must resolve to existing host directories.
- Mount `containerPath` values must be absolute paths inside the container.
- Mount paths must not contain commas or equal signs because Apple Container
  mount flags use comma-separated key-value syntax.
- `ports` defaults to an empty array.
- `ports` values must be unique in the normalized session surface and must be
  valid TCP port numbers.

## Sandbox Sessions

- `createSession()` must create and start a long-lived Apple container.
- `createSession({ sessionId })` must use `sessionId` as the container id.
- The `name` option must be used only when `createSession()` does not receive a
  `sessionId`.
- `createSession({ onFirstCreate })` must run the hook once after container
  startup with the restricted sandbox session surface.
- `resumeSession({ sessionId })` must inspect and reattach to the existing
  container with the same id.
- `resumeSession()` must start a stopped container and must not restart an
  already-running container.
- `resumeSession()` must not create a replacement container or rerun
  `onFirstCreate` when the requested container does not exist.
- Sandbox `run` and `spawn` commands must execute through `container exec`
  and the configured command shell with `-lc`.
- Session-level `env` values must apply to commands, and per-command `env`
  values must take precedence.
- `readFile`, `readBinaryFile`, `readTextFile`, `writeFile`,
  `writeBinaryFile`, `writeTextFile`, `spawn`, and `run` must match the AI SDK
  `Experimental_SandboxSession` method shapes.
- Sessions must implement the AI SDK `HarnessV1NetworkSandboxSession` contract.
- File reads must return `null` when the path does not exist.
- File writes must create parent directories and overwrite existing files.
- `run()` must return `exitCode`, `stdout`, and `stderr` without throwing for
  non-zero command exits.
- `stop()` must stop and retain the Apple container so the session can be
  resumed.
- `destroy()` must stop the Apple container when needed and permanently delete
  it.
- `stop()` and `destroy()` must be idempotent for a session wrapper.
- Configured ports must be passed to `container create` with `--publish` and
  published on `127.0.0.1` with the same host and container port.
- `getPortEndpoint()` must resolve configured ports to local HTTP, HTTPS, or
  WebSocket URLs, default to HTTP, and omit endpoint headers.
- Port resolution must reject unconfigured ports with
  `HarnessCapabilityUnsupportedError`.
- `getPortUrl()` must remain available for backward compatibility and delegate
  to `getPortEndpoint()`.
