import type { Account, AccountType, Budget, Strategy } from "./model";
import { ACCOUNT_TYPES } from "./model";
import type { Projection } from "./simulate";
import { isDebt } from "./model";

export interface SavedBudget {
  id: string;
  name: string;
  budget: Budget;
  accounts: Account[];
  strategies: Strategy[];
  years: number;
  updatedAt: number;
}

const LS_BUDGETS = "budgetsim:budgets:v1";
const LS_ACTIVE = "budgetsim:active:v1";

export function makeExampleBudget(): SavedBudget {
  const accounts: Account[] = [
    { id: "ef", type: "emergency_fund", name: "Emergency Fund", balance: 5000, rate: 0.04, currentMonthlyPayment: 0, targetBalance: 20000 },
    { id: "loan", type: "personal_loan", name: "Personal Loan", balance: 15000, rate: 0.099, currentMonthlyPayment: 250 },
    { id: "k401", type: "retirement_401k", name: "401(k)", balance: 20000, rate: 0.07, currentMonthlyPayment: 300, contributionCap: 23000, employerMatch: { percent: 0.04, maxAmount: 500 } },
    { id: "inv", type: "investment", name: "Investment", balance: 8000, rate: 0.08, currentMonthlyPayment: 0 },
    { id: "hsa", type: "hsa", name: "HSA", balance: 1000, rate: 0.05, currentMonthlyPayment: 0, contributionCap: 4150 },
  ];
  return {
    id: "example",
    name: "Example",
    budget: { grossMonthly: 9000, deductionsMonthly: 2500, expensesMonthly: 3500 },
    accounts,
    strategies: [],
    years: 30,
    updatedAt: Date.now(),
  };
}

export function loadAll(): { budgets: SavedBudget[]; activeId: string | null } {
  if (typeof window === "undefined") return { budgets: [], activeId: null };
  try {
    const raw = window.localStorage.getItem(LS_BUDGETS);
    if (!raw) return { budgets: [], activeId: null };
    const parsed = JSON.parse(raw) as { v?: number; budgets?: unknown[] };
    if (!Array.isArray(parsed.budgets)) return { budgets: [], activeId: null };
    const budgets = parsed.budgets
      .map((b) => budgetFromJSON(JSON.stringify(b)))
      .filter((b): b is SavedBudget => b !== null);
    return { budgets, activeId: window.localStorage.getItem(LS_ACTIVE) };
  } catch {
    return { budgets: [], activeId: null };
  }
}

export function persist(budgets: SavedBudget[], activeId: string | null): void {
  if (typeof window === "undefined") return;
  const stamped = budgets.map((b) => (b.id === activeId ? { ...b, updatedAt: Date.now() } : b));
  window.localStorage.setItem(LS_BUDGETS, JSON.stringify({ v: 1, budgets: stamped }));
  if (activeId) window.localStorage.setItem(LS_ACTIVE, activeId);
}

export function budgetToJSON(sb: SavedBudget): string {
  return JSON.stringify(sb, null, 2);
}

