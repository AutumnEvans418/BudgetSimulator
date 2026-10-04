import { describe, expect, it } from "vitest";
import type { Account } from "./model";
import {
  accountsFromCSV,
  accountsToCSV,
  budgetFromJSON,
  budgetToJSON,
  makeExampleBudget,
} from "./storage";

describe("storage", () => {
  it("round-trips a budget through JSON", () => {
    const b = makeExampleBudget();
    b.strategies = [
      { id: "s1", name: "Avalanche", years: 30, steps: [{ name: "debt", allocations: [{ accountId: "loan", share: null, stop: "payoff" }] }] },
    ];
    const out = budgetFromJSON(budgetToJSON(b));
    expect(out).not.toBeNull();
    expect(out!.id).toBe(b.id);
    expect(out!.name).toBe(b.name);
    expect(out!.budget).toEqual(b.budget);
    expect(out!.accounts).toEqual(b.accounts);
    expect(out!.strategies).toEqual(b.strategies);
    expect(out!.years).toBe(30);
  });

  it("rejects malformed JSON", () => {
    expect(budgetFromJSON("not json")).toBeNull();
    expect(budgetFromJSON('{"accounts": []}')).toBeNull();
    expect(budgetFromJSON('{"budget": {"grossMonthly": "x"}}')).toBeNull();
  });

  it("round-trips accounts through CSV", () => {
    const b = makeExampleBudget();
    const out = accountsFromCSV(accountsToCSV(b.accounts));
    expect(out).toEqual(b.accounts);
  });

  it("handles optional fields and quoting in CSV", () => {
    const accounts: Account[] = [
      { id: "a1", type: "investment", name: 'Multi, "word" name', balance: 100, rate: 0.05, currentMonthlyPayment: 0 },
      { id: "a2", type: "retirement_401k", name: "401(k)", balance: 0, rate: 0.05, currentMonthlyPayment: 100, contributionCap: 23000, employerMatch: { percent: 0.04, maxAmount: 500 } },
      { id: "a3", type: "mortgage", name: "Home", balance: 300000, rate: 0.06, currentMonthlyPayment: 1800, minMonthlyPayment: 1500, escrow: 400 },
    ];
    const out = accountsFromCSV(accountsToCSV(accounts));
    expect(out).toEqual(accounts);
  });

  it("skips rows with unknown account types", () => {
    const csv = "id,name,type,balance,rate,currentMonthlyPayment\n1,fake,flying_car,100,0,0\n2,real,checking,50,0,0\n";
    const out = accountsFromCSV(csv);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("real");
  });

  it("builds a sane example budget", () => {
    const b = makeExampleBudget();
    expect(b.accounts.length).toBeGreaterThan(0);
    expect(b.budget.grossMonthly).toBeGreaterThan(0);
    expect(b.strategies).toHaveLength(1);
    expect(b.strategies[0].name).toBe("Leave No Match");
    expect(b.years).toBe(30);
    expect(b.id).toBeTruthy();
  });
});