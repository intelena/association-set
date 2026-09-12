import { assets, denyList, maxAmount, minAge, screening, type Policy } from "@intelena/association-set";

/** JSON shape accepted by `--policy`. Rules run in listed order. */
export interface PolicyFile {
  id: string;
  version: number;
  description?: string;
  denyList?: string[];
  minAgeBlocks?: number;
  assets?: string[];
  maxAmount?: Record<string, string>;
  screening?: { provider: string; flagged: Record<string, string> }[];
}

export function policyFromFile(file: PolicyFile): Policy {
  const rules: Policy["rules"] = [];
  if (file.denyList) rules.push(denyList(file.denyList));
  if (file.assets) rules.push(assets(file.assets));
  if (file.maxAmount) {
    rules.push(maxAmount(Object.fromEntries(Object.entries(file.maxAmount).map(([k, v]) => [k, BigInt(v)]))));
  }
  for (const s of file.screening ?? []) rules.push(screening(s.flagged, s.provider));
  if (file.minAgeBlocks !== undefined) rules.push(minAge(file.minAgeBlocks));
  return { id: file.id, version: file.version, description: file.description, rules };
}
