/**
 * Sentry402 client — used by every plugin action.
 *
 * Two modes:
 *   "screen"    — calls /api/screen (free, no x402). Same engine, same response
 *                 shape. Use during dev or for internal agents.
 *   "preflight" — calls /api/preflight (x402-gated, $0.02 USDC). Production
 *                 agent endpoint. Requires X-PAYMENT header.
 *
 * The X-PAYMENT signing is delegated to a caller-provided async function so
 * the plugin works with any x402 wallet (CDP Wallet, viem, ethers).
 */

export type Verdict = "allow" | "warn" | "block";
export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type Sentry402Signal = {
  id: string;
  type: string;
  severity: Severity;
  title: string;
  rationale: string;
  fatf_reference?: string;
  fincen_reference?: string;
  mica_reference?: string;
  evidence_ids: string[];
  score_contribution: number;
};

export type Sentry402Response = {
  verdict: Verdict;
  score: number;
  severity: Severity;
  reasoning: string;
  signals: Sentry402Signal[];
  metadata: {
    rule_pack_version: string;
    rule_pack_sha256?: string;
    sdn_list_version: string;
    generation_id?: string;
  };
  latency_ms: number;
};

export type Sentry402ChainName =
  | "eth-mainnet"
  | "base-mainnet"
  | "matic-mainnet"
  | "bsc-mainnet"
  | "arbitrum-mainnet"
  | "optimism-mainnet"
  | "solana-mainnet";

export type Sentry402ClientOptions = {
  /** Sentry402 deployment URL. Default https://sentry402.vercel.app */
  apiUrl?: string;
  /**
   * "screen" — free, no x402. "preflight" — x402-gated $0.02 USDC.
   * Default: "screen" (safe default for evaluation).
   */
  mode?: "screen" | "preflight";
  /**
   * Async function that returns a signed X-PAYMENT header value for the
   * x402 protocol. Required when mode === "preflight".
   * Plugin users typically wire this to their agent's wallet provider.
   */
  signX402Payment?: () => Promise<string>;
  /** Per-call timeout in milliseconds. Default 30000. */
  timeoutMs?: number;
};

const DEFAULT_API_URL = "https://sentry402.vercel.app";

export class Sentry402Client {
  private apiUrl: string;
  private mode: "screen" | "preflight";
  private signX402Payment?: () => Promise<string>;
  private timeoutMs: number;

  constructor(opts: Sentry402ClientOptions = {}) {
    this.apiUrl = opts.apiUrl ?? DEFAULT_API_URL;
    this.mode = opts.mode ?? "screen";
    this.signX402Payment = opts.signX402Payment;
    this.timeoutMs = opts.timeoutMs ?? 30000;

    if (this.mode === "preflight" && !this.signX402Payment) {
      throw new Error(
        "Sentry402Client: mode 'preflight' requires signX402Payment callback. Pass screen mode for free preview without x402.",
      );
    }
  }

  /**
   * Pre-flight check on a destination address. Returns the verdict the agent
   * should branch on.
   */
  async preflight(args: {
    chain: Sentry402ChainName;
    toAddress: string;
    amountUsd?: number;
    fromAgent?: string;
  }): Promise<Sentry402Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      if (this.mode === "screen") {
        const url = new URL(`${this.apiUrl}/api/screen`);
        url.searchParams.set("chain", args.chain);
        url.searchParams.set("to_address", args.toAddress);
        const res = await fetch(url.toString(), { signal: ctrl.signal });
        return await this.parse(res);
      }
      const xPayment = await this.signX402Payment!();
      const res = await fetch(`${this.apiUrl}/api/preflight`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-PAYMENT": xPayment,
        },
        body: JSON.stringify({
          chain: args.chain,
          to_address: args.toAddress,
          amount_usd: args.amountUsd,
          from_agent: args.fromAgent,
        }),
        signal: ctrl.signal,
      });
      return await this.parse(res);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parse(res: Response): Promise<Sentry402Response> {
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Sentry402 ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as Sentry402Response;
  }
}

/**
 * Decide what an agent should do for a given verdict, plus a stable
 * shouldProceed boolean for the plugin's wrapping logic.
 */
export function decideAgentAction(r: Sentry402Response): {
  shouldProceed: boolean;
  shouldEscalate: boolean;
  shouldBlock: boolean;
  summary: string;
} {
  if (r.verdict === "block") {
    return {
      shouldProceed: false,
      shouldEscalate: false,
      shouldBlock: true,
      summary: `Sentry402 blocked transfer: ${r.reasoning}`,
    };
  }
  if (r.verdict === "warn") {
    return {
      shouldProceed: false,
      shouldEscalate: true,
      shouldBlock: false,
      summary: `Sentry402 flagged transfer for review: ${r.reasoning}`,
    };
  }
  return {
    shouldProceed: true,
    shouldEscalate: false,
    shouldBlock: false,
    summary: `Sentry402 cleared transfer (severity ${r.severity}, score ${r.score}/100).`,
  };
}
