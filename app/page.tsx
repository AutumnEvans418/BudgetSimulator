"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Account, Budget, Strategy, Allocation, StopCondition } from "../lib/model";
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
import {
  finalNetWorth,
  totalContributions,
  totalInterestPaid,
} from "../lib/simulate";
import { ALL_TEMPLATES, getTemplate } from "../lib/templates";
import type { TemplateId } from "../lib/templates";
import { isDebt as isDebtType } from "../lib/model";
import {
  accountsFromCSV,
  accountsToCSV,
  budgetFromJSON,
  downloadFile,
  loadAll,
  makeExampleBudget,
  persist,
  readFile,
  yearsToCSV,
  budgetToJSON,
} from "../lib/storage";
import type { SavedBudget } from "../lib/storage";

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function Home() {
  const [init] = useState(() => {
    const saved = loadAll();
    if (saved.budgets.length > 0) {
      const active = saved.budgets.find((b) => b.id === saved.activeId) ?? saved.budgets[0];
      return { budgets: saved.budgets, activeId: active.id };
    }
    const example = makeExampleBudget();
    return { budgets: [example], activeId: example.id };
  });
  const [budgets, setBudgets] = useState<SavedBudget[]>(init.budgets);
  const [activeId, setActiveId] = useState(init.activeId);
  // ponytail: init at 1 so the example (and any loaded budget) shows results without pressing Run
  const [run, setRun] = useState(1);
  const [savedFlash, setSavedFlash] = useState(false);
  const jsonInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);

  // ponytail: debounced autosave; explicit Save button flushes immediately
  useEffect(() => {
    const t = setTimeout(() => persist(budgets, activeId), 500);
    return () => clearTimeout(t);
  }, [budgets, activeId]);

  const active = budgets.find((b) => b.id === activeId) ?? budgets[0];
  const isExample = active.id === "example";

  const patchActive = (patch: Partial<SavedBudget>) =>
    setBudgets((bs) => bs.map((b) => (b.id === active.id ? { ...b, ...patch } : b)));

  const selectBudget = (id: string) => {
    setActiveId(id);
    setRun((r) => r + 1);
  };

  const duplicateActive = () => {
    const copy: SavedBudget = { ...active, id: crypto.randomUUID(), name: `Copy of ${active.name}`, updatedAt: Date.now() };
    setBudgets((bs) => [...bs, copy]);
    setActiveId(copy.id);
    setRun((r) => r + 1);
  };

  const deleteActive = () => {
    if (isExample) return;
    setBudgets((bs) => {
      const rest = bs.filter((b) => b.id !== active.id);
      setActiveId((activeId === active.id ? rest[0].id : activeId));
      setRun((r) => r + 1);
      return rest;
    });
  };

  const newBudget = () => {
    const doc: SavedBudget = {
      id: crypto.randomUUID(),
      name: "Untitled",
      budget: { grossMonthly: 0, deductionsMonthly: 0, expensesMonthly: 0 },
      accounts: [],
      strategies: [],
      years: 30,
      updatedAt: Date.now(),
    };
    setBudgets((bs) => [...bs, doc]);
    setActiveId(doc.id);
    setRun((r) => r + 1);
  };

  const saveNow = () => {
    persist(budgets, activeId);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  };

  const importJson = async (file: File) => {
    const doc = budgetFromJSON(await readFile(file));
    if (!doc) return;
    const fresh = { ...doc, id: crypto.randomUUID(), name: doc.name || "Imported" };
    setBudgets((bs) => [...bs, fresh]);
    setActiveId(fresh.id);
    setRun((r) => r + 1);
  };

  const importCsv = async (file: File) => {
    const accounts = accountsFromCSV(await readFile(file));
    if (accounts.length === 0) return;
    const doc: SavedBudget = {
      id: crypto.randomUUID(),
      name: file.name.replace(/\.csv$/i, "") || "Imported (CSV)",
      budget: { grossMonthly: 0, deductionsMonthly: 0, expensesMonthly: 0 },
      accounts,
      strategies: [],
      years: 30,
      updatedAt: Date.now(),
    };
    setBudgets((bs) => [...bs, doc]);
    setActiveId(doc.id);
    setRun((r) => r + 1);
  };

  const exportResultsCsv = () => {
    if (!results) return;
    const run = results.runs[0];
    downloadFile(
      `${active.name.toLowerCase().replace(/\s+/g, "-")}-results.csv`,
      yearsToCSV(active, run, active.accounts),
      "text/csv"
    );
  };

  const results = useMemo(() => {
    if (run === 0) return null;
    return {
      runs: active.strategies.map((s) => simulate(active.budget, active.accounts, s)),
      baseline: simulate(
        active.budget,
        active.accounts,
        { id: "baseline", name: "Doing Nothing", steps: [], years: active.years } as Strategy
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const addAccount = (type: AccountType) =>
    patchActive({ accounts: [...active.accounts, emptyAccount(type)] });

  const updateAccount = (id: string, patch: Partial<Account>) =>
    patchActive({ accounts: active.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  const removeAccount = (id: string) =>
    patchActive({ accounts: active.accounts.filter((a) => a.id !== id) });

  const addStrategy = (templateId: TemplateId) =>
    patchActive({
      strategies: [
        ...active.strategies,
        { ...getTemplate(templateId).build(active.accounts, active.years), id: crypto.randomUUID() },
      ],
    });

  const addBlankStrategy = () =>
    patchActive({
      strategies: [
        ...active.strategies,
        {
          id: crypto.randomUUID(),
          name: "Custom",
          years: active.years,
          steps: [{ name: "Step 1", allocations: [] }],
        },
      ],
    });

  const updateStrategy = (id: string, patch: Partial<Strategy>) =>
    patchActive({
      strategies: active.strategies.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });

  const removeStrategy = (id: string) =>
    patchActive({ strategies: active.strategies.filter((s) => s.id !== id) });

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-5xl flex-col gap-8 px-8 py-10">
        <Title />
        <div className="card">
          <BudgetBar
            budgets={budgets}
            active={active}
            savedFlash={savedFlash}
            onSelect={selectBudget}
            onRename={(name) => patchActive({ name })}
            onNew={newBudget}
            onDuplicate={duplicateActive}
            onDelete={deleteActive}
            canDelete={!isExample}
            onSave={saveNow}
            onJsonImport={importJson}
            onCsvImport={importCsv}
            onExportJson={() =>
              downloadFile(`${active.name.toLowerCase().replace(/\s+/g, "-")}.json`, budgetToJSON(active), "application/json")
            }
            onExportAccounts={() =>
              downloadFile(`${active.name.toLowerCase().replace(/\s+/g, "-")}-accounts.csv`, accountsToCSV(active.accounts), "text/csv")
            }
            onExportResults={exportResultsCsv}
            resultsReady={!!results}
            jsonInputRef={jsonInput}
            csvInputRef={csvInput}
          />
          <BudgetEditor budget={active.budget} onChange={(patch) => patchActive({ budget: { ...active.budget, ...patch } })} />
        </div>
        <AccountsEditor accounts={active.accounts} onAdd={addAccount} onUpdate={updateAccount} onRemove={removeAccount} />
        <Simulation
          accounts={active.accounts}
          years={active.years}
          onYears={(y) => patchActive({ years: y })}
          strategies={active.strategies}
          onAddStrategy={addStrategy}
          onAddBlankStrategy={addBlankStrategy}
          onUpdateStrategy={updateStrategy}
          onRemoveStrategy={removeStrategy}
          onRun={() => setRun((r) => r + 1)}
          results={results}
        />
      </main>
    </div>
  );
}

function BudgetBar({
  budgets,
  active,
  savedFlash,
  onSelect,
  onRename,
  onNew,
  onDuplicate,
  onDelete,
  canDelete,
  onSave,
  onJsonImport,
  onCsvImport,
  onExportJson,
  onExportAccounts,
  onExportResults,
  resultsReady,
  jsonInputRef,
  csvInputRef,
}: {
  budgets: SavedBudget[];
  active: SavedBudget;
  savedFlash: boolean;
  onSelect: (id: string) => void;
  onRename: (name: string) => void;
  onNew: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
  onSave: () => void;
  onJsonImport: (f: File) => void;
  onCsvImport: (f: File) => void;
  onExportJson: () => void;
  onExportAccounts: () => void;
  onExportResults: () => void;
  resultsReady: boolean;
  jsonInputRef: React.RefObject<HTMLInputElement | null>;
  csvInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-4 dark:border-zinc-800">
      <select aria-label="budget" className="field w-44" value={active.id} onChange={(e) => onSelect(e.target.value)}>
        {budgets.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <input
        aria-label="Budget name"
        className="field w-52"
        value={active.name}
        onChange={(e) => onRename(e.target.value)}
      />
      <button className="btn-ghost" onClick={onNew}>
        New Budget
      </button>
      <button className="btn-ghost" onClick={onDuplicate}>
        Duplicate
      </button>
      <button className="btn-ghost text-red-600" disabled={!canDelete} onClick={onDelete}>
        Delete
      </button>
      <button className="btn-ghost" onClick={onSave}>
        {savedFlash ? "Saved ✓" : "Save"}
      </button>
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => jsonInputRef.current?.click()}>
          Import JSON
        </button>
        <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => csvInputRef.current?.click()}>
          Import CSV
        </button>
        <button className="btn-ghost px-2 py-0.5 text-xs" onClick={onExportJson}>
          Export JSON
        </button>
        <button className="btn-ghost px-2 py-0.5 text-xs" onClick={onExportAccounts}>
          Export Accounts CSV
        </button>
        <button className="btn-ghost px-2 py-0.5 text-xs" disabled={!resultsReady} onClick={onExportResults}>
          Export Results CSV
        </button>
      </div>
      <input ref={jsonInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onJsonImport(f); e.target.value = ""; }} />
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onCsvImport(f); e.target.value = ""; }} />
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
        Enter your accounts and compare savings strategies over the years all in your browser.
      </p>
    </div>
  );
}

