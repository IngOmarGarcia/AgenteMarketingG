"use client";

import { CLASES_ACCION, IconoAccion } from "@/components/accion-rapida";

/**
 * Descarga la estrategia en PDF.
 *
 * Usa el diálogo de impresión del navegador —"Guardar como PDF"— y no una
 * librería. La decisión importa, así que queda escrita:
 *
 *  - Una librería de cliente (jsPDF, html2pdf) añade entre 300 y 400 KB al
 *    bundle de TODO el mundo, para una acción que se usa de vez en cuando. Y
 *    las que rasterizan el HTML producen un PDF que es una foto: texto que no
 *    se puede seleccionar ni buscar, y borroso al ampliar.
 *  - Generarlo en el servidor exige un navegador headless. En las funciones de
 *    Netlify eso no cabe: hay límite de tamaño y de tiempo.
 *  - El diálogo del navegador da texto seleccionable, saltos de página reales y
 *    la tipografía correcta. Lo que hacía falta era decirle CÓMO imprimir, y de
 *    eso se encarga el bloque `@media print` de globals.css.
 *
 * `window.print()` es síncrono y bloquea hasta que se cierra el diálogo, así
 * que no hay estado de carga que enseñar.
 */
export function DescargarPdfBoton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title="Abre el diálogo de impresión: elige «Guardar como PDF» para descargarla"
      className={CLASES_ACCION}
    >
      <IconoAccion nombre="descargar" />
      Descargar PDF
    </button>
  );
}
