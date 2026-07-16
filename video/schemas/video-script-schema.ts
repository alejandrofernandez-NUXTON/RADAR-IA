import { z } from "zod";

const narrationBlock = z.object({
  narration: z.string().min(10).max(1800),
  onScreenTitle: z.string().min(2).max(120),
  onScreenText: z.string().max(220).nullable()
});

export const videoScriptSchema = z.object({
  version: z.literal("1.0"),
  title: z.string().min(3).max(140),
  subtitle: z.string().max(180).nullable(),
  language: z.string().min(2).max(24),
  estimatedDurationSeconds: z.number().int().min(20).max(1200),
  introduction: narrationBlock,
  scenes: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        newsItemId: z.string().min(1),
        order: z.number().int().positive(),
        title: z.string().min(2).max(150),
        narration: z.string().min(20).max(2400),
        onScreenBullets: z.array(z.string().min(2).max(180)).min(1).max(3),
        sourceLabel: z.string().min(1).max(100),
        sourceUrl: z.string().max(2048).nullable(),
        preferredImageUrl: z.string().max(2048).nullable(),
        estimatedDurationSeconds: z.number().int().min(5).max(300)
      })
    )
    .min(1)
    .max(12),
  conclusion: z.object({
    narration: z.string().min(10).max(1800),
    onScreenTitle: z.string().min(2).max(120),
    onScreenBullets: z.array(z.string().min(2).max(180)).min(1).max(3)
  }),
  sources: z.array(
    z.object({
      newsItemId: z.string().min(1),
      name: z.string().min(1).max(100),
      title: z.string().min(1).max(180),
      url: z.string().max(2048).nullable()
    })
  )
});

export type VideoScript = z.infer<typeof videoScriptSchema>;
