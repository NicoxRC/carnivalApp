"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { setLanguage, useLanguage } from "@/lib/i18n";

const ICONS: Record<string, React.ReactNode> = {
  map: <path d="M9 20l-5.5 2V6L9 4m0 16l6-2m-6 2V4m6 14l5.5 2V4l-5.5 2m0 12V6m0 0L9 4" />,
  today: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  parades: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
    </>
  ),
  photos: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
};

const TABS = [
  { href: "/", key: "nav.map", icon: "map" },
  { href: "/today", key: "nav.today", icon: "today" },
  { href: "/parades", key: "nav.parades", icon: "parades" },
  { href: "/photos", key: "nav.photos", icon: "photos" },
] as const;

export function Navigation() {
  const path = usePathname();
  const { language, t } = useLanguage();

  if (path.startsWith("/admin") || path.startsWith("/reporter")) return null;

  return (
    <nav
      className={
        "pb-safe sticky bottom-0 z-30 border-t border-line bg-white " +
        "lg:top-0 lg:h-dvh lg:w-[92px] lg:shrink-0 lg:border-t-0 lg:border-r lg:pb-0"
      }
    >
      <ul className="mx-auto flex max-w-lg px-1 pt-1.5 lg:mx-0 lg:max-w-none lg:flex-col lg:gap-1 lg:px-2 lg:pt-4">
        {TABS.map((tab) => {
          const active = path === tab.href;
          return (
            <li key={tab.href} className="flex-1 lg:flex-none">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center gap-[3px] rounded-xl py-2 lg:py-3 lg:hover:bg-paper-2"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={active ? "var(--color-head)" : "var(--color-ink-4)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {ICONS[tab.icon]}
                </svg>
                <span
                  className={`text-[11px] ${
                    active ? "font-extrabold text-head" : "font-bold text-ink-4"
                  }`}
                >
                  {t(tab.key)}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="hidden lg:mt-auto lg:block">
          <button
            type="button"
            onClick={() => setLanguage(language === "es" ? "en" : "es")}
            className="w-full rounded-xl py-3 text-[11px] font-bold text-ink-3 hover:bg-paper-2"
          >
            {t("nav.language")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
