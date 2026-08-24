export interface NormalizedAppleContainerSandboxOptions {
  commandShell: string;
  containerArgs: string[];
  containerBinary: string;
  cwd: string;
  env: Record<string, string>;
  image: string;
  memory?: string;
  mounts: ReadonlyArray<NormalizedAppleContainerSandboxMount>;
  name?: string;
  ports: ReadonlyArray<number>;
}

export interface NormalizedAppleContainerSandboxMount {
  containerPath: string;
  hostPath: string;
  readOnly: boolean;
}
