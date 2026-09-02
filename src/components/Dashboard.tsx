import { useEffect, useState } from 'react';
import { collection, query, onSnapshot, where, Timestamp, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { TrendingUp, TrendingDown, Wallet, DollarSign, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { startOfMonth, endOfMonth, format, parse, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface Transaction {
  id: string;
  type: 'tithe' | 'offering' | 'expense';
  amount: number;
  date: string;
  description: string;
}

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie');
  const [churchSettings, setChurchSettings] = useState<{ qrCodeUrl?: string; titheMessage?: string } | null>(null);

  // Mês selecionado (persiste e sincroniza com os relatórios e REFC)
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('ieq_selected_month_year');
      if (saved && /^\d{4}-\d{2}$/.test(saved)) {
        return saved;
      }
    } catch (e) {
      // Ignore
    }
    return format(new Date(), 'yyyy-MM');
  });

  useEffect(() => {
    if (selectedMonthYear && /^\d{4}-\d{2}$/.test(selectedMonthYear)) {
      try {
        localStorage.setItem('ieq_selected_month_year', selectedMonthYear);
      } catch (e) {
        // Ignore
      }
    }
  }, [selectedMonthYear]);

  useEffect(() => {
    const q = query(collection(db, 'transactions'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(data);
      setLoading(false);
    });

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'church'), (sDoc) => {
      if (sDoc.exists()) {
        setChurchSettings(sDoc.data() as any);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeSettings();
    };
  }, []);

  const parsedMonthDate = (() => {
    try {
      const parsed = parse(selectedMonthYear, 'yyyy-MM', new Date());
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    } catch {
      return new Date();
    }
  })();

  const handlePrevMonth = () => {
    const prev = subMonths(parsedMonthDate, 1);
    setSelectedMonthYear(format(prev, 'yyyy-MM'));
  };

  const handleNextMonth = () => {
    const next = addMonths(parsedMonthDate, 1);
    setSelectedMonthYear(format(next, 'yyyy-MM'));
  };

  const monthTransactions = transactions.filter(t => {
    if (!t.date) return false;
    return t.date.startsWith(selectedMonthYear);
  });

  const totals = monthTransactions.reduce((acc, t) => {
    const amt = typeof t.amount === 'number' ? t.amount : (parseFloat(String(t.amount)) || 0);
    if (t.type === 'tithe') acc.tithes += amt;
    if (t.type === 'offering') acc.offerings += amt;
    if (t.type === 'expense') acc.expenses += amt;
    return acc;
  }, { tithes: 0, offerings: 0, expenses: 0 });

  totals.tithes = Math.round(totals.tithes * 100) / 100;
  totals.offerings = Math.round(totals.offerings * 100) / 100;
  totals.expenses = Math.round(totals.expenses * 100) / 100;

  const balance = Math.round((totals.tithes + totals.offerings - totals.expenses) * 100) / 100;

  const stats = [
    { label: 'Dízimos', value: totals.tithes, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Ofertas', value: totals.offerings, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Despesas', value: totals.expenses, icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Saldo Mensal', value: balance, icon: Wallet, color: 'text-zinc-900', bg: 'bg-zinc-100' },
  ];

  const chartData = [
    { name: 'Dízimos', value: totals.tithes, color: '#10b981' },
    { name: 'Ofertas', value: totals.offerings, color: '#3b82f6' },
    { name: 'Despesas', value: totals.expenses, color: '#f43f5e' },
  ].filter(item => item.value > 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  const renderPieLabel = ({ value, percent }: any) => {
    if (!value || value <= 0) return '';
    const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(value);
    const pct = Math.round((percent || 0) * 100);
    return `${formatted} (${pct}%)`;
  };

  if (loading) return <div className="p-8 text-center text-zinc-500 font-medium">Carregando painel geral...</div>;

  return (
    <div className="space-y-8 w-full max-w-full">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900">Dashboard</h1>
          <p className="text-xs sm:text-sm text-zinc-500 capitalize">
            Resumo financeiro de {format(parsedMonthDate, 'MMMM \'de\' yyyy', { locale: ptBR })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor do Mês Sincronizado */}
          <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-xl border border-zinc-200 shadow-sm">
            <button
              onClick={handlePrevMonth}
              title="Mês anterior"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-1.5 px-2">
              <Calendar size={15} className="text-blue-600" />
              <input
                type="month"
                value={selectedMonthYear}
                onChange={(e) => {
                  if (e.target.value) {
                    setSelectedMonthYear(e.target.value);
                  }
                }}
                className="text-xs sm:text-sm font-bold text-zinc-800 bg-transparent border-none focus:outline-none cursor-pointer"
              />
            </div>
            <button
              onClick={handleNextMonth}
              title="Próximo mês"
              className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {churchSettings && (churchSettings.qrCodeUrl || churchSettings.titheMessage) && (
            <div className="flex items-center gap-3 rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-zinc-200">
              {churchSettings.qrCodeUrl && (
                <img src={churchSettings.qrCodeUrl} alt="QR Code" className="h-10 w-10 sm:h-12 sm:w-12 object-contain" referrerPolicy="no-referrer" />
              )}
              {churchSettings.titheMessage && (
                <p className="text-xs font-medium text-zinc-700 max-w-[180px] hidden sm:block">{churchSettings.titheMessage}</p>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200"
          >
            <div className="flex items-center justify-between">
              <div className={cn("rounded-xl p-2", stat.bg)}>
                <stat.icon className={stat.color} size={24} />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-zinc-500">{stat.label}</p>
              <p className={cn("text-2xl font-bold", stat.color)}>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stat.value)}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <h3 className="mb-4 text-lg font-semibold">Lançamentos Recentes</h3>
          <div className="space-y-4">
            {monthTransactions.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-zinc-100 pb-4 last:border-0">
                <div>
                  <p className="font-medium text-zinc-900">{t.description}</p>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">{t.type} • {format(new Date(t.date), 'dd/MM/yyyy')}</p>
                </div>
                <p className={cn("font-bold", t.type === 'expense' ? "text-rose-600" : "text-emerald-600")}>
                  {t.type === 'expense' ? '-' : '+'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}
                </p>
              </div>
            ))}
            {monthTransactions.length === 0 && (
              <p className="text-center text-zinc-500 py-8">Nenhum lançamento no mês selecionado.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Resumo Financeiro</h3>
            <div className="flex rounded-lg bg-zinc-100 p-1">
              <button onClick={() => setChartType('pie')} className={cn("px-3 py-1 rounded-md text-sm font-semibold transition-all", chartType === 'pie' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500")}>Pizza</button>
              <button onClick={() => setChartType('bar')} className={cn("px-3 py-1 rounded-md text-sm font-semibold transition-all", chartType === 'bar' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500")}>Barra</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            {chartType === 'pie' ? (
              <PieChart>
                <Pie 
                  data={chartData} 
                  dataKey="value" 
                  nameKey="name" 
                  cx="50%" 
                  cy="50%" 
                  outerRadius={75} 
                  label={renderPieLabel}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(val: any) => [
                    formatCurrency(Number(val) || 0),
                    'Total'
                  ]}
                />
                <Legend />
              </PieChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis 
                  tickFormatter={(val) => `R$ ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                />
                <Tooltip 
                  formatter={(val: any) => [
                    formatCurrency(Number(val) || 0),
                    'Total'
                  ]}
                />
                <Bar dataKey="value" fill="#8884d8">
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// Helper for cn in this file since I can't import it easily without creating it first
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
