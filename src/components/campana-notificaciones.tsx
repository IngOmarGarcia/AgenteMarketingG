"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  listarNotificacionesAction,
  marcarLeidaAction,
  marcarTodasLeidasAction,
} from "@/modules/notificaciones/actions";
import {
  formatearContador,
  haceCuanto,
  TEXTOS,
} from "@/modules/notificaciones/notificaciones";
import type { NotificacionFila } from "@/modules/notificaciones/notificaciones.service";

/**
 * Campana del centro de avisos.
 *
 * El contador llega ya calculado desde el servidor (`noLeidasIniciales`): así
 * el número correcto está en el primer pintado, sin un salto de 0 a 3 al
 * hidratar. A partir de ahí lo lleva el estado local, porque al marcar como
 * leída la respuesta debe ser inmediata y no un viaje al servidor.
 *
 * La lista, en cambio, se pide **al abrir**, no en cada render de la barra.
 * Contar no leídas es una consulta que no trae filas y se puede permitir en
 * todas las páginas; traerse veinte notificaciones que casi nadie va a
 * desplegar, no.
 *
 * No hay sondeo ni tiempo real: los avisos aparecen al navegar o al recargar.
 * Es un tablero de trabajo, no un chat.
 */
export function CampanaNotificaciones({
  noLeidasIniciales,
}: {
  noLeidasIniciales: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [noLeidas, setNoLeidas] = useState(noLeidasIniciales);
  const [filas, setFilas] = useState<NotificacionFila[] | null>(null);
  const [cargando, empezar] = useTransition();
  const contenedor = useRef<HTMLDivElement>(null);

  // Se fija al abrir y no en cada render: si se recalculara continuamente, los
  // textos "hace 3 min" cambiarían solos mientras se lee el panel.
  const [ahora, setAhora] = useState(() => new Date());

  // Cerrar al pulsar fuera o con Escape. Sin esto, el panel se queda abierto
  // encima del contenido y hay que volver a la campana para quitarlo.
  useEffect(() => {
    if (!abierto) return;

    function fuera(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    function escape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }

    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  function alternar() {
    const siguiente = !abierto;
    setAbierto(siguiente);
    if (!siguiente) return;

    setAhora(new Date());
    empezar(async () => {
      setFilas(await listarNotificacionesAction());
    });
  }

  function marcarUna(fila: NotificacionFila) {
    if (fila.leida) return;

    // Optimista: se pinta como leída antes de que el servidor conteste. El
    // usuario suele estar navegando al enlace en ese mismo clic, y esperar la
    // respuesta dejaría la fila resaltada durante toda la transición.
    setNoLeidas((n) => Math.max(0, n - 1));
    setFilas((actuales) =>
      actuales?.map((f) => (f.id === fila.id ? { ...f, leida: true } : f)) ?? null,
    );
    void marcarLeidaAction(fila.id);
  }

  function marcarTodas() {
    setNoLeidas(0);
    setFilas((actuales) => actuales?.map((f) => ({ ...f, leida: true })) ?? null);
    void marcarTodasLeidasAction();
  }

  const contador = formatearContador(noLeidas);

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-label={
          contador ? `Notificaciones, ${noLeidas} sin leer` : "Notificaciones"
        }
        className="relative rounded-md border border-white/20 p-2 transition hover:bg-white/10"
      >
        {/* SVG en línea y no una librería de iconos: es el único icono de la
            barra y no compensa arrastrar una dependencia entera por él. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {contador && (
          <span
            // -top/-right y no dentro del botón: el círculo muerde el borde,
            // que es donde el ojo lo busca.
            className="absolute -top-1.5 -right-1.5 min-w-[1.15rem] rounded-full bg-red-500 px-1 text-[0.65rem] leading-[1.15rem] font-bold text-white"
          >
            {contador}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Notificaciones"
          // z-50 porque cae sobre el contenido de la página. w-[22rem] con tope
          // al ancho de la ventana: en móvil un panel fijo de 352px se sale.
          className="glass-card animate-fade-in absolute right-0 z-50 mt-2 max-h-[70vh] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold">Notificaciones</h2>
            {noLeidas > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                className="text-xs text-[var(--acento)] transition hover:underline"
              >
                Marcar todas
              </button>
            )}
          </div>

          {cargando && filas === null && (
            <p className="px-4 py-6 text-center text-xs opacity-70">Cargando…</p>
          )}

          {filas?.length === 0 && (
            <p className="px-4 py-6 text-center text-xs opacity-70">
              No tienes notificaciones.
            </p>
          )}

          <ul>
            {filas?.map((fila) => (
              <li key={fila.id} className="border-b border-white/5 last:border-0">
                <Fila
                  fila={fila}
                  ahora={ahora}
                  onLeer={() => marcarUna(fila)}
                  onNavegar={() => setAbierto(false)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Una notificación. Es un `<Link>` cuando lleva a algún sitio y un `<button>`
 * cuando no: un enlace sin destino no se puede recorrer con el teclado de forma
 * sensata y el lector de pantalla lo anuncia como algo que no es.
 */
function Fila({
  fila,
  ahora,
  onLeer,
  onNavegar,
}: {
  fila: NotificacionFila;
  ahora: Date;
  onLeer: () => void;
  onNavegar: () => void;
}) {
  const texto = TEXTOS[fila.tipo];

  const cuerpo = (
    <>
      <span
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-base text-[var(--acento)]"
      >
        {texto.icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{fila.titulo}</span>
        <span className="mt-0.5 block text-xs opacity-75">{fila.mensaje}</span>
        <span className="mt-1 block text-[0.7rem] opacity-55">
          {haceCuanto(fila.createdAt, ahora)}
        </span>
      </span>
      {!fila.leida && (
        // El punto es lo único que distingue leída de no leída. Un fondo
        // teñido se pierde sobre el vidrio.
        <span
          aria-label="Sin leer"
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--acento)]"
        />
      )}
    </>
  );

  const clases = `flex w-full gap-3 px-4 py-3 text-left transition hover:bg-white/10 ${
    fila.leida ? "" : "bg-white/5"
  }`;

  if (!fila.enlace) {
    return (
      <button type="button" onClick={onLeer} className={clases}>
        {cuerpo}
      </button>
    );
  }

  return (
    <Link
      href={fila.enlace}
      onClick={() => {
        onLeer();
        onNavegar();
      }}
      className={clases}
    >
      {cuerpo}
    </Link>
  );
}
