/**
 * AI使用量の報告クライアント（TypeScript / Node / Next.js APIルート / Vercel）。
 * 各アプリにこのファイルをコピーして使う。
 *
 * 使い方:
 *   import { recordUsage } from "@/lib/aiUsage";
 *   const res = await anthropic.messages.create({...});
 *   await recordUsage(res, "generate");     // ← これ1行だけ
 *
 * 環境変数:
 *   AI_USAGE_APP       このアプリのID（例 2ch-daihon-maker）※必須
 *   AI_USAGE_KEY       合言葉 ※必須（未設定なら黙って何もしない）
 *   AI_USAGE_ENDPOINT  送り先（既定 https://hisho.run-strategy.jp/ai-usage）
 *
 * ⚠️ Vercel等のサーバーレスでは、投げっぱなし(void fetch)にすると**関数が先に終了して
 *    送信が破棄される**。だからここは await する。タイムアウト3秒＋例外握りつぶしなので、
 *    遅くても本体のレスポンスを3秒以上遅らせないし、落とさない。
 */

const ENDPOINT = process.env.AI_USAGE_ENDPOINT || "https://hisho.run-strategy.jp/ai-usage";
const KEY = process.env.AI_USAGE_KEY || "";
const APP = process.env.AI_USAGE_APP || "";

export type AnthropicUsageLike = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export function usageEnabled(): boolean {
  return Boolean(KEY && APP);
}

/** 数値を直接渡して報告する（レスポンスオブジェクトが無い場合用）。 */
export async function sendUsage(args: {
  model: string;
  usage: AnthropicUsageLike;
  kind?: string;
  app?: string;
}): Promise<void> {
  if (!usageEnabled()) return;
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-usage-key": KEY },
      body: JSON.stringify({
        app: args.app || APP,
        model: args.model || "",
        kind: args.kind || "",
        usage: {
          input_tokens: args.usage?.input_tokens ?? 0,
          output_tokens: args.usage?.output_tokens ?? 0,
          cache_creation_input_tokens: args.usage?.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens: args.usage?.cache_read_input_tokens ?? 0,
        },
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // 使用量の記録ごときで本体を巻き込まない
  }
}

/**
 * Anthropic の messages.create のレスポンスをそのまま渡す。
 *
 * ⚠️ モデル名は **レスポンスが名乗ったもの** を使う（設定値の固定名にしない）。
 * 機能ごとにモデルを変えたとき、固定名だと単価が数倍ずれて集計が嘘になる。
 */
export async function recordUsage(
  res: { model?: string; usage?: AnthropicUsageLike } | null | undefined,
  kind = "",
  app?: string,
): Promise<void> {
  if (!res?.usage) return;
  await sendUsage({ model: res.model || "", usage: res.usage, kind, app });
}

/**
 * Anthropic クライアントを丸ごと包んで、**全ての messages.create を自動で記録**する。
 *
 * 呼び出し箇所が多いアプリ（2ch台本メーカーは15箇所以上）では、1箇所ずつ record を
 * 足すより、クライアント生成のところだけ差し替えるほうが速いし漏れない。
 * 将来 messages.create を増やしても勝手に計測される。
 *
 *   - const client = new Anthropic({ apiKey });
 *   + const client = wrapAnthropic(new Anthropic({ apiKey }), "generate");
 *
 * ⚠️ stream:true の呼び出しは戻り値に usage が無いので記録されない（no-op）。
 *    ストリームを使う場合は最終メッセージを取ってから recordUsage を呼ぶこと。
 */
export function wrapAnthropic<T extends { messages: { create: (...a: any[]) => any } }>(
  client: T,
  kind = "",
): T {
  const messages: any = client.messages;
  if (messages.__usageWrapped) return client;   // 二重ラップ防止
  const orig = messages.create.bind(messages);
  messages.create = async (...args: any[]) => {
    const res = await orig(...args);
    await recordUsage(res, kind);
    return res;
  };
  messages.__usageWrapped = true;
  return client;
}
