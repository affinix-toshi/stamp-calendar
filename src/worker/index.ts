export interface Env {
  ASSETS?: Fetcher;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/ping") {
      return Response.json({ ok: true });
    }
    // /feed/ と /api/ 以外は静的ファイル側が処理する（ここには来ない）
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
