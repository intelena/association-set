#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import {
  AssociationSet, buildSet, depositsFromJson, diffSets, snapshotFromJson, snapshotToJson, verifyMembership,
} from "@intelena/association-set";
import { policyFromFile, type PolicyFile } from "./policies.js";

const HELP = `association-set — curate and verify proof-of-innocence sets

Usage:
  association-set build  --deposits <deposits.json> --policy <policy.json> [--head <block>] [--out <set.json>]
  association-set verify <set.json>
  association-set prove  <set.json> <commitment>
  association-set diff   <before.json> <after.json>

deposits.json: [{ commitment, depositor, asset, amount, blockNumber, timestamp }]
policy.json:   { id, version, denyList?, minAgeBlocks?, assets?, maxAmount?, screening? }
`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

export function run(argv: string[]): { out: string; code: number } {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "build": {
      const depositsPath = flag(rest, "deposits");
      const policyPath = flag(rest, "policy");
      if (!depositsPath || !policyPath) return { out: HELP, code: 1 };
      const deposits = depositsFromJson(readFileSync(depositsPath, "utf8"));
      const policy = policyFromFile(JSON.parse(readFileSync(policyPath, "utf8")) as PolicyFile);
      const head = flag(rest, "head");
      const { set, excluded } = buildSet(policy, deposits, { context: head ? { headBlock: Number(head) } : {} });
      const json = snapshotToJson(set.snapshot());
      const outPath = flag(rest, "out");
      if (outPath) writeFileSync(outPath, json);
      const summary = `policy ${set.policyId}@${set.policyVersion}\nroot  ${set.root}\nsize  ${set.size} admitted, ${excluded.length} excluded`;
      return { out: outPath ? `${summary}\nwrote ${outPath}` : json, code: 0 };
    }
    case "verify": {
      const [path] = rest;
      if (!path) return { out: HELP, code: 1 };
      const snap = snapshotFromJson(readFileSync(path, "utf8"));
      try {
        const set = AssociationSet.fromSnapshot(snap);
        return { out: `ok    root ${set.root} (${set.size} leaves, policy ${set.policyId}@${set.policyVersion})`, code: 0 };
      } catch (err) {
        return { out: `FAIL  ${err instanceof Error ? err.message : String(err)}`, code: 2 };
      }
    }
    case "prove": {
      const [path, commitment] = rest;
      if (!path || !commitment) return { out: HELP, code: 1 };
      const set = AssociationSet.fromSnapshot(snapshotFromJson(readFileSync(path, "utf8")));
      const proof = set.proveMembership(commitment as `0x${string}`);
      if (!proof) return { out: `not a member: ${commitment}`, code: 3 };
      if (!verifyMembership(proof, set.root)) return { out: "internal error: proof does not verify", code: 4 };
      return { out: JSON.stringify(proof, null, 2), code: 0 };
    }
    case "diff": {
      const [a, b] = rest;
      if (!a || !b) return { out: HELP, code: 1 };
      const d = diffSets(snapshotFromJson(readFileSync(a, "utf8")), snapshotFromJson(readFileSync(b, "utf8")));
      return { out: `+${d.added.length} -${d.removed.length} root ${d.rootChanged ? "changed" : "unchanged"}\n${d.added.map((x) => `+ ${x}`).concat(d.removed.map((x) => `- ${x}`)).join("\n")}`.trimEnd(), code: 0 };
    }
    default:
      return { out: HELP, code: cmd === "--help" || cmd === "-h" || cmd === undefined ? 0 : 1 };
  }
}

if (process.argv[1] && /cli\.(js|ts)$/.test(process.argv[1])) {
  try {
    const { out, code } = run(process.argv.slice(2));
    (code === 0 ? process.stdout : process.stderr).write(out + "\n");
    process.exit(code);
  } catch (err) {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
