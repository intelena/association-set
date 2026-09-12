import { IncrementalMerkleTree, isHex32, verifyProof, type MerkleProof } from "@intelena/shielded-notes";
import type { BuildContext, Deposit, Exclusion, Hex32, Policy, SetDiff, SetSnapshot } from "./types.js";

export const DEFAULT_SET_DEPTH = 20;

export interface BuildOptions {
  depth?: number;
  context?: Partial<BuildContext>;
}

export interface BuildResult {
  set: AssociationSet;
  excluded: Exclusion[];
}

/**
 * An immutable, published association set: a Merkle tree over the deposit
 * commitments a policy admitted. Spenders prove membership of their note's
 * origin deposit; verifiers only need `root`.
 */
export class AssociationSet {
  readonly tree: IncrementalMerkleTree;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly excluded: readonly Exclusion[];
  readonly headBlock: number;
  readonly createdAt: number;
  private readonly index = new Map<Hex32, number>();

  constructor(params: {
    leaves: Hex32[];
    depth: number;
    policyId: string;
    policyVersion: number;
    excluded: Exclusion[];
    headBlock: number;
    createdAt: number;
  }) {
    this.tree = new IncrementalMerkleTree(params.depth);
    for (const leaf of params.leaves) {
      if (!isHex32(leaf)) throw new TypeError(`invalid leaf ${leaf}`);
      if (this.index.has(leaf)) throw new Error(`duplicate leaf ${leaf}`);
      this.index.set(leaf, this.tree.insert(leaf));
    }
    this.policyId = params.policyId;
    this.policyVersion = params.policyVersion;
    this.excluded = params.excluded;
    this.headBlock = params.headBlock;
    this.createdAt = params.createdAt;
  }

  get root(): Hex32 {
    return this.tree.root;
  }

  get size(): number {
    return this.tree.size;
  }

  has(commitment: Hex32): boolean {
    return this.index.has(commitment);
  }

  /** Membership proof for a deposit commitment, or `null` if it was not admitted. */
  proveMembership(commitment: Hex32): MerkleProof | null {
    const i = this.index.get(commitment);
    return i === undefined ? null : this.tree.proof(i);
  }

  snapshot(): SetSnapshot {
    const leaves: Hex32[] = [];
    for (let i = 0; i < this.tree.size; i++) leaves.push(this.tree.leafAt(i)!);
    return {
      policyId: this.policyId,
      policyVersion: this.policyVersion,
      depth: this.tree.depth,
      root: this.root,
      size: this.size,
      leaves,
      excluded: [...this.excluded],
      headBlock: this.headBlock,
      createdAt: this.createdAt,
    };
  }

  /** Rebuild from a snapshot and check that the claimed root matches. */
  static fromSnapshot(snapshot: SetSnapshot): AssociationSet {
    const set = new AssociationSet({
      leaves: snapshot.leaves,
      depth: snapshot.depth,
      policyId: snapshot.policyId,
      policyVersion: snapshot.policyVersion,
      excluded: snapshot.excluded,
      headBlock: snapshot.headBlock,
      createdAt: snapshot.createdAt,
    });
    if (set.root !== snapshot.root) throw new Error(`snapshot root mismatch: claimed ${snapshot.root}, rebuilt ${set.root}`);
    if (set.size !== snapshot.size) throw new Error("snapshot size mismatch");
    return set;
  }
}

/**
 * Apply a policy to deposits (in chain order) and build the set.
 * Deterministic: same policy + deposits + context ⇒ same root.
 */
export function buildSet(policy: Policy, deposits: Iterable<Deposit>, options: BuildOptions = {}): BuildResult {
  const list = [...deposits].sort((a, b) => a.blockNumber - b.blockNumber || a.commitment.localeCompare(b.commitment));
  const ctx: BuildContext = {
    headBlock: options.context?.headBlock ?? (list.at(-1)?.blockNumber ?? 0),
    now: options.context?.now ?? Math.floor(Date.now() / 1000),
  };
  const leaves: Hex32[] = [];
  const excluded: Exclusion[] = [];
  const seen = new Set<Hex32>();
  for (const d of list) {
    if (seen.has(d.commitment)) continue;
    seen.add(d.commitment);
    const verdict = evaluate(policy, d, ctx);
    if (verdict.allow) leaves.push(d.commitment);
    else excluded.push({ commitment: d.commitment, rule: verdict.rule ?? "unknown", reason: verdict.reason ?? "" });
  }
  const set = new AssociationSet({
    leaves,
    depth: options.depth ?? DEFAULT_SET_DEPTH,
    policyId: policy.id,
    policyVersion: policy.version,
    excluded,
    headBlock: ctx.headBlock,
    createdAt: ctx.now,
  });
  return { set, excluded };
}

/** First failing rule wins; rules run in policy order. */
export function evaluate(policy: Policy, deposit: Deposit, ctx: BuildContext) {
  for (const rule of policy.rules) {
    const v = rule(deposit, ctx);
    if (!v.allow) return v;
  }
  return { allow: true } as const;
}

export function diffSets(before: SetSnapshot, after: SetSnapshot): SetDiff {
  const b = new Set(before.leaves);
  const a = new Set(after.leaves);
  return {
    added: after.leaves.filter((l) => !b.has(l)),
    removed: before.leaves.filter((l) => !a.has(l)),
    rootChanged: before.root !== after.root,
  };
}

export function verifyMembership(proof: MerkleProof, root: Hex32): boolean {
  return proof.root === root && verifyProof(proof);
}
