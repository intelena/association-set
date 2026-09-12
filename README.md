# association-set

Tooling for **proof-of-innocence association sets**: turn a list of shielded-pool deposits plus a policy into a reproducible Merkle set, publish verifiable snapshots, prove membership, diff revisions. Companion to [`shielded-notes`](https://github.com/intelena/shielded-notes).

> Status: design reference. The membership check is modelled in TypeScript (`checkInnocenceWitness`); the circuit reuses `MerkleInclusion` from `shielded-notes/circuits`.

```
packages/core   @intelena/association-set — rules, buildSet, AssociationSet, snapshots, innocence witness
packages/cli    association-set build | verify | prove | diff
examples/       curate.mjs
SPEC.md         the normative spec
```

## Curate a set

```ts
import { buildSet, denyList, minAge, screening } from "@intelena/association-set";

const policy = {
  id: "intelena-default", version: 3,
  rules: [denyList(sanctioned, "ofac-sdn"), screening(vendorFlags, "vendor"), minAge(20)],
};
const { set, excluded } = buildSet(policy, depositsFromChain, { context: { headBlock } });

set.root          // publish this
set.snapshot()    // JSON anyone can rebuild + verify
excluded          // [{ commitment, rule: "ofac-sdn", reason: "..." }]
```

Rules are pure functions of `(deposit, { headBlock, now })`, so the same policy + deposits always yields the same root. Publishing a snapshot is publishing a claim anyone can check:

```bash
association-set build  --deposits deposits.json --policy policy.json --head 1234567 --out set.json
association-set verify set.json            # rebuilds the tree, fails on a forged root
association-set prove  set.json 0xabc…     # Merkle path, or "not a member"
association-set diff   v2.json v3.json     # +added -removed
```

## Prove innocence

```ts
import { buildInnocenceWitness, checkInnocenceWitness, RootRegistry } from "@intelena/association-set";

const registry = new RootRegistry(8);       // verifier accepts the last 8 published roots
registry.publish(set.root);

const witness = buildInnocenceWitness(set, note.origin);      // null if the origin was excluded
checkInnocenceWitness(witness, registry.known());             // null = ok, else a typed rejection
```

The verifier learns only that the note's origin deposit is *one of* `set.size` admitted deposits.

## Built-in rules

| Rule | Excludes |
|---|---|
| `denyList(addresses, source?)` | depositors on a list (sanctions, exploiters) |
| `allowList(addresses)` | everyone not on a list (KYC'd / institutional sets) |
| `minAge(blocks)` | deposits too young to have been screened |
| `maxAmount({ asset: cap })` | oversized single deposits |
| `assets([...])` | assets outside the set's scope |
| `screening(flagged, provider)` | depositors flagged by a pre-fetched vendor result |
| `custom(id, predicate)` | anything else |

## Properties covered by tests

- deterministic, order-independent builds; duplicates ignored; first failing rule wins with a reason
- membership proofs only for admitted deposits; verify against the root, fail against any other
- snapshots round-trip through JSON; a tampered root is rejected on load
- diffs report added/removed leaves; innocence witness rejects unknown roots, wrong origins, forged paths
- CLI: build → verify → prove → diff, tampered snapshot fails verify

## Develop

```bash
pnpm install && pnpm build && pnpm test && node examples/curate.mjs
```

`@intelena/shielded-notes` is consumed via `file:../../../shielded-notes/packages/core` until it is on npm — clone both repos as siblings (CI does the same).

MIT © Intelena
