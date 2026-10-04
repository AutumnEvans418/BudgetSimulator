import type { Account, AccountType, Strategy, StrategyStep } from "./model";
import { isDebt, isTaxAdvantaged, liquidityRank } from "./model";

export type TemplateId =
  | "avalanche"
  | "liquidity-first"
  | "match-first"
  | "max-net-worth"
  | "min-interest-payable"
  | "fixed";

export interface Template {
  id: TemplateId;
  label: string;
  description: string;
  /** Build a strategy from the current account list. */
  build: (accounts: Account[], years: number) => Strategy;
  /** True if the template can use the current accounts. */
  applicable: (accounts: Account[]) => boolean;
}

const step = (name: string, allocations: StrategyStep["allocations"]): StrategyStep => ({
  name,
  allocations,
});

const solo = (accountId: string, stop: StrategyStep["allocations"][number]["stop"]): StrategyStep => {
  return step("Fund", [{ accountId, share: null, stop }]);
};

const sortDebtsRateDesc = (accounts: Account[]) =>
  [...accounts].filter((a) => isDebt(a.type)).sort((a, b) => b.rate - a.rate);

const sameType = (accountType: AccountType) => (a: Account) => a.type === accountType;
const byLiquidity = (a: Account, b: Account) => liquidityRank(b.type) - liquidityRank(a.type);

const toStrategy = (id: string, name: string, steps: StrategyStep[], years: number): Strategy => ({
  id: `strategy-${years}-${id}`,
  name,
  steps,
  years,
});

// -- static templates --------------------------------------------------------

/** Pay off debts by rate desc, then emergency fund, then tax-advantaged caps, rest to investment. */
export const avalanche: Template = {
  id: "avalanche",
  label: "Avalanche (Loans First)",
  description: "Highest-rate debt first all the way to zero, then savings.",
  applicable: (a) => a.some((x) => isDebt(x.type)),
  build: (accounts, years) => {
    const steps: StrategyStep[] = [];
    for (const d of sortDebtsRateDesc(accounts)) {
      steps.push(solo(d.id, "payoff"));
    }
    const ef = accounts.find(sameType("emergency_fund"));
    if (ef && (ef.targetBalance ?? 0) > 0) steps.push(step("Emergency fund to target", [{ accountId: ef.id, share: 1, stop: "target" }]));
    steps.push(...capSteps(accounts.filter((a) => isTaxAdvantaged(a.type))));
    const inv = accounts.find(sameType("investment"));
    if (inv) steps.push(step("Invest remainder", [{ accountId: inv.id, share: null, stop: "cap" }]));
    return toStrategy("avalanche", "Avalanche", steps, years);
  },
};

const capSteps = (taxAccounts: Account[]): StrategyStep[] => {
  const capped = taxAccounts.filter((a) => (a.contributionCap ?? 0) > 0);
  if (capped.length === 0) return [];
  return [
    step(
      "Fill tax-advantaged caps",
      capped.map((a) => ({ accountId: a.id, share: 1 / capped.length, stop: "cap" }))
    ),
  ];
};

/** Emergency fund to target first, then accounts by liquidity rank. */
export const liquidityFirst: Template = {
  id: "liquidity-first",
  label: "Liquidity First",
  description: "Lock down the emergency fund, then fund in order of access speed.",
  applicable: (a) => a.some((x) => x.type === "emergency_fund"),
  build: (accounts, years) => {
    const steps: StrategyStep[] = [];
    const ef = accounts.find(sameType("emergency_fund"));
    if (ef && (ef.targetBalance ?? 0) > 0) {
      steps.push(step("Emergency fund to target", [{ accountId: ef.id, share: 1, stop: "target" }]));
    }
    const liquid = [...accounts].filter((a) => !isDebt(a.type)).sort(byLiquidity);
    for (const a of liquid) {
      if (a.id === ef?.id) continue;
      steps.push(solo(a.id, a.contributionCap ? "cap" : "cap"));
    }
    return toStrategy("liquidity-first", "Liquidity First", steps, years);
  },
};

