import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid flex-1 place-items-center bg-paper-3 px-6 py-16 text-center">
      <div>
        <h1 className="display-font text-[28px] text-ink">Por acá no pasa el desfile</h1>
        <p className="mt-2 text-[15px] text-ink-2">Esa página no existe.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-ink px-6 py-3 font-bold text-paper">
          Volver al mapa
        </Link>
      </div>
    </div>
  );
}
