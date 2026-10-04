import { describe, expect, it } from "vitest";
import type { Account, Budget } from "./model";
import {
  finalNetWorth,
  simulate,
  totalContributions,
  totalInterestPaid,
} from "./simulate";

const budget: Budget = { grossMonthly: 5000, deductionsMonthly: 1000, expensesMonthly: 3000 };
const surplus = 1000;

const acct = (over: Partial<Account> & { id: string; type: Account["type"] }): Account => ({
  name: over.id,
  balance: 0,
  rate: 0,
  currentMonthlyPayment: 0,
  ...over,
});

describe("simulate", () => {
  it("compounds asset interest monthly", () => {
    const a = acct({ id: "inv", type: "investment", balance: 1200, rate: 0.12 });
    const p = simulate(budget, [a], { id: "s", name: "s", steps: [], years: 1 });
    const last = p.snapshots[p.snapshots.length - 1];
    expect(last.balances.inv).toBeCloseTo(1200 * Math.pow(1.01, 12), 2);
  });

  it("grows debt balance and accumulates interest paid", () => {
    const d = acct({ id: "loan", type: "personal_loan", balance: 1000, rate: 0.12 });
    const p = simulate(budget, [d], { id: "s", name: "s", steps: [], years: 1 });
    const last = p.snapshots[p.snapshots.length - 1];
    expect(last.balances.loan).toBeCloseTo(1000 * Math.pow(1.01, 12), 2);
    expect(totalInterestPaid(p)).toBeCloseTo(last.balances.loan - 1000, 2);
  });

  it("applies mandatory debt payment before interest", () => {
    const d = acct({ id: "loan", type: "personal_loan", balance: 1000, rate: 0.12, currentMonthlyPayment: 100 });
    const p = simulate(budget, [d], { id: "s", name: "s", steps: [], years: 1 });
    const last = p.snapshots[p.snapshots.length - 1];
    // 12 payments of <=$100 can fully pay $1000 balance
    expect(last.balances.loan).toBeLessThanOrEqual(0.001);
  });

  it("distributes surplus to a single share step", () => {
    const inv = acct({ id: "inv", type: "investment", balance: 0, rate: 0 });
    const p = simulate(budget, [inv], {
      id: "s",
      name: "s",
      years: 1,
      steps: [{ name: "all in", allocations: [{ accountId: "inv", share: null, stop: "cap" }] }],
    });
    const last = p.snapshots[p.snapshots.length - 1];
    expect(last.balances.inv).toBeCloseTo(surplus * 12, 2);
    expect(totalContributions(p)).toBeCloseTo(surplus * 12, 2);
  });

  it("cascades: debt paid off first, then investment gets the rest", () => {
    const loan = acct({ id: "loan", type: "personal_loan", balance: 5000, rate: 0, currentMonthlyPayment: 0 });
    const inv = acct({ id: "inv", type: "investment", balance: 0, rate: 0 });
    const p = simulate(budget, [loan, inv], {
      id: "s",
      name: "s",
      years: 1,
      steps: [
        { name: "debt", allocations: [{ accountId: "loan", share: null, stop: "payoff" }] },
        { name: "invest", allocations: [{ accountId: "inv", share: null, stop: "cap" }] },
      ],
    });
    const last = p.snapshots[p.snapshots.length - 1];
    expect(last.balances.loan).toBe(0);
    expect(last.balances.inv).toBeCloseTo(surplus * 12 - 5000, 2);
  });

  it("respects monthly cap slice for capped accounts", () => {
    const k = acct({ id: "k", type: "retirement_401k", balance: 0, rate: 0, contributionCap: 12000 });
    const p = simulate(budget, [k], {
      id: "s",
      name: "s",
      years: 1,
      steps: [{ name: "401k", allocations: [{ accountId: "k", share: null, stop: "cap" }] }],
    });
    const last = p.snapshots[p.snapshots.length - 1];
    expect(last.balances.k).toBeCloseTo(12000, 0); // $1000/mo cap -> exactly $12k/yr
  });

  it("leaves unconsumed surplus as residual cash", () => {
    const inv = acct({ id: "inv", type: "investment", balance: 100, rate: 0, contributionCap: 600 });
    const p = simulate(budget, [inv], {
      id: "s",
      name: "s",
      years: 1,
      steps: [{ name: "capped", allocations: [{ accountId: "inv", share: null, stop: "cap" }] }],
    });
    const last = p.snapshots[p.snapshots.length - 1];
    // monthly cap $50, surplus $1000 -> residual $950/mo
    expect(last.residualCash).toBeCloseTo(950, 2);
    expect(last.balances.inv).toBeCloseTo(100 + 600, 2);
  });

  it("computes final net worth with debt classed negative", () => {
    const loan = acct({ id: "loan", type: "personal_loan", balance: 2000, rate: 0, currentMonthlyPayment: 0 });
    const inv = acct({ id: "inv", type: "investment", balance: 5000, rate: 0 });
    const p = simulate(budget, [loan, inv], { id: "s", name: "s", steps: [], years: 1 });
    // residual cash (one month's surplus) is net worth too
    expect(finalNetWorth(p, [loan, inv])).toBeCloseTo(3000 + surplus, 2);
  });
});