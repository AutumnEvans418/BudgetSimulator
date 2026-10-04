"use client";

import { useMemo, useState } from "react";
import type { Account, Budget, Strategy } from "../lib/model";
import {
  ACCOUNT_TYPES,
  accountTypeLabel,
  emptyAccount,
  isDebt,
  monthlySurplus,
  netMonthly,
} from "../lib/model";
import type { AccountType } from "../lib/model";
import { simulate } from "../lib/simulate";
import type { Projection } from "../lib/simulate";
import { finalNetWorth, totalContributions, totalInterestPaid } from "../lib/simulate";
import { ALL_TEMPLATES, getTemplate } from "../lib/templates";
import type { TemplateId } from "../lib/templates";
import { isDebt as isDebtType } from "../lib/model";

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const sampleAccounts: Account[] = [
  { id: "ef", type: "emergency_fund", name: "Emergency Fund", balance: 5000, rate: 0.04, currentMonthlyPayment: 0, targetBalance: 20000 },
  { id: "loan", type: "personal_loan", name: "Personal Loan", balance: 15000, rate: 0.099, currentMonthlyPayment: 250 },
  { id: "k401", type: "retirement_401k", name: "401(k)", balance: 20000, rate: 0.07, currentMonthlyPayment: 300, contributionCap: 23000, employerMatch: { percent: 0.04, maxAmount: 500 } },
  { id: "inv", type: "investment", name: "Investment", balance: 8000, rate: 0.08, currentMonthlyPayment: 0 },
  { id: "hsa", type: "hsa", name: "HSA", balance: 1000, rate: 0.05, currentMonthlyPayment: 0, contributionCap: 4150 },
];

