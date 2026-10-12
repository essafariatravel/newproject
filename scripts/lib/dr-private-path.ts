import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

function containmentPath(value: string): string {
  const absolute = path.resolve(value);
  let current = absolute;
  const tail: string[] = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return absolute;
    tail.unshift(path.basename(current));
    current = parent;
  }
  const physicalAncestor = realpathSync.native(current);
  return path.join(physicalAncestor, ...tail);
}

export function pathInsideRepository(value: string, repositoryRoot: string = process.cwd()): boolean {
  const root = realpathSync.native(path.resolve(repositoryRoot));
  const candidate = containmentPath(value);
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
