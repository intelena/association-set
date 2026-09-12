import { describe, expect, it } from "vitest";
import { randomHex32 } from "@intelena/shielded-notes";
import {
  AssociationSet, RootRegistry, allowList, assets, buildInnocenceWitness, buildSet, checkInnocenceWitness,
  denyList, diffSets, maxAmount, minAge, screening, snapshotFromJson, snapshotToJson, verifyMembership,
  type Deposit, type Policy,
} from "../src/index.js";

function deposit(over: Partial<Deposit> = {}): Deposit {
  return {
    commitment: randomHex32(),
    depositor: "0xaaaa",
    asset: "USDG",
    amount: 100n,
    blockNumber: 100,
    timestamp: 1_700_000_000,
    ...over,
  };
}

const basePolicy: Policy = { id: "intelena-default", version: 1, rules: [denyList(["0xBAD"]), minAge(10)] };
const ctx = { context: { headBlock: 200, now: 1_700_000_500 } };

describe("buildSet", () => {
  it("admits clean deposits and excludes by rule with a reason", () => {
    const clean = deposit();
    const bad = deposit({ depositor: "0xbad" });
    const young = deposit({ blockNumber: 195 });
    const { set, excluded } = buildSet(basePolicy, [clean, bad, young], ctx);
    expect(set.size).toBe(1);
    expect(set.has(clean.commitment)).toBe(true);
    expect(excluded.map((e) => e.rule).sort()).toEqual(["deny-list", "min-age"]);
    expect(excluded.find((e) => e.commitment === bad.commitment)?.reason).toMatch(/0xbad/);
  });

  it("is deterministic and order-independent for the same inputs", () => {
    const ds = [deposit({ blockNumber: 50 }), deposit({ blockNumber: 60 }), deposit({ blockNumber: 70 })];
    const a = buildSet(basePolicy, ds, ctx).set;
    const b = buildSet(basePolicy, [...ds].reverse(), ctx).set;
    expect(a.root).toBe(b.root);
  });

  it("ignores duplicate commitments", () => {
    const d = deposit();
    expect(buildSet(basePolicy, [d, d], ctx).set.size).toBe(1);
  });

  it("supports allow-list, asset, amount and screening rules", () => {
    const policy: Policy = {
      id: "strict",
      version: 1,
      rules: [allowList(["0xaaaa"]), assets(["USDG"]), maxAmount({ USDG: 1_000n }), screening({ "0xaaaa": "mixer" }, "vendor")],
    };
    const r = buildSet(policy, [deposit(), deposit({ depositor: "0xcccc" }), deposit({ asset: "ETH" }), deposit({ amount: 5_000n })], ctx);
    // each deposit trips a different rule; first failing rule wins
    expect(r.set.size).toBe(0);
    expect(r.excluded.map((e) => e.rule).sort()).toEqual(["allow-list", "asset", "max-amount", "screening:vendor"]);
  });
});

describe("membership + snapshots", () => {
  it("proves membership only for admitted deposits and verifies against the root", () => {
    const ok = deposit();
    const bad = deposit({ depositor: "0xbad" });
    const { set } = buildSet(basePolicy, [ok, bad], ctx);
    const proof = set.proveMembership(ok.commitment)!;
    expect(proof).not.toBeNull();
    expect(verifyMembership(proof, set.root)).toBe(true);
    expect(verifyMembership(proof, randomHex32())).toBe(false);
    expect(set.proveMembership(bad.commitment)).toBeNull();
  });

  it("round-trips through JSON and rejects a tampered root", () => {
    const { set } = buildSet(basePolicy, [deposit(), deposit()], ctx);
    const json = snapshotToJson(set.snapshot());
    const rebuilt = AssociationSet.fromSnapshot(snapshotFromJson(json));
    expect(rebuilt.root).toBe(set.root);
    const tampered = { ...snapshotFromJson(json), root: randomHex32() };
    expect(() => AssociationSet.fromSnapshot(tampered)).toThrow(/root mismatch/);
  });

  it("diffs two snapshots", () => {
    const a = deposit({ blockNumber: 10 });
    const b = deposit({ blockNumber: 20 });
    const c = deposit({ blockNumber: 30 });
    const s1 = buildSet(basePolicy, [a, b], ctx).set.snapshot();
    const s2 = buildSet({ ...basePolicy, rules: [denyList([a.depositor === "0xaaaa" ? "0xnone" : ""]) ] }, [b, c], ctx).set.snapshot();
    const d = diffSets(s1, s2);
    expect(d.added).toEqual([c.commitment]);
    expect(d.removed).toEqual([a.commitment]);
    expect(d.rootChanged).toBe(true);
  });
});

describe("proof of innocence", () => {
  it("accepts a valid witness against a known root and rejects the rest", () => {
    const origin = deposit();
    const { set } = buildSet(basePolicy, [origin, deposit()], ctx);
    const registry = new RootRegistry(2);
    registry.publish(set.root);
    const w = buildInnocenceWitness(set, origin.commitment)!;
    expect(checkInnocenceWitness(w, registry.known())).toBeNull();
    expect(checkInnocenceWitness(w, [randomHex32()])).toBe("UNKNOWN_SET_ROOT");
    expect(checkInnocenceWitness({ ...w, private: { ...w.private, origin: randomHex32() } }, registry.known())).toBe("ORIGIN_MISMATCH");
    const forged = { ...w, private: { ...w.private, merkleProof: { ...w.private.merkleProof, siblings: w.private.merkleProof.siblings.map(() => randomHex32()) } } };
    expect(checkInnocenceWitness(forged, registry.known())).toBe("INVALID_MEMBERSHIP_PROOF");
  });

  it("excluded origins cannot build a witness; registry keeps only recent roots", () => {
    const bad = deposit({ depositor: "0xbad" });
    const { set } = buildSet(basePolicy, [bad, deposit()], ctx);
    expect(buildInnocenceWitness(set, bad.commitment)).toBeNull();
    const registry = new RootRegistry(2);
    const [r1, r2, r3] = [randomHex32(), randomHex32(), randomHex32()];
    registry.publish(r1); registry.publish(r2); registry.publish(r3);
    expect(registry.isKnown(r1)).toBe(false);
    expect(registry.isKnown(r3)).toBe(true);
    expect(registry.current).toBe(r3);
  });
});
