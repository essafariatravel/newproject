import path from "node:path";

export function pathInsideRepository(value: string, repositoryRoot: string = process.cwd()): boolean {
  const root = path.resolve(repositoryRoot);
  const candidate = path.resolve(value);
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function privateArtifactPath(
  value: string,
  label: string,
  options: { requireAbsolute?: boolean; repositoryRoot?: string } = {},
): string {
  if (!value?.trim()) throw new Error(`${label} is required.`);
  if (options.requireAbsolute && !path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute private path.`);
  }
  const resolved = path.resolve(value);
  if (pathInsideRepository(resolved, options.repositoryRoot ?? process.cwd())) {
    throw new Error(`${label} must be outside the public repository working tree.`);
  }
  return resolved;
}
