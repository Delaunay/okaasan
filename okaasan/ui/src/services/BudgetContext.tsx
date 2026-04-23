import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { jsonStore } from './jsonstore';

const COLLECTION = 'expense-tracker';

interface BudgetContextValue {
  fileList: string[];
  refreshFileList: () => Promise<void>;
}

const BudgetContext = createContext<BudgetContextValue | null>(null);

export function BudgetProvider({ children }: { children: ReactNode }) {
  const [fileList, setFileList] = useState<string[]>([]);

  const refreshFileList = useCallback(async () => {
    try {
      const all = await jsonStore.list(COLLECTION);
      setFileList(all.filter(f => !f.startsWith('_')));
    } catch {
      setFileList([]);
    }
  }, []);

  return (
    <BudgetContext.Provider value={{ fileList, refreshFileList }}>
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudget(): BudgetContextValue {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used within BudgetProvider');
  return ctx;
}
