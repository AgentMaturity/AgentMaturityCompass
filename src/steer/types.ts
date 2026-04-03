export interface SteerRequestContext {
  agentId: string;
  providerId: string;
  url: string;
  init: RequestInit;
  metadata: Record<string, unknown>;
}

export interface SteerResponseContext extends SteerRequestContext {
  response: Response;
}

export interface SteerStage {
  id: string;
  enabled?: boolean;
  onRequest?: (
    context: SteerRequestContext
  ) => SteerRequestContext | Promise<SteerRequestContext>;
  onResponse?: (
    context: SteerResponseContext
  ) => SteerResponseContext | Promise<SteerResponseContext>;
}

export interface SteerPipeline {
  readonly stages: readonly SteerStage[];
  runRequest(
    context: SteerRequestContext
  ): Promise<SteerRequestContext>;
  runResponse(
    context: SteerResponseContext
  ): Promise<SteerResponseContext>;
}

export interface CreateSteerPipelineOptions {
  stages?: SteerStage[];
}
