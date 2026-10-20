import { z } from 'zod';

/** Every error response from the API has this shape. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const healthSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptimeSeconds: z.number(),
  time: z.string(),
});
