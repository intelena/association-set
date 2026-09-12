// Curate a set from mock deposits, prove innocence for one, reject another.
// Run: pnpm build && node examples/curate.mjs
import { randomHex32 } from "@intelena/shielded-notes";
import { buildSet, denyList, minAge, buildInnocenceWitness, checkInnocenceWitness, RootRegistry } from "@intelena/association-set";

const deposits = [
  { commitment: randomHex32(), depositor: "0xalice", asset: "USDG", amount: 1_000n, blockNumber: 100, timestamp: 1 },
  { commitment: randomHex32(), depositor: "0xexploiter", asset: "USDG", amount: 900_000n, blockNumber: 101, timestamp: 2 },
  { commitment: randomHex32(), depositor: "0xbob", asset: "USDG", amount: 250n, blockNumber: 198, timestamp: 3 },
];
const policy = { id: "intelena-default", version: 1, rules: [denyList(["0xexploiter"], "ofac-sdn"), minAge(20)] };

const { set, excluded } = buildSet(policy, deposits, { context: { headBlock: 200 } });
console.log("root", set.root, "admitted", set.size);
console.table(excluded);

const registry = new RootRegistry();
registry.publish(set.root);

const w = buildInnocenceWitness(set, deposits[0].commitment);
console.log("alice proves innocence:", checkInnocenceWitness(w, registry.known()) ?? "ok");
console.log("exploiter can build a witness?", buildInnocenceWitness(set, deposits[1].commitment) !== null);
