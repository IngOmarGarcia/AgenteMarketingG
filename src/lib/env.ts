import { z } from "zod";

/**
 * Validación de entorno en el arranque. Falla rápido y ruidoso en vez de
 * reventar dentro de una llamada a la API con un `undefined`.
 *
 * IMPORTANTE: este módulo es SOLO de servidor. Valida `SUPABASE_SERVICE_ROLE_KEY`,
 * que salta todas las políticas de RLS. Importarlo desde un componente de
 * cliente arrastraría esa clave al bundle del navegador.
 *
 * Por eso el cliente de navegador (`supabase-browser.ts`) NO importa de aquí:
 * lee `process.env.NEXT_PUBLIC_*` directamente, que es lo que Next sustituye
 * en tiempo de build.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY es obligatoria"),

  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL debe ser una URL completa (https://<ref>.supabase.co)"),

  /** Clave pública. Segura en el navegador: respeta RLS. */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY es obligatoria"),

  /**
   * Clave de administración. SALTA RLS POR COMPLETO.
   * Nunca con prefijo NEXT_PUBLIC_, nunca en un componente de cliente.
   */
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY es obligatoria"),

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
