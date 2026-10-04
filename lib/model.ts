export type AccountType =
  | "checking"
  | "emergency_fund"
  | "investment"
  | "retirement_401k"
  | "ira"
  | "roth_ira"
  | "hsa"
  | "cd"
  | "mortgage"
  | "student_loan"
  | "personal_loan"
  | "credit_card"
  | "auto_loan"
  | "other_asset"
  | "other_debt";

const DEBT_TYPES: AccountType[] = [
  "mortgage",
  "student_loan",
  "personal_loan",
  "credit_card",
  "auto_loan",
  "other_debt",
];

const TAX_ADVANTAGED_TYPES: AccountType[] = [
  "retirement_401k",
  "ira",
  "roth_ira",
  "hsa",
];

export interface Account {
  id: string;
  type: AccountType;
  name: string;
  /** Debt = remaining balance owed (positive). Asset = current value. */
  balance: number;
  /** Decimal rate: APY/APR for assets, nominal APR for debts. */
  rate: number;
  /** Monthly payment/contribution already budgeted in expenses. */
  currentMonthlyPayment: number;
  /** Debt floor payment; if 0 the debt is counted as paid. */
  minMonthlyPayment?: number;
  /** Monthly portion of payment going to taxes/insurance, not principal (mortgage). */
  escrow?: number;
  /** Funding goal (emergency fund target, etc.). */
  targetBalance?: number;
  /** Annual contribution cap (401k/HSA). */
  contributionCap?: number;
  /** Employer match on contributions: percent of each contribution, capped at maxAmount per month. */
  employerMatch?: { percent: number; maxAmount: number };
  /** Months until funds accessible, for liquidity ranking (CD). */
  lockMonths?: number;
}

export const isDebt = (t: AccountType): boolean => DEBT_TYPES.includes(t);
export const isTaxAdvantaged = (t: AccountType): boolean =>
  TAX_ADVANTAGED_TYPES.includes(t);

/** Higher = faster access to funds, for liquidity templates. */
export function liquidityRank(t: AccountType): number {
  switch (t) {
    case "checking":
      return 6;
    case "emergency_fund":
      return 5;
    case "investment":
      return 4;
    case "cd":
      return 3;
    case "hsa":
      return 2;
    case "retirement_401k":
    case "ira":
    case "roth_ira":
      return 1;
    default:
      return 0;
  }
}

export const ACCOUNT_TYPES: AccountType[] = [
  "checking",
  "emergency_fund",
  "investment",
  "retirement_401k",
  "ira",
  "roth_ira",
  "hsa",
  "cd",
  "mortgage",
  "student_loan",
  "personal_loan",
  "credit_card",
  "auto_loan",
  "other_asset",
  "other_debt",
];

const ACCOUNT_LABELS: Record<AccountType, string> = {
  checking: "Checking",
  emergency_fund: "Emergency Fund",
  investment: "Investment",
  retirement_401k: "401(k)",
  ira: "IRA",
  roth_ira: "Roth IRA",
  hsa: "HSA",
  cd: "CD",
  mortgage: "Mortgage",
  student_loan: "Student Loan",
  personal_loan: "Personal Loan",
  credit_card: "Credit Card",
  auto_loan: "Auto Loan",
  other_asset: "Other Asset",
  other_debt: "Other Debt",
};

export const accountTypeLabel = (t: AccountType): string => ACCOUNT_LABELS[t];

export function emptyAccount(type: AccountType): Account {
  return {
    id: crypto.randomUUID(),
    type,
    name: ACCOUNT_LABELS[type],
    balance: 0,
    rate: isDebt(type) ? 0.0799 : 0.05,
    currentMonthlyPayment: 0,
    targetBalance: type === "emergency_fund" ? 0 : undefined,
    contributionCap: type === "retirement_401k" || type === "hsa" ? 0 : undefined,
    employerMatch: type === "retirement_401k" ? { percent: 0, maxAmount: 0 } : undefined,
  };
}

export interface Budget {
  grossMonthly: number;
  deductionsMonthly: number;
  expensesMonthly: number;
}

export const netMonthly = (b: Budget): number => b.grossMonthly - b.deductionsMonthly;

export const monthlySurplus = (b: Budget): number =>
  netMonthly(b) - b.expensesMonthly;

export type StopCondition = "payoff" | "target" | "cap" | "match";

export interface Allocation {
  accountId: string;
  /** Fraction of step surplus (0-1). null = take all leftovers in the step. */
  share: number | null;
  stop: StopCondition;
}

export interface StrategyStep {
  name: string;
  allocations: Allocation[];
}

export interface Strategy {
  id: string;
  name: string;
  steps: StrategyStep[];
  years: number;
}