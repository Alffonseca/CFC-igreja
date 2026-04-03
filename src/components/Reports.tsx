import { useEffect, useState, useRef } from 'react';
import { collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import { db, auth } from '../firebase';
import { Printer, FileText, Calendar, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { startOfMonth, endOfMonth, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';

interface Transaction {
  id: string;
  type: 'tithe' | 'offering' | 'expense';
  amount: number;
  date: string;
  description: string;
  category?: string;
}

interface Meeting {
  id: string;
  cellId: string;
  date: string;
  membersPresent: number;
  visitors: number;
  conversions: number;
  baptisms: number;
  acceptedJesus?: string[];
  wantBaptism?: string[];
}

interface Cell {
  id: string;
  name: string;
  leader: string;
  leaderId?: string;
  memberCount: number;
  conversions: number;
  createdAt: any;
}

interface ChurchSettings {
  name: string;
  logoUrl?: string;
  pastorName?: string;
}

interface ReportsProps {
  role: string | null;
}

export default function Reports({ role }: ReportsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reportType, setReportType] = useState<'financial' | 'cells' | 'meetings'>(
    (searchParams.get('type') as 'financial' | 'cells' | 'meetings') || (role === 'cell' ? 'cells' : 'financial')
  );
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportMode, setReportMode] = useState<'daily' | 'monthly'>('daily');
  const [settings, setSettings] = useState<ChurchSettings | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchUser = async () => {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          setCurrentUserProfile(userDoc.data());
        }
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (role === 'cell' && !currentUserProfile) return;

    const qTransactions = query(collection(db, 'transactions'));
    const unsubscribeTransactions = onSnapshot(qTransactions, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(data);
      setLoading(false);
    });

    const qCells = query(collection(db, 'cells'));
    const unsubscribeCells = onSnapshot(qCells, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cell));
      if (role === 'cell') {
        data = data.filter(c => c.leaderId === auth.currentUser?.uid);
      }
      setCells(data);
    });

    const qMeetings = query(collection(db, 'meetings'));
    const unsubscribeMeetings = onSnapshot(qMeetings, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Meeting));
      setMeetings(data);
      setLoading(false);
    });

    const fetchSettings = async () => {
      const settingsDoc = await getDoc(doc(db, 'settings', 'church'));
      if (settingsDoc.exists()) {
        setSettings(settingsDoc.data() as ChurchSettings);
      }
    };
    fetchSettings();

    return () => {
      unsubscribeTransactions();
      unsubscribeCells();
      unsubscribeMeetings();
    };
  }, [role, currentUserProfile]);

  const reportDate = parseISO(selectedDate);
  const monthStart = startOfMonth(reportDate);
  const monthEnd = endOfMonth(reportDate);

  const filteredMeetings = meetings.filter(m => {
    const mDate = parseISO(m.date);
    const isMatch = reportMode === 'daily' 
      ? m.date === selectedDate
      : mDate >= monthStart && mDate <= monthEnd;
    
    if (role === 'cell') {
      const myCellIds = cells.map(c => c.id);
      return isMatch && myCellIds.includes(m.cellId);
    }
    return isMatch;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const filteredTransactions = transactions.filter(t => {
    const tDate = parseISO(t.date);
    return reportMode === 'daily' 
      ? t.date === selectedDate
      : tDate >= monthStart && tDate <= monthEnd;
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totals = filteredTransactions.reduce((acc, t) => {
    if (t.type === 'tithe') acc.tithes += t.amount;
    if (t.type === 'offering') acc.offerings += t.amount;
    if (t.type === 'expense') acc.expenses += t.amount;
    return acc;
  }, { tithes: 0, offerings: 0, expenses: 0 });

  const balance = totals.tithes + totals.offerings - totals.expenses;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Relatorios</h1>
          <p className="text-zinc-500">Gere e imprima relatorios mensais</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-zinc-200 bg-white p-1">
            <button
              onClick={() => setReportMode('daily')}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-all",
                reportMode === 'daily' ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900"
              )}
            >
              Diário
            </button>
            <button
              onClick={() => setReportMode('monthly')}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-all",
                reportMode === 'monthly' ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900"
              )}
            >
              Mensal
            </button>
          </div>
          <div className="flex rounded-lg border border-zinc-200 bg-white p-1">
            {role !== 'cell' && (
              <button
                onClick={() => {
                  setReportType('financial');
                  setSearchParams({ type: 'financial' });
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-semibold transition-all",
                  reportType === 'financial' ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                Financeiro
              </button>
            )}
            <button
              onClick={() => {
                setReportType('cells');
                setSearchParams({ type: 'cells' });
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-all",
                reportType === 'cells' ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900"
              )}
            >
              Células
            </button>
            <button
              onClick={() => {
                setReportType('meetings');
                setSearchParams({ type: 'meetings' });
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-all",
                reportType === 'meetings' ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-900"
              )}
            >
              Reuniões
            </button>
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-zinc-200 bg-white py-2 pl-10 pr-4 outline-none focus:border-zinc-900"
            />
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 font-semibold text-white transition-all hover:bg-zinc-800 active:scale-95"
          >
            <Printer size={20} />
            Imprimir A4
          </button>
        </div>
      </header>

      {/* Report Preview / Print Area */}
      <div 
        ref={printRef}
        className="mx-auto max-w-[210mm] rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200 print:m-0 print:rounded-none print:p-0 print:shadow-none print:ring-0"
      >
        {/* Header */}
        <div className="mb-12 flex items-center justify-between border-b-2 border-zinc-900 pb-8">
          <div className="flex items-center gap-6">
            {settings?.logoUrl ? (
              <img 
                src={settings.logoUrl} 
                alt="Logo" 
                className="h-24 w-24 object-contain" 
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                style={{ display: 'block' }}
              />
            ) : null}
            <div id="logo-fallback" className={cn("flex h-24 w-24 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400", settings?.logoUrl ? "hidden" : "")}>
              <FileText size={40} />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-zinc-900 uppercase tracking-tight">{settings?.name || 'NOME DA IGREJA'}</h2>
              <p className="text-lg font-medium text-zinc-500 uppercase tracking-widest">
                {reportType === 'financial' ? 'Relatorio Financeiro Mensal' : 
                 reportType === 'meetings' ? 'Relatorio de Reunioes Mensal' : 
                 'Relatorio de Celulas Mensal'}
              </p>
              {role === 'cell' && cells.length > 0 && (
                <p className="text-sm font-bold text-zinc-900 mt-1 uppercase">
                  Célula: {cells.map(c => c.name).join(', ')}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Periodo</p>
            <p className="text-xl font-bold text-zinc-900 uppercase">{format(reportDate, 'dd/MM/yyyy', { locale: ptBR })}</p>
          </div>
        </div>

        {reportType === 'financial' ? (
          <>
            {/* Financial Summary Grid */}
            <div className="mb-12 grid grid-cols-4 gap-4">
              {[
                { label: 'Dizimos', value: totals.tithes, color: 'text-emerald-600' },
                { label: 'Ofertas', value: totals.offerings, color: 'text-blue-600' },
                { label: 'Despesas', value: totals.expenses, color: 'text-rose-600' },
                { label: 'Saldo Final', value: balance, color: 'text-zinc-900', highlight: true },
              ].map((item) => (
                <div key={item.label} className={cn(
                  "rounded-xl border border-zinc-200 p-4 text-center",
                  item.highlight && "bg-zinc-50 border-zinc-900 border-2"
                )}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{item.label}</p>
                  <p className={cn("text-lg font-bold", item.color)}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value)}
                  </p>
                </div>
              ))}
            </div>

            {/* Detailed Table */}
            <div className="space-y-8">
              <section className="overflow-x-auto scrollbar-hide">
                <h3 className="mb-4 border-b border-zinc-200 pb-2 text-sm font-bold uppercase tracking-widest text-zinc-900">Entradas (Dizimos e Ofertas)</h3>
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="text-zinc-400">
                    <tr>
                      <th className="py-2">Data</th>
                      <th className="py-2">Descricao</th>
                      <th className="py-2">Tipo</th>
                      <th className="py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredTransactions.filter(t => t.type !== 'expense').map((t) => (
                      <tr key={t.id}>
                        <td className="py-2">{format(new Date(t.date), 'dd/MM/yyyy')}</td>
                        <td className="py-2 font-medium">{t.description}</td>
                        <td className="py-2 uppercase text-[10px] font-bold text-zinc-400">{t.type === 'tithe' ? 'Dizimo' : 'Oferta'}</td>
                        <td className="py-2 text-right font-bold text-emerald-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-zinc-900 font-bold">
                      <td colSpan={3} className="py-4 text-right uppercase tracking-widest">Total Entradas</td>
                      <td className="py-4 text-right text-emerald-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.tithes + totals.offerings)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="overflow-x-auto scrollbar-hide">
                <h3 className="mb-4 border-b border-zinc-200 pb-2 text-sm font-bold uppercase tracking-widest text-zinc-900">Saidas (Despesas)</h3>
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="text-zinc-400">
                    <tr>
                      <th className="py-2">Data</th>
                      <th className="py-2">Descricao</th>
                      <th className="py-2">Categoria</th>
                      <th className="py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredTransactions.filter(t => t.type === 'expense').map((t) => (
                      <tr key={t.id}>
                        <td className="py-2">{format(new Date(t.date), 'dd/MM/yyyy')}</td>
                        <td className="py-2 font-medium">{t.description}</td>
                        <td className="py-2 uppercase text-[10px] font-bold text-zinc-400">{t.category || '-'}</td>
                        <td className="py-2 text-right font-bold text-rose-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-zinc-900 font-bold">
                      <td colSpan={3} className="py-4 text-right uppercase tracking-widest">Total Saidas</td>
                      <td className="py-4 text-right text-rose-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totals.expenses)}</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </div>
          </>
        ) : reportType === 'meetings' ? (
          <>
            {/* Meetings Detailed Table */}
            <div className="space-y-8">
              <section className="overflow-x-auto scrollbar-hide">
                <h3 className="mb-4 border-b border-zinc-200 pb-2 text-sm font-bold uppercase tracking-widest text-zinc-900">Reunioes Cadastradas</h3>
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="text-zinc-400">
                    <tr>
                      <th className="py-2">Data</th>
                      <th className="py-2 text-center">Membros</th>
                      <th className="py-2 text-center">Visitantes</th>
                      <th className="py-2 text-center">Conversoes</th>
                      <th className="py-2 text-center">Batismos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredMeetings.map((meeting) => (
                      <tr key={meeting.id}>
                        <td className="py-2">{format(new Date(meeting.date), 'dd/MM/yyyy')}</td>
                        <td className="py-2 text-center font-bold text-blue-600">{meeting.membersPresent}</td>
                        <td className="py-2 text-center font-bold text-zinc-600">{meeting.visitors}</td>
                        <td className="py-2 text-center font-bold text-rose-600">{meeting.conversions}</td>
                        <td className="py-2 text-center font-bold text-emerald-600">{meeting.baptisms}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-zinc-900 font-bold text-zinc-900">
                    <tr>
                      <td className="py-4">Total ({filteredMeetings.length})</td>
                      <td className="py-4 text-center text-blue-600">{filteredMeetings.reduce((sum, m) => sum + (m.membersPresent || 0), 0)}</td>
                      <td className="py-4 text-center text-zinc-600">{filteredMeetings.reduce((sum, m) => sum + (m.visitors || 0), 0)}</td>
                      <td className="py-4 text-center text-rose-600">{filteredMeetings.reduce((sum, m) => sum + (m.conversions || 0), 0)}</td>
                      <td className="py-4 text-center text-emerald-600">{filteredMeetings.reduce((sum, m) => sum + (m.baptisms || 0), 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </section>
            </div>
          </>
        ) : (
          <>
            {/* Cells Summary Grid */}
            <div className="mb-12 grid grid-cols-3 gap-4">
              {[
                { label: 'Total de Celulas', value: cells.length, color: 'text-zinc-900' },
                { label: 'Total de Membros', value: cells.reduce((acc, c) => acc + c.memberCount, 0), color: 'text-blue-600' },
                { label: 'Total de Conversoes', value: cells.reduce((acc, c) => acc + c.conversions, 0), color: 'text-rose-600' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-zinc-200 p-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{item.label}</p>
                  <p className={cn("text-2xl font-bold", item.color)}>{item.value}</p>
                </div>
              ))}
            </div>

            {/* Cells Detailed Table */}
            <div className="space-y-8">
              <section className="overflow-x-auto scrollbar-hide">
                <h3 className="mb-4 border-b border-zinc-200 pb-2 text-sm font-bold uppercase tracking-widest text-zinc-900">Celulas de Crescimento</h3>
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="text-zinc-400">
                    <tr>
                      <th className="py-2">Nome da Celula</th>
                      <th className="py-2">Lider / Responsavel</th>
                      <th className="py-2 text-center">Membros</th>
                      <th className="py-2 text-right">Conversoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {cells.map((cell) => (
                      <tr key={cell.id}>
                        <td className="py-2 font-bold text-zinc-900">{cell.name}</td>
                        <td className="py-2 font-medium">{cell.leader}</td>
                        <td className="py-2 text-center font-bold text-blue-600">{cell.memberCount}</td>
                        <td className="py-2 text-right font-bold text-rose-600">{cell.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </>
        )}

        {/* Footer / Signatures */}
        <div className="mt-24 grid grid-cols-2 gap-24">
          <div className="border-t border-zinc-900 pt-4 text-center">
            <p className="text-xs font-bold uppercase tracking-widest">
              {reportType === 'financial' ? 'RESPONSAVEL:' : 'LIDER / RESPONSAVEL:'} 
              {' '}
              {currentUserProfile?.name || '____________________'}
            </p>
          </div>
          <div className="border-t border-zinc-900 pt-4 text-center">
            <p className="text-sm font-bold uppercase tracking-tight">{settings?.pastorName || '____________________'}</p>
            <p className="text-xs font-bold uppercase tracking-widest">Pastor(a)</p>
          </div>
        </div>

        <div className="mt-12 text-center text-[10px] text-zinc-400 uppercase tracking-widest">
          Relatorio gerado em {format(new Date(), 'dd/MM/yyyy HH:mm')} • Ver. 1.0 Beta
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:m-0, .print\\:m-0 * {
            visibility: visible;
          }
          .print\\:m-0 {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          @page {
            size: A4;
            margin: 20mm;
          }
        }
      `}</style>
    </div>
  );
}
