/**
 * SAFE_TRANSFER_EVM — same logic as SAFE_TRANSFER_SOL but for EVM chains.
 * Plugin host passes the chain at construction time so a single agent can
 * register one action per chain it operates on.
 */

import {
  Sentry402Client,
  decideAgentAction,
  type Sentry402ChainName,
} from "../client.js";
import type { ElizaAction, SafeTransferActionContext } from "./safe-transfer-sol.js";

type EvmChain = Exclude<Sentry402ChainName, "solana-mainnet">;

type TransferIntent = { to: string; amountUsd?: number };

function parseEvmIntent(messageContent: unknown): TransferIntent | null {
  if (!messageContent) return null;
  if (typeof messageContent === "object") {
    const m = messageContent as { to?: string; toAddress?: string; amountUsd?: number; amount?: number };
    const to = m.to ?? m.toAddress;
    if (!to) return null;
    return { to, amountUsd: m.amountUsd ?? m.amount };
  }
  if (typeof messageContent === "string") {
    const addr = messageContent.match(/0x[a-fA-F0-9]{40}/);
    if (!addr) return null;
    const usd = messageContent.match(/\$?\s*([0-9][0-9.,]*)\s*(USDC?|USDT|USD|ETH)?/i);
    return {
      to: addr[0],
      amountUsd: usd ? Number(usd[1].replace(/,/g, "")) : undefined,
    };
  }
  return null;
}

export function createSafeTransferEvmAction(
  chain: EvmChain,
  ctx: SafeTransferActionContext,
): ElizaAction {
  const log = ctx.logger ?? console;
  const upper = chain.replace("-mainnet", "").toUpperCase();
  return {
    name: `SAFE_TRANSFER_${upper}`,
    similes: [`SEND_${upper}_SAFELY`, `PRECHECKED_TRANSFER_${upper}`],
    description: `Send tokens on ${chain} from the agent's wallet, but ONLY after a Sentry402 pre-flight sanctions check returns allow. Always use this action instead of TRANSFER_${upper} when sending funds.`,
    validate: async (_runtime, message) => parseEvmIntent(message.content) !== null,
    handler: async (_runtime, message) => {
      const intent = parseEvmIntent(message.content);
      if (!intent) {
        return { text: `SAFE_TRANSFER_${upper}: could not parse destination address.` };
      }
      let response;
      try {
        response = await ctx.client.preflight({
          chain,
          toAddress: intent.to,
          amountUsd: intent.amountUsd,
        });
      } catch (err) {
        log.error(`SAFE_TRANSFER_${upper}: pre-flight failed: ${(err as Error).message}`);
        return {
          text: `Pre-flight check unavailable. Aborting transfer.`,
          metadata: { error: String(err), conservative_block: true },
        };
      }
      const decision = decideAgentAction(response);
      if (decision.shouldBlock) {
        log.warn(`SAFE_TRANSFER_${upper} BLOCKED: ${response.reasoning}`);
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
          return {
            text: `Transfer flagged for human review. ${decision.summary}`,
            metadata: { verdict: response.verdict, generation_id: response.metadata.generation_id },
          };
        }
        const v = await ctx.onEscalate({
          to: intent.to,
          amountUsd: intent.amountUsd,
          chain,
          reason: response.reasoning,
        });
        if (v === "denied") {
          return {
            text: `Human reviewer denied transfer to ${intent.to}.`,
            metadata: { verdict: "warn_denied", generation_id: response.metadata.generation_id },
          };
        }
      }
      log.info(
        `SAFE_TRANSFER_${upper} CLEARED: ${intent.to} score=${response.score} severity=${response.severity}`,
      );
      return {
        text: `Sentry402 cleared transfer to ${intent.to}. Proceeding.`,
        metadata: {
          verdict: response.verdict,
          severity: response.severity,
          score: response.score,
          generation_id: response.metadata.generation_id,
          rule_pack_version: response.metadata.rule_pack_version,
          forward_to: `TRANSFER_${upper}`,
          forward_args: intent,
        },
      };
    },
  };
}
