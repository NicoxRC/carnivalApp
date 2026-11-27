"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { api, BotonPrimario, BotonSec, Campo, ENTRADA, TARJETA } from "@/components/admin/comun";
import { BUSINESS_CATEGORIES, SERVICE_CATEGORIES, isService, OFFER_TIMINGS, categoryName, BUSINESS_PLANS } from "@/lib/businesses";
import type { Business, MenuItem, OfferTiming, BusinessPlan, MetricType } from "@/lib/types";

// MapLibre toca `window` al importarse.
const MapaSelector = dynamic(() => import("@/components/admin/MapaSelector"), {
  ssr: false,
  loading: () => <div className="h-72 w-full rounded-2xl bg-papel-2" />,
});

type Borrador = Omit<Business, "id" | "lat" | "lng"> & { id: string | null; lat: number | null; lng: number | null };
type Metricas = Record<string, Partial<Record<MetricType, number>>>;

const VACIO: Borrador = {
  id: null,
  name: "",
  category: "restaurant",
  description: "",
  address: "",
  hours: "",
  lat: null,
  lng: null,
  plan: null,
  offer: null,
  offerTiming: "always",
  menu: [],
  whatsapp: null,
  link: null,
  visible: true,
};

/** Lo que se le muestra al anunciante, en el orden en que pasa: lo ven, lo abren, actúan. */
const ETIQUETA_METRICA: [MetricType, string][] = [
  ["offer", "vieron la oferta"],
  ["card", "abrieron la ficha"],
  ["menu", "vieron el menú"],
  ["map", "«ver en el mapa»"],
  ["whatsapp", "WhatsApp"],
  ["link", "link"],
];

