import { useEffect, useMemo, useRef, useState } from 'react';
import { runBuyingProjection } from './lib/buyingProjection';
import { getSuggestions } from './lib/suggestions';
import { DEFAULT_BUYING_INPUTS, type BuyingScenarioInputs, type RetirementAccountType } from './types/buying';
import { SummaryBanner } from './components/SummaryBanner';
import { BuyingInputPanel } from './components/BuyingInputPanel';
import { BuyingForecastTable } from './components/BuyingForecastTable';
import { BuyingNetWorthChart } from './components/BuyingNetWorthChart';
import { SummaryStats } from './components/SummaryStats';
import { SuggestionsPanel } from './components/SuggestionsPanel';

const STORAGE_KEY = 'net-worth-planner-inputs';
const SAVE_DEBOUNCE_MS = 400;

function loadStoredInputs(): BuyingScenarioInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BUYING_INPUTS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Migrate old field names
    if (parsed.householdTFSAContributionRoom == null) {
      const p1 = Number(parsed.person1CurrentTFSAContributionRoom ?? parsed.zakCurrentTFSAContributionRoom ?? 0);
      const p2 = Number(parsed.person2CurrentTFSAContributionRoom ?? parsed.annaCurrentTFSAContributionRoom ?? 0);
      if (p1 + p2 > 0) parsed.householdTFSAContributionRoom = p1 + p2;
    }
    const keys = Object.keys(DEFAULT_BUYING_INPUTS) as (keyof BuyingScenarioInputs)[];
    const merged = { ...DEFAULT_BUYING_INPUTS };
    for (const k of keys) {
      const v = parsed[k];
      if (v === undefined) continue;
      if (k === 'retirementWithdrawalOrder') {
        if (Array.isArray(v) && v.length === 4 && v.every((x) => ['TFSA', 'RRSP', 'NonRegistered', 'HELOC'].includes(x)))
          merged[k] = v as RetirementAccountType[];
        continue;
      }
      if (k === 'numberOfIncomeEarners') {
        merged[k] = v === 1 ? 1 : 2;
        continue;
      }
      if (typeof v === 'number' || typeof v === 'boolean') (merged as Record<string, unknown>)[k] = v;
    }
    return merged;
  } catch {
    return DEFAULT_BUYING_INPUTS;
  }
}

function App() {
  const [inputs, setInputs] = useState<BuyingScenarioInputs>(loadStoredInputs);
  const [tableOpen, setTableOpen] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
      } catch {
        // ignore quota or private mode
      }
      saveTimeoutRef.current = null;
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [inputs]);

  const rows = useMemo(() => runBuyingProjection(inputs), [inputs]);
  const buyNowRows = useMemo(() => {
    if (inputs.yearsUntilPurchase <= 0) return null;
    return runBuyingProjection({ ...inputs, yearsUntilPurchase: 0 });
  }, [inputs]);
  const suggestions = useMemo(() => getSuggestions(inputs, rows), [inputs, rows]);
  const retirementYear = new Date().getFullYear() + Math.max(0, inputs.retirementAge - inputs.currentAge);
  const retirementRow = rows.find((r) => r.year === retirementYear);
  const retirementMonthlyHousing = retirementRow?.monthlyHousingCosts;
  const firstRow = rows[0];
  const comparisonYear = retirementYear ?? (rows.length > 0 ? rows[rows.length - 1].year : new Date().getFullYear());

  const handleChange = (field: keyof BuyingScenarioInputs, value: number | boolean) => {
    if (field === 'numberOfIncomeEarners') {
      setInputs((prev) => ({ ...prev, [field]: value === 1 ? 1 : 2 }));
    } else {
      setInputs((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleWithdrawalOrderChange = (order: typeof inputs.retirementWithdrawalOrder) => {
    setInputs((prev) => ({ ...prev, retirementWithdrawalOrder: order }));
  };

  const handleResetToDefaults = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setInputs(DEFAULT_BUYING_INPUTS);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <div className="flex flex-1 min-h-0 w-full max-w-[1800px] mx-auto">
        {/* Sidebar: inputs in collapsible cards */}
        <aside className="w-[320px] shrink-0 border-r border-slate-800 bg-slate-900/30 overflow-y-auto flex flex-col">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-200">Assumptions</h2>
            <button
              type="button"
              onClick={handleResetToDefaults}
              className="text-xs text-slate-500 hover:text-slate-300 underline"
            >
              Reset
            </button>
          </div>
          <BuyingInputPanel
            values={inputs}
            onChange={handleChange}
            onWithdrawalOrderChange={handleWithdrawalOrderChange}
            retirementMonthlyHousing={retirementMonthlyHousing}
            firstYearRow={firstRow}
          />
        </aside>

        {/* Main: results always visible */}
        <main className="flex-1 min-w-0 flex flex-col overflow-auto">
          <div className="p-4 sm:p-6 space-y-4">
            <header>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
                Your net worth, mapped
              </h1>
              <p className="mt-0.5 text-slate-400 text-sm">
                See how housing, investments, and tax choices play out. Your data is saved in this browser.
              </p>
            </header>

            <SummaryBanner
              rows={rows}
              buyNowRows={buyNowRows}
              comparisonYear={comparisonYear}
              retirementYear={retirementYear}
            />

            <section className="flex-shrink-0">
              <BuyingNetWorthChart rows={rows} retirementYear={retirementYear} />
            </section>

            <section>
              <SummaryStats rows={rows} retirementYear={retirementYear} />
            </section>

            <section className="grid gap-4 lg:grid-cols-1">
              <SuggestionsPanel suggestions={suggestions} />
            </section>

            <section>
              <div className="rounded-xl bg-slate-800/60 border border-slate-700/80 overflow-hidden shadow-lg">
                <button
                  type="button"
                  onClick={() => setTableOpen((o) => !o)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left border-b border-slate-700 hover:bg-slate-700/30 transition min-h-[44px]"
                  aria-expanded={tableOpen}
                >
                  <span className="font-display text-base font-semibold text-slate-100">
                    Year-by-year forecast
                  </span>
                  <span
                    className="text-slate-500 transition-transform inline-block text-xs"
                    style={{ transform: tableOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    aria-hidden
                  >
                    ▼
                  </span>
                </button>
                {tableOpen && <BuyingForecastTable rows={rows} />}
              </div>
            </section>
          </div>
        </main>
      </div>

      <footer className="border-t border-slate-800 py-2 px-3 sm:px-4 shrink-0">
        <p className="text-center text-xs text-slate-600">
          Built by <span className="text-slate-500">Zak</span>
        </p>
      </footer>
    </div>
  );
}

export default App;
