import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    /**
     * Raíz del proyecto, fijada a mano.
     *
     * Turbopack la deduce buscando un lockfile hacia arriba, y hay un
     * `package-lock.json` suelto en el directorio del usuario (`C:\Users\66762`),
     * así que tomaba ESE como raíz. Next lo avisaba en cada arranque.
     *
     * No era cosmético. Con la raíz mal deducida falla la validación de caché
     * —lo dice la propia documentación de `turbopack.root`—, y el síntoma era
     * que `/estrategias/[id]/tablero` se compilaba pero nunca llegaba a
     * `app-paths-manifest.json`, el índice que consulta el enrutador. Resultado:
     * 404 en una ruta que existía, con el código sin ejecutarse siquiera.
     */
    root: __dirname,
  },
};

export default nextConfig;