export default function Home() {
  const [budget, setBudget] = useState<Budget>({ grossMonthly: 9000, deductionsMonthly: 2500, expensesMonthly: 3500 });
  const [accounts, setAccounts] = useState<Account[]>(sampleAccounts);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [years, setYears] = useState(30);
  const [run, setRun] = useState(0);

  const apply = (patch: Partial<Budget>) => setBudget((b) => ({ ...b, ...patch }));

  const updateAccount = (id: string, patch: Partial<Account>) =>
    setAccounts((as) => as.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const removeAccount = (id: string) => setAccounts((as) => as.filter((a) => a.id !== id));

  const addAccount = (type: AccountType) =>
    setAccounts((as) => [...as, emptyAccount(type)]);

  const addStrategy = (templateId: TemplateId) =>
    setStrategies((ss) => [...ss, getTemplate(templateId).build(accounts, years)]);

  const removeStrategy = (id: string) =>
    setStrategies((ss) => ss.filter((s) => s.id !== id));

  const results = useMemo(() => {
    if (run === 0) return null;
    return {
      runs: strategies.map((s) => simulate(budget, accounts, s)),
      baseline: simulate(
        budget,
        accounts,
        { id: "baseline", name: "Doing Nothing", steps: [], years } as Strategy
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-5xl flex-col gap-8 px-8 py-10">
        <Title />
        <BudgetEditor budget={budget} onChange={apply} />
        <AccountsEditor accounts={accounts} onAdd={addAccount} onUpdate={updateAccount} onRemove={removeAccount} />
        <Simulation
          accounts={accounts}
          years={years}
          onYears={setYears}
          strategies={strategies}
          onAddStrategy={addStrategy}
          onRemoveStrategy={removeStrategy}
          onRun={() => setRun((r) => r + 1)}
          results={results}
        />
      </main>
    </div>
  );
}

export function Title() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Budget Simulator
      </h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">
        Enter your accounts and compare savings strategies over the years — all in your browser.
      </p>
    </div>
  );
}

function BudgetEditor({ budget, onChange }: { budget: Budget; onChange: (p: Partial<Budget>) => void }) {
  const surplus = monthlySurplus(budget);
  const net = netMonthly(budget);
  return (
    <section className="card" aria-label="Budget">
      <h2 className="text-lg font-semibold">Budget</h2>
      <div className="input-row">
        <Field label="Gross Pay / month" value={budget.grossMonthly} onChange={(v) => onChange({ grossMonthly: v })} />
        <Field label="Deductions / month" value={budget.deductionsMonthly} onChange={(v) => onChange({ deductionsMonthly: v })} />
        <Field label="Living Expenses / month" value={budget.expensesMonthly} onChange={(v) => onChange({ expensesMonthly: v })} />
      </div>
      <div className="text-sm text-zinc-600 dark:text-zinc-400">
        Net income <b>{fmt.format(net)}</b> · Surplus to invest <b className="text-emerald-600 dark:text-emerald-400">{fmt.format(surplus)}/mo</b>
      </div>
    </section>
  );
}

function FieldText({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="label">{label}</span>
      <input
        type="text"
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label>
      <span className="label">{label}</span>
      <input
        type="number"
        min={0}
        className="field"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  );
}

function AccountsEditor({
  accounts,
  onAdd,
  onUpdate,
  onRemove,
}: {
  accounts: Account[];
  onAdd: (t: AccountType) => void;
  onUpdate: (id: string, patch: Partial<Account>) => void;
  onRemove: (id: string) => void;
}) {
  const [pick, setPick] = useState<AccountType>("checking");
  return (
    <section className="card" aria-label="Accounts">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Accounts</h2>
        <div className="flex gap-2">
          <select aria-label="account type" className="field w-56" value={pick} onChange={(e) => setPick(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {accountTypeLabel(t)}
              </option>
            ))}
          </select>
          <button className="btn-primary" onClick={() => onAdd(pick)}>
            Add
          </button>
        </div>
      </div>
      {accounts.length === 0 && <p className="text-sm text-zinc-500">No accounts yet. Add one above.</p>}
      {accounts.map((a) => (
        <AccountRow key={a.id} account={a} onUpdate={onUpdate} onRemove={onRemove} />
      ))}
    </section>
  );
}

function AccountRow({
  account,
  onUpdate,
  onRemove,
}: {
  account: Account;
  onUpdate: (id: string, patch: Partial<Account>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">
          {account.name} <span className="text-xs text-zinc-500">({accountTypeLabel(account.type)})</span>
        </span>
        <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onRemove(account.id)}>
          Remove
        </button>
      </div>
      <div className="input-row">
        <FieldText label="Name" value={account.name} onChange={(v) => onUpdate(account.id, { name: v })} />
        <Field label={isDebt(account.type) ? "Amount Owed" : "Balance"} value={account.balance} onChange={(v) => onUpdate(account.id, { balance: v })} />
        <Field label="Rate %/yr" value={account.rate * 100} onChange={(v) => onUpdate(account.id, { rate: v / 100 })} />
        <Field label="Current Payment /mo" value={account.currentMonthlyPayment} onChange={(v) => onUpdate(account.id, { currentMonthlyPayment: v })} />
        {(account.type === "emergency_fund" || account.type === "cd") && (
          <Field label="Target Balance" value={account.targetBalance ?? 0} onChange={(v) => onUpdate(account.id, { targetBalance: v })} />
        )}
        {(account.type === "retirement_401k" || account.type === "hsa" || account.type === "ira" || account.type === "roth_ira") && (
          <Field label="Annual Cap" value={account.contributionCap ?? 0} onChange={(v) => onUpdate(account.id, { contributionCap: v })} />
        )}
      </div>
    </div>
  );
}

function Simulation({
  accounts,
  years,
  onYears,
  strategies,
  onAddStrategy,
  onRemoveStrategy,
  onRun,
  results,
}: {
  accounts: Account[];
  years: number;
  onYears: (n: number) => void;
  strategies: Strategy[];
  onAddStrategy: (t: TemplateId) => void;
  onRemoveStrategy: (id: string) => void;
  onRun: () => void;
  results: { runs: Projection[]; baseline: Projection } | null;
}) {
  const [pick, setPick] = useState<TemplateId>("max-net-worth");
  return (
    <section className="card" aria-label="Simulation">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Simulation</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            Years
            <input type="number" min={1} max={80} className="field w-20" value={years} onChange={(e) => onYears(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <button className="btn-primary" onClick={onRun} disabled={strategies.length === 0}>
            Run
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <select aria-label="template" className="field w-72" value={pick} onChange={(e) => setPick(e.target.value as TemplateId)}>
          {ALL_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id} disabled={!t.applicable(accounts)}>
              {t.label}
            </option>
          ))}
        </select>
        <button className="btn-ghost" onClick={() => onAddStrategy(pick)}>
          Add Strategy
        </button>
      </div>
      <p className="text-xs text-zinc-500">{ALL_TEMPLATES.find((t) => t.id === pick)?.description}</p>

      {strategies.length === 0 && <p className="text-sm text-zinc-500">Add a strategy, then Run to compare.</p>}
      <ul className="flex flex-col gap-2">
        {strategies.map((s) => (
          <li key={s.id} data-testid="strategy-row" className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
            <div>
              <b>{s.name}</b>
              <span className="ml-2 text-zinc-500">
                {s.steps.length} step{s.steps.length === 1 ? "" : "s"} · {s.years}yr
              </span>
            </div>
            <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onRemoveStrategy(s.id)}>
              Remove
            </button>
          </li>
        ))}
      </ul>

      {results && <Results results={results} accounts={accounts} />}
    </section>
  );
}

function Results({ results, accounts }: { results: { runs: Projection[]; baseline: Projection }; accounts: Account[] }) {
  return (
    <div className="flex flex-col gap-6">
      <SummaryTable results={results} accounts={accounts} />
      <YearlyBreakdown results={results} accounts={accounts} />
      <Charts results={results} accounts={accounts} />
    </div>
  );
}

