import { z } from "zod";

export const visionModelsResponseSchema = z.object({
  models: z.array(z.string().min(1)),
  assignedModel: z.string().min(1).nullable(),
});
