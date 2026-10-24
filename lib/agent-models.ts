import { z } from "zod";

export const agentModelsResponseSchema = z.object({
  models: z.array(z.string().min(1)),
  assignedModel: z.string().min(1).nullable(),
});
