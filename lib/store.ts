/**
 * In-memory dossier cache.
 *
 * Hackathon-grade — sufficient for the demo flow (paste wallet → see dossier →
 * click export). Production would persist to Redis or a small KV table so
 * exports survive a server restart.
 *
 * Keys are dossier generation_id (already a ULID, collision-safe across reqs).
 */

import type { RiskDossier } from "./types";

const TTL_MS = 30 * 60 * 1000; // 30 minutes — long enough for a demo + export

type Entry = { dossier: RiskDossier; expires_at: number };

const cache = new Map<string, Entry>();

export function cacheDossier(d: RiskDossier): void {
  cache.set(d.metadata.generation_id, {
    dossier: d,
    expires_at: Date.now() + TTL_MS,
  });
  // Best-effort eviction. Keeps memory bounded over a long-running session.
  for (const [k, v] of cache.entries()) {
    if (v.expires_at < Date.now()) cache.delete(k);
  }
}

export function getCachedDossier(id: string): RiskDossier | null {
  const e = cache.get(id);
  if (!e) return null;
  if (e.expires_at < Date.now()) {
    cache.delete(id);
    return null;
  }
  return e.dossier;
}
