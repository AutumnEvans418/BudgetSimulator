import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "../app/page";

describe("Home", () => {
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

  it("adds an account type from the dropdown", () => {
    render(<Home />);
    const select = screen.getByLabelText("account type") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "cd" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    // new row shows both the name and its type label
    expect(screen.getAllByText("CD").length).toBeGreaterThanOrEqual(2);
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
  });

  it("removes a strategy", () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Add Strategy" }));
    const row = screen.getByTestId("strategy-row");
    fireEvent.click(within(row).getByRole("button", { name: "Remove" }));
    expect(screen.queryAllByTestId("strategy-row")).toHaveLength(0);
  });
});