/** Employer match first, then rate-desc debt, then caps, rest to investment. */
export const matchFirst: Template = {
  id: "match-first",
  label: "Never Leave the Match",
  description: "Max employer match, then highest-rate debt, then tax-advantaged caps.",
  applicable: (a) => a.some((x) => x.employerMatch || isDebt(x.type)),
  build: (accounts, years) => {
    const steps: StrategyStep[] = [];
    const matchAccts = accounts.filter((a) => a.employerMatch && !isDebt(a.type));
    if (matchAccts.length > 0) {
      steps.push(
        step(
          "Capture employer match",
          matchAccts.map((a) => ({ accountId: a.id, share: 1 / matchAccts.length, stop: "cap" }))
        )
      );
    }
    for (const d of sortDebtsRateDesc(accounts)) {
      steps.push(solo(d.id, "payoff"));
    }
    steps.push(...capSteps(accounts.filter((a) => isTaxAdvantaged(a.type))));
    const inv = accounts.find(sameType("investment"));
    if (inv) steps.push(step("Invest remainder", [{ accountId: inv.id, share: null, stop: "cap" }]));
    return toStrategy("match-first", "Leave No Match", steps, years);
  },
};

// -- computed templates ------------------------------------------------------

/**
 * Greedy priority: employer match -> highest-rate debt -> tax-advantaged caps -> taxable.
 * Same frontier as "minimize interest paid" once debt exists.
 */
export const maxNetWorth: Template = {
  id: "max-net-worth",
  label: "Maximize Net Worth",
  description: "Algorithmic greedy: match, then rate-sorted debt, then caps, then taxable.",
  applicable: () => true,
  build: (accounts, years) => {
    const steps: StrategyStep[] = [];
    const matchAccts = accounts.filter((a) => a.employerMatch && !isDebt(a.type));
    if (matchAccts.length > 0) {
      steps.push(step("Capture employer match", matchAccts.map((a) => ({ accountId: a.id, share: 1 / matchAccts.length, stop: "cap" }))));
    }
    for (const d of sortDebtsRateDesc(accounts)) {
      steps.push(solo(d.id, "payoff"));
    }
    steps.push(...capSteps(accounts.filter((a) => isTaxAdvantaged(a.type))));
    const inv = accounts.find(sameType("investment"));
    if (inv) steps.push(step("Invest remainder", [{ accountId: inv.id, share: null, stop: "cap" }]));
    return toStrategy("max-net-worth", "Max Net Worth", steps, years);
  },
};

export const minInterestPayable: Template = {
  id: "min-interest-payable",
  label: "Minimize Interest Paid",
  description: "Always retire the most expensive debt first; identical to avalanche.",
  applicable: (a) => a.some((x) => isDebt(x.type)),
  build: (accounts, years) => {
    const steps = [...sortDebtsRateDesc(accounts)].map((d) => solo(d.id, "payoff"));
    return toStrategy("min-interest-payable", "Minimize Interest", steps, years);
  },
};

/** Idempotent fixed split template for manual funding. */
export const fixed: Template = {
  id: "fixed",
  label: "Fixed Split",
  description: "Split surplus equally into a chosen account (editable in step editor).",
  applicable: (a) => a.length > 0,
  build: (accounts, years) => {
    const f = accounts.find((a) => !isDebt(a.type)) ?? accounts[0];
    return toStrategy("fixed", "Fixed Split", [step("Split", [{ accountId: f.id, share: 1, stop: "cap" }])], years);
  },
};

export const ALL_TEMPLATES: Template[] = [
  avalanche,
  liquidityFirst,
  matchFirst,
  maxNetWorth,
  minInterestPayable,
  fixed,
];

export function getTemplate(id: TemplateId): Template {
  return ALL_TEMPLATES.find((t) => t.id === id) ?? fixed;
}