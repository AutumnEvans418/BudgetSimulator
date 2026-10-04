import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import Home from "../app/page";
import { accountsToCSV } from "../lib/storage";

describe("Home", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  it("renders title and budget surplus", () => {
    render(<Home />);
    expect(
      (screen.getByRole("heading", { level: 1 }) as HTMLElement).textContent
    ).toContain("Budget Simulator");
    expect(screen.getByText(/Surplus to invest/i)).toBeTruthy();
  });

  it("shows default sample accounts", () => {
    render(<Home />);
    expect(screen.getAllByText("Emergency Fund").length).toBeGreaterThanOrEqual(1);
  });

  it("shows employer match inputs on 401k accounts", () => {
    render(<Home />);
    const selects = screen.getAllByLabelText("Current Payment /mo");
    expect(selects.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Employer Match %")).toBeTruthy();
    expect(screen.getByLabelText("Match Max /mo")).toBeTruthy();
  });

  it("adds an account type from the dropdown", () => {
    render(<Home />);
    const select = screen.getByLabelText("account type") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "cd" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    // new row shows both the name and its type label
    expect(screen.getAllByText("CD").length).toBeGreaterThanOrEqual(2);
  });

  it("shows min payment and escrow fields for debts", () => {
    render(<Home />);
    const select = screen.getByLabelText("account type") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "mortgage" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getAllByLabelText("Min Payment /mo").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Escrow /mo").length).toBeGreaterThan(0);
  });

  it("adds a strategy, runs it, and renders summary + charts", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Add Strategy" }));
    expect(screen.getAllByTestId("strategy-row")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.getAllByText(/Doing Nothing/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("nw-chart")).toBeTruthy();
    expect(screen.getByTestId("int-chart")).toBeTruthy();
    expect(screen.getByText(/Final Net Worth/)).toBeTruthy();
    expect(screen.getByTestId("yearly-breakdown")).toBeTruthy();
    expect(screen.getByText("Year 1")).toBeTruthy();
    expect(screen.getByText("Year 30")).toBeTruthy();
    expect(screen.getByText("Net Worth")).toBeTruthy();
    expect(screen.getByText("Interest Paid")).toBeTruthy();
    expect(screen.getByText("Allocations this year")).toBeTruthy();
  });

  it("removes a strategy", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Add Strategy" }));
    const row = screen.getByTestId("strategy-row");
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    expect(screen.queryAllByTestId("strategy-row")).toHaveLength(0);
  });

  it("edits a strategy: adds a step in the builder", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Add Strategy" }));
    fireEvent.click(within(screen.getByTestId("strategy-row")).getByRole("button", { name: "Edit" }));
    expect(screen.getByTestId("strategy-builder")).toBeTruthy();
    const before = screen.getAllByTestId("strategy-step").length;
    fireEvent.click(screen.getByRole("button", { name: "+ Step" }));
    expect(screen.getAllByTestId("strategy-step").length).toBe(before + 1);
  });

  it("edits a blank strategy: renames it and sets an allocation", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Blank" }));
    fireEvent.click(within(screen.getByTestId("strategy-row")).getByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText("Strategy name") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "My Plan" } });
    expect(screen.queryAllByTestId("strategy-step")[0]).toBeTruthy();
    fireEvent.click(screen.getAllByText("+ Allocation")[0]);
    expect(screen.getAllByLabelText("allocation account").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByText("My Plan")).toBeTruthy();
  });

  it("duplicates the active budget", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    const select = screen.getByLabelText("budget") as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    expect((screen.getByLabelText("Budget name") as HTMLInputElement).value).toBe("Copy of Example");
  });

  it("deletes the active budget and falls back to another", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "New Budget" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const select = screen.getByLabelText("budget") as HTMLSelectElement;
    expect(select.options).toHaveLength(1);
    expect((screen.getByLabelText("Budget name") as HTMLInputElement).value).toBe("Example");
  });

  it("deleting non-example budgets returns to the example", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "New Budget" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const select = screen.getByLabelText("budget") as HTMLSelectElement;
    expect(select.options).toHaveLength(1);
    expect((screen.getByLabelText("Budget name") as HTMLInputElement).value).toBe("Example");
  });

  it("cannot delete the example budget", () => {
    render(<Home />);
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "New Budget" }));
    expect((screen.getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("creates a new budget and switches to it", () => {
    render(<Home />);
    const select = screen.getByLabelText("budget") as HTMLSelectElement;
    expect(select.options).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "New Budget" }));
    expect(select.options).toHaveLength(2);
    expect(select.value).not.toBe("example");
    expect((screen.getByLabelText("Budget name") as HTMLInputElement).value).toBe("Untitled");
  });

  it("renames the budget and saves to localStorage", () => {
    render(<Home />);
    fireEvent.change(screen.getByLabelText("Budget name"), { target: { value: "My Budget" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const raw = window.localStorage.getItem("budgetsim:budgets:v1");
    expect(raw).toContain("My Budget");
  });

  it("loads a budget saved in localStorage", () => {
    const seeded = {
      v: 1,
      budgets: [
        {
          id: "example",
          name: "Saved Plan",
          budget: { grossMonthly: 9000, deductionsMonthly: 2500, expensesMonthly: 3500 },
          accounts: [
            { id: "chk", type: "checking", name: "Seeded Checking", balance: 1000, rate: 0, currentMonthlyPayment: 0 },
          ],
          strategies: [],
          years: 30,
          updatedAt: 1,
        },
      ],
    };
    window.localStorage.setItem("budgetsim:budgets:v1", JSON.stringify(seeded));
    window.localStorage.setItem("budgetsim:active:v1", "example");
    render(<Home />);
    expect(screen.getByText("Saved Plan")).toBeTruthy();
    expect(screen.getByText("Seeded Checking")).toBeTruthy();
  });

  it("imports a JSON budget as a new budget", async () => {
    render(<Home />);
    const json = JSON.stringify({
      id: "x",
      name: "Imported Plan",
      budget: { grossMonthly: 8000, deductionsMonthly: 2000, expensesMonthly: 3000 },
      accounts: [
        { id: "inv2", type: "investment", name: "Imported Invest", balance: 500, rate: 0.05, currentMonthlyPayment: 0 },
      ],
      strategies: [],
      years: 20,
      updatedAt: 1,
    });
    const input = document.querySelector('input[accept*="json"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([json], "plan.json", { type: "application/json" })] } });
    expect(await screen.findByText("Imported Plan")).toBeTruthy();
    expect(screen.getAllByText("Imported Invest").length).toBeGreaterThan(0);
    const select = screen.getByLabelText("budget") as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
  });

  it("imports a CSV of accounts as a new budget", async () => {
    render(<Home />);
    const csv = accountsToCSV([
      { id: "c1", type: "checking", name: "CSV Checking", balance: 200, rate: 0, currentMonthlyPayment: 0 },
    ]);
    const input = document.querySelector('input[accept*="csv"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([csv], "accounts.csv", { type: "text/csv" })] } });
    expect((await screen.findAllByText("CSV Checking")).length).toBeGreaterThan(0);
    const select = screen.getByLabelText("budget") as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    expect(select.value).not.toBe("example");
  });
});