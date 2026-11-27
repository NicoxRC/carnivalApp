"use client";

import { useEffect } from "react";

import { useLanguage } from "@/lib/i18n";

/**
 * Si una pantalla revienta, esto es lo que se ve en vez de una página en
 * blanco. Lo importante es el botón: el 31 nadie va a recargar a mano.
 */
export default function ErrorDePantalla({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useLanguage();
  useEffect(() => {
    console.error("[pantalla]", error);
  }, [error]);

  return (
    <div className="grid flex-1 place-items-center bg-papel-3 px-6 py-16 text-center">
      <div>
        <h1 className="fuente-display text-[28px] text-tinta">{t("error.title")}</h1>
        <p className="mt-2 text-[15px] text-tinta-2">{t("error.text")}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full bg-tinta px-6 py-3 font-bold text-papel active:opacity-90"
        >
          {t("error.retry")}
        </button>
      </div>
    </div>
  );
}
