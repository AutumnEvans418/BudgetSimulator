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
    expect(last.contribByAccount.loan).toBe(5000);
    expect(last.contribByAccount.inv).toBeCloseTo(surplus * 12 - 5000, 2);
  });

  it("tracks mandatory payments in contribByAccount", () => {
    const d = acct({ id: "loan", type: "personal_loan", balance: 1000, rate: 0, currentMonthlyPayment: 100 });
    const p = simulate(budget, [d], { id: "s", name: "s", steps: [], years: 1 });
    expect(p.snapshots[11].contribByAccount.loan).toBeCloseTo(1000, 2); // 10 months x $100 pays debt
  });

  it("amortizes debt interest-first on mandatory payments", () => {
    const m = acct({ id: "mort", type: "mortgage", balance: 100000, rate: 0.06, currentMonthlyPayment: 1000 });
    const p = simulate(budget, [m], { id: "s", name: "s", steps: [], years: 1 });
    const m1 = p.snapshots[0];
    // interest = 100000 * .005 = 500; principal = 1000 - 500 = 500
    expect(m1.interestPaid).toBeCloseTo(500, 2);
    expect(m1.balances.mort).toBeCloseTo(99500, 2);
    expect(m1.contribByAccount.mort).toBeCloseTo(500, 2);
  });

  it("excludes escrow from principal reduction", () => {
    const m = acct({ id: "mort", type: "mortgage", balance: 100000, rate: 0.06, currentMonthlyPayment: 1200, escrow: 200 });
    const p = simulate(budget, [m], { id: "s", name: "s", steps: [], years: 1 });
    const m1 = p.snapshots[0];
    // P&I = 1000 after escrow; same amortization as the $1000 payment above
    expect(m1.interestPaid).toBeCloseTo(500, 2);
    expect(m1.balances.mort).toBeCloseTo(99500, 2);
  });

  it("falls back to the minimum payment when current is zero", () => {
    const d = acct({ id: "loan", type: "personal_loan", balance: 1000, rate: 0, currentMonthlyPayment: 0, minMonthlyPayment: 100 });
    const p = simulate(budget, [d], { id: "s", name: "s", steps: [], years: 1 });
    expect(p.snapshots[11].contribByAccount.loan).toBeCloseTo(1000, 2);
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

  it("accumulates unconsumed surplus as a checking-like balance", () => {
    const inv = acct({ id: "inv", type: "investment", balance: 100, rate: 0, contributionCap: 600 });
    const p = simulate(budget, [inv], {
      id: "s",
      name: "s",
      years: 1,
      steps: [{ name: "capped", allocations: [{ accountId: "inv", share: null, stop: "cap" }] }],
    });
    const last = p.snapshots[p.snapshots.length - 1];
    // monthly cap $50, surplus $1000 -> $950/mo unallocated, accumulates to a year-end balance
    expect(last.residualCash).toBeCloseTo(950 * 12, 2);
    expect(last.balances.inv).toBeCloseTo(100 + 600, 2);
  });

  it("unallocated surplus piles up year over year", () => {
    const p = simulate(budget, [], { id: "s", name: "s", steps: [], years: 2 });
    const last = p.snapshots[p.snapshots.length - 1];
    expect(last.residualCash).toBeCloseTo(surplus * 24, 2);
  });

  it("applies employer match on budgeted 401k contributions", () => {
    const k = acct({
      id: "k",
      type: "retirement_401k",
      balance: 1000,
      rate: 0,
      currentMonthlyPayment: 300,
      employerMatch: { percent: 0.04, maxAmount: 500 },
    });
    const p = simulate(budget, [k], { id: "s", name: "s", steps: [], years: 1 });
    const last = p.snapshots[p.snapshots.length - 1];
    // employee 300/mo + match 4% (12/mo) -> 3744 by year end
    expect(last.balances.k).toBeCloseTo(1000 + (300 + 12) * 12, 2);
    // match is employer money, not counted as personal contribution
    expect(totalContributions(p)).toBeCloseTo(300 * 12, 2);
  });

  it("applies employer match on surplus allocation, capped per month", () => {
    const k = acct({
      id: "k",
      type: "retirement_401k",
      balance: 0,
      rate: 0,
      employerMatch: { percent: 0.5, maxAmount: 100 },
    });
    const p = simulate(budget, [k], {
      id: "s",
      name: "s",
      years: 1,
      steps: [{ name: "park", allocations: [{ accountId: "k", share: null, stop: "cap" }] }],
    });
    const last = p.snapshots[p.snapshots.length - 1];
    // $1000/mo into 401k, match 50% = 500 but capped at 100/mo -> 13200 balance year end
    expect(last.balances.k).toBeCloseTo((1000 + 100) * 12, 2);
  });

  it("match stop funds only the match-needed contribution, cascades the rest", () => {
    const k = acct({
      id: "k",
      type: "retirement_401k",
      balance: 0,
      rate: 0,
      employerMatch: { percent: 1, maxAmount: 100 },
    });
    const inv = acct({ id: "inv", type: "investment", balance: 0, rate: 0 });
    const p = simulate(budget, [k, inv], {
      id: "s",
      name: "s",
      years: 1,
      steps: [
        { name: "match", allocations: [{ accountId: "k", share: null, stop: "match" }] },
        { name: "rest", allocations: [{ accountId: "inv", share: null, stop: "cap" }] },
      ],
    });
    const last = p.snapshots[p.snapshots.length - 1];
    expect(last.balances.k).toBeCloseTo((100 + 100) * 12, 2); // $100 contribution + $100 match /mo
    expect(last.balances.inv).toBeCloseTo(900 * 12, 2); // the $900/mo remainder cascaded
    expect(last.residualCash).toBe(0);
  });

  it("match stop respects a budgeted-payment contribution toward the goal", () => {
    const k = acct({
      id: "k",
      type: "retirement_401k",
      balance: 0,
      rate: 0,
      currentMonthlyPayment: 50,
      employerMatch: { percent: 1, maxAmount: 100 },
    });
    const inv = acct({ id: "inv", type: "investment", balance: 0, rate: 0 });
    const p = simulate(budget, [k, inv], {
      id: "s",
      name: "s",
      years: 1,
      steps: [
        { name: "match", allocations: [{ accountId: "k", share: null, stop: "match" }] },
        { name: "rest", allocations: [{ accountId: "inv", share: null, stop: "cap" }] },
      ],
    });
    const last = p.snapshots[p.snapshots.length - 1];
    // budgeted $50/mo already counts; match step tops up only $50 -> $100 total, match $100
    expect(last.balances.k).toBeCloseTo((50 + 50 + 100) * 12, 2);
    expect(last.balances.inv).toBeCloseTo(950 * 12, 2);
  });

  it("computes final net worth with debt classed negative", () => {
    const loan = acct({ id: "loan", type: "personal_loan", balance: 2000, rate: 0, currentMonthlyPayment: 0 });
    const inv = acct({ id: "inv", type: "investment", balance: 5000, rate: 0 });
    const p = simulate(budget, [loan, inv], { id: "s", name: "s", steps: [], years: 1 });
    // residual cash (year of unallocated surplus) counts toward net worth too
    expect(finalNetWorth(p, [loan, inv])).toBeCloseTo(3000 + surplus * 12, 2);
  });
});