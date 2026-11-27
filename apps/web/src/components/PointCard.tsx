"use client";

import { useEffect, useState } from "react";

import type { MapPoint } from "@/components/ParadeMap";
import { categoryName } from "@/lib/businesses";
import { shortDistance } from "@/lib/format";
import { useLanguage } from "@/lib/i18n";
import { countMetric } from "@/lib/metrics";
import { projectOnCourse, describePosition } from "@/lib/course";

interface Props {
  point: MapPoint;
  distanceM: number | null;
  onClose: () => void;
  onTakeMe: () => void;
}

export function PointCard({ point, distanceM, onClose, onTakeMe }: Props) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const projection = projectOnCourse(point.lat, point.lng);
  const reference = describePosition(projection.metres, "you", t).phrase.replace(/^(estás|you're) /, "");
  const isAd = Boolean(point.plan);
  const isBusiness = point.group === "business";
  const menu = point.menu ?? [];

  useEffect(() => {
    setMenuOpen(false);
    if (isBusiness) countMetric(point.id, "card");
  }, [point.id, isBusiness]);

  const count = (kind: "map" | "menu" | "whatsapp" | "link") => {
    if (isBusiness) countMetric(point.id, kind);
  };

  return (
    <div className="max-h-[70dvh] overflow-y-auto rounded-t-[26px] bg-white px-5 pt-4 pb-4 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.28)] lg:rounded-[26px] lg:border lg:border-line-2 lg:shadow-[0_12px_34px_-14px_rgba(0,0,0,0.34)]">
      <div className="mx-auto max-w-lg">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold tracking-[1px] text-ink-3 uppercase">
              {point.category === "stage" ? "Tarima" : categoryName(point.category)}
            </p>
            <h2 className="display-font mt-1 text-[22px] leading-[1.15] text-ink">
              {point.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t("card.close")}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-paper-2 text-ink-2 active:bg-line"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {point.description && (
          <p className="mt-2.5 text-[15px] leading-snug text-ink-2">{point.description}</p>
        )}

        <dl className="mt-3.5 space-y-1.5 text-[13px]">
          <div className="flex gap-2">
            <dt className="w-[74px] shrink-0 font-bold text-ink-3">{t("card.where")}</dt>
            <dd className="min-w-0 flex-1 text-ink">
              {point.address || reference}
              {distanceM !== null && (
                <span className="font-bold text-user">{t("card.away", { d: shortDistance(distanceM) })}</span>
              )}
            </dd>
          </div>
          {point.hours && (
            <div className="flex gap-2">
              <dt className="w-[74px] shrink-0 font-bold text-ink-3">{t("card.hours")}</dt>
              <dd className="min-w-0 flex-1 text-ink">{point.hours}</dd>
            </div>
          )}
        </dl>

        {point.offer && (
          <p className="mt-3 rounded-xl border border-dashed border-[#d8b96a] bg-paper px-3 py-2.5 text-[14px] font-bold text-ink">
            {point.offer}
          </p>
        )}

        {menu.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              aria-expanded={menuOpen}
              onClick={() => {
                if (!menuOpen) count("menu");
                setMenuOpen((v) => !v);
              }}
              className="text-[14px] font-bold text-ink underline underline-offset-2"
            >
              {menuOpen ? t("card.hideMenu") : `${t("card.menu")} (${menu.length})`}
            </button>
            {menuOpen && (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line-2">
                {menu.map((item, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2 text-[14px]">
                    <span className="min-w-0 text-ink">{item.name}</span>
                    {item.price && <span className="shrink-0 font-bold text-ink-2">{item.price}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              count("map");
              onTakeMe();
            }}
            className="flex h-11 min-w-[140px] flex-1 items-center justify-center gap-2 rounded-full bg-ink text-sm font-bold text-paper active:opacity-90"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-head)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.6" />
            </svg>
            {t("card.showOnMap")}
          </button>

          {point.whatsapp && (
            <a
              href={`https://wa.me/${point.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => count("whatsapp")}
              className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#128c4a] px-4 text-sm font-bold text-white active:opacity-90"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 20l1.3-4A8 8 0 1 1 8.5 19z" />
              </svg>
              {t("card.whatsapp")}
            </a>
          )}

          {point.link && (
            <a
              href={point.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => count("link")}
              className="flex h-11 items-center justify-center rounded-full border border-line-2 px-4 text-sm font-bold text-ink active:bg-paper-2"
            >
              {t("card.link")}
            </a>
          )}

          {isAd && (
            <span className="shrink-0 rounded-full border border-line-2 px-2.5 py-1 text-[10px] font-extrabold tracking-[1px] text-ink-3">
              {t("card.ad")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
