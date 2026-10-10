export interface VercelDeploymentLike {
  uid?: string;
  id?: string;
  url?: string;
  target?: string | null;
  state?: string | null;
  readyState?: string | null;
  created?: number | string;
  createdAt?: number | string;
  alias?: string[];
  aliases?: Array<string | { alias?: string }>;
  meta?: Record<string, unknown>;
  gitSource?: Record<string, unknown> | null;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;

export function extractGitSha(deployment: VercelDeploymentLike): string | null {
  const candidates = [
    deployment.gitSource?.sha,
    deployment.meta?.githubCommitSha,
    deployment.meta?.gitCommitSha,
    deployment.meta?.gitSha,
    deployment.meta?.commitSha,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && FULL_SHA.test(candidate.trim())) {
      return candidate.trim().toLowerCase();
    }
  }
  return null;
}

export function aliasNames(deployment: VercelDeploymentLike): string[] {
  const names = new Set<string>();
  for (const alias of deployment.alias ?? []) {
    if (typeof alias === "string" && alias.trim()) names.add(alias.trim().toLowerCase());
  }
  for (const alias of deployment.aliases ?? []) {
    if (typeof alias === "string") {
      if (alias.trim()) names.add(alias.trim().toLowerCase());
    } else if (alias?.alias?.trim()) {
      names.add(alias.alias.trim().toLowerCase());
    }
  }
  return [...names];
}

export function deploymentHasDomain(
  deployment: VercelDeploymentLike,
  domain: string,
): boolean {
  const wanted = domain.trim().toLowerCase();
  return aliasNames(deployment).includes(wanted);
}

export function newestDeployment(
  deployments: readonly VercelDeploymentLike[],
): VercelDeploymentLike | null {
  if (!deployments.length) return null;
  return [...deployments].sort((a,b) => {
    const at = Number(new Date(a.createdAt ?? a.created ?? 0).getTime());
    const bt = Number(new Date(b.createdAt ?? b.created ?? 0).getTime());
    return bt-at;
  })[0] ?? null;
}
