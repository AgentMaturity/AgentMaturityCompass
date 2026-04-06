import { BaseIntegration } from './base.js';

class GitHubIntegration extends BaseIntegration {
  readonly service = 'github';

  private async request<T = any>(path: string, opts?: RequestInit): Promise<T> {
    const config = await this.getConfig();
    if (!config.token) throw new Error('GitHub token not configured');

    const res = await fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        Authorization: `token ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        ...opts?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API ${res.status}: ${body}`);
    }
    return res.json() as T;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request('/user');
      await this.setStatus('connected');
      return true;
    } catch (err: any) {
      await this.setStatus('error', err.message);
      return false;
    }
  }

  async getPRs(repo: string, state: string = 'open'): Promise<any[]> {
    const config = await this.getConfig();
    const owner = config.owner || 'thewisecrab';
    const prs = await this.request(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=30`);
    return (prs as any[]).map((pr: any) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user?.login,
      url: pr.html_url,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    }));
  }

  async getRelease(repo: string, tag?: string): Promise<any> {
    const config = await this.getConfig();
    const owner = config.owner || 'thewisecrab';
    const path = tag
      ? `/repos/${owner}/${repo}/releases/tags/${tag}`
      : `/repos/${owner}/${repo}/releases/latest`;
    return this.request(path);
  }

  async triggerWorkflow(repo: string, workflowId: string, ref: string = 'main', inputs?: Record<string, string>): Promise<void> {
    const config = await this.getConfig();
    const owner = config.owner || 'thewisecrab';
    await this.request(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, inputs: inputs || {} }),
    });
  }

  async getWorkflowRuns(repo: string, limit: number = 10): Promise<any[]> {
    const config = await this.getConfig();
    const owner = config.owner || 'thewisecrab';
    const data = await this.request(`/repos/${owner}/${repo}/actions/runs?per_page=${limit}`);
    return (data as any).workflow_runs.map((r: any) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
      branch: r.head_branch,
      url: r.html_url,
      createdAt: r.created_at,
    }));
  }
}

export const github = new GitHubIntegration();
