import type { Account, Allocation, Budget, Strategy, StopCondition } from "./model";
import { isDebt as isDebtType } from "./model";

export interface MonthSnapshot {
  month: number; // 1-based absolute from simulation start
  balances: Record<string, number>; // accountId -> balance. Debt = still owed (positive)
  residualCash: number; // cumulative unallocated surplus balance (no interest, counts toward net worth)
  interestPaid: number; // cumulative debt interest
  contributions: number; // cumulative money moved into accounts
  contribByAccount: Record<string, number>; // cumulative money moved, per account
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
  contribBy: Map<string, number>;
  amortized: Set<string>; // debt ids that applied full P&I this month
  cash: number; // running unallocated surplus balance (checking-like)
  matchBy: Map<string, number>; // employer match already applied this month, per account
  monthContrib: Map<string, number>; // contributions placed this month, per account
}

/** How much this allocation can absorb this month, and whether it's finished. */
function capacity(
  ctx: Ctx,
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
    case "match": {
      // fund only what earns the full monthly employer match, then cascade the rest.
      const m = acc.employerMatch;
      if (!m || m.percent <= 0 || m.maxAmount <= 0) return { max: 0, done: true };
      const matched = ctx.matchBy.get(acc.id) ?? 0;
      if (matched >= m.maxAmount) return { max: 0, done: true };
      const goal = Math.ceil(m.maxAmount / m.percent);
      const remaining = Math.max(0, goal - (ctx.monthContrib.get(acc.id) ?? 0));
      return { max: remaining, done: remaining <= 0 };
    }
  }
}

/** Add employer match (percent of contribution, capped per month) to an asset balance. */
function applyMatch(ctx: Ctx, acc: Account, contrib: number): void {
  const m = acc.employerMatch;
  if (!m || m.maxAmount <= 0) return;
  const used = ctx.matchBy.get(acc.id) ?? 0;
  const available = Math.max(0, m.maxAmount - used);
  if (available <= 0) return;
  const match = Math.min(contrib * m.percent, available);
  if (match <= 0) return;
  ctx.balances.set(acc.id, (ctx.balances.get(acc.id) ?? 0) + match);
  ctx.matchBy.set(acc.id, used + match);
}

/** Apply one allocation's share of cash. Returns money actually placed. */
function place(ctx: Ctx, alloc: Allocation, ask: number, balances: Map<string, number>): number {
  const acc = ctx.byId.get(alloc.accountId);
  if (!acc) return 0;
  const bal = balances.get(alloc.accountId) ?? 0;
  const cap = capacity(ctx, acc, alloc.stop, bal);
  if (cap.done) return 0;
  const want = Math.min(ask, cap.max);
  const placed = Math.floor(want);
  if (placed <= 0) return 0;

  if (isDebtType(acc.type)) {
    balances.set(alloc.accountId, bal - placed);
  } else {
    balances.set(alloc.accountId, bal + placed);
    ctx.monthContrib.set(alloc.accountId, (ctx.monthContrib.get(alloc.accountId) ?? 0) + placed);
    applyMatch(ctx, acc, placed);
  }
  ctx.contributions += placed;
  ctx.contribBy.set(alloc.accountId, (ctx.contribBy.get(alloc.accountId) ?? 0) + placed);
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
    contribBy: new Map(),
    amortized: new Set(),
    cash: 0,
    matchBy: new Map(),
    monthContrib: new Map(),
  };
  const snapshots: MonthSnapshot[] = [];
  const surplus = Math.max(0, budget.grossMonthly - budget.deductionsMonthly - budget.expensesMonthly);

  for (let m = 1; m <= strategy.years * 12; m++) {
    ctx.amortized.clear();
    ctx.matchBy.clear();
    ctx.monthContrib.clear();
    stepMandatory(ctx);
    ctx.cash += _distributeCash(ctx, strategy.steps, surplus, ctx.balances);
    stepInterest(ctx);
    snapshots.push({
      month: m,
      balances: Object.fromEntries(ctx.balances),
      residualCash: ctx.cash,
      interestPaid: ctx.interestPaid,
      contributions: ctx.contributions,
      contribByAccount: Object.fromEntries(ctx.contribBy),
    });
  }
  return { strategyName: strategy.name, snapshots };
}

function stepMandatory(ctx: Ctx): void {
  for (const [id, a] of ctx.byId) {
    const bal = ctx.balances.get(id) ?? 0;
    if (bal <= 0 && isDebtType(a.type)) continue; // debts stop once paid off
    if (!isDebtType(a.type)) {
      if (a.currentMonthlyPayment <= 0) continue;
      ctx.balances.set(id, bal + a.currentMonthlyPayment);
      ctx.contributions += a.currentMonthlyPayment;
      ctx.contribBy.set(id, (ctx.contribBy.get(id) ?? 0) + a.currentMonthlyPayment);
      ctx.monthContrib.set(id, (ctx.monthContrib.get(id) ?? 0) + a.currentMonthlyPayment);
      applyMatch(ctx, a, a.currentMonthlyPayment);
      continue;
    }
    const base = a.currentMonthlyPayment > 0 ? a.currentMonthlyPayment : a.minMonthlyPayment ?? 0;
    if (base <= 0) continue;
    // ponytail: amortize interest-first; escrow never reduces principal.
    const payment = Math.max(0, base - (a.escrow ?? 0));
    const interest = (bal * a.rate) / 12;
    const principal = Math.min(Math.max(payment - interest, 0), bal);
    ctx.balances.set(id, bal - principal);
    if (payment > 0) {
      ctx.interestPaid += interest;
      ctx.contributions += principal;
      ctx.contribBy.set(id, (ctx.contribBy.get(id) ?? 0) + principal);
      ctx.amortized.add(id);
    }
  }
}

function stepInterest(ctx: Ctx): void {
  for (const [id, a] of ctx.byId) {
    if (ctx.amortized.has(id)) continue; // interest already charged in stepMandatory
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