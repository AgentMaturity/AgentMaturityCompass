/** Common endpoint shape shared by Studio's modular OpenAPI descriptions. */
export interface OpenApiOperation {
  summary?: string;
  tags?: string[];
  security?: Array<Record<string, unknown[]>>;
  parameters?: Array<Record<string, unknown>>;
  requestBody?: Record<string, unknown>;
  responses?: Record<string, unknown>;
}