export function budgetFromJSON(text: string): SavedBudget | null {
  try {
    const raw = JSON.parse(text) as SavedBudget;
    if (!raw || typeof raw !== "object") return null;
    const b = raw.budget;
    if (!b || typeof b.grossMonthly !== "number") return null;
    if (!Array.isArray(raw.accounts) || !Array.isArray(raw.strategies)) return null;
    if (typeof raw.years !== "number") return null;
    return {
      id: raw.id || crypto.randomUUID(),
      name: String(raw.name ?? "Imported"),
      budget: {
        grossMonthly: b.grossMonthly,
        deductionsMonthly: b.deductionsMonthly ?? 0,
        expensesMonthly: b.expensesMonthly ?? 0,
      },
      accounts: raw.accounts.filter(isAccount),
      strategies: raw.strategies.filter(isStrategy),
      years: raw.years,
      updatedAt: raw.updatedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

function isAccount(a: unknown): a is Account {
  if (!a || typeof a !== "object") return false;
  const x = a as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    typeof x.type === "string" &&
    ACCOUNT_TYPES.includes(x.type as AccountType) &&
    typeof x.name === "string" &&
    typeof x.balance === "number" &&
    typeof x.rate === "number" &&
    typeof x.currentMonthlyPayment === "number"
  );
}

export function isStrategy(s: unknown): s is Strategy {
  if (!s || typeof s !== "object") return false;
  const x = s as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    typeof x.years === "number" &&
    Array.isArray(x.steps)
  );
}

const CSV_COLS = [
  "id",
  "name",
  "type",
  "balance",
  "rate",
  "currentMonthlyPayment",
  "minMonthlyPayment",
  "escrow",
  "targetBalance",
  "contributionCap",
  "lockMonths",
  "matchPercent",
  "matchMax",
] as const;

const esc = (v: string | number | undefined) => {
  if (v === undefined || v === "") return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function accountsToCSV(accounts: Account[]): string {
  const rows = [CSV_COLS.join(",")];
  for (const a of accounts) {
    rows.push(
      [
        esc(a.id),
        esc(a.name),
        esc(a.type),
        esc(a.balance),
        esc(a.rate),
        esc(a.currentMonthlyPayment),
        esc(a.minMonthlyPayment),
        esc(a.escrow),
        esc(a.targetBalance),
        esc(a.contributionCap),
        esc(a.lockMonths),
        esc(a.employerMatch?.percent),
        esc(a.employerMatch?.maxAmount),
      ].join(",")
    );
  }
  return rows.join("\n");
}

export function accountsFromCSV(text: string): Account[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const cell = (row: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? row[i] ?? "" : "";
  };
  const num = (row: string[], name: string) => {
    const v = parseFloat(cell(row, name));
    return Number.isFinite(v) ? v : 0;
  };
  const opt = (row: string[], name: string) => {
    const c = cell(row, name);
    const v = parseFloat(c);
    const has = c !== "";
    const out = Number.isFinite(v) ? v : 0;
    return has ? out : undefined;
  };

  const accounts: Account[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const type = cell(row, "type");
    const id = cell(row, "id");
    if (!ACCOUNT_TYPES.includes(type as AccountType)) continue;
    const account: Account = {
      id: id || crypto.randomUUID(),
      type: type as AccountType,
      name: cell(row, "name") || id,
      balance: num(row, "balance"),
      rate: num(row, "rate"),
      currentMonthlyPayment: num(row, "currentMonthlyPayment"),
    };
    const t = opt(row, "targetBalance");
    const c = opt(row, "contributionCap");
    const l = opt(row, "lockMonths");
    const mi = opt(row, "minMonthlyPayment");
    const es = opt(row, "escrow");
    if (t !== undefined) account.targetBalance = t;
    if (c !== undefined) account.contributionCap = c;
    if (l !== undefined) account.lockMonths = l;
    if (mi !== undefined) account.minMonthlyPayment = mi;
    if (es !== undefined) account.escrow = es;
    const mp = opt(row, "matchPercent");
    const mm = opt(row, "matchMax");
    if (mp !== undefined && mm !== undefined) account.employerMatch = { percent: mp, maxAmount: mm };
    accounts.push(account);
  }
  return accounts;
}

/** Minimal CSV parser: RFC-compliant quotes, keeps blank cells. */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

export function yearsToCSV(sb: SavedBudget, projection: Projection, accounts: Account[]): string {
  const years = Math.floor(projection.snapshots.length / 12);
  const head = ["Year", ...accounts.map((a) => a.name), "Net Worth", "Interest Paid", "Allocations"];
  const lines = [head.join(",")];
  for (let y = 1; y <= years; y++) {
    const snap = projection.snapshots[y * 12 - 1];
    if (!snap) continue;
    const prev = y > 1 ? projection.snapshots[(y - 1) * 12 - 1] : null;
    let nw = snap.residualCash;
    const balances: number[] = accounts.map((a) => {
      const sign = isDebt(a.type) ? -1 : 1;
      nw += sign * snap.balances[a.id];
      return snap.balances[a.id] ?? 0;
    });
    const unallocated = (snap.residualCash ?? 0) - (prev ? prev.residualCash ?? 0 : 0);
    const parts = accounts.map((a) => {
      const delta = (snap.contribByAccount[a.id] ?? 0) - (prev ? prev.contribByAccount[a.id] ?? 0 : 0);
      return delta > 0 ? `${a.name} +${Math.round(delta)}` : null;
    });
    if (unallocated > 0) parts.push(`unallocated +${Math.round(unallocated)}`);
    lines.push([y, ...balances, nw, snap.interestPaid, `"${(parts.filter(Boolean) as string[]).join(" · ")}"`].join(","));
  }
  return lines.join("\n");
}

export function downloadFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}