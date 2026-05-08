/**
 * @sentry402/eliza-plugin — entry point.
 *
 * Drop into an ElizaOS agent's plugin list. The agent gains:
 *
 *   • SAFE_TRANSFER_SOL          — pre-flight check before SOL/SPL transfers
 *   • SAFE_TRANSFER_ETH          — pre-flight check before ETH transfers
 *   • SAFE_TRANSFER_BASE         — pre-flight check before Base transfers
 *   • SAFE_TRANSFER_MATIC        — pre-flight check before Polygon transfers
 *   • SAFE_TRANSFER_ARBITRUM     — pre-flight check before Arbitrum transfers
 *   • SAFE_TRANSFER_OPTIMISM     — pre-flight check before Optimism transfers
 *   • SAFE_TRANSFER_BSC          — pre-flight check before BNB Chain transfers
 *   • CHECK_DESTINATION          — standalone check that returns the verdict
 *
 * Each action calls Sentry402's /api/screen (free) or /api/preflight (x402,
 * $0.02 USDC). The plugin chooses based on configuration.
 *
 * Usage in an ElizaOS agent character:
 *
 *   {
 *     "name": "MyAgent",
 *     "plugins": [
 *       ["@sentry402/eliza-plugin", {
 *         "apiUrl": "https://sentry402.vercel.app",
 *         "mode": "screen"
 *       }]
 *     ],
 *     "system": "Always use SAFE_TRANSFER_* actions instead of TRANSFER_*."
 *   }
 *
 * For production paid mode the host wires `signX402Payment` to the agent's
 * wallet provider.
 */

import { Sentry402Client, type Sentry402ClientOptions } from "./client.js";
import {
  createSafeTransferSolAction,
  type SafeTransferActionContext,
  type ElizaAction,
} from "./actions/safe-transfer-sol.js";
import { createSafeTransferEvmAction } from "./actions/safe-transfer-evm.js";
import { createCheckDestinationAction } from "./actions/check-destination.js";

export type Sentry402PluginOptions = Sentry402ClientOptions & {
  /**
   * Optional callback for verdict==="warn" cases. Implement this in the
   * host runtime to route to a human approval queue, Slack, Telegram, etc.
   */
  onEscalate?: SafeTransferActionContext["onEscalate"];
  /**
   * Restrict which chains this plugin registers actions for. Default: all
   * supported chains. Useful if the host agent only operates on Solana.
   */
  chains?: Array<
    | "solana-mainnet"
    | "eth-mainnet"
    | "base-mainnet"
    | "matic-mainnet"
    | "bsc-mainnet"
    | "arbitrum-mainnet"
    | "optimism-mainnet"
  >;
  /** Optional logger override — same shape as ElizaOS's elizaLogger. */
  logger?: SafeTransferActionContext["logger"];
};

const DEFAULT_CHAINS: NonNullable<Sentry402PluginOptions["chains"]> = [
  "solana-mainnet",
  "eth-mainnet",
  "base-mainnet",
  "matic-mainnet",
  "bsc-mainnet",
  "arbitrum-mainnet",
  "optimism-mainnet",
];

/**
 * Plugin descriptor. Compatible with ElizaOS plugin loader (returns
 * { name, description, actions, providers, evaluators }). Plugin loader
 * code is unaware of @elizaos/core types so we keep the descriptor's
 * shape minimal and untyped against core.
 */
export type Sentry402Plugin = {
  name: string;
  description: string;
  actions: ElizaAction[];
  providers?: unknown[];
  evaluators?: unknown[];
};

export function sentry402Plugin(opts: Sentry402PluginOptions = {}): Sentry402Plugin {
  const client = new Sentry402Client(opts);
  const ctx: SafeTransferActionContext = {
    client,
    onEscalate: opts.onEscalate,
    logger: opts.logger,
  };
  const chains = opts.chains ?? DEFAULT_CHAINS;

  const actions: ElizaAction[] = [];
  if (chains.includes("solana-mainnet")) {
    actions.push(createSafeTransferSolAction(ctx));
  }
  for (const chain of chains) {
    if (chain === "solana-mainnet") continue;
    actions.push(createSafeTransferEvmAction(chain, ctx));
  }
  actions.push(createCheckDestinationAction(ctx));

  return {
    name: "sentry402",
    description:
      "Pre-flight sanctions firewall for AI agents. Wraps every transfer with a $0.02 x402 call to Sentry402, which screens the destination against OFAC SDN, DPRK clusters (SB0416), Lazarus, mixer proximity, drainer patterns, and 11 more cited rules. Citation-bound output: every flag links to a specific GoldRush or Helius API call so a compliance officer can attach the JSON to a SAR exhibit.",
    actions,
    providers: [],
    evaluators: [],
  };
}

// Default export for `import sentry402Plugin from '@sentry402/eliza-plugin'`
export default sentry402Plugin;

// Re-export client for advanced users who want direct access
export { Sentry402Client, decideAgentAction } from "./client.js";
export type {
  Sentry402Response,
  Sentry402Signal,
  Sentry402ChainName,
  Verdict,
  Severity,
} from "./client.js";
export type { ElizaAction, SafeTransferActionContext } from "./actions/safe-transfer-sol.js";
