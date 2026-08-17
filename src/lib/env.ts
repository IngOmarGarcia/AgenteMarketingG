import { z } from "zod";

/**
 * Validación de entorno en el arranque. Falla rápido y ruidoso en vez de
 * reventar dentro de una llamada a la API con un `undefined`.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY es obligatoria"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const detalle = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Variables de entorno inválidas:\n${detalle}`);
}

export const env: Env = parsed.data;
