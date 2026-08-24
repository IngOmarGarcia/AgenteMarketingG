"use client"; // Los error boundaries tienen que ser componentes de cliente.

import { useEffect } from "react";

/**
 * Red de seguridad de toda la zona autenticada.
 *
 * Sin este fichero, cualquier excepción durante el render de un Server
 * Component tumba la página entera y en producción el usuario recibe el error
 * minificado de React, sin contexto y sin salida. Eso es exactamente lo que
 * pasaba: no había ni un solo boundary en la aplicación.
 *
 * Lo que de verdad importa aquí es el DIGEST. React oculta el mensaje real en
 * producción a propósito, para no filtrar detalles del servidor al navegador, y
 * a cambio deja un hash. Ese hash aparece también en el log del servidor junto
 * al error completo y su traza: es lo que permite pasar de "algo falló" a la
 * línea concreta. Enseñarlo en pantalla no filtra nada —es un hash— y ahorra
 * tener que pedirle al usuario que abra la consola del navegador.
 *
 * Cubre `page.tsx` y los layouts anidados por debajo, pero NO el layout de su
 * propio segmento ni los de arriba. Un fallo en el layout raíz lo recoge
 * `global-error.tsx`.
 */
export default function ErrorZonaPrivada({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // En desarrollo esto imprime el error real con su traza. En producción
    // llega recortado, pero deja constancia en la consola del navegador.
    console.error("[zona privada] fallo de render:", error);
  }, [error]);

  return (
    <div className="glass-card glass-card--error animate-fade-in mx-auto max-w-2xl rounded-lg p-6">
      <h1 className="text-lg font-semibold">Esta vista no se pudo cargar</h1>

      <p className="mt-2 text-sm opacity-80">
        El fallo es del servidor, no de algo que hayas hecho. Puedes reintentar:
        a veces es temporal —una consulta que no llegó a tiempo, por ejemplo—.
      </p>

      {error.digest && (
        <div className="mt-4 rounded-md bg-black/25 p-3">
          <p className="text-xs opacity-70">
            Código del fallo. Búscalo en el log del servidor: ahí está el
            mensaje completo.
          </p>
          <code className="mt-1 block font-mono text-sm break-all select-all">
            {error.digest}
          </code>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          // `retry()` y no `reset()`: reset limpia el estado del boundary pero
          // reutiliza el contenido, así que ante un fallo de consulta vuelve a
          // enseñar el mismo error. `retry()` vuelve a pedirlo al servidor.
          onClick={() => retry()}
          className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] transition hover:opacity-90"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
