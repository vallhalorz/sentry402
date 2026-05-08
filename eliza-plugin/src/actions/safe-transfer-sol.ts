/**
 * SAFE_TRANSFER_SOL — wraps the agent's native Solana transfer flow with a
 * mandatory Sentry402 pre-flight check.
 *
 * Behaviour:
 *   1. Parse {to, amount} from message.
 *   2. Call Sentry402 (screen or preflight depending on plugin config).
 *   3. block  → throw, do not transfer.
 *   4. warn   → call onEscalate handler if provided, else throw.
 *   5. allow  → forward to the existing TRANSFER_SOL action handler.
 *
 * The action is named SAFE_TRANSFER_SOL so the agent's character file can
 * instruct it: "Always use SAFE_TRANSFER_SOL when sending SOL or SPL tokens."
 *
 * This file deliberately does NOT depend on any specific @elizaos/core
 * version. It exposes a plain factory `createSafeTransferSolAction(opts)`
 * that returns an Action object matching the runtime's expected shape.
 * Pass it to runtime.registerAction in your plugin's init hook.
 */

import { Sentry402Client, decideAgentAction, type Sentry402ChainName } from "../client";

export type SafeTransferActionContext = {
  client: Sentry402Client;
  /**
   * Optional handler called when verdict === "warn". Typical implementation:
   * post a message to a human approval queue, return a Promise that resolves
   * to either "approved" (proceed) or "denied" (block).
   */
  onEscalate?: (args: {
    to: string;
    amountUsd?: number;
    chain: Sentry402ChainName;
    reason: string;
  }) => Promise<"approved" | "denied">;
  /**
   * Optional logger so the host runtime can record dossier ids alongside
   * the agent's audit trail. Defaults to console.
   */
  logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
};

type TransferIntent = { to: string; amountUsd?: number };

/**
 * Best-effort intent parser. The agent typically passes a structured payload
 * (action arg) but we also handle natural-language fallbacks like "send 50
 * USDC to 9xQy…". For the canonical case the plugin host should pre-parse.
 */
function parseTransferIntent(messageContent: unknown): TransferIntent | null {
  if (!messageContent) return null;
  if (typeof messageContent === "object") {
    const m = messageContent as { to?: string; toAddress?: string; amountUsd?: number; amount?: number };
    const to = m.to ?? m.toAddress;
    if (!to) return null;
    return { to, amountUsd: m.amountUsd ?? m.amount };
  }
  if (typeof messageContent === "string") {
    const addr = messageContent.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/);
    if (!addr) return null;
    const usd = messageContent.match(/\$?\s*([0-9][0-9.,]*)\s*(USDC?|USD|SOL)?/i);
    return {
      to: addr[0],
      amountUsd: usd ? Number(usd[1].replace(/,/g, "")) : undefined,
    };
  }
  return null;
}

/**
 * Generic Action shape. We do not import @elizaos/core directly so the
 * plugin works across ElizaOS minor versions.
 */
export interface ElizaAction {
  name: string;
  similes?: string[];
  description: string;
  validate: (runtime: unknown, message: { content: unknown }) => Promise<boolean>;
  handler: (
    runtime: unknown,
    message: { content: unknown },
    state?: unknown,
  ) => Promise<{
    text: string;
    metadata?: Record<string, unknown>;
  }>;
  examples?: unknown[];
}

export function createSafeTransferSolAction(
  ctx: SafeTransferActionContext,
): ElizaAction {
  const log = ctx.logger ?? console;
  return {
    name: "SAFE_TRANSFER_SOL",
    similes: ["SEND_SOL_SAFELY", "PRECHECKED_TRANSFER_SOL"],
    description:
      "Send SOL or SPL tokens from the agent's wallet, but ONLY after a Sentry402 pre-flight sanctions check returns allow. Always use this action instead of TRANSFER_SOL when sending funds.",
    validate: async (_runtime, message) => parseTransferIntent(message.content) !== null,
    handler: async (_runtime, message) => {
      const intent = parseTransferIntent(message.content);
      if (!intent) {
        return { text: "SAFE_TRANSFER_SOL: could not parse destination address." };
      }
      let response;
      try {
        response = await ctx.client.preflight({
          chain: "solana-mainnet",
          toAddress: intent.to,
          amountUsd: intent.amountUsd,
        });
      } catch (err) {
        log.error(`SAFE_TRANSFER_SOL: pre-flight failed: ${(err as Error).message}`);
        return {
          text: `Pre-flight check unavailable. Aborting transfer to protect against silent sanctions exposure. Retry once Sentry402 is reachable.`,
          metadata: { error: String(err), conservative_block: true },
        };
      }
      const decision = decideAgentAction(response);
      if (decision.shouldBlock) {
        log.warn(`SAFE_TRANSFER_SOL BLOCKED: ${response.reasoning}`);
        return {
          text: `Cannot send to ${intent.to}. ${decision.summary}`,
          metadata: {
            verdict: response.verdict,
            severity: response.severity,
            score: response.score,
            generation_id: response.metadata.generation_id,
            signals: response.signals.map((s) => s.type),
          },
        };
      }
      if (decision.shouldEscalate) {
        if (!ctx.onEscalate) {
          log.warn(
            `SAFE_TRANSFER_SOL WARN (no onEscalate handler — defaulting to block): ${response.reasoning}`,
          );
          return {
            text: `Transfer flagged for human review. ${decision.summary}`,
            metadata: {
              verdict: response.verdict,
              severity: response.severity,
              score: response.score,
              generation_id: response.metadata.generation_id,
            },
          };
        }
        const verdict = await ctx.onEscalate({
          to: intent.to,
          amountUsd: intent.amountUsd,
          chain: "solana-mainnet",
          reason: response.reasoning,
        });
        if (verdict === "denied") {
          return {
            text: `Human reviewer denied transfer to ${intent.to}.`,
            metadata: { verdict: "warn_denied", generation_id: response.metadata.generation_id },
          };
        }
      }
      // allow path — return the cleared intent so the host runtime can
      // forward to the native TRANSFER_SOL action.
      log.info(
        `SAFE_TRANSFER_SOL CLEARED: ${intent.to} score=${response.score} severity=${response.severity}`,
      );
      return {
        text: `Sentry402 cleared transfer to ${intent.to}. Proceeding.`,
        metadata: {
          verdict: response.verdict,
          severity: response.severity,
          score: response.score,
          generation_id: response.metadata.generation_id,
          rule_pack_version: response.metadata.rule_pack_version,
          forward_to: "TRANSFER_SOL",
          forward_args: intent,
        },
      };
    },
    examples: [
      [
        {
          user: "user1",
          content: { text: "Send 50 USDC to DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK" },
        },
        {
          user: "agent",
          content: {
            text: "Cannot send. Sentry402 blocked transfer: destination on active OFAC SDN list (DPRK SB0416 cluster).",
            action: "SAFE_TRANSFER_SOL",
          },
        },
      ],
    ],
  };
}
