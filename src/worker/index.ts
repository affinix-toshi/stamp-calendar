import { handleFeed } from "./feed";
import { handleHealth } from "./health";
import { resetDemo } from "./demoReset";
import { UpstreamError } from "./rtdb";

export interface Env {
  ASSETS?: Fetcher;
  /** 秘密（wrangler secret put）: 家族用・見本用のサービスアカウント JSON */
  FAMILY_SA_JSON?: string;
  DEMO_SA_JSON?: string;
  /** 環境変数（wrangler.jsonc の vars）: Realtime Database の URL */
  FAMILY_DB_URL?: string;
  DEMO_DB_URL?: string;
}

/** 見本のリセット。失敗は理由の短い言葉だけをログに出す（鍵・URL は出さない） */
async function runDemoReset(env: Env, now: Date): Promise<"ok" | "not_configured" | "failed"> {
  try {
    await resetDemo(env, now);
    return "ok";
  } catch (e) {
    const reason = e instanceof UpstreamError ? e.reason : "unexpected";
    console.error("demo reset: failed", reason);
    return reason === "not_configured" ? "not_configured" : "failed";
  }
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
    if (pathname === "/api/demo/reset") {
      if (request.method !== "POST") return new Response("Not Found", { status: 404 });
      const result = await runDemoReset(env, new Date());
      if (result === "ok") return Response.json({ ok: true });
      return Response.json(
        { error: result === "not_configured" ? "not_configured" : "unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (pathname.startsWith("/feed/")) {
      return handleFeed(request, env);
    }
    // /feed/ と /api/ 以外は静的ファイル側が処理する（ここには来ない）
    return new Response("Not Found", { status: 404 });
  },
  /** 毎日 日本時間 3:00（cron 0 18 * * *）に見本を最初の状態に戻す */
  async scheduled(controller, env, ctx): Promise<void> {
    ctx.waitUntil(runDemoReset(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
