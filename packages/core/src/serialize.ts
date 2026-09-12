import type { Deposit, SetSnapshot } from "./types.js";

export function snapshotToJson(snapshot: SetSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function snapshotFromJson(json: string): SetSnapshot {
  const raw = JSON.parse(json) as SetSnapshot;
  if (typeof raw.root !== "string" || !Array.isArray(raw.leaves)) throw new TypeError("not a snapshot");
  return raw;
}

interface RawDeposit {
  commitment: string;
  depositor: string;
  asset: string;
  amount: string | number;
  blockNumber: number;
  timestamp: number;
}

export function depositsFromJson(json: string): Deposit[] {
  const raw = JSON.parse(json) as RawDeposit[];
  if (!Array.isArray(raw)) throw new TypeError("deposits must be an array");
  return raw.map((d) => ({
    commitment: d.commitment as Deposit["commitment"],
    depositor: d.depositor,
    asset: d.asset,
    amount: BigInt(d.amount),
    blockNumber: d.blockNumber,
    timestamp: d.timestamp,
  }));
}
