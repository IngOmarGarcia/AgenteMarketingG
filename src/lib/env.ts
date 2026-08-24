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
  /** Obligatoria solo con AI_PROVIDER=anthropic. Ver el superRefine de abajo. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),

  /**
   * URL pública del despliegue, para los enlaces que salen por correo.
   * Opcional: sin ella se deduce de las cabeceras. Ver `url-publica.ts`.
   */
  APP_URL: z.string().url().optional().or(z.literal("")),

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

  /** Qué proveedor atiende las generaciones. */
  AI_PROVIDER: z.enum(["anthropic", "ollama"]).default("anthropic"),

  /** Requiere `ollama serve` corriendo. Solo se usa con AI_PROVIDER=ollama. */
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen2.5:latest"),
})
  .superRefine((val, ctx) => {
    // La clave es opcional en el objeto y obligatoria AQUÍ. Dejarla `.optional()`
    // a secas permitiría arrancar en modo Anthropic sin clave, y el fallo
    // aparecería dentro de una llamada a la API — justo lo que este módulo
    // existe para evitar.
    if (val.AI_PROVIDER === "anthropic" && !val.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message:
          "es obligatoria con AI_PROVIDER=anthropic. Para trabajar en local sin coste, pon AI_PROVIDER=ollama.",
      });
    }
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
