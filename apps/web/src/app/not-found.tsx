import Link from "next/link";

export default function NoEncontrada() {
  return (
    <div className="grid flex-1 place-items-center bg-papel-3 px-6 py-16 text-center">
      <div>
        <h1 className="fuente-display text-[28px] text-tinta">Por acá no pasa el desfile</h1>
        <p className="mt-2 text-[15px] text-tinta-2">Esa página no existe.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-tinta px-6 py-3 font-bold text-papel">
          Volver al mapa
        </Link>
      </div>
    </div>
  );
}
