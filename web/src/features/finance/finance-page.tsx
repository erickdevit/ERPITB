import React, { useState } from 'react';
import { DollarSign, Wallet } from 'lucide-react';
import { useApp } from '../../app-context';
import { canManageFinance } from '../../types';
import { CashView } from './cash-view';
import { FeesView } from './fees-view';

type FinanceTab = 'fees' | 'cash';

export function FinancePage() {
  const { session } = useApp();
  const [activeTab, setActiveTab] = useState<FinanceTab>('fees');

  if (!session || !canManageFinance(session.role)) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
        Acesso restrito à equipe financeira e à administração.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      {/* Header with Title and Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Gestão Financeira
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Controle de mensalidades escolares, recebimentos e escrituração de Livro Caixa.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('fees')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'fees'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Mensalidades</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cash')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'cash'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Livro Caixa</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'fees' && <FeesView />}
        {activeTab === 'cash' && <CashView />}
      </div>
    </div>
  );
}
