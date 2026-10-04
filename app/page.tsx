import Image from "next/image";

/*
- TODO: Save to browser storage.
- Import/Export (json/csv)
*/
export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">

        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <Title></Title>
          <Budget></Budget>
          <Accounts></Accounts>
          <Simulation></Simulation>
        </div>

        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          Autumn Evans
        </div>
      </main>
    </div>
  );
}

export function Title() {
  return (
    <div>
      <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
        Budget Simulator
      </h1>
      <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Enter your accounts and determine the best strategy for increasing wealth, all in the comfort and privacy of your browser.
      </p>

    </div>
  );
}

export function Budget() {

  let fields = [
    "Gross Pay",
    "Deductions",
    "Pay Period",
    "Monthly Income",
    "Monthly Expenses",
    "Surplus Income",
    "Effective Tax Rate (https://taxgrids.info/marginal-tax-rate-calculator/)",
  ]

  return (
    <div>
      {fields.map(f => (
        <label className="max-w-m block text-sm fond-bold mb-2">{f}
          <input type="number" min={0} max={10000000} className="shadow border rounded w-full py-2 px-3 appearance-none" />
        </label>
      ))}
    </div>

  );
}

export function Accounts() {

  let options = [
    "Personal Investment Account", //Balance, Equity Rate - cap gains, Current Payment
    "Mortgage", //Balance, Rate, Min Payment, Escrow, Current Payment
    "Roth-IRA", //Balance, Equity Rate, Max, Current Payment
    "Emergency Fund", //Balance, Rate, EF Target (6 month expenses), Current Payment
    "401(k)", //Balance, Rate, Max Contributions, Emp match, Current Payment
    "Health Savings Account", //Balance, Rate, Max, Start Date, Current Payment
    "Student Loan", //Balance, Min Payment, Rate, Current Payment
    "Personal Loan", //Balance, Min Payment, Rate, Current Payment
    "CD Account", //Balance, Rate, Payoff, Penalty, Current Payment
  ];

  return (
    <div>
      <button className="bg-blue-900 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded">
        Add
      </button>
      <select className="bg-blue-900 hover:bg-blue-500 text-white py-2 px-4 rounded ml-2">
        {options.map(o => (
          <option key={o}>{o}</option>
        ))}
      </select>

    </div>
  );
}

export function Simulation() {

  let options = [
    "Surplus -> Savings",
    "Avalanche (Loans First)",
    "High Interest First",
    "Low Risk First (Emergency Fund)"
  ];
//Examples, but not the proper data structure
  return (
    <div>
      <h1>Simulation</h1>
      <button className="bg-blue-900 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded">
        Add Simulation
      </button>
      <label>
        Templates
        <select className="bg-blue-900 hover:bg-blue-500 text-white py-2 px-4 rounded ml-2">
          {options.map(o => (
            <option key={o}>{o}</option>
          ))}
        </select>

      </label>
      <div>
        <table className="table-auto w-full">
          <thead>
            <tr>
              <th>Simulation</th>
              <th>Priority 1</th>
              <th>Priority 2</th>
              <th>Priority 3</th>
              <th>Priority 4</th>
            </tr>
          </thead>
          <tbody> 
            <tr>
              <td>Savings</td>
              <td>Max EF</td>
              <td>CD</td>
              <td>HSA</td>
              <td>401(k)</td>
            </tr>
            <tr>
              <td>Loans</td>
              <td>EF</td>
              <td>401(k)</td>
              <td>HSA</td>
              <td>Personal</td>
            </tr>
            <tr>
              <td>Retirement</td>
              <td>401(k)</td>
              <td>EF</td>
              <td>Loans</td>
              <td>HSA</td>
            </tr>
            <tr>
              <td>Retirement</td>
              <td>401(k)</td>
              <td>EF</td>
              <td>Loans</td>
              <td>HSA</td>
            </tr>
            <tr>
              <td>Hybrid</td>
              <td>EF (50%)</td>
              <td>HSA</td>
              <td>Personal</td>
              <td>401(k)</td>
              <td>...</td>
            </tr>
          </tbody>
        </table>
      </div>
      <button className="bg-blue-900 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded">
        Run Simulation
      </button>
        <label className="max-w-m block text-sm fond-bold mb-2">Years
          <input type="number" min={0} max={10000000} className="shadow border rounded w-full py-2 px-3 appearance-none" />
        </label>
    </div>
  );
  
}

export function SimulationResult(){
  //TODO: Return the simulation table, showing the projected amounts over each year for the various accounts.
}

export function Summary() {
  //TODO: Table with Path, Net worth, cum int paid, net worth vs doing nothing, interest vs doing nothing

}

export function Chart() {
  //TODO: Net Worth Chart by Path, Cumulative Interest Paid Chart by Path
}