import type { Hex32, MerkleProof } from "@intelena/shielded-notes";

export type { Hex32, MerkleProof };

/** A shielded-pool deposit as seen on-chain (from `Deposit` events). */
export interface Deposit {
  commitment: Hex32;
  /** Address that called `deposit()`. The only identity a curator ever sees. */
  depositor: string;
  asset: string;
  amount: bigint;
  blockNumber: number;
  /** Unix seconds. */
  timestamp: number;
}

export interface Verdict {
  allow: boolean;
  /** Machine-readable rule id, e.g. `deny-list`, `min-age`, `screening:chainalysis`. */
  rule?: string;
  reason?: string;
}

/**
 * A rule decides whether one deposit may enter the set. Rules must be pure
 * functions of the deposit and the build context so a snapshot is reproducible
 * by anyone holding the same policy + inputs.
 */
export type Rule = (deposit: Deposit, ctx: BuildContext) => Verdict;

export interface BuildContext {
  /** Head block at build time — used for age rules. */
  headBlock: number;
  /** Unix seconds at build time. */
  now: number;
}

export interface Policy {
  id: string;
  version: number;
  description?: string;
  rules: Rule[];
}

export interface Exclusion {
  commitment: Hex32;
  rule: string;
  reason: string;
}

/**
 * Serializable, verifiable description of one published set. Anyone can
 * rebuild the tree from `leaves` and check `root`.
 */
export interface SetSnapshot {
  policyId: string;
  policyVersion: number;
  depth: number;
  root: Hex32;
  size: number;
  /** Deposit commitments in insertion (chain) order. */
  leaves: Hex32[];
  excluded: Exclusion[];
  headBlock: number;
  createdAt: number;
}

export interface SetDiff {
  added: Hex32[];
  removed: Hex32[];
  rootChanged: boolean;
}

/** What the innocence circuit sees. */
export interface InnocenceWitness {
  public: { setRoot: Hex32 };
  private: { origin: Hex32; merkleProof: MerkleProof };
}

export type InnocenceRejection = "UNKNOWN_SET_ROOT" | "INVALID_MEMBERSHIP_PROOF" | "ORIGIN_MISMATCH";
