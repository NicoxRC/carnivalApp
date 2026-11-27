"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, requestApi } from "@/lib/api/client";
import { parsePhotos, parseUploadGrant } from "@/lib/api/photos";
import { forgetDevice, getDevice } from "@/lib/device";
import { useUserLocation } from "@/lib/hooks/useUserLocation";
import { useLanguage } from "@/lib/i18n";
import { shrinkPhoto } from "@/lib/image";
import { MAX_USER_OFFSET_M, nearestWaypoint } from "@/lib/course";
import type { Photo } from "@/lib/types";

type Upload = "none" | "uploading" | "sent" | "error";

async function uploadFile(jpeg: Blob, device: string, metres: number | null): Promise<void> {
  const started = await requestApi("/api/photos/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device, size: jpeg.size }),
  });
  const grant = parseUploadGrant(await started.json());
  const put = await fetch(grant.uploadUrl, { method: "PUT", headers: { "Content-Type": grant.contentType }, body: jpeg });
  if (!put.ok) throw new ApiError(put.status, "");
  await requestApi(`/api/photos/uploads/${encodeURIComponent(grant.id)}/done`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: grant.token, metres }),
  });
}

export function PhotosScreen() {
  const { t } = useLanguage();
  const { location } = useUserLocation();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [upload, setUpload] = useState<Upload>("none");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const read = useCallback(() => {
    requestApi("/api/photos")
      .then((r) => r.json())
      .then((json) => setPhotos(parsePhotos(json)))
      .catch(() => setPhotos((f) => f ?? []));
  }, []);

  useEffect(read, [read]);

  const uploadPhoto = async (file: File) => {
    setUpload("uploading");
    setUploadError(null);
    try {
      const [jpeg, device] = await Promise.all([shrinkPhoto(file), getDevice()]);
      if (!device) throw new Error("no device");
      const onCourse = location !== null && location.projection.offsetM <= MAX_USER_OFFSET_M;
      await uploadFile(jpeg, device, onCourse ? Math.round(location.projection.metres) : null);
      setUpload("sent");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) forgetDevice();
        if (error.message && !error.message.startsWith("Error ")) setUploadError(error.message);
      }
      setUpload("error");
    }
  };

  return (
    <div className="flex-1 bg-paper-3">
      <div className="mx-auto w-full max-w-lg lg:max-w-5xl">
        <header className="pt-safe px-5 pb-3 lg:px-6 lg:pt-8">
          <h1 className="display-font text-[34px] leading-none text-ink">{t("photos.title")}</h1>
          <p className="mt-1.5 text-sm text-ink-3">{t("photos.sub")}</p>
        </header>

        <div className="px-4 lg:px-6">
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadPhoto(file);
            }}
          />
          <button
            type="button"
            disabled={upload === "uploading"}
            onClick={() => input.current?.click()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-[15px] font-extrabold text-paper active:opacity-90 disabled:opacity-60 lg:w-auto lg:px-8"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-head)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
            {upload === "uploading" ? t("photos.uploading") : t("photos.upload")}
          </button>

          <p
            role="status"
            className={`mt-2.5 rounded-xl px-3 py-2 text-[12px] leading-snug font-semibold ${
              upload === "sent"
                ? "bg-[#e3f3ea] text-ok"
                : upload === "error"
                  ? "bg-[#fbe9e7] text-alert"
                  : "bg-paper text-warn-text"
            }`}
          >
            {upload === "sent" ? t("photos.sent") : upload === "error" ? (uploadError ?? t("photos.error")) : t("photos.rules")}
          </p>
        </div>

        <div className="px-4 pt-4 pb-6 lg:px-6">
          {photos !== null && photos.length === 0 && (
            <p className="py-8 text-center text-[15px] text-ink-3">{t("photos.empty")}</p>
          )}
          <div className="[column-count:2] [column-gap:12px] lg:[column-count:4] lg:[column-gap:16px]">
            {(photos ?? []).map((f) => {
              const place = f.metres !== null ? nearestWaypoint(f.metres)?.name : null;
              return (
                <figure
                  key={f.id}
                  className="mb-3 overflow-hidden rounded-2xl border border-[#e9e6dd] bg-white shadow-[0_6px_16px_-12px_rgba(0,0,0,0.4)] [break-inside:avoid]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- already shrunk; the Next optimizer adds nothing and widens the attack surface */}
                  <img src={f.url} alt="" loading="lazy" className="block w-full" />
                  {place && (
                    <figcaption className="px-3 py-2 text-[12px] font-semibold text-ink-3">
                      {t("photos.near", { place: place })}
                    </figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
