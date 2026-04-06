import { query } from '../db.js';

export interface IntegrationConfig {
  [key: string]: string;
}

export abstract class BaseIntegration {
  abstract readonly service: string;

  async getConfig(): Promise<IntegrationConfig> {
    const { rows } = await query('SELECT config FROM integrations WHERE service = $1', [this.service]);
    return rows[0]?.config || {};
  }

  async saveConfig(config: IntegrationConfig, status: string = 'connected'): Promise<void> {
    await query(
      `UPDATE integrations SET config = $1, status = $2 WHERE service = $3`,
      [JSON.stringify(config), status, this.service]
    );
  }

  async setStatus(status: string, error?: string): Promise<void> {
    const configPatch = error ? { error } : {};
    await query(
      `UPDATE integrations SET status = $1, config = config || $2::jsonb WHERE service = $3`,
      [status, JSON.stringify(configPatch), this.service]
    );
  }

  abstract testConnection(): Promise<boolean>;
}
