export type HostedTestTarget = {
  baseUrl: string;
  approvedOrigin: string;
  deploymentProjectId: string;
  approvedVercelProjectId: string;
  supabaseProjectRef: string;
  approvedSupabaseRef: string;
  gitBranch: string;
  vercelEnv: string;
  databaseSchema: string;
};

export declare function assertHostedTestTarget(target: HostedTestTarget): string;
