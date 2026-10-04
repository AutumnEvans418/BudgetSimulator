import { describe, expect, it } from "vitest";
import type { Account } from "./model";
import {
  ALL_TEMPLATES,
  avalanche,
  getTemplate,
  liquidityFirst,
  matchFirst,
  maxNetWorth,
  minInterestPayable,
} from "./templates";

const debt = (id: string, rate: number): Account => ({
  id,
  type: "personal_loan",
  name: id,
  balance: 5000,
  rate,
  currentMonthlyPayment: 100,
});

const inv = (id: string): Account => ({
  id,
  type: "investment",
  name: id,
  balance: 0,
  rate: 0.08,
  currentMonthlyPayment: 0,
});

const ef = (): Account => ({
  id: "ef",
  type: "emergency_fund",
  name: "EF",
  balance: 1000,
  rate: 0.04,
  currentMonthlyPayment: 0,
  targetBalance: 10000,
});

const accounts = [debt("high", 0.18), debt("low", 0.06), inv("inv"), ef(), debt("mid", 0.11)];

describe("templates", () => {
  it("avalanche orders debts by rate desc, then target fund, then investment", () => {
    const s = avalanche.build(accounts, 30);
    expect(s.steps.length).toBeGreaterThan(3);
    expect(s.steps[0].allocations[0].accountId).toBe("high");
    expect(s.steps[1].allocations[0].accountId).toBe("mid");
    expect(s.steps[2].allocations[0].accountId).toBe("low");
    const efStep = s.steps.find((st) => st.allocations.some((al) => al.accountId === "ef"));
    expect(efStep?.allocations[0]?.stop).toBe("target");
    const invStep = s.steps[s.steps.length - 1];
    expect(invStep.allocations[0].accountId).toBe("inv");
  });

  it("min interest template targets every debt", () => {
    const s = minInterestPayable.build(accounts, 20);
    expect(s.steps.map((st) => st.allocations[0].accountId)).toEqual(["high", "mid", "low"]);
  });

  it("liquidity first puts emergency fund target before liquid accounts", () => {
    const s = liquidityFirst.build(accounts, 30);
    expect(s.steps[0].allocations[0].stop).toBe("target");
    expect(s.steps[0].allocations[0].accountId).toBe("ef");
  });

  it("max net worth includes match capture when present", () => {
    const withMatch: Account[] = [
      ...accounts,
      { id: "k", type: "retirement_401k", name: "401k", balance: 0, rate: 0.07, currentMonthlyPayment: 0, contributionCap: 23000, employerMatch: { percent: 0.04, maxAmount: 500 } },
    ];
    const s = maxNetWorth.build(withMatch, 30);
    expect(s.steps[0].name).toMatch(/match/i);
  });

  it("match first funds only the match slice, not the full cap", () => {
    const withMatch: Account[] = [
      ...accounts,
      { id: "k", type: "retirement_401k", name: "401k", balance: 0, rate: 0.07, currentMonthlyPayment: 0, contributionCap: 23000, employerMatch: { percent: 0.04, maxAmount: 500 } },
    ];
    const s = matchFirst.build(withMatch, 30);
    const matchStep = s.steps.find((st) => st.name.toLowerCase().includes("match"));
    expect(matchStep!.allocations[0].stop).toBe("match");
  });

  it("applies guards", () => {
    expect(avalanche.applicable(accounts)).toBe(true);
    expect(avalanche.applicable([inv("x")])).toBe(false);
    expect(liquidityFirst.applicable(accounts)).toBe(true);
  });

  it("getTemplate falls back to fixed for unknown id", () => {
    expect(getTemplate("fixed" as never).id).toBe("fixed");
  });

  it("all templates have unique ids and build without error", () => {
    expect(ALL_TEMPLATES.map((t) => t.id).length).toBe(new Set(ALL_TEMPLATES.map((t) => t.id)).size);
    for (const t of ALL_TEMPLATES) {
      expect(t.build(accounts, 30).steps).toBeDefined();
    }
  });
});