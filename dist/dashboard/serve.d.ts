export interface ServeDashboardInput {
    workspace: string;
    agentId?: string;
    port: number;
    outDir?: string;
}
export interface DashboardServerHandle {
    agentId: string;
    rootDir: string;
    url: string;
    close: () => Promise<void>;
}
export declare function serveDashboard(input: ServeDashboardInput): Promise<DashboardServerHandle>;
