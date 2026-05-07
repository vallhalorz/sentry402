/**
 * OFAC SDN list loader.
 *
 * For the hackathon MVP we ship a small static seed list of well-known
 * sanctioned-or-historically-flagged addresses (Lazarus clusters, Tornado Cash
 * legacy contracts, North Korean IT-worker clusters that ZachXBT documented).
 * Production would refresh from https://www.treasury.gov/ofac/downloads/sdn.csv
 * on a daily cron and version the snapshot.
 *
 * IMPORTANT: Tornado Cash was DELISTED from OFAC SDN on 2025-03-21, with the
 * Texas Federal Court permanently enjoining re-listing on 2025-04-29. We
 * therefore separate "active SDN" from "historic concern" — a wallet hit on a
 * historic-concern address is informational, not a sanctions match.
 */

export type SdnEntry = {
  address: string; // lowercased
  category:
    | "ofac_sdn_active"
    | "tornado_cash_historic"
    | "lazarus_cluster"
    | "drainer_known"
    | "mixer_known";
  label: string;
  source: string;
  added_at: string; // ISO date this entry was last verified
};

// Lowercased EVM addresses. Solana addresses should be added under their own
// case-sensitive base58 form (we do not lowercase those at lookup time).
export const SDN_ENTRIES: SdnEntry[] = [
  // ===== ACTIVE OFAC SDN — DPRK IT-worker designations 2026-03-12 =====
  // Source: U.S. Treasury press release SB0416 (https://home.treasury.gov/news/press-releases/sb0416)
  // Reproduced via Chainalysis blog 2026-03-12.
  // Amnokgang Technology Development Company — DPRK IT-worker delegation manager
  {
    address: "0xcb74874f1e06fcf80a306e06e5379a44b488ba2d",
    category: "ofac_sdn_active",
    label: "Amnokgang Technology Development Company (DPRK)",
    source: "OFAC SDN 2026-03-12, Treasury SB0416",
    added_at: "2026-03-12",
  },
  {
    address: "0x0330070fd38ec3bb94f58fa55d40368271e9e54a",
    category: "ofac_sdn_active",
    label: "Amnokgang Technology Development Company (DPRK)",
    source: "OFAC SDN 2026-03-12, Treasury SB0416",
    added_at: "2026-03-12",
  },
  {
    address: "0x9be599d7867f5e1a2d7ec6db9710df2b98a15573",
    category: "ofac_sdn_active",
    label: "Amnokgang Technology Development Company (DPRK)",
    source: "OFAC SDN 2026-03-12, Treasury SB0416",
    added_at: "2026-03-12",
  },
  // Yun Song Guk — DPRK IT-worker lead operating from Boten, Laos
  {
    address: "0xb637f84b66876ebf609c2a4208905f9ddac9d075",
    category: "ofac_sdn_active",
    label: "Yun Song Guk (DPRK IT-worker lead, Laos)",
    source: "OFAC SDN 2026-03-12, Treasury SB0416",
    added_at: "2026-03-12",
  },
  {
    address: "0x95584c303fcd48af5c6b9873015f2ad0ca84eae3",
    category: "ofac_sdn_active",
    label: "Yun Song Guk (DPRK IT-worker lead, Laos)",
    source: "OFAC SDN 2026-03-12, Treasury SB0416",
    added_at: "2026-03-12",
  },
  // Sim Hyon Sop — China-based KKBC representative; new addresses added 2026-03-12
  {
    address: "0xd04e33461fea8302c5e1e13895b60cee8aefda7f",
    category: "ofac_sdn_active",
    label: "Sim Hyon Sop (KKBC rep, DPRK)",
    source: "OFAC SDN 2026-03-12 update, Treasury SB0416",
    added_at: "2026-03-12",
  },
  {
    address: "0x76ea76ca4eb727f18956ab93445a94c5280412b9",
    category: "ofac_sdn_active",
    label: "Sim Hyon Sop (KKBC rep, DPRK)",
    source: "OFAC SDN 2026-03-12 update, Treasury SB0416",
    added_at: "2026-03-12",
  },
  {
    address: "0xfb3eff152ea55d1bfa04dbdd509a80fd7b72cdeb",
    category: "ofac_sdn_active",
    label: "Sim Hyon Sop (KKBC rep, DPRK)",
    source: "OFAC SDN 2026-03-12 update, Treasury SB0416",
    added_at: "2026-03-12",
  },
  {
    address: "0xfda1ec4a6178d4916b001a065422d31ebe5f62ff",
    category: "ofac_sdn_active",
    label: "Sim Hyon Sop (KKBC rep, DPRK)",
    source: "OFAC SDN 2026-03-12 update, Treasury SB0416",
    added_at: "2026-03-12",
  },
  {
    address: "0x747afb5c7a7fc34b547cd0fdebf9b91759c5a52b",
    category: "ofac_sdn_active",
    label: "Sim Hyon Sop (KKBC rep, DPRK)",
    source: "OFAC SDN 2026-03-12 update, Treasury SB0416",
    added_at: "2026-03-12",
  },
  // Lazarus Group cluster (ByBit Feb 2025 hack — $1.46B)
  {
    address: "0x47666fab8bd0ac7003bce3f5c3585383f09486e2",
    category: "lazarus_cluster",
    label: "Lazarus Group (ByBit hack 2025-02 cluster)",
    source: "FATF Targeted Update June 2025",
    added_at: "2025-02-22",
  },
  // ===== HISTORIC CONCERN — Tornado Cash =====
  // Delisted 2025-03-21; Texas Federal Court permanently enjoined re-listing
  // 2025-04-29. Treat as informational, NOT an active sanctions hit.
  {
    address: "0x8589427373d6d84e98730d7795d8f6f8731fda16",
    category: "tornado_cash_historic",
    label: "Tornado Cash 0.1 ETH (historic — delisted 2025-03-21)",
    source: "Chainalysis published address list",
    added_at: "2025-03-21",
  },
  {
    address: "0x722122df12d4e14e13ac3b6895a86e84145b6967",
    category: "tornado_cash_historic",
    label: "Tornado Cash Router (historic — delisted 2025-03-21)",
    source: "Chainalysis published address list",
    added_at: "2025-03-21",
  },
  {
    address: "0xdd4c48c0b24039969fc16d1cdf626eab821d3384",
    category: "tornado_cash_historic",
    label: "Tornado Cash 1 ETH (historic — delisted 2025-03-21)",
    source: "Chainalysis published address list",
    added_at: "2025-03-21",
  },
];

export const SDN_LIST_VERSION = "2026-05-07-dprk-mar2026";

const lowerSet = new Set(
  SDN_ENTRIES.filter((e) => /^0x/.test(e.address)).map((e) => e.address.toLowerCase()),
);

export function isSdnAddress(address: string): SdnEntry | null {
  const norm = /^0x/.test(address) ? address.toLowerCase() : address;
  if (!lowerSet.has(norm) && !SDN_ENTRIES.some((e) => e.address === norm)) {
    return null;
  }
  return SDN_ENTRIES.find((e) =>
    e.address === norm || e.address.toLowerCase() === norm,
  ) ?? null;
}

export function isActiveSanctions(entry: SdnEntry | null): boolean {
  if (!entry) return false;
  return entry.category === "ofac_sdn_active" || entry.category === "lazarus_cluster";
}

export function isHistoricConcern(entry: SdnEntry | null): boolean {
  if (!entry) return false;
  return entry.category === "tornado_cash_historic" || entry.category === "mixer_known";
}
