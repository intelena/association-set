import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";

const dir = mkdtempSync(join(tmpdir(), "aset-"));
const c = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;
const deposits = [
  { commitment: c(1), depositor: "0xaaaa", asset: "USDG", amount: "100", blockNumber: 10, timestamp: 1 },
  { commitment: c(2), depositor: "0xbad", asset: "USDG", amount: "100", blockNumber: 11, timestamp: 2 },
  { commitment: c(3), depositor: "0xcccc", asset: "USDG", amount: "100", blockNumber: 95, timestamp: 3 },
];
writeFileSync(join(dir, "deposits.json"), JSON.stringify(deposits));
writeFileSync(join(dir, "policy.json"), JSON.stringify({ id: "test", version: 1, denyList: ["0xbad"], minAgeBlocks: 10 }));

describe("cli", () => {
  it("build → verify → prove → diff", () => {
    const out = join(dir, "set.json");
    const b = run(["build", "--deposits", join(dir, "deposits.json"), "--policy", join(dir, "policy.json"), "--head", "100", "--out", out]);
    expect(b.code).toBe(0);
    expect(b.out).toMatch(/1 admitted, 2 excluded/);
    expect(run(["verify", out])).toMatchObject({ code: 0 });
    expect(run(["prove", out, c(1)]).code).toBe(0);
    expect(run(["prove", out, c(2)]).code).toBe(3);

    const tampered = join(dir, "tampered.json");
    writeFileSync(tampered, readFileSync(out, "utf8").replace(/"size": 1/, '"size": 1').replace(/"root": "0x[0-9a-f]{64}"/, `"root": "${c(9)}"`));
    expect(run(["verify", tampered]).code).toBe(2);

    const out2 = join(dir, "set2.json");
    writeFileSync(join(dir, "policy2.json"), JSON.stringify({ id: "test", version: 2, denyList: ["0xbad"], minAgeBlocks: 1 }));
    run(["build", "--deposits", join(dir, "deposits.json"), "--policy", join(dir, "policy2.json"), "--head", "100", "--out", out2]);
    expect(run(["diff", out, out2]).out).toMatch(/^\+1 -0 root changed/);
  });
  it("prints help", () => {
    expect(run([]).code).toBe(0);
    expect(run(["nope"]).code).toBe(1);
  });
});
