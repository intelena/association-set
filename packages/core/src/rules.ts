import type { Deposit, Rule, Verdict } from "./types.js";

const ALLOW: Verdict = { allow: true };

function norm(address: string): string {
  return address.trim().toLowerCase();
}

/** Exclude deposits from any listed address (sanctions lists, known exploiters). */
export function denyList(addresses: Iterable<string>, source = "deny-list"): Rule {
  const set = new Set([...addresses].map(norm));
  return (d) =>
    set.has(norm(d.depositor)) ? { allow: false, rule: source, reason: `depositor ${d.depositor} is on ${source}` } : ALLOW;
}

/** Only admit deposits from listed addresses (KYC'd pools, institutional sets). */
export function allowList(addresses: Iterable<string>, source = "allow-list"): Rule {
  const set = new Set([...addresses].map(norm));
  return (d) =>
    set.has(norm(d.depositor)) ? ALLOW : { allow: false, rule: source, reason: `depositor ${d.depositor} is not on ${source}` };
}

/** Deposits must be at least `blocks` old — gives screening providers time to flag. */
export function minAge(blocks: number): Rule {
  return (d, ctx) =>
    ctx.headBlock - d.blockNumber >= blocks
      ? ALLOW
      : { allow: false, rule: "min-age", reason: `deposit is ${ctx.headBlock - d.blockNumber} blocks old, need ${blocks}` };
}

/** Cap per-deposit size (large single deposits are the usual laundering pattern). */
export function maxAmount(limits: Record<string, bigint>): Rule {
  return (d) => {
    const cap = limits[d.asset];
    if (cap === undefined || d.amount <= cap) return ALLOW;
    return { allow: false, rule: "max-amount", reason: `${d.amount} ${d.asset} exceeds cap ${cap}` };
  };
}

/** Restrict the set to specific assets. */
export function assets(allowed: Iterable<string>): Rule {
  const set = new Set([...allowed].map(norm));
  return (d) => (set.has(norm(d.asset)) ? ALLOW : { allow: false, rule: "asset", reason: `${d.asset} not admitted` });
}

/**
 * Adapter for an external screening result that was fetched *before* the
 * build (keeps rules pure). `flagged` maps depositor → label.
 */
export function screening(flagged: Record<string, string>, provider: string): Rule {
  const map = new Map(Object.entries(flagged).map(([k, v]) => [norm(k), v]));
  return (d) => {
    const label = map.get(norm(d.depositor));
    return label === undefined
      ? ALLOW
      : { allow: false, rule: `screening:${provider}`, reason: `${provider} flagged ${d.depositor}: ${label}` };
  };
}

/** Wrap any predicate. */
export function custom(id: string, predicate: (d: Deposit) => boolean, reason = "custom rule"): Rule {
  return (d) => (predicate(d) ? ALLOW : { allow: false, rule: id, reason });
}
