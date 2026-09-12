# Association sets — specification v0.1

How Intelena curates the deposit set that every spend proves membership in ("proof of innocence"). Implemented by `packages/core`; the membership circuit reuses `MerkleInclusion` from [`shielded-notes`](https://github.com/intelena/shielded-notes).

## 1. Inputs

Deposits are read from the pool's `Deposit(commitment, index, amount)` events plus the transaction sender: `(commitment, depositor, asset, amount, blockNumber, timestamp)`. **The depositor address is the only identity a curator sees** — never a note, balance, or later activity.

## 2. Policy

A policy is `(id, version, rules[])`. A rule is a **pure** function `(deposit, ctx) → { allow, rule?, reason? }` where `ctx = { headBlock, now }`. Rules run in order; the first refusal wins and is recorded as an *exclusion* `(commitment, rule, reason)`. Because rules are pure, any party with the same policy, deposit list and context rebuilds the identical set — publishing a set is publishing a claim anyone can audit.

Built-in rules: `denyList`, `allowList`, `minAge(blocks)`, `maxAmount({asset: cap})`, `assets([...])`, `screening(flaggedMap, provider)` (results fetched *before* the build), `custom`.

## 3. Set

Admitted commitments are inserted in chain order (`blockNumber`, then commitment) into an incremental Merkle tree of depth 20 with the same hash and zero values as the pool tree. A **snapshot** is:

```
{ policyId, policyVersion, depth, root, size, leaves[], excluded[], headBlock, createdAt }
```

`AssociationSet.fromSnapshot` rebuilds the tree and **rejects a snapshot whose `root` or `size` does not match its leaves** — a snapshot cannot lie about what it contains.

### Origin labels

Each note carries an `origin`: the commitment of the deposit it descends from. Outputs of a spend inherit the input's origin (multi-input spends produce one output per distinct origin, or require all inputs to share one). The origin is private note data; it never appears on-chain.

## 4. Proof of innocence

Public: `setRoot`. Private: `origin`, Merkle path.
Constraints (`checkInnocenceWitness`):
1. `setRoot` ∈ roots accepted by the verifier — `UNKNOWN_SET_ROOT`
2. `merkleProof.leaf = origin` — `ORIGIN_MISMATCH`
3. path recomputes to `setRoot` — `INVALID_MEMBERSHIP_PROOF`

The spend circuit binds `origin` to the note being spent (it is a note field), so a spender cannot borrow someone else's origin. The verifier learns only that the origin is *one of* `size` admitted deposits.

## 5. Root registry

Sets are re-published as deposits age past `minAge` or lists change. The verifier accepts the last *N* roots (`RootRegistry`, default 8) so a proof built against a recent snapshot still verifies. Removing a deposit from the set (e.g. a new sanction) takes effect for new proofs once the old roots expire from the registry.

## 6. What this does not do

Decide *which* lists are legitimate — that is the operator's policy, published as `policyId@version` alongside every snapshot. Nor does it reveal anything about a proving user beyond "their funds entered through an admitted deposit".
