"use client";

/**
 * Último recurso: un fallo en el layout raíz.
 *
 * `(protected)/error.tsx` no puede recogerlo, porque un boundary no cubre el
 * layout de su propio segmento ni los de arriba. Si revienta el layout raíz
 * —o el de `(protected)`, que es donde vive la barra de navegación— solo queda
 * esto.
 *
 * Sustituye al documento entero, así que lleva sus propios `<html>` y `<body>`.
 * Y por eso mismo **no le llega `globals.css`**: los estilos van en línea. Un
 * `className` de Tailwind aquí no pinta nada, que es justo el fallo que
 * convierte esta pantalla en un texto negro sobre blanco sin formato.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          // Sin hoja de estilos no hay variables de tema: los colores van
          // escritos. Oscuro fijo, como el resto del sistema.
          backgroundColor: "#0f172a",
          color: "#e2e8f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: "32rem", width: "100%" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            La aplicación no pudo arrancar
          </h1>

          <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", opacity: 0.8 }}>
            Ha fallado algo por encima de las vistas. Reintenta; si sigue igual,
            pasa este código a quien lleve el servidor.
          </p>

          {error.digest && (
            <code
              style={{
                display: "block",
                marginTop: "1rem",
                padding: "0.75rem",
                borderRadius: "0.375rem",
                backgroundColor: "rgba(0,0,0,0.35)",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.875rem",
                wordBreak: "break-all",
              }}
            >
              {error.digest}
            </code>
          )}

          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1.25rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "none",
              backgroundColor: "#4f46e5",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