function Section({
  title,
  summary,
  controls,
  defaultOpen = true,
  children,
}: {
  title: string;
  summary?: ReactNode;
  controls?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-zinc-400">{open ? "▾" : "▸"}</span>
          <span className="text-lg font-semibold">{title}</span>
          {summary && <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">{summary}</span>}
        </button>
        {controls}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

function BudgetEditor({ budget, onChange }: { budget: Budget; onChange: (p: Partial<Budget>) => void }) {
  const surplus = monthlySurplus(budget);
  const net = netMonthly(budget);
  return (
    <Section
      title="Budget"
      summary={`Net ${fmt.format(net)}/mo · ${fmt.format(surplus)}/mo surplus`}
    >
      <div className="input-row">
        <Field label="Gross Pay / month" value={budget.grossMonthly} onChange={(v) => onChange({ grossMonthly: v })} />
        <Field label="Deductions / month" value={budget.deductionsMonthly} onChange={(v) => onChange({ deductionsMonthly: v })} />
        <Field label="Living Expenses / month" value={budget.expensesMonthly} onChange={(v) => onChange({ expensesMonthly: v })} />
      </div>
      <div className="text-sm text-zinc-600 dark:text-zinc-400">
        Net income <b>{fmt.format(net)}</b> · Surplus to invest <b className="text-emerald-600 dark:text-emerald-400">{fmt.format(surplus)}/mo</b>
      </div>
    </Section>
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
    <Section
      title="Accounts"
      summary={`${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
      controls={
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
      }
    >
      {accounts.length === 0 && <p className="text-sm text-zinc-500">No accounts yet. Add one above.</p>}
      {accounts.map((a) => (
        <AccountRow key={a.id} account={a} onUpdate={onUpdate} onRemove={onRemove} />
      ))}
    </Section>
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
        {isDebt(account.type) && (
          <>
            <Field label="Min Payment /mo" value={account.minMonthlyPayment ?? 0} onChange={(v) => onUpdate(account.id, { minMonthlyPayment: v })} />
            <Field label="Escrow /mo" value={account.escrow ?? 0} onChange={(v) => onUpdate(account.id, { escrow: v })} />
          </>
        )}
        {(account.type === "emergency_fund" || account.type === "cd") && (
          <Field label="Target Balance" value={account.targetBalance ?? 0} onChange={(v) => onUpdate(account.id, { targetBalance: v })} />
        )}
        {(account.type === "retirement_401k" || account.type === "hsa" || account.type === "ira" || account.type === "roth_ira") && (
          <Field label="Annual Cap" value={account.contributionCap ?? 0} onChange={(v) => onUpdate(account.id, { contributionCap: v })} />
        )}
        {account.type === "retirement_401k" && (
          <>
            <Field
              label="Employer Match %"
              value={(account.employerMatch?.percent ?? 0) * 100}
              onChange={(v) => onUpdate(account.id, { employerMatch: { percent: v / 100, maxAmount: account.employerMatch?.maxAmount ?? 0 } })}
            />
            <Field
              label="Match Max /mo"
              value={account.employerMatch?.maxAmount ?? 0}
              onChange={(v) => onUpdate(account.id, { employerMatch: { percent: account.employerMatch?.percent ?? 0, maxAmount: v } })}
            />
          </>
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
  onAddBlankStrategy,
  onUpdateStrategy,
  onRemoveStrategy,
  onRun,
  results,
}: {
  accounts: Account[];
  years: number;
  onYears: (n: number) => void;
  strategies: Strategy[];
  onAddStrategy: (t: TemplateId) => void;
  onAddBlankStrategy: () => void;
  onUpdateStrategy: (id: string, patch: Partial<Strategy>) => void;
  onRemoveStrategy: (id: string) => void;
  onRun: () => void;
  results: { runs: Projection[]; baseline: Projection } | null;
}) {
  const [pick, setPick] = useState<TemplateId>("match-first");
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = strategies.find((s) => s.id === editingId);
  return (
    <Section
      title="Simulation"
      summary={`${strategies.length} strateg${strategies.length === 1 ? "y" : "ies"}`}
      controls={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            Years
            <input type="number" min={1} max={80} className="field w-20" value={years} onChange={(e) => onYears(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <button className="btn-primary" onClick={onRun} disabled={strategies.length === 0}>
            Run
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
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
        <button className="btn-ghost" onClick={onAddBlankStrategy}>
          Blank
        </button>
      </div>
      <p className="text-xs text-zinc-500">{ALL_TEMPLATES.find((t) => t.id === pick)?.description}</p>

      {strategies.length === 0 && <p className="text-sm text-zinc-500">Add a strategy, then Run to compare.</p>}
      <ul className="flex flex-col gap-2">
        {strategies.map((s) => (
          <li key={s.id} data-testid="strategy-row" className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
            <button className="text-left font-medium hover:underline" onClick={() => setEditingId(s.id)}>
              {s.name}
            </button>
            <div className="flex items-center gap-3">
              <span className="text-zinc-500">
                {s.steps.length} step{s.steps.length === 1 ? "" : "s"} · {s.years}yr
              </span>
              <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setEditingId(s.id)}>
                Edit
              </button>
              <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onRemoveStrategy(s.id)}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Edit Strategy</h3>
            <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => setEditingId(null)}>
              Close
            </button>
          </div>
          <StrategyBuilder strategy={editing} accounts={accounts} onUpdate={(patch) => onUpdateStrategy(editing.id, patch)} />
        </div>
      )}

      {results && <Results results={results} accounts={accounts} />}
    </Section>
  );
}

function StrategyBuilder({
  strategy,
  accounts,
  onUpdate,
}: {
  strategy: Strategy;
  accounts: Account[];
  onUpdate: (patch: Partial<Strategy>) => void;
}) {
  const updateStep = (i: number, patch: Partial<Strategy["steps"][number]>) =>
    onUpdate({ steps: strategy.steps.map((st, idx) => (idx === i ? { ...st, ...patch } : st)) });

  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= strategy.steps.length) return;
    const steps = [...strategy.steps];
    [steps[i], steps[j]] = [steps[j], steps[i]];
    onUpdate({ steps });
  };

  const addStep = () => {
    const name = `Step ${strategy.steps.length + 1}`;
    const alloc = accounts.length > 0 ? [{ accountId: accounts[0].id, share: 1, stop: "cap" as const }] : [];
    onUpdate({ steps: [...strategy.steps, { name, allocations: alloc }] });
  };

  return (
    <div data-testid="strategy-builder" className="flex flex-col gap-3">
      <div className="input-row">
        <FieldText label="Strategy name" value={strategy.name} onChange={(v) => onUpdate({ name: v })} />
        <Field label="Years" value={strategy.years} onChange={(v) => onUpdate({ years: Math.max(1, v) })} />
      </div>

      {strategy.steps.length === 0 && (
        <p className="text-sm text-zinc-500">No steps. Surplus will sit unallocated. Add a step below.</p>
      )}

      {strategy.steps.map((st, i) => (
        <div key={i} data-testid="strategy-step" className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <FieldText label="Step name" value={st.name} onChange={(v) => updateStep(i, { name: v })} />
            <div className="flex gap-1">
              <button className="btn-ghost px-2 py-0.5 text-xs" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                ↑
              </button>
              <button className="btn-ghost px-2 py-0.5 text-xs" disabled={i === strategy.steps.length - 1} onClick={() => moveStep(i, 1)}>
                ↓
              </button>
              <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => onUpdate({ steps: strategy.steps.filter((_, idx) => idx !== i) })}>
                Delete
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {st.allocations.map((al, ai) => (
              <AllocationRow
                key={ai}
                allocation={al}
                accounts={accounts}
                onChange={(patch) =>
                  updateStep(i, { allocations: st.allocations.map((x, idx) => (idx === ai ? { ...x, ...patch } : x)) })
                }
                onRemove={() => updateStep(i, { allocations: st.allocations.filter((_, idx) => idx !== ai) })}
              />
            ))}
            <button
              className="btn-ghost px-2 py-0.5 text-xs self-start"
              disabled={accounts.length === 0}
              onClick={() =>
                updateStep(i, { allocations: [...st.allocations, { accountId: accounts[0].id, share: 1, stop: "cap" }] })
              }
            >
              + Allocation
            </button>
          </div>
        </div>
      ))}

      <button className="btn-ghost self-start" onClick={addStep}>
        + Step
      </button>
    </div>
  );
}

function AllocationRow({
  allocation,
  accounts,
  onChange,
  onRemove,
}: {
  allocation: Allocation;
  accounts: Account[];
  onChange: (patch: Partial<Allocation>) => void;
  onRemove: () => void;
}) {
  const accName = accounts.find((a) => a.id === allocation.accountId)?.name ?? "(removed account)";
  const stopLabels: Record<StopCondition, string> = {
    payoff: "Pay off",
    target: "Reach target",
    cap: "Monthly cap",
    match: "Capture match",
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <select className="field w-44" value={allocation.accountId} aria-label="allocation account" onChange={(e) => onChange({ accountId: e.target.value })}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <select className="field w-36" value={allocation.stop} aria-label="allocation stop" onChange={(e) => onChange({ stop: e.target.value as Allocation["stop"] })}>
        {Object.entries(stopLabels).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          checked={allocation.share === null}
          onChange={(e) => onChange({ share: e.target.checked ? null : 1 })}
        />
        Remainder
      </label>
      {allocation.share !== null && (
        <Field label="Share %" value={allocation.share * 100} onChange={(v) => onChange({ share: Math.min(100, Math.max(0, v)) / 100 })} />
      )}
      <button className="btn-ghost px-2 py-0.5 text-xs" onClick={onRemove}>
        ×
      </button>
      <span className="text-xs text-zinc-500">{accName}</span>
    </div>
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
  const [open, setOpen] = useState(false);

  return (
    <div data-testid="yearly-breakdown">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} Year by Year`}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="text-zinc-400">{open ? "▾" : "▸"}</span>
          <h2 className="text-lg font-semibold">Year by Year</h2>
        </button>
      </div>
      {open && (
        <>
          <div className="mb-2 flex justify-end">
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
              <th>Allocations this year</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: years }, (_, i) => i + 1).map((y) => {
              const snap = projection.projection.snapshots[y * 12 - 1];
              if (!snap) return null;
              const prev = y > 1 ? projection.projection.snapshots[(y - 1) * 12 - 1] : null;
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
              const unallocated = (snap.residualCash ?? 0) - (prev ? prev.residualCash ?? 0 : 0);
              const parts = accounts
                .map((a) => {
                  const delta = (snap.contribByAccount[a.id] ?? 0) - (prev ? prev.contribByAccount[a.id] ?? 0 : 0);
                  return delta > 0 ? `${a.name} +${fmt.format(delta)}` : null;
                })
                .filter(Boolean) as string[];
              if (unallocated > 0) parts.push(`unallocated +${fmt.format(unallocated)}`);
              return (
                <tr key={y}>
                  <td>Year {y}</td>
                  {cells}
                  <td className="text-right tabular-nums font-semibold">{fmt.format(nw)}</td>
                  <td className="text-right tabular-nums text-red-600">{fmt.format(snap.interestPaid)}</td>
                  <td className="text-xs text-zinc-600 dark:text-zinc-400">{parts.length ? parts.join(" · ") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        </>
      )}
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
        {rows.map((r, i) => (
          <tr key={i}>
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
  const runs = results.runs.map((r, i) => ({
    name: r.strategyName,
    data: nwSeries(r, accounts),
    color: PALETTE[i % PALETTE.length],
  }));
  const series = [
    { name: results.baseline.strategyName, data: nwSeries(results.baseline, accounts), color: "steelblue" },
    ...runs,
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[0, 1].map((chart) => (
        <NwChart key={chart} chart={chart} series={series} results={results} />
      ))}
    </div>
  );
}

const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#db2777", "#0891b2", "#65a30d", "#f59e0b"];

function NwChart({
  chart,
  series,
  results,
}: {
  chart: number;
  series: { name: string; data: number[]; color: string }[];
  results: { runs: Projection[]; baseline: Projection };
}) {
  const W = 420;
  const H = 220;
  const pad = 30;
  const all = chart === 0
    ? series
    : [
        { name: results.baseline.strategyName, data: results.baseline.snapshots.map((s) => s.interestPaid), color: "crimson" },
        ...results.runs.map((r, i) => ({ name: r.strategyName, data: r.snapshots.map((s) => s.interestPaid), color: PALETTE[i % PALETTE.length] })),
      ];
  const max = Math.max(1, ...all.flatMap((s) => s.data));
  const min = Math.min(0, ...all.flatMap((s) => s.data));
  const span = max - min || 1;
  const len = Math.max(...all.map((s) => s.data.length));
  const years = Math.max(1, Math.floor(len / 12));
  const x = (i: number, n: number) => pad + (i / Math.max(1, n - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * span);
  const money = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1000 || v <= -1000 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v)}`);
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{chart === 0 ? "Net Worth by Year" : "Cumulative Interest Paid"}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={chart === 0 ? "Net worth chart" : "Interest chart"} data-testid={chart === 0 ? "nw-chart" : "int-chart"}>
        {yTicks.map((t) => (
          <line key={t} x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} stroke="#d4d4d4" strokeWidth={1} />
        ))}
        {yTicks.map((t) => (
          <text key={t} x={pad - 4} y={y(t) + 3} fontSize={9} textAnchor="end" fill="#71717a">{money(t)}</text>
        ))}
        {Array.from({ length: Math.floor(years / 5) + 1 }, (_, i) => i * 5).map((yy) => (
          <text key={yy} x={x((yy / years) * (len - 1), len)} y={H - pad + 14} fontSize={9} textAnchor="middle" fill="#71717a">{yy}</text>
        ))}
        {all.map((s, i) => (
          <polyline
            key={i}
            points={s.data.map((v, i) => `${x(i, s.data.length)},${y(v)}`).join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div className="flex flex-wrap gap-2 text-xs">
        {all.map((s, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="inline-block h-0 w-3 border-t-2" style={{ borderColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}