import { fromHex, hashFields, verifyProof } from "@intelena/shielded-notes";
import type { AssociationSet } from "./set.js";
import type { Hex32, InnocenceRejection, InnocenceWitness } from "./types.js";

/**
 * Proof of innocence, reference model.
 *
 * Every note carries an `origin`: the commitment of the deposit it descends
 * from (outputs of a spend inherit the input's origin — see SPEC §3). A spend
 * additionally proves `origin ∈ set(root)` without revealing which leaf.
 */
export function buildInnocenceWitness(set: AssociationSet, origin: Hex32): InnocenceWitness | null {
  const merkleProof = set.proveMembership(origin);
  if (!merkleProof) return null;
  return { public: { setRoot: set.root }, private: { origin, merkleProof } };
}

/**
 * The innocence circuit's constraints, evaluated in the clear.
 * `knownRoots` is what the verifier contract accepts (current + recent sets).
 */
export function checkInnocenceWitness(witness: InnocenceWitness, knownRoots: Iterable<Hex32>): InnocenceRejection | null {
  const { setRoot } = witness.public;
  const { origin, merkleProof } = witness.private;
  if (![...knownRoots].includes(setRoot)) return "UNKNOWN_SET_ROOT";
  if (merkleProof.leaf !== origin) return "ORIGIN_MISMATCH";
  if (merkleProof.root !== setRoot || !verifyProof(merkleProof)) return "INVALID_MEMBERSHIP_PROOF";
  return null;
}

/**
 * Tracks which set roots a verifier accepts. Sets are re-published as new
 * deposits age in; keeping the last N roots means a proof built against
 * yesterday's set still verifies today.
 */
export class RootRegistry {
  private readonly roots: Hex32[] = [];
  constructor(private readonly history = 8) {}

  publish(root: Hex32): void {
    this.roots.push(root);
    while (this.roots.length > this.history) this.roots.shift();
  }

  get current(): Hex32 | undefined {
    return this.roots.at(-1);
  }

  isKnown(root: Hex32): boolean {
    return this.roots.includes(root);
  }

  known(): Hex32[] {
    return [...this.roots];
  }
}

/**
 * Short, display-safe id for a proof of innocence, matching the `poi_…` ids
 * the Intelena dapp shows in the Proofs tab: derived from the set root and the
 * origin so the same proof always gets the same id, without leaking either.
 */
export function innocenceProofId(witness: InnocenceWitness): string {
  const material = fromHex(witness.public.setRoot);
  const origin = fromHex(witness.private.origin);
  const digest = hashFields("intelena/poi-id", [material, origin]);
  return `poi_${digest.slice(2, 14)}`;
}
