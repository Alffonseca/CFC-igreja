import { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  Download, 
  FileSpreadsheet, 
  Calendar, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  AlertCircle, 
  Building2, 
  ChevronRight, 
  RefreshCw,
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Move,
  Smartphone,
  Loader2,
  AlertTriangle,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { printHtmlElements } from '../lib/printUtils';
import { captureElementToPng, downloadPdfFromPngList, openPdfInNewTab } from '../lib/pdfCapture';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface ChurchInfo {
  churchName: string;
  pastorName: string;
  address: string;
  region: string;
  logoUrl?: string;
}

export interface MonthSummary {
  monthNum: string; // "01", "02", ... "12"
  monthName: string;
  tithes: number;
  offeringGeneral: number;
  offeringSpecial: number;
  missions: number;
  totalEntradas: number;
  taxaSede25: number;
  expenses: number;
  totalSaidas: number;
  saldoMes: number;
  hasData: boolean;
  status: 'preenchido' | 'parcial' | 'zerado';
}

interface AnnualConsolidatedReportProps {
  churchInfo: ChurchInfo;
  onSelectMonth?: (monthYear: string) => void;
  initialYear?: string;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function AnnualConsolidatedReport({ 
  churchInfo, 
  onSelectMonth,
  initialYear = '2026'
}: AnnualConsolidatedReportProps) {
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    try {
      const savedYear = localStorage.getItem('ieq_selected_year');
      if (savedYear && /^\d{4}$/.test(savedYear)) {
        return savedYear;
      }
      const savedMonth = localStorage.getItem('ieq_selected_month_year');
      if (savedMonth && savedMonth.length >= 4 && /^\d{4}/.test(savedMonth)) {
        return savedMonth.substring(0, 4);
      }
    } catch (e) {
      // Ignore
    }
    return initialYear;
  });

  useEffect(() => {
    if (selectedYear && /^\d{4}$/.test(selectedYear)) {
      try {
        localStorage.setItem('ieq_selected_year', selectedYear);
      } catch (e) {
        // Ignore
      }
    }
  }, [selectedYear]);
  const [monthsData, setMonthsData] = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfNotification, setPdfNotification] = useState<{
    status: 'generating' | 'ready' | 'error';
    message?: string;
    blobUrl?: string;
    fileName?: string;
  } | null>(null);
  const printAnnualRef = useRef<HTMLDivElement>(null);

  // Estados para Gestos e Zoom Responsivo Mobile (Android / iOS)
  const [mobileZoomMode, setMobileZoomMode] = useState<'fit' | '100' | 'custom'>('fit');
  const [customZoomScale, setCustomZoomScale] = useState<number>(1);
  const [screenWidth, setScreenWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const sheetScrollWrapperRef = useRef<HTMLDivElement>(null);
  const touchStateRef = useRef<{ startX: number; startY: number; scrollLeft: number; startScrollY: number } | null>(null);

  useEffect(() => {
    const handleWinResize = () => {
      if (sheetScrollWrapperRef.current && sheetScrollWrapperRef.current.clientWidth > 0) {
        setScreenWidth(sheetScrollWrapperRef.current.clientWidth);
      } else {
        setScreenWidth(window.innerWidth);
      }
    };
    handleWinResize();
    window.addEventListener('resize', handleWinResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && sheetScrollWrapperRef.current) {
      ro = new ResizeObserver(() => {
        handleWinResize();
      });
      ro.observe(sheetScrollWrapperRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleWinResize);
      ro?.disconnect();
    };
  }, []);

  const isSmallScreen = screenWidth < 840;
  const calculatedFitScale = Math.min(1, Math.max(0.32, (screenWidth - 28) / 794));
  const currentSheetScale = isSmallScreen
    ? (mobileZoomMode === 'fit' ? calculatedFitScale : (mobileZoomMode === '100' ? 1.0 : customZoomScale))
    : 1.0;

  const handleSheetTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && sheetScrollWrapperRef.current) {
      touchStateRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        scrollLeft: sheetScrollWrapperRef.current.scrollLeft,
        startScrollY: window.scrollY
      };
    }
  };

  const handleSheetTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStateRef.current && e.touches.length === 1 && sheetScrollWrapperRef.current) {
      const deltaX = touchStateRef.current.startX - e.touches[0].clientX;
      const deltaY = touchStateRef.current.startY - e.touches[0].clientY;

      if (currentSheetScale > calculatedFitScale) {
        sheetScrollWrapperRef.current.scrollLeft = touchStateRef.current.scrollLeft + deltaX;
      }
      window.scrollTo({
        top: touchStateRef.current.startScrollY + deltaY,
        behavior: 'auto'
      });
    }
  };

  const handleSheetTouchEnd = () => {
    touchStateRef.current = null;
  };

  // Carrega e consolida os dados de todos os 12 meses
  useEffect(() => {
    loadAnnualData(selectedYear);
  }, [selectedYear]);

  const loadAnnualData = async (year: string) => {
    setLoading(true);
    const monthsResult: MonthSummary[] = [];

    // Tentar ler todos os relatórios salvos no Firestore
    const firestoreReportsMap: Record<string, any> = {};
    try {
      const q = query(collection(db, 'refc_reports'));
      const querySnap = await getDocs(q);
      querySnap.docs.forEach(docSnap => {
        const id = docSnap.id; // ex: "2026-07"
        if (id.startsWith(`${year}-`)) {
          firestoreReportsMap[id] = docSnap.data();
        }
      });
    } catch (e) {
      console.warn('Erro ao consultar refc_reports no Firestore:', e);
    }

    // Processa os 12 meses
    for (let m = 1; m <= 12; m++) {
      const monthNumStr = m.toString().padStart(2, '0');
      const monthKey = `${year}-${monthNumStr}`;
      const monthName = MONTH_NAMES[m - 1];

      let tithes = 0;
      let offeringGeneral = 0;
      let offeringSpecial = 0;
      let missions = 0;
      let totalEntradas = 0;
      let taxaSede25 = 0;
      let expenses = 0;
      let totalSaidas = 0;
      let saldoMes = 0;
      let hasData = false;

      // 1. Verificar dados do Firestore
      const fsData = firestoreReportsMap[monthKey];
      if (fsData) {
        hasData = true;
        if (fsData.totals) {
          tithes = Number(fsData.totals.totalTithes) || 0;
          offeringGeneral = Number(fsData.totals.totalOfferingGeneral) || 0;
          offeringSpecial = Number(fsData.totals.totalOfferingSpecial) || 0;
          missions = Number(fsData.totals.totalMissions) || 0;
          totalEntradas = Number(fsData.totals.totalArrecadacao) || (tithes + offeringGeneral + offeringSpecial + missions);
          taxaSede25 = Number(fsData.totals.taxaSede25) || (totalEntradas * 0.25);
          expenses = Number(fsData.totals.totalExpenses) || 0;
          totalSaidas = Number(fsData.totals.totalSaidas) || (taxaSede25 + expenses);
          saldoMes = Number(fsData.totals.saldoFinal) || (totalEntradas - totalSaidas);
        } else if (fsData.dailyEntries) {
          fsData.dailyEntries.forEach((e: any) => {
            tithes += Number(e.tithes) || 0;
            offeringGeneral += Number(e.offeringGeneral) || 0;
            offeringSpecial += Number(e.offeringSpecial) || 0;
            missions += Number(e.missions) || 0;
          });
          totalEntradas = tithes + offeringGeneral + offeringSpecial + missions;
          taxaSede25 = totalEntradas * 0.25;
          if (fsData.expenses && Array.isArray(fsData.expenses)) {
            expenses = fsData.expenses.reduce((sum: number, exp: any) => sum + (Number(exp.amount) || 0), 0);
          }
          totalSaidas = taxaSede25 + expenses;
          saldoMes = totalEntradas - totalSaidas;
        }
      } else {
        // 2. Tentar verificar cache do LocalStorage
        try {
          const localStr = localStorage.getItem(`refc_data_${monthKey}`);
          if (localStr) {
            const localData = JSON.parse(localStr);
            if (localData.dailyEntries && Array.isArray(localData.dailyEntries)) {
              localData.dailyEntries.forEach((e: any) => {
                tithes += Number(e.tithes) || 0;
                offeringGeneral += Number(e.offeringGeneral) || 0;
                offeringSpecial += Number(e.offeringSpecial) || 0;
                missions += Number(e.missions) || 0;
              });
              totalEntradas = tithes + offeringGeneral + offeringSpecial + missions;
              taxaSede25 = totalEntradas * 0.25;
              if (localData.expenses && Array.isArray(localData.expenses)) {
                expenses = localData.expenses.reduce((sum: number, exp: any) => sum + (Number(exp.amount) || 0), 0);
              }
              totalSaidas = taxaSede25 + expenses;
              saldoMes = totalEntradas - totalSaidas;
              if (totalEntradas > 0 || expenses > 0) {
                hasData = true;
              }
            }
          }
        } catch (e) {
          // ignore
        }
      }

      let status: 'preenchido' | 'parcial' | 'zerado' = 'zerado';
      if (totalEntradas > 0 && expenses > 0) {
        status = 'preenchido';
      } else if (totalEntradas > 0 || expenses > 0) {
        status = 'parcial';
      }

      monthsResult.push({
        monthNum: monthNumStr,
        monthName,
        tithes,
        offeringGeneral,
        offeringSpecial,
        missions,
        totalEntradas,
        taxaSede25,
        expenses,
        totalSaidas,
        saldoMes,
        hasData,
        status
      });
    }

    setMonthsData(monthsResult);
    setLoading(false);
  };

  // Cálculos do TOTAL ANUAL (Somatório de todas as colunas)
  const totalTithesYear = monthsData.reduce((sum, m) => sum + m.tithes, 0);
  const totalOfferingGenYear = monthsData.reduce((sum, m) => sum + m.offeringGeneral, 0);
  const totalOfferingSpecYear = monthsData.reduce((sum, m) => sum + m.offeringSpecial, 0);
  const totalMissionsYear = monthsData.reduce((sum, m) => sum + m.missions, 0);
  const totalEntradasYear = monthsData.reduce((sum, m) => sum + m.totalEntradas, 0);
  const totalTaxaSedeYear = monthsData.reduce((sum, m) => sum + m.taxaSede25, 0);
  const totalExpensesYear = monthsData.reduce((sum, m) => sum + m.expenses, 0);
  const totalSaidasYear = monthsData.reduce((sum, m) => sum + m.totalSaidas, 0);
  const saldoTotalYear = totalEntradasYear - totalSaidasYear;

  const monthsWithMovement = monthsData.filter(m => m.hasData || m.totalEntradas > 0).length;
  const mediaMensalArrecadacao = monthsWithMovement > 0 ? totalEntradasYear / monthsWithMovement : 0;

  // Formatação de Moeda BRL
  const fmtCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Impressão Oficial da Folha A4 do Consolidado Anual
  const handlePrintAnnual = () => {
    try {
      printHtmlElements(['print-annual-sheet'], {
        title: `Consolidado Anual ${selectedYear} - ${churchInfo.churchName}`
      });
    } catch (err) {
      console.warn('Erro na impressão direta do consolidado, usando fallback nativo:', err);
      setTimeout(() => {
        window.print();
      }, 50);
    }
  };

  // Baixar PDF Oficial do Consolidado Anual
  const handleDownloadPdfAnnual = async () => {
    setIsGeneratingPdf(true);
    const fileName = `CONSOLIDADO_ANUAL_IEQ_${selectedYear}.pdf`;

    setPdfNotification({
      status: 'generating',
      message: `Renderizando demonstrativo consolidado de ${selectedYear} em alta definição...`,
      fileName
    });

    try {
      const png = await captureElementToPng('print-annual-sheet');
      if (!png) {
        throw new Error('Folha do consolidado não encontrada.');
      }
      const result = await downloadPdfFromPngList([png], fileName);
      setPdfNotification({
        status: 'ready',
        message: `Consolidado Anual ${selectedYear} gerado e baixado no seu dispositivo!`,
        blobUrl: result.blobUrl,
        fileName
      });
    } catch (err: any) {
      console.error('Erro ao gerar PDF anual:', err);
      setPdfNotification({
        status: 'error',
        message: 'Erro ao gerar PDF: ' + (err?.message || 'Falha ao capturar o consolidado. Tente novamente.')
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Exportar Excel Oficial do Consolidado Anual (.xlsx)
  const handleExportExcelAnnual = () => {
    const wb = XLSX.utils.book_new();

    const annualRows: any[][] = [
      ['', 'IGREJA DO EVANGELHO QUADRANGULAR', '', '', '', '', '', '', '', ''],
      ['', `CONSOLIDADO ANUAL DO RELATÓRIO ESTATÍSTICO E FINANCEIRO (REFC) — EXERCÍCIO ${selectedYear}`, '', '', '', '', '', '', '', ''],
      ['', `IGREJA: ${churchInfo.churchName}`, '', '', `REGIÃO: ${churchInfo.region}`, '', `PASTOR: ${churchInfo.pastorName}`, '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      [
        'MÊS', 
        'DÍZIMOS (R$)', 
        'OFERTA GERAL (R$)', 
        'OFERTA ESPECIAL (R$)', 
        'MISSÕES (R$)', 
        'TOTAL ENTRADAS (R$)', 
        'SEDE 25% (R$)', 
        'DESPESAS LOCAIS (R$)', 
        'TOTAL SAÍDAS (R$)', 
        'SALDO LÍQUIDO (R$)'
      ],
    ];

    monthsData.forEach(m => {
      annualRows.push([
        m.monthName.toUpperCase(),
        m.tithes,
        m.offeringGeneral,
        m.offeringSpecial,
        m.missions,
        m.totalEntradas,
        m.taxaSede25,
        m.expenses,
        m.totalSaidas,
        m.saldoMes
      ]);
    });

    annualRows.push([
      `TOTAL GERAL ${selectedYear}`,
      totalTithesYear,
      totalOfferingGenYear,
      totalOfferingSpecYear,
      totalMissionsYear,
      totalEntradasYear,
      totalTaxaSedeYear,
      totalExpensesYear,
      totalSaidasYear,
      saldoTotalYear
    ]);

    const ws = XLSX.utils.aoa_to_sheet(annualRows);
    XLSX.utils.book_append_sheet(wb, ws, `Consolidado ${selectedYear}`);
    XLSX.writeFile(wb, `RELATORIO_CONSOLIDADO_ANUAL_IEQ_${selectedYear}.xlsx`);
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      {/* Barra de Controle do Consolidado Anual */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-white p-4 sm:p-5 border border-zinc-200 shadow-sm print:hidden">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-1 text-xs font-bold text-purple-700 ring-1 ring-inset ring-purple-600/20">
              Fechamento do Ano
            </span>
            <h3 className="text-lg sm:text-xl font-bold text-zinc-900 truncate">
              Consolidado Geral Anual ({selectedYear})
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Demonstrativo de todos os 12 meses do ano com somatórios das entradas, 25% da Sede, despesas e saldo final acumulado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Seletor de Ano */}
          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
            <Calendar size={16} className="text-zinc-500" />
            <label htmlFor="annual-year-select" className="text-xs font-bold text-zinc-600 uppercase">Ano:</label>
            <select
              id="annual-year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent font-bold text-zinc-900 outline-none cursor-pointer text-sm"
            >
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
              <option value="2028">2028</option>
            </select>
          </div>

          <button
            onClick={() => loadAnnualData(selectedYear)}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition-all active:scale-95"
            title="Recarregar dados do banco de dados"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>

          <button
            onClick={handlePrintAnnual}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-zinc-800 transition-all active:scale-95"
            title="Imprimir Folha A4 Oficial do Consolidado Anual"
          >
            <Printer size={15} />
            Imprimir A4
          </button>

          <button
            onClick={handleDownloadPdfAnnual}
            disabled={isGeneratingPdf}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition-all active:scale-95 disabled:opacity-50"
            title="Baixar PDF do Consolidado"
          >
            <Download size={15} />
            {isGeneratingPdf ? 'Gerando...' : 'PDF'}
          </button>

          <button
            onClick={handleExportExcelAnnual}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-all active:scale-95"
            title="Exportar Planilha Excel com todos os 12 meses"
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
        </div>
      </div>

      {/* Cards de Resumo Anual (KPIs) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Arrecadação Anual</p>
          <p className="text-base sm:text-xl font-extrabold text-blue-950 mt-1">{fmtCurrency(totalEntradasYear)}</p>
          <span className="text-[10px] text-blue-600 font-semibold">{monthsWithMovement} meses c/ movimento</span>
        </div>

        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Taxa Sede (25%)</p>
          <p className="text-base sm:text-xl font-extrabold text-indigo-950 mt-1">{fmtCurrency(totalTaxaSedeYear)}</p>
          <span className="text-[10px] text-indigo-600 font-semibold">Repasse Regional</span>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Despesas Locais</p>
          <p className="text-base sm:text-xl font-extrabold text-rose-950 mt-1">{fmtCurrency(totalExpensesYear)}</p>
          <span className="text-[10px] text-rose-600 font-semibold">Gastos Operacionais</span>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Saldo Líquido Anual</p>
          <p className="text-base sm:text-xl font-extrabold text-emerald-950 mt-1">{fmtCurrency(saldoTotalYear)}</p>
          <span className="text-[10px] text-emerald-600 font-semibold">Em Caixa Acumulado</span>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4 shadow-xs col-span-2 sm:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Média Mensal</p>
          <p className="text-base sm:text-xl font-extrabold text-amber-950 mt-1">{fmtCurrency(mediaMensalArrecadacao)}</p>
          <span className="text-[10px] text-amber-600 font-semibold">Por mês ativo</span>
        </div>
      </div>

      {/* Tabela Interativa na Tela */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm print:hidden">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-3">
          <h4 className="text-sm font-bold text-zinc-900 uppercase tracking-wide">
            Quadro Demonstrativo de Todos os 12 Meses — Exercício {selectedYear}
          </h4>
          <span className="text-xs text-zinc-400 font-medium">
            Clique em um mês para abrir e gerenciar seus lançamentos
          </span>
        </div>

        <div className="w-full max-w-full overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full min-w-[900px] text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-800 text-white font-bold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3 border-r border-zinc-700">Mês</th>
                <th className="py-2.5 px-2 text-right border-r border-zinc-700">Dízimos</th>
                <th className="py-2.5 px-2 text-right border-r border-zinc-700">Oferta Geral</th>
                <th className="py-2.5 px-2 text-right border-r border-zinc-700">Oferta Especial</th>
                <th className="py-2.5 px-2 text-right border-r border-zinc-700">Missões</th>
                <th className="py-2.5 px-3 text-right bg-blue-900 text-white font-extrabold border-r border-zinc-700">Total Entradas</th>
                <th className="py-2.5 px-2 text-right border-r border-zinc-700 text-indigo-200">Sede (25%)</th>
                <th className="py-2.5 px-2 text-right border-r border-zinc-700 text-rose-200">Despesas</th>
                <th className="py-2.5 px-2 text-right border-r border-zinc-700 font-extrabold text-rose-300">Total Saídas</th>
                <th className="py-2.5 px-3 text-right bg-emerald-900 text-white font-extrabold border-r border-zinc-700">Saldo Mês</th>
                <th className="py-2.5 px-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {monthsData.map((m) => {
                const isSelected = m.hasData || m.totalEntradas > 0;
                return (
                  <tr 
                    key={m.monthNum} 
                    className={cn(
                      "hover:bg-blue-50/50 transition-colors",
                      isSelected ? "bg-white" : "bg-zinc-50/50 text-zinc-400"
                    )}
                  >
                    <td className="py-2.5 px-3 font-bold text-zinc-900 border-r border-zinc-200 flex items-center gap-2">
                      <span className="font-mono text-[11px] bg-zinc-100 text-zinc-600 rounded px-1.5 py-0.5">
                        {m.monthNum}
                      </span>
                      {m.monthName}
                    </td>

                    <td className="py-2 px-2 text-right font-mono border-r border-zinc-200">
                      {m.tithes > 0 ? fmtCurrency(m.tithes) : '-'}
                    </td>

                    <td className="py-2 px-2 text-right font-mono border-r border-zinc-200">
                      {m.offeringGeneral > 0 ? fmtCurrency(m.offeringGeneral) : '-'}
                    </td>

                    <td className="py-2 px-2 text-right font-mono border-r border-zinc-200">
                      {m.offeringSpecial > 0 ? fmtCurrency(m.offeringSpecial) : '-'}
                    </td>

                    <td className="py-2 px-2 text-right font-mono text-emerald-800 font-semibold border-r border-zinc-200">
                      {m.missions > 0 ? fmtCurrency(m.missions) : '-'}
                    </td>

                    <td className="py-2 px-3 text-right font-mono font-extrabold text-blue-950 bg-blue-50/30 border-r border-zinc-200">
                      {m.totalEntradas > 0 ? fmtCurrency(m.totalEntradas) : '-'}
                    </td>

                    <td className="py-2 px-2 text-right font-mono text-indigo-900 border-r border-zinc-200">
                      {m.taxaSede25 > 0 ? fmtCurrency(m.taxaSede25) : '-'}
                    </td>

                    <td className="py-2 px-2 text-right font-mono text-rose-800 border-r border-zinc-200">
                      {m.expenses > 0 ? fmtCurrency(m.expenses) : '-'}
                    </td>

                    <td className="py-2 px-2 text-right font-mono font-bold text-rose-950 border-r border-zinc-200 bg-rose-50/20">
                      {m.totalSaidas > 0 ? fmtCurrency(m.totalSaidas) : '-'}
                    </td>

                    <td className={cn(
                      "py-2 px-3 text-right font-mono font-extrabold border-r border-zinc-200",
                      m.saldoMes >= 0 ? "text-emerald-700 bg-emerald-50/30" : "text-rose-700 bg-rose-50/40"
                    )}>
                      {m.totalEntradas > 0 || m.totalSaidas > 0 ? fmtCurrency(m.saldoMes) : '-'}
                    </td>

                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => onSelectMonth?.(`${selectedYear}-${m.monthNum}`)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors"
                        title={`Abrir Lançamentos de ${m.monthName}/${selectedYear}`}
                      >
                        Abrir REFC
                        <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-900 bg-zinc-900 text-white font-bold font-mono text-xs">
                <td className="py-3 px-3 uppercase font-sans tracking-wider">TOTAL ANUAL ({selectedYear})</td>
                <td className="py-3 px-2 text-right">{fmtCurrency(totalTithesYear)}</td>
                <td className="py-3 px-2 text-right">{fmtCurrency(totalOfferingGenYear)}</td>
                <td className="py-3 px-2 text-right">{fmtCurrency(totalOfferingSpecYear)}</td>
                <td className="py-3 px-2 text-right text-emerald-300">{fmtCurrency(totalMissionsYear)}</td>
                <td className="py-3 px-3 text-right font-extrabold bg-blue-700 text-white">{fmtCurrency(totalEntradasYear)}</td>
                <td className="py-3 px-2 text-right text-indigo-200">{fmtCurrency(totalTaxaSedeYear)}</td>
                <td className="py-3 px-2 text-right text-rose-200">{fmtCurrency(totalExpensesYear)}</td>
                <td className="py-3 px-2 text-right font-bold text-rose-300">{fmtCurrency(totalSaidasYear)}</td>
                <td className="py-3 px-3 text-right font-extrabold bg-emerald-700 text-white">{fmtCurrency(saldoTotalYear)}</td>
                <td className="py-3 px-3 text-center font-sans text-[10px] text-zinc-400">12 MESES</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 📄 FOLHA DE IMPRESSÃO OFICIAL A4 DO CONSOLIDADO ANUAL     */}
      {/* ========================================================= */}
      {/* Barra de Controle de Visualização e Gestos no Celular e Tablet */}
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 rounded-2xl bg-white p-3 sm:p-4 border border-zinc-200 shadow-xs lg:hidden print:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 flex-shrink-0">
            <Smartphone size={18} />
          </span>
          <div>
            <p className="text-xs font-bold text-zinc-900 leading-tight">Visualização Celular / Tablet</p>
            <p className="text-[11px] text-zinc-500">
              {mobileZoomMode === 'fit' 
                ? '✨ Modo Ajustado: centralizado e pronto para visualização' 
                : `🔍 Zoom ${Math.round(currentSheetScale * 100)}%: arraste em qualquer direção (2D)`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1 sm:pt-0 border-t sm:border-t-0 border-zinc-100">
          <button
            type="button"
            onClick={() => setMobileZoomMode('fit')}
            className={cn(
              "flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all active:scale-95",
              mobileZoomMode === 'fit' ? "bg-blue-600 text-white shadow-xs" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            )}
            title="Ajusta a folha inteira para caber na largura da tela sem cortes"
          >
            <Maximize2 size={13} />
            Ajustar à Tela
          </button>

          <button
            type="button"
            onClick={() => setMobileZoomMode('100')}
            className={cn(
              "flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all active:scale-95",
              mobileZoomMode === '100' ? "bg-blue-600 text-white shadow-xs" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            )}
            title="Tamanho real A4 (100%) para leitura ampliada"
          >
            <Move size={13} />
            100%
          </button>

          <div className="flex items-center rounded-xl border border-zinc-200 bg-zinc-50 p-0.5">
            <button
              type="button"
              onClick={() => {
                setMobileZoomMode('custom');
                setCustomZoomScale(prev => Math.max(0.3, Number((prev - 0.15).toFixed(2))));
              }}
              className="p-1.5 text-zinc-600 hover:text-zinc-900 active:scale-95"
              title="Diminuir Zoom"
            >
              <ZoomOut size={14} />
            </button>
            <span className="px-1.5 text-[11px] font-mono font-bold text-zinc-800 min-w-[40px] text-center">
              {Math.round(currentSheetScale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => {
                setMobileZoomMode('custom');
                setCustomZoomScale(prev => Math.min(1.6, Number((prev + 0.15).toFixed(2))));
              }}
              className="p-1.5 text-zinc-600 hover:text-zinc-900 active:scale-95"
              title="Aumentar Zoom"
            >
              <ZoomIn size={14} />
            </button>
          </div>
        </div>
      </div>

      <div 
        ref={sheetScrollWrapperRef}
        onTouchStart={handleSheetTouchStart}
        onTouchMove={handleSheetTouchMove}
        onTouchEnd={handleSheetTouchEnd}
        className={cn(
          "w-full max-w-full overflow-x-auto pb-10 sheet-scroll-container touch-auto flex",
          Math.round(794 * currentSheetScale) > screenWidth ? "justify-start" : "justify-center"
        )}
      >
        <div
          style={{
            width: currentSheetScale === 1 ? 'auto' : `${Math.round(794 * currentSheetScale)}px`,
            minHeight: currentSheetScale === 1 ? 'auto' : `${Math.round(1123 * currentSheetScale)}px`,
            height: currentSheetScale === 1 ? 'auto' : `${Math.round(1123 * currentSheetScale)}px`,
            overflow: currentSheetScale !== 1 ? 'hidden' : 'visible',
            transition: 'width 0.2s ease, height 0.2s ease',
            flexShrink: 0
          }}
          className="print:w-auto print:min-h-0 print:h-auto print:m-0 print:overflow-visible mx-auto flex flex-col items-center"
        >
          <div 
            id="print-annual-sheet"
            ref={printAnnualRef}
            className="w-[210mm] min-w-[210mm] min-h-[297mm] bg-white text-black p-6 shadow-sm border border-zinc-300 flex flex-col justify-between font-sans print:border-none print:shadow-none print:m-0 print:p-0"
            style={{
              boxSizing: 'border-box',
              transform: currentSheetScale !== 1 ? `scale(${currentSheetScale})` : undefined,
              transformOrigin: 'top center'
            }}
          >
          <div>
            {/* Cabeçalho Oficial IEQ */}
            <div className="border-b-2 border-black pb-2 mb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {churchInfo.logoUrl ? (
                    <img 
                      src={churchInfo.logoUrl} 
                      alt="Logo" 
                      className="h-14 w-14 object-contain" 
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="h-12 w-12 border border-black flex items-center justify-center font-bold text-[10px]">
                      IEQ
                    </div>
                  )}
                  <div>
                    <h1 className="text-base font-bold tracking-wider uppercase">IGREJA DO EVANGELHO QUADRANGULAR</h1>
                    <h2 className="text-xs font-extrabold uppercase text-zinc-800">
                      DEMONSTRATIVO CONSOLIDADO ANUAL — REFC ({selectedYear})
                    </h2>
                    <p className="text-[10px] font-semibold text-zinc-600">
                      {churchInfo.churchName} • {churchInfo.address}
                    </p>
                  </div>
                </div>

                <div className="text-right text-[11px] leading-tight">
                  <p className="font-bold">EXERCÍCIO: <strong className="font-mono text-sm">{selectedYear}</strong></p>
                  <p>REGIÃO: <strong>{churchInfo.region}</strong></p>
                  <p>PASTOR: <strong>{churchInfo.pastorName}</strong></p>
                </div>
              </div>
            </div>

            {/* Tabela dos 12 Meses Consolidada */}
            <table className="w-full text-[9px] border border-black border-collapse mb-3">
              <thead>
                <tr className="bg-zinc-800 text-white font-bold text-center">
                  <th className="p-1 border-r border-black w-24">MÊS</th>
                  <th className="p-1 border-r border-black">DÍZIMOS</th>
                  <th className="p-1 border-r border-black">OF. GERAL</th>
                  <th className="p-1 border-r border-black">OF. ESPECIAL</th>
                  <th className="p-1 border-r border-black">MISSÕES</th>
                  <th className="p-1 border-r border-black bg-zinc-900 font-extrabold">TOTAL ENTRADAS</th>
                  <th className="p-1 border-r border-black">SEDE (25%)</th>
                  <th className="p-1 border-r border-black">DESPESAS</th>
                  <th className="p-1 border-r border-black font-extrabold">TOTAL SAÍDAS</th>
                  <th className="p-1 font-extrabold bg-zinc-900">SALDO LÍQUIDO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {monthsData.map((m) => (
                  <tr key={m.monthNum} className="h-5">
                    <td className="p-1 border-r border-black font-bold uppercase text-[9px] whitespace-nowrap">
                      {m.monthNum} - {m.monthName}
                    </td>
                    <td className="p-1 border-r border-black text-right font-mono">
                      {m.tithes > 0 ? fmtCurrency(m.tithes) : '-'}
                    </td>
                    <td className="p-1 border-r border-black text-right font-mono">
                      {m.offeringGeneral > 0 ? fmtCurrency(m.offeringGeneral) : '-'}
                    </td>
                    <td className="p-1 border-r border-black text-right font-mono">
                      {m.offeringSpecial > 0 ? fmtCurrency(m.offeringSpecial) : '-'}
                    </td>
                    <td className="p-1 border-r border-black text-right font-mono">
                      {m.missions > 0 ? fmtCurrency(m.missions) : '-'}
                    </td>
                    <td className="p-1 border-r border-black text-right font-mono font-bold bg-zinc-50">
                      {m.totalEntradas > 0 ? fmtCurrency(m.totalEntradas) : '-'}
                    </td>
                    <td className="p-1 border-r border-black text-right font-mono">
                      {m.taxaSede25 > 0 ? fmtCurrency(m.taxaSede25) : '-'}
                    </td>
                    <td className="p-1 border-r border-black text-right font-mono">
                      {m.expenses > 0 ? fmtCurrency(m.expenses) : '-'}
                    </td>
                    <td className="p-1 border-r border-black text-right font-mono font-bold bg-zinc-50">
                      {m.totalSaidas > 0 ? fmtCurrency(m.totalSaidas) : '-'}
                    </td>
                    <td className="p-1 text-right font-mono font-bold bg-zinc-100">
                      {m.totalEntradas > 0 || m.totalSaidas > 0 ? fmtCurrency(m.saldoMes) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black bg-zinc-200 font-bold font-mono text-[10px]">
                  <td className="p-1.5 border-r border-black uppercase font-sans">TOTAL DO ANO</td>
                  <td className="p-1.5 border-r border-black text-right">{fmtCurrency(totalTithesYear)}</td>
                  <td className="p-1.5 border-r border-black text-right">{fmtCurrency(totalOfferingGenYear)}</td>
                  <td className="p-1.5 border-r border-black text-right">{fmtCurrency(totalOfferingSpecYear)}</td>
                  <td className="p-1.5 border-r border-black text-right">{fmtCurrency(totalMissionsYear)}</td>
                  <td className="p-1.5 border-r border-black text-right font-extrabold bg-zinc-300">{fmtCurrency(totalEntradasYear)}</td>
                  <td className="p-1.5 border-r border-black text-right">{fmtCurrency(totalTaxaSedeYear)}</td>
                  <td className="p-1.5 border-r border-black text-right">{fmtCurrency(totalExpensesYear)}</td>
                  <td className="p-1.5 border-r border-black text-right font-extrabold bg-zinc-300">{fmtCurrency(totalSaidasYear)}</td>
                  <td className="p-1.5 text-right font-extrabold bg-zinc-400">{fmtCurrency(saldoTotalYear)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Quadro Resumo dos Indicadores Anuais */}
            <div className="grid grid-cols-3 gap-3 text-[9.5px] border border-black p-2 bg-zinc-50 mb-6">
              <div>
                <p className="font-bold uppercase text-zinc-700">TOTAL ARRECADAÇÃO ANUAL:</p>
                <p className="font-mono text-sm font-extrabold text-black">{fmtCurrency(totalEntradasYear)}</p>
                <p className="text-[8px] text-zinc-500">Soma de Dízimos e Ofertas dos 12 meses</p>
              </div>

              <div>
                <p className="font-bold uppercase text-zinc-700">TOTAL ENVIADO À SEDE (25%):</p>
                <p className="font-mono text-sm font-extrabold text-black">{fmtCurrency(totalTaxaSedeYear)}</p>
                <p className="text-[8px] text-zinc-500">Taxa Regional recolhida</p>
              </div>

              <div>
                <p className="font-bold uppercase text-zinc-700">SALDO LÍQUIDO EM CAIXA:</p>
                <p className="font-mono text-sm font-extrabold text-black">{fmtCurrency(saldoTotalYear)}</p>
                <p className="text-[8px] text-zinc-500">Arrecadação menos Total de Saídas</p>
              </div>
            </div>
          </div>

          {/* Assinaturas Oficiais de Fechamento do Ano */}
          <div>
            <div className="grid grid-cols-3 gap-8 text-center pt-8 border-t border-black text-[10px]">
              <div>
                <div className="border-t border-black pt-1">
                  <p className="font-bold uppercase">{churchInfo.pastorName || '____________________'}</p>
                  <p className="text-[9px] text-zinc-600 uppercase">Pastor Titular / Presidente</p>
                </div>
              </div>

              <div>
                <div className="border-t border-black pt-1">
                  <p className="font-bold uppercase">____________________</p>
                  <p className="text-[9px] text-zinc-600 uppercase">1º Tesoureiro(a) Geral</p>
                </div>
              </div>

              <div>
                <div className="border-t border-black pt-1">
                  <p className="font-bold uppercase">____________________</p>
                  <p className="text-[9px] text-zinc-600 uppercase">Conselho Fiscal / Auditoria</p>
                </div>
              </div>
            </div>

            <div className="mt-4 text-center text-[8px] text-zinc-400 uppercase tracking-widest">
              Demonstrativo Consolidado Anual Oficial • Igreja do Evangelho Quadrangular • Gerado pelo Sistema de Gestão
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* MODAL DE STATUS E DOWNLOAD DE PDF */}
      {pdfNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-4">
              <div className="flex items-center gap-2.5">
                {pdfNotification.status === 'generating' && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 animate-pulse">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                )}
                {pdfNotification.status === 'ready' && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                    <CheckCircle2 size={22} />
                  </div>
                )}
                {pdfNotification.status === 'error' && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                    <AlertTriangle size={22} />
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-zinc-900">
                    {pdfNotification.status === 'generating' && 'Gerando Consolidado Anual...'}
                    {pdfNotification.status === 'ready' && 'PDF Anual Pronto com Sucesso!'}
                    {pdfNotification.status === 'error' && 'Atenção ao Gerar PDF'}
                  </h3>
                  <p className="text-xs text-zinc-500">Documento Oficial A4 (12 Meses)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPdfNotification(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-zinc-700 font-medium">
                {pdfNotification.message}
              </p>

              {pdfNotification.status === 'ready' && pdfNotification.blobUrl && (
                <div className="space-y-2 pt-2">
                  <a
                    href={pdfNotification.blobUrl}
                    download={pdfNotification.fileName || `CONSOLIDADO_ANUAL_${selectedYear}.pdf`}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-700 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-purple-800 transition-all active:scale-95"
                  >
                    <Download size={18} />
                    Baixar Arquivo PDF Novamente
                  </a>

                  <button
                    type="button"
                    onClick={() => {
                      if (pdfNotification.blobUrl) {
                        openPdfInNewTab(pdfNotification.blobUrl);
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-bold text-zinc-800 hover:bg-zinc-100 transition-all active:scale-95 cursor-pointer"
                  >
                    <Printer size={16} className="text-zinc-600" />
                    Abrir em Nova Aba (Para Visualizar e Imprimir)
                  </button>
                </div>
              )}

              {pdfNotification.status === 'error' && (
                <button
                  type="button"
                  onClick={handleDownloadPdfAnnual}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-zinc-800 transition-all active:scale-95"
                >
                  <RefreshCw size={16} />
                  Tentar Novamente
                </button>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setPdfNotification(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-50 transition-all cursor-pointer"
              >
                Fechar Janela
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
