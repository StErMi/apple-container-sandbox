export interface AppleContainerSandboxSessionOptions {
  commandShell: string;
  containerBinary: string;
  cwd: string;
  env: Record<string, string>;
  id: string;
  image: string;
  ports: ReadonlyArray<number>;
}