function YearlyBreakdown({ results, accounts }: { results: { runs: Projection[]; baseline: Projection }; accounts: Account[] }) {
  const options = [
    { id: "baseline", label: results.baseline.strategyName, projection: results.baseline },
    ...results.runs.map((r) => ({ id: r.strategyName, label: r.strategyName, projection: r })),
  ];
  const [pick, setPick] = useState(options[0].id);
  const projection = options.find((o) => o.id === pick) ?? options[0];
  const years = Math.floor(projection.projection.snapshots.length / 12);

  return (
    <div data-testid="yearly-breakdown">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Year by Year</h2>
        <select aria-label="breakdown strategy" className="field w-64" value={projection.id} onChange={(e) => setPick(e.target.value)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Year</th>
              {accounts.map((a) => (
                <th key={a.id} className="text-right">
                  {a.name}
                </th>
              ))}
              <th className="text-right">Net Worth</th>
              <th className="text-right">Interest Paid</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: years }, (_, i) => i + 1).map((y) => {
              const snap = projection.projection.snapshots[y * 12 - 1];
              if (!snap) return null;
              let nw = snap.residualCash;
              const cells = accounts.map((a) => {
                const bal = snap.balances[a.id];
                const sign = isDebt(a.type) ? -1 : 1;
                nw += sign * bal;
                return (
                  <td key={a.id} className="text-right tabular-nums">
                    <span className={sign < 0 ? "text-red-600" : "text-zinc-800 dark:text-zinc-200"}>{fmt.format(bal)}</span>
                  </td>
                );
              });
              return (
                <tr key={y}>
                  <td>Year {y}</td>
                  {cells}
                  <td className="text-right tabular-nums font-semibold">{fmt.format(nw)}</td>
                  <td className="text-right tabular-nums text-red-600">{fmt.format(snap.interestPaid)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function nwSeries(p: Projection, accounts: Account[]) {
  return p.snapshots.map((s) => {
    let nw = s.residualCash;
    for (const a of accounts) {
      nw += (isDebtType(a.type) ? -1 : 1) * s.balances[a.id];
    }
    return nw;
  });
}

function SummaryTable({ results, accounts }: { results: { runs: Projection[]; baseline: Projection }; accounts: Account[] }) {
  const baseNw = finalNetWorth(results.baseline, accounts);
  const baseInt = totalInterestPaid(results.baseline);
  const rows = [
    { name: results.baseline.strategyName, nw: baseNw, int: baseInt, contribution: totalContributions(results.baseline), baseline: true },
    ...results.runs.map((r) => ({
      name: r.strategyName,
      nw: finalNetWorth(r, accounts),
      int: totalInterestPaid(r),
      contribution: totalContributions(r),
      baseline: false,
    })),
  ];
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Strategy</th>
          <th className="text-right">Final Net Worth</th>
          <th className="text-right">Cum. Interest Paid</th>
          <th className="text-right">Cum. Contributions</th>
          <th className="text-right">Δ NW vs {results.baseline.strategyName}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td>{r.name}{r.baseline && <span className="ml-2 text-xs text-zinc-500">(baseline)</span>}</td>
            <td className="text-right">{fmt.format(r.nw)}</td>
            <td className="text-right">{fmt.format(r.int)}</td>
            <td className="text-right">{fmt.format(r.contribution)}</td>
            <td className={`text-right ${r.nw - baseNw >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {r.baseline ? "—" : fmt.format(r.nw - baseNw)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Charts({ results, accounts }: { results: { runs: Projection[]; baseline: Projection }; accounts: Account[] }) {
  const series = [
    { name: results.baseline.strategyName, data: nwSeries(results.baseline, accounts), dashed: true },
    ...results.runs.map((r) => ({ name: r.strategyName, data: nwSeries(r, accounts), dashed: false })),
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[0, 1].map((chart) => (
        <NwChart key={chart} chart={chart} series={series} results={results} />
      ))}
    </div>
  );
}

function NwChart({
  chart,
  series,
  results,
}: {
  chart: number;
  series: { name: string; data: number[]; dashed: boolean }[];
  results: { runs: Projection[]; baseline: Projection };
}) {
  const W = 420;
  const H = 220;
  const pad = 30;
  const all = chart === 0
    ? series
    : [
        { name: results.baseline.strategyName, data: results.baseline.snapshots.map((s) => s.interestPaid), dashed: true },
        ...results.runs.map((r) => ({ name: r.strategyName, data: r.snapshots.map((s) => s.interestPaid), dashed: false })),
      ];
  const max = Math.max(1, ...all.flatMap((s) => s.data));
  const min = Math.min(0, ...all.flatMap((s) => s.data));
  const span = max - min || 1;
  const x = (i: number, len: number) => pad + (i / Math.max(1, len - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{chart === 0 ? "Net Worth by Year" : "Cumulative Interest Paid"}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={chart === 0 ? "Net worth chart" : "Interest chart"} data-testid={chart === 0 ? "nw-chart" : "int-chart"}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={pad} x2={W - pad} y1={y(min + t * span)} y2={y(min + t * span)} stroke="#d4d4d4" strokeWidth={1} />
        ))}
        {all.map((s) => (
          <polyline
            key={s.name}
            points={s.data.map((v, i) => `${x(i, s.data.length)},${y(v)}`).join(" ")}
            fill="none"
            stroke={chart === 0 ? "steelblue" : "crimson"}
            strokeWidth={1.5}
            strokeDasharray={s.dashed ? "4 3" : undefined}
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-2 text-xs">
        {all.map((s) => (
          <span key={s.name} className={s.dashed ? "italic text-zinc-500" : ""}>
            — {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}