import { handleFeed } from "./feed";
import { handleHealth } from "./health";

export interface Env {
  ASSETS?: Fetcher;
  /** 秘密（wrangler secret put）: 家族用・見本用のサービスアカウント JSON */
  FAMILY_SA_JSON?: string;
  DEMO_SA_JSON?: string;
  /** 環境変数（wrangler.jsonc の vars）: Realtime Database の URL */
  FAMILY_DB_URL?: string;
  DEMO_DB_URL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/ping") {
      return Response.json({ ok: true });
    }
    if (pathname === "/api/health") {
      return handleHealth(env);
    }
    if (pathname.startsWith("/feed/")) {
      return handleFeed(request, env);
    }
    // /feed/ と /api/ 以外は静的ファイル側が処理する（ここには来ない）
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
