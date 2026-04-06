import type {
  CreateSteerPipelineOptions,
  SteerPipeline,
  SteerRequestContext,
  SteerResponseContext,
  SteerStage,
} from "./types.js";

function activeStages(stages: readonly SteerStage[]): SteerStage[] {
  return stages.filter((stage) => stage.enabled !== false);
}

export function createSteerPipeline(
  options: CreateSteerPipelineOptions = {}
): SteerPipeline {
  const stages = Object.freeze([...(options.stages ?? [])]);

  return {
    stages,
    async runRequest(context: SteerRequestContext): Promise<SteerRequestContext> {
      let current = context;
      for (const stage of activeStages(stages)) {
        if (!stage.onRequest) {
          continue;
        }
        current = await stage.onRequest(current);
      }
      return current;
    },
    async runResponse(
      context: SteerResponseContext
    ): Promise<SteerResponseContext> {
      let current = context;
      for (const stage of activeStages(stages)) {
        if (!stage.onResponse) {
          continue;
        }
        current = await stage.onResponse(current);
      }
      return current;
    },
  };
}