export function Comercios({ onVencida }: { onVencida: () => void }) {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [metricas, setMetricas] = useState<Metricas>({});
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [filtro, setFiltro] = useState("");

  const recargar = useCallback(async () => {
    const r = await api<{ businesses: Business[]; metricas: Metricas }>("/api/admin/comercios");
    if (r.ok) {
      setBusinesses(r.datos.businesses);
      setMetricas(r.datos.metricas);
    } else if (r.status === 401) onVencida();
    else setError(r.error);
  }, [onVencida]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const save = async (b: Borrador) => {
    const r = await api(b.id ? `/api/admin/comercios/${b.id}` : "/api/admin/comercios", {
      method: b.id ? "PUT" : "POST",
      body: JSON.stringify(b),
    });
    if (!r.ok) {
      if (r.status === 401) onVencida();
      return r.error;
    }
    setEditando(null);
    void recargar();
    return null;
  };

  const borrar = async (c: Business) => {
    if (!confirm(`¿Borrar «${c.name}» del mapa? Si solo es por hoy, mejor ocultalo.`)) return;
    const r = await api(`/api/admin/comercios/${c.id}`, { method: "DELETE" });
    if (!r.ok) setError(r.error);
    void recargar();
  };

  if (editando) {
    return <FormComercio inicial={editando} onGuardar={save} onCancelar={() => setEditando(null)} />;
  }

  const list = (businesses ?? []).filter((c) => c.name.toLowerCase().includes(filtro.trim().toLowerCase()));
  const conPauta = (businesses ?? []).filter((c) => c.plan).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setEditando(VACIO)} className="rounded-full bg-tinta px-5 py-2.5 font-bold text-papel">
          Agregar comercio o servicio
        </button>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por nombre"
          aria-label="Buscar"
          className={`${ENTRADA} mt-0 min-w-48 flex-1`}
        />
        {businesses ? (
          <p className="text-[13px] text-tinta-3">
            {businesses.length} en total · {conPauta} con pauta
          </p>
        ) : null}
      </div>
      {error ? <p className="text-sm font-semibold text-alerta">{error}</p> : null}

      <section className={`${TARJETA} overflow-hidden p-0`}>
        {businesses === null ? (
          <p className="p-5 text-sm text-tinta-3">Cargando…</p>
        ) : list.length === 0 ? (
          <p className="p-5 text-sm text-tinta-3">No hay nada.</p>
        ) : (
          <ul className="divide-y divide-borde">
            {list.map((c) => {
              const m = metricas[c.id] ?? {};
              const conDatos = ETIQUETA_METRICA.filter(([kind]) => m[kind]);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-48 flex-1">
                    <p className={`font-bold ${c.visible ? "text-tinta" : "text-tinta-4"}`}>
                      {c.name}
                      {c.plan ? (
                        <span className="ml-2 rounded bg-papel px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-tinta-2">
                          PAUTA · {BUSINESS_PLANS[c.plan].toUpperCase()}
                        </span>
                      ) : null}
                      {isService(c.category) ? (
                        <span className="ml-2 rounded bg-[#e2f0f9] px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-marca">
                          SERVICIO
                        </span>
                      ) : null}
                      {!c.visible ? <span className="ml-2 text-[12px] font-semibold text-tinta-4">(oculto)</span> : null}
                    </p>
                    <p className="text-[13px] text-tinta-3">
                      {categoryName(c.category)}
                      {c.address ? ` · ${c.address}` : ""}
                    </p>
                    {c.offer ? <p className="text-[13px] font-semibold text-cabeza-txt">{c.offer}</p> : null}
                    {/* El reporte para el anunciante: cuánta gente lo vio y qué hizo. */}
                    {conDatos.length > 0 ? (
                      <p className="mt-1 text-[12px] text-tinta-2">
                        {conDatos.map(([kind, etiqueta]) => `${m[kind]} ${etiqueta}`).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <BotonSec onClick={() => setEditando(c)}>Editar</BotonSec>
                  <BotonSec onClick={() => void save({ ...c, visible: !c.visible })}>
                    {c.visible ? "Ocultar" : "Mostrar"}
                  </BotonSec>
                  <BotonSec peligro onClick={() => void borrar(c)}>
                    Borrar
                  </BotonSec>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-[12px] text-tinta-3">
        Los números son toques contados en la app desde que se creó el comercio. No identifican a
        nadie y no distinguen si la misma persona abrió la ficha dos veces.
      </p>
    </div>
  );
}

function FormComercio({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: Borrador;
  onGuardar: (b: Borrador) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [b, setB] = useState<Borrador>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const field = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((x) => ({ ...x, [k]: v }));
  const servicio = isService(b.category);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError(await onGuardar(b));
    setOcupado(false);
  };

  const item = (i: number, cambios: Partial<MenuItem>) =>
    field("menu", b.menu.map((x, j) => (j === i ? { ...x, ...cambios } : x)));

  return (
    <form onSubmit={send} className={TARJETA}>
      <p className="fuente-display text-[20px] text-tinta">{b.id ? "Editar" : "Nuevo"}</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Campo etiqueta="Nombre">
            <input value={b.name} onChange={(e) => field("name", e.target.value)} className={ENTRADA} required />
          </Campo>
          <Campo etiqueta="Categoría">
            <select
              value={b.category}
              onChange={(e) => field("category", e.target.value as Business["category"])}
              className={ENTRADA}
            >
              <optgroup label="Comercios">
                {Object.entries(BUSINESS_CATEGORIES).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Servicios (solo con datos oficiales)">
                {Object.entries(SERVICE_CATEGORIES).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </optgroup>
            </select>
          </Campo>
          {servicio && (
            <p className="rounded-xl bg-papel px-3 py-2 text-[12px] font-semibold text-aviso-txt">
              Cargá servicios solo si el dato es oficial y verificado. Un baño o un puesto de salud
              que no está donde dice el mapa es peor que no mostrarlo.
            </p>
          )}
          <Campo etiqueta={servicio ? "Detalle" : "Qué ofrece"} ayuda="Una línea: lo que le sirve a quien está en la senda.">
            <textarea value={b.description} onChange={(e) => field("description", e.target.value)} rows={2} className={ENTRADA} />
          </Campo>
          <Campo etiqueta="Cómo encontrarlo" ayuda="Mejor una referencia («frente a Cristo Rey») que una dirección.">
            <input value={b.address} onChange={(e) => field("address", e.target.value)} className={ENTRADA} />
          </Campo>
          <Campo etiqueta="Horario">
            <input
              value={b.hours}
              onChange={(e) => field("hours", e.target.value)}
              placeholder="10:00 a. m. – 8:00 p. m."
              className={ENTRADA}
            />
          </Campo>
        </div>

        <div className="space-y-4">
          {/* Un div y no <label>: dentro de un label, cada toque en el mapa
              se reenviaría al botón de zoom. */}
          <div className="text-sm font-bold text-tinta">
            Ubicación
            <span className="block text-[12px] font-normal text-tinta-3">
              Tocá en el mapa donde queda, o arrastrá el pin.
            </span>
            <div className="mt-1.5">
              <MapaSelector lat={b.lat} lng={b.lng} onCambio={(lat, lng) => setB((x) => ({ ...x, lat, lng }))} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-bold text-tinta">
            <input type="checkbox" checked={b.visible} onChange={(e) => field("visible", e.target.checked)} />
            Visible en el mapa
          </label>
        </div>
      </div>

      {!servicio && (
        <fieldset className="mt-5 rounded-2xl border border-borde-2 p-4">
          <legend className="px-1 text-sm font-bold text-tinta">Pauta</legend>
          <select
            value={b.plan ?? ""}
            onChange={(e) => field("plan", (e.target.value || null) as BusinessPlan | null)}
            aria-label="Plan"
            className={`${ENTRADA} mt-0 md:w-1/2`}
          >
            <option value="">Sin plan (aparece igual en el mapa)</option>
            {Object.entries(BUSINESS_PLANS).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[12px] text-tinta-3">
            Con plan, la ficha lleva el sello «Pauta» y muestra oferta, menú y contacto. El plan
            Destacado además sale como «oferta cerca» a quien pase a menos de 300 m y en la pantalla
            Hoy. Aparecer en el mapa no depende de pagar.
          </p>

          {b.plan && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <Campo etiqueta="Oferta">
                  <input
                    value={b.offer ?? ""}
                    onChange={(e) => field("offer", e.target.value)}
                    placeholder="Segundo jugo gratis mostrando la app"
                    className={ENTRADA}
                  />
                </Campo>
                <Campo etiqueta="Cuándo se muestra la oferta">
                  <select
                    value={b.offerTiming}
                    onChange={(e) => field("offerTiming", e.target.value as OfferTiming)}
                    className={ENTRADA}
                  >
                    {Object.entries(OFFER_TIMINGS).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="WhatsApp" ayuda="El celular del negocio. Sale como botón en la ficha.">
                  <input
                    value={b.whatsapp ?? ""}
                    onChange={(e) => field("whatsapp", e.target.value)}
                    inputMode="tel"
                    placeholder="300 123 4567"
                    className={ENTRADA}
                  />
                </Campo>
                <Campo etiqueta="Enlace" ayuda="Instagram o página del negocio (opcional).">
                  <input
                    value={b.link ?? ""}
                    onChange={(e) => field("link", e.target.value)}
                    placeholder="instagram.com/minegocio"
                    className={ENTRADA}
                  />
                </Campo>
              </div>

              <div>
                <p className="text-sm font-bold text-tinta">Menú</p>
                <p className="text-[12px] text-tinta-3">Producto y precio. Se ve en la ficha, con o sin señal.</p>
                <ul className="mt-2 space-y-2">
                  {b.menu.map((x, i) => (
                    <li key={i} className="flex gap-2">
                      <input
                        value={x.name}
                        onChange={(e) => item(i, { name: e.target.value })}
                        placeholder="Cuy asado"
                        aria-label={`Producto ${i + 1}`}
                        className={`${ENTRADA} mt-0 min-w-0 flex-1`}
                      />
                      <input
                        value={x.price}
                        onChange={(e) => item(i, { price: e.target.value })}
                        placeholder="$45.000"
                        aria-label={`Precio ${i + 1}`}
                        className={`${ENTRADA} mt-0 w-28`}
                      />
                      <BotonSec peligro onClick={() => field("menu", b.menu.filter((_, j) => j !== i))}>
                        ✕
                      </BotonSec>
                    </li>
                  ))}
                </ul>
                <div className="mt-2">
                  <BotonSec onClick={() => field("menu", [...b.menu, { name: "", price: "" }])}>
                    Agregar producto
                  </BotonSec>
                </div>
              </div>
            </div>
          )}
        </fieldset>
      )}

      {error ? <p className="mt-4 text-sm font-semibold text-alerta">{error}</p> : null}
      <div className="mt-5 flex gap-2">
        <BotonPrimario disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar"}</BotonPrimario>
        <BotonSec onClick={onCancelar}>Cancelar</BotonSec>
      </div>
    </form>
  );
}
