"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { api, PrimaryButton, SecondaryButton, Field, INPUT_CLASS, CARD_CLASS } from "@/components/admin/common";
import { BUSINESS_CATEGORIES, SERVICE_CATEGORIES, isService, OFFER_TIMINGS, categoryName, BUSINESS_PLANS } from "@/lib/businesses";
import type { Business, MenuItem, OfferTiming, BusinessPlan, MetricType } from "@/lib/types";

const MapPicker = dynamic(() => import("@/components/admin/MapPicker"), {
  ssr: false,
  loading: () => <div className="h-72 w-full rounded-2xl bg-paper-2" />,
});

type Draft = Omit<Business, "id" | "lat" | "lng"> & { id: string | null; lat: number | null; lng: number | null };
type Metrics = Record<string, Partial<Record<MetricType, number>>>;

const EMPTY: Draft = {
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

const METRIC_LABEL: [MetricType, string][] = [
  ["offer", "vieron la oferta"],
  ["card", "abrieron la ficha"],
  ["menu", "vieron el menú"],
  ["map", "«ver en el mapa»"],
  ["whatsapp", "WhatsApp"],
  ["link", "link"],
];

export function BusinessesAdmin({ onExpired }: { onExpired: () => void }) {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({});
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [filter, setFilter] = useState("");

  const reload = useCallback(async () => {
    const r = await api<{ businesses: Business[]; metrics: Metrics }>("/api/admin/comercios");
    if (r.ok) {
      setBusinesses(r.data.businesses);
      setMetrics(r.data.metrics);
    } else if (r.status === 401) onExpired();
    else setError(r.error);
  }, [onExpired]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = async (b: Draft) => {
    const r = await api(b.id ? `/api/admin/comercios/${b.id}` : "/api/admin/comercios", {
      method: b.id ? "PUT" : "POST",
      body: JSON.stringify(b),
    });
    if (!r.ok) {
      if (r.status === 401) onExpired();
      return r.error;
    }
    setEditing(null);
    void reload();
    return null;
  };

  const remove = async (c: Business) => {
    if (!confirm(`¿Borrar «${c.name}» del mapa? Si solo es por hoy, mejor ocultalo.`)) return;
    const r = await api(`/api/admin/comercios/${c.id}`, { method: "DELETE" });
    if (!r.ok) setError(r.error);
    void reload();
  };

  if (editing) {
    return <BusinessForm initial={editing} onSave={save} onCancel={() => setEditing(null)} />;
  }

  const list = (businesses ?? []).filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const withAd = (businesses ?? []).filter((c) => c.plan).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setEditing(EMPTY)} className="rounded-full bg-ink px-5 py-2.5 font-bold text-paper">
          Agregar comercio o servicio
        </button>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar por nombre"
          aria-label="Buscar"
          className={`${INPUT_CLASS} mt-0 min-w-48 flex-1`}
        />
        {businesses ? (
          <p className="text-[13px] text-ink-3">
            {businesses.length} en total · {withAd} con pauta
          </p>
        ) : null}
      </div>
      {error ? <p className="text-sm font-semibold text-alert">{error}</p> : null}

      <section className={`${CARD_CLASS} overflow-hidden p-0`}>
        {businesses === null ? (
          <p className="p-5 text-sm text-ink-3">Cargando…</p>
        ) : list.length === 0 ? (
          <p className="p-5 text-sm text-ink-3">No hay nada.</p>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((c) => {
              const m = metrics[c.id] ?? {};
              const withData = METRIC_LABEL.filter(([kind]) => m[kind]);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-48 flex-1">
                    <p className={`font-bold ${c.visible ? "text-ink" : "text-ink-4"}`}>
                      {c.name}
                      {c.plan ? (
                        <span className="ml-2 rounded bg-paper px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-ink-2">
                          PAUTA · {BUSINESS_PLANS[c.plan].toUpperCase()}
                        </span>
                      ) : null}
                      {isService(c.category) ? (
                        <span className="ml-2 rounded bg-[#e2f0f9] px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-wider text-brand">
                          SERVICIO
                        </span>
                      ) : null}
                      {!c.visible ? <span className="ml-2 text-[12px] font-semibold text-ink-4">(oculto)</span> : null}
                    </p>
                    <p className="text-[13px] text-ink-3">
                      {categoryName(c.category)}
                      {c.address ? ` · ${c.address}` : ""}
                    </p>
                    {c.offer ? <p className="text-[13px] font-semibold text-head-text">{c.offer}</p> : null}
                    {withData.length > 0 ? (
                      <p className="mt-1 text-[12px] text-ink-2">
                        {withData.map(([kind, label]) => `${m[kind]} ${label}`).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <SecondaryButton onClick={() => setEditing(c)}>Editar</SecondaryButton>
                  <SecondaryButton onClick={() => void save({ ...c, visible: !c.visible })}>
                    {c.visible ? "Ocultar" : "Mostrar"}
                  </SecondaryButton>
                  <SecondaryButton danger onClick={() => void remove(c)}>
                    Borrar
                  </SecondaryButton>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-[12px] text-ink-3">
        Los números son toques contados en la app desde que se creó el comercio. No identifican a
        nadie y no distinguen si la misma persona abrió la ficha dos veces.
      </p>
    </div>
  );
}

function BusinessForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Draft;
  onSave: (b: Draft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [b, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((x) => ({ ...x, [k]: v }));
  const service = isService(b.category);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(await onSave(b));
    setBusy(false);
  };

  const item = (i: number, changes: Partial<MenuItem>) =>
    field("menu", b.menu.map((x, j) => (j === i ? { ...x, ...changes } : x)));

  return (
    <form onSubmit={send} className={CARD_CLASS}>
      <p className="display-font text-[20px] text-ink">{b.id ? "Editar" : "Nuevo"}</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <Field label="Nombre">
            <input value={b.name} onChange={(e) => field("name", e.target.value)} className={INPUT_CLASS} required />
          </Field>
          <Field label="Categoría">
            <select
              value={b.category}
              onChange={(e) => field("category", e.target.value as Business["category"])}
              className={INPUT_CLASS}
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
          </Field>
          {service && (
            <p className="rounded-xl bg-paper px-3 py-2 text-[12px] font-semibold text-warn-text">
              Cargá servicios solo si el dato es oficial y verificado. Un baño o un puesto de salud
              que no está donde dice el mapa es peor que no mostrarlo.
            </p>
          )}
          <Field label={service ? "Detalle" : "Qué ofrece"} help="Una línea: lo que le sirve a quien está en la senda.">
            <textarea value={b.description} onChange={(e) => field("description", e.target.value)} rows={2} className={INPUT_CLASS} />
          </Field>
          <Field label="Cómo encontrarlo" help="Mejor una referencia («frente a Cristo Rey») que una dirección.">
            <input value={b.address} onChange={(e) => field("address", e.target.value)} className={INPUT_CLASS} />
          </Field>
          <Field label="Horario">
            <input
              value={b.hours}
              onChange={(e) => field("hours", e.target.value)}
              placeholder="10:00 a. m. – 8:00 p. m."
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <div className="space-y-4">
          <div className="text-sm font-bold text-ink">
            Ubicación
            <span className="block text-[12px] font-normal text-ink-3">
              Tocá en el mapa donde queda, o arrastrá el pin.
            </span>
            <div className="mt-1.5">
              <MapPicker lat={b.lat} lng={b.lng} onChange={(lat, lng) => setDraft((x) => ({ ...x, lat, lng }))} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-bold text-ink">
            <input type="checkbox" checked={b.visible} onChange={(e) => field("visible", e.target.checked)} />
            Visible en el mapa
          </label>
        </div>
      </div>

      {!service && (
        <fieldset className="mt-5 rounded-2xl border border-line-2 p-4">
          <legend className="px-1 text-sm font-bold text-ink">Pauta</legend>
          <select
            value={b.plan ?? ""}
            onChange={(e) => field("plan", (e.target.value || null) as BusinessPlan | null)}
            aria-label="Plan"
            className={`${INPUT_CLASS} mt-0 md:w-1/2`}
          >
            <option value="">Sin plan (aparece igual en el mapa)</option>
            {Object.entries(BUSINESS_PLANS).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[12px] text-ink-3">
            Con plan, la ficha lleva el sello «Pauta» y muestra oferta, menú y contacto. El plan
            Destacado además sale como «oferta cerca» a quien pase a menos de 300 m y en la pantalla
            Hoy. Aparecer en el mapa no depende de pagar.
          </p>

          {b.plan && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <Field label="Oferta">
                  <input
                    value={b.offer ?? ""}
                    onChange={(e) => field("offer", e.target.value)}
                    placeholder="Segundo jugo gratis mostrando la app"
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label="Cuándo se muestra la oferta">
                  <select
                    value={b.offerTiming}
                    onChange={(e) => field("offerTiming", e.target.value as OfferTiming)}
                    className={INPUT_CLASS}
                  >
                    {Object.entries(OFFER_TIMINGS).map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="WhatsApp" help="El celular del negocio. Sale como botón en la ficha.">
                  <input
                    value={b.whatsapp ?? ""}
                    onChange={(e) => field("whatsapp", e.target.value)}
                    inputMode="tel"
                    placeholder="300 123 4567"
                    className={INPUT_CLASS}
                  />
                </Field>
                <Field label="Enlace" help="Instagram o página del negocio (opcional).">
                  <input
                    value={b.link ?? ""}
                    onChange={(e) => field("link", e.target.value)}
                    placeholder="instagram.com/minegocio"
                    className={INPUT_CLASS}
                  />
                </Field>
              </div>

              <div>
                <p className="text-sm font-bold text-ink">Menú</p>
                <p className="text-[12px] text-ink-3">Producto y precio. Se ve en la ficha, con o sin señal.</p>
                <ul className="mt-2 space-y-2">
                  {b.menu.map((x, i) => (
                    <li key={i} className="flex gap-2">
                      <input
                        value={x.name}
                        onChange={(e) => item(i, { name: e.target.value })}
                        placeholder="Cuy asado"
                        aria-label={`Producto ${i + 1}`}
                        className={`${INPUT_CLASS} mt-0 min-w-0 flex-1`}
                      />
                      <input
                        value={x.price}
                        onChange={(e) => item(i, { price: e.target.value })}
                        placeholder="$45.000"
                        aria-label={`Precio ${i + 1}`}
                        className={`${INPUT_CLASS} mt-0 w-28`}
                      />
                      <SecondaryButton danger onClick={() => field("menu", b.menu.filter((_, j) => j !== i))}>
                        ✕
                      </SecondaryButton>
                    </li>
                  ))}
                </ul>
                <div className="mt-2">
                  <SecondaryButton onClick={() => field("menu", [...b.menu, { name: "", price: "" }])}>
                    Agregar producto
                  </SecondaryButton>
                </div>
              </div>
            </div>
          )}
        </fieldset>
      )}

      {error ? <p className="mt-4 text-sm font-semibold text-alert">{error}</p> : null}
      <div className="mt-5 flex gap-2">
        <PrimaryButton disabled={busy}>{busy ? "Guardando…" : "Guardar"}</PrimaryButton>
        <SecondaryButton onClick={onCancel}>Cancelar</SecondaryButton>
      </div>
    </form>
  );
}
