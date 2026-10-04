import { describe, expect, it } from "vitest";
import {
  accountTypeLabel,
  emptyAccount,
  isDebt,
  isTaxAdvantaged,
  liquidityRank,
  monthlySurplus,
  netMonthly,
} from "./model";

describe("model helpers", () => {
  it("classifies debt and tax-advantaged types", () => {
    expect(isDebt("mortgage")).toBe(true);
    expect(isDebt("credit_card")).toBe(true);
    expect(isDebt("investment")).toBe(false);
    expect(isTaxAdvantaged("hsa")).toBe(true);
    expect(isTaxAdvantaged("retirement_401k")).toBe(true);
    expect(isTaxAdvantaged("checking")).toBe(false);
  });

  it("ranks liquidity", () => {
    expect(liquidityRank("checking")).toBeGreaterThan(liquidityRank("investment"));
    expect(liquidityRank("investment")).toBeGreaterThan(liquidityRank("cd"));
    expect(liquidityRank("retirement_401k")).toBeGreaterThan(liquidityRank("personal_loan"));
  });

  it("has labels for every account type", () => {
    for (const t of ["checking", "emergency_fund", "investment", "retirement_401k", "ira", "roth_ira", "hsa", "cd", "mortgage", "student_loan", "personal_loan", "credit_card", "auto_loan", "other_asset", "other_debt"] as const) {
      expect(accountTypeLabel(t).length).toBeGreaterThan(0);
    }
  });

  it("builds debt defaults higher than asset defaults", () => {
    expect(emptyAccount("personal_loan").rate).toBeGreaterThan(emptyAccount("investment").rate);
    expect(emptyAccount("emergency_fund").targetBalance).toBe(0);
  });
});

describe("budget math", () => {
  const budget = { grossMonthly: 1000, deductionsMonthly: 200, expensesMonthly: 500 };
  it("computes net and surplus", () => {
    expect(netMonthly(budget)).toBe(800);
    expect(monthlySurplus(budget)).toBe(300);
  });
});