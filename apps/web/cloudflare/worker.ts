interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const RANGE = /^bytes=(\d+)-(\d*)$/;

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const range = RANGE.exec(request.headers.get("range") ?? "");
    if (!range || request.method !== "GET") return env.ASSETS.fetch(request);

    const whole = await env.ASSETS.fetch(new Request(request.url));
    if (whole.status !== 200) return whole;
    const buffer = await whole.arrayBuffer();
    const total = buffer.byteLength;
    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : total - 1, total - 1);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    const headers = new Headers(whole.headers);
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(end - start + 1));
    headers.set("Accept-Ranges", "bytes");
    return new Response(buffer.slice(start, end + 1), { status: 206, headers });
  },
};

export default worker;
