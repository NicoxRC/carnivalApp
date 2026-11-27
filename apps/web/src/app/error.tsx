"use client";

import { useEffect } from "react";

import { useLanguage } from "@/lib/i18n";

export default function ScreenError({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useLanguage();
  useEffect(() => {
    console.error("[screen]", error);
  }, [error]);

  return (
    <div className="grid flex-1 place-items-center bg-paper-3 px-6 py-16 text-center">
      <div>
        <h1 className="display-font text-[28px] text-ink">{t("error.title")}</h1>
        <p className="mt-2 text-[15px] text-ink-2">{t("error.text")}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full bg-ink px-6 py-3 font-bold text-paper active:opacity-90"
        >
          {t("error.retry")}
        </button>
      </div>
    </div>
  );
}
