/**
 * CHECK_DESTINATION — standalone action. Returns the Sentry402 verdict for
 * a destination address without forwarding anywhere. Useful when an agent
 * wants to discuss a wallet (e.g. "is this address safe to interact with?")
 * before a transfer is even drafted.
 */

import type { Sentry402ChainName } from "../client";
import { decideAgentAction } from "../client";
import type { ElizaAction, SafeTransferActionContext } from "./safe-transfer-sol";

function inferChainFromAddress(addr: string): Sentry402ChainName | null {
  if (/^0x[a-fA-F0-9]{40}$/.test(addr)) return "eth-mainnet";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return "solana-mainnet";
  return null;
}

export function createCheckDestinationAction(
  ctx: SafeTransferActionContext,
): ElizaAction {
  return {
    name: "CHECK_DESTINATION",
    similes: ["SCREEN_WALLET", "SANCTIONS_CHECK", "PREFLIGHT_CHECK"],
    description:
      "Screen a wallet address against the Sentry402 risk engine without sending any funds. Returns the verdict (allow / warn / block), severity, score, and cited signals. Use this when discussing or evaluating a counterparty before any transfer intent exists.",
    validate: async (_runtime, message) => {
      const txt = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
      return /0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}/.test(txt);
    },
    handler: async (_runtime, message) => {
      const txt = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
      const m = txt.match(/(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/);
      if (!m) return { text: "CHECK_DESTINATION: no address found in message." };
      const addr = m[1];
      const chain = inferChainFromAddress(addr);
      if (!chain) return { text: `CHECK_DESTINATION: cannot infer chain for ${addr}.` };
      try {
        const r = await ctx.client.preflight({ chain, toAddress: addr });
        const decision = decideAgentAction(r);
        const top = r.signals[0];
        const lines = [
          `Verdict: ${r.verdict.toUpperCase()} · severity ${r.severity} · score ${r.score}/100`,
          `${decision.summary}`,
          ...(top
            ? [
                `Top signal: ${top.type} (+${top.score_contribution})`,
                `${top.title}`,
                ...(top.fatf_reference ? [`Cite: ${top.fatf_reference}`] : []),
              ]
            : []),
          `Rule pack: ${r.metadata.rule_pack_version} · SDN list: ${r.metadata.sdn_list_version}`,
        ];
        return {
          text: lines.join("\n"),
          metadata: {
            verdict: r.verdict,
            severity: r.severity,
            score: r.score,
            generation_id: r.metadata.generation_id,
            address: addr,
            chain,
          },
        };
      } catch (err) {
        return { text: `CHECK_DESTINATION failed: ${(err as Error).message}` };
      }
    },
  };
}
