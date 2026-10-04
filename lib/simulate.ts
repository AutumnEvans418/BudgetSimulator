import type { Account, Allocation, Budget, Strategy, StopCondition } from "./model";
import { isDebt as isDebtType } from "./model";

export interface MonthSnapshot {
  month: number; // 1-based absolute from simulation start
  balances: Record<string, number>; // accountId -> balance. Debt = still owed (positive)
  residualCash: number; // surplus not absorbed by any step this month
  interestPaid: number; // cumulative debt interest
  contributions: number; // cumulative money moved into accounts
}

export interface Projection {
  strategyName: string;
  snapshots: MonthSnapshot[];
}

const lastSnap = (p: Projection) => p.snapshots[p.snapshots.length - 1];

export function finalNetWorth(p: Projection, accounts: Account[]): number {
  const s = lastSnap(p);
  if (!s) return 0;
  let nw = s.residualCash;
  for (const a of accounts) {
    nw += (isDebtType(a.type) ? -1 : 1) * s.balances[a.id];
  }
  return nw;
}

export const totalInterestPaid = (p: Projection): number => lastSnap(p)?.interestPaid ?? 0;
export const totalContributions = (p: Projection): number => lastSnap(p)?.contributions ?? 0;

// ---------------------------------------------------------------------------

interface Ctx {
  byId: Map<string, Account>;
  balances: Map<string, number>;
  interestPaid: number;
  contributions: number;
}

/** How much this allocation can absorb this month, and whether it's finished. */
function capacity(
  acc: Account,
  stop: StopCondition,
  balance: number
): { max: number; done: boolean } {
  switch (stop) {
    case "payoff":
      return { max: Infinity, done: balance <= 0 };
    case "target":
      return { max: Math.max(0, (acc.targetBalance ?? 0) - balance), done: balance >= (acc.targetBalance ?? 0) };
    case "cap":
      // ponytail: monthly slice of annual cap; ignores year rollover. No cap set = unlimited parking.
      return {
        max: (acc.contributionCap ?? 0) > 0 ? (acc.contributionCap ?? 0) / 12 : Infinity,
        done: false,
      };
  }
}

/** Apply one allocation's share of cash. Returns money actually placed. */
function place(ctx: Ctx, alloc: Allocation, ask: number, balances: Map<string, number>): number {
  const acc = ctx.byId.get(alloc.accountId);
  if (!acc) return 0;
  const bal = balances.get(alloc.accountId) ?? 0;
  const cap = capacity(acc, alloc.stop, bal);
  if (cap.done) return 0;
  const want = Math.min(ask, cap.max);
  const placed = Math.floor(want);
  if (placed <= 0) return 0;

  if (isDebtType(acc.type) && alloc.stop === "payoff") {
    balances.set(alloc.accountId, bal - placed);
  } else if (isDebtType(acc.type)) {
    // debt with target/cap stop: treat as prepayment toward balance
    balances.set(alloc.accountId, bal - placed);
  } else {
    balances.set(alloc.accountId, bal + placed);
  }
  ctx.contributions += placed;
  return placed;
}

/**
 * Walk steps in order, draining cash through each step's allocations.
 * Leftover cascades to the next step; final leftover returns to caller.
 */
export function _distributeCash(
  ctx: Ctx,
  steps: Strategy["steps"],
  cash: number,
  balances: Map<string, number>
): number {
  let remaining = cash;
  for (const step of steps) {
    if (remaining <= 0) break;
    let stepSpent = 0;
    for (const alloc of step.allocations) {
      if (remaining - stepSpent <= 0) break;
      const ask =
        alloc.share == null ? remaining - stepSpent : (remaining - stepSpent) * alloc.share;
      stepSpent += place(ctx, alloc, ask, balances);
    }
    if (stepSpent <= 0) continue; // step could take nothing; cascade to next step
    remaining -= stepSpent;
  }
  return Math.max(0, remaining);
}

/**
 * Simulate a strategy over {strategy.years} years, monthly.
 * Order per month: mandatory payments -> strategy cascade -> interest accrual.
 */
export function simulate(budget: Budget, accounts: Account[], strategy: Strategy): Projection {
  const ctx: Ctx = {
    byId: new Map(accounts.map((a) => [a.id, a])),
    balances: new Map(accounts.map((a) => [a.id, a.balance])),
    interestPaid: 0,
    contributions: 0,
  };
  const snapshots: MonthSnapshot[] = [];
  const surplus = Math.max(0, budget.grossMonthly - budget.deductionsMonthly - budget.expensesMonthly);

  for (let m = 1; m <= strategy.years * 12; m++) {
    stepMandatory(ctx);
    const leftover = _distributeCash(ctx, strategy.steps, surplus, ctx.balances);
    stepInterest(ctx);
    snapshots.push({
      month: m,
      balances: Object.fromEntries(ctx.balances),
      residualCash: leftover,
      interestPaid: ctx.interestPaid,
      contributions: ctx.contributions,
    });
  }
  return { strategyName: strategy.name, snapshots };
}

function stepMandatory(ctx: Ctx): void {
  for (const [id, a] of ctx.byId) {
    if (a.currentMonthlyPayment <= 0) continue;
    const bal = ctx.balances.get(id) ?? 0;
    if (isDebtType(a.type)) {
      const pay = Math.min(a.currentMonthlyPayment, bal);
      ctx.balances.set(id, bal - pay);
      ctx.contributions += pay;
    } else {
      ctx.balances.set(id, bal + a.currentMonthlyPayment);
      ctx.contributions += a.currentMonthlyPayment;
    }
  }
}

function stepInterest(ctx: Ctx): void {
  for (const [id, a] of ctx.byId) {
    const bal = ctx.balances.get(id) ?? 0;
    if (bal <= 0 || a.rate <= 0) continue;
    if (isDebtType(a.type)) {
      const interest = (bal * a.rate) / 12;
      ctx.balances.set(id, bal + interest);
      ctx.interestPaid += interest;
    } else {
      ctx.balances.set(id, bal * (1 + a.rate / 12));
    }
  }
}