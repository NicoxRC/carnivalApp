import { datos, MODO_DATOS, resolverDesfile } from "@/lib/datos";
import { suscribirLocal } from "@/lib/datos/local";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stream de estado por SSE. Solo existe en modo local.
 * En modo supabase el navegador se suscribe directo a Realtime — que es el punto
 * de usar Supabase — y esta ruta no se usa.
 */
export async function GET(req: Request) {
  if (MODO_DATOS !== "local") {
    return new Response(
      JSON.stringify({ error: "En modo supabase el cliente usa Realtime, no este stream." }),
      { status: 501, headers: { "Content-Type": "application/json" } },
    );
  }

  const desfile = await resolverDesfile(new URL(req.url).searchParams.get("desfile"));
  if (!desfile) {
    return new Response(JSON.stringify({ error: "No hay desfile." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const desfileId = desfile.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let cerrado = false;
      const enviar = (dato: unknown) => {
        if (cerrado) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(dato)}\n\n`));
        } catch {
          cerrado = true;
        }
      };

      // Primer envío inmediato: la pantalla nunca debe quedarse en blanco esperando.
      const inicial = await datos().leerEstado(desfileId);
      if (inicial) enviar(inicial);

      const desuscribir = suscribirLocal(desfileId, enviar);

      // Latido: mantiene viva la conexión a través de proxies y detecta cortes.
      const latido = setInterval(() => {
        if (cerrado) return;
        try {
          controller.enqueue(encoder.encode(`: latido\n\n`));
        } catch {
          cerrado = true;
        }
      }, 20_000);

      const limpiar = () => {
        if (cerrado) return;
        cerrado = true;
        clearInterval(latido);
        desuscribir();
        try {
          controller.close();
        } catch {
          // Ya estaba cerrado.
        }
      };

      req.signal.addEventListener("abort", limpiar);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
