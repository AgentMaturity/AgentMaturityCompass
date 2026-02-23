export interface DashboardBuildInput {
    workspace: string;
    agentId?: string;
    outDir: string;
}
export interface DashboardBuildResult {
    agentId: string;
    outDir: string;
    latestRunId: string;
    generatedFiles: string[];
}
export declare function buildDashboard(input: DashboardBuildInput): DashboardBuildResult;
