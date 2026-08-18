import { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  Download, 
  FileSpreadsheet, 
  Sparkles, 
  Calculator, 
  Calendar, 
  Building2, 
  Save, 
  Plus, 
  Trash2, 
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Info,
  Layers,
  ArrowDownCircle,
  FileText,
  Pencil,
  X
} from 'lucide-react';
import { format, parseISO, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { logAction } from '../lib/logger';

interface DailyEntry {
  day: number;
  dateStr: string;
  dayOfWeek: number; // 0: Dom, 1: Seg, 2: Ter, 3: Qua, 4: Qui, 5: Sex, 6: Sab
  dayOfWeekName: string;
  isCulto: boolean;
  isThirdSunday: boolean;
  tithes: number;
  offeringGeneral: number;
  offeringSpecial: number;
  missions: number; // 3º domingo
  total: number;
}

interface ExpenseEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  isTaxaRegiao?: boolean;
}

interface ChurchInfo {
  churchName: string;
  pastorName: string;
  address: string;
  region: string;
  logoUrl?: string;
}

export default function QuadrangularReport({ role }: { role: string | null }) {
  // Competência selecionada (ex: 2026-07)
  const [selectedMonthYear, setSelectedMonthYear] = useState('2026-07');
  const [activeTab, setActiveTab] = useState<'refc' | 'entradas' | 'expenses'>('refc');
  const [printMode, setPrintMode] = useState<'single' | 'both'>('single');
  
  // Informações da Igreja e Liderança
  const [churchInfo, setChurchInfo] = useState<ChurchInfo>({
    churchName: 'TABERNÁCULO DA FAMÍLIA',
    pastorName: 'MARCELO PONTES',
    address: 'RUA 30 QUADRA 46 Nº 232 - CONJ PROMORAR',
    region: '115'
  });

  // Estatísticas do REFC
  const [stats, setStats] = useState({
    membersCount: 120,
    cellsCount: 11,
    visitorsCount: 25,
    conversionsCount: 0,
    baptismsWaterCount: 0,
    baptismsHolySpiritCount: 0
  });

  // Entradas Diárias (1 a 31)
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);

  // Valores de Distribuição Rápida (inicialmente vazios para o usuário lançar)
  const [distMode, setDistMode] = useState<'total' | 'detailed'>('total');
  const [totalGeneralTarget, setTotalGeneralTarget] = useState<string>('');
  const [targetTithes, setTargetTithes] = useState<string>('');
  const [targetOfferingGeneral, setTargetOfferingGeneral] = useState<string>('');
  const [targetOfferingSpecial, setTargetOfferingSpecial] = useState<string>('');
  const [targetMissions, setTargetMissions] = useState<string>('');

  // Saídas / Despesas (inicia zerado para o usuário lançar)
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);

  // Estado para Alteração/Edição de Despesa
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');

  // Novo formulário de inserção rápida de despesa
  const [newExpenseDate, setNewExpenseDate] = useState('');
  const [newExpenseDesc, setNewExpenseDesc] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [isImportingExpenses, setIsImportingExpenses] = useState(false);

  const [observations, setObservations] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const refcPrintRef = useRef<HTMLDivElement>(null);
  const entradasPrintRef = useRef<HTMLDivElement>(null);
  const bothPrintRef = useRef<HTMLDivElement>(null);

  // Sugestões comuns de despesas da igreja
  const commonExpenseSuggestions = [
    'TAXA ÁGUA',
    'TAXA DE LUZ',
    'SUSTENTO PASTORAL',
    'INTERNET / TELEFONE',
    'MATERIAL DE LIMPEZA',
    'MANUTENÇÃO DO TEMPLO',
    'MISSÕES REGIONAIS',
    'EQUIPAMENTOS DE SOM',
    'COMBUSTÍVEL / TRANSPORTE',
    'ALUGUEL DO TEMPLO',
    'SECRETARIA / PAPELARIA',
    'ESCOLA BÍBLICA / INFANTIL'
  ];

  // Carrega configurações da igreja ao montar
  useEffect(() => {
    const fetchChurchSettings = async () => {
      try {
        const sDoc = await getDoc(doc(db, 'settings', 'church'));
        if (sDoc.exists()) {
          const data = sDoc.data();
          setChurchInfo(prev => ({
            ...prev,
            churchName: data.name || prev.churchName,
            pastorName: data.pastorName || prev.pastorName,
            address: data.address || prev.address,
            region: data.region || prev.region,
            logoUrl: data.logoUrl || prev.logoUrl
          }));
        }

        // Tentar buscar contagem real de células e membros
        const cellsSnap = await getDocs(collection(db, 'cells'));
        const cellsList = cellsSnap.docs.map(d => d.data());
        if (cellsList.length > 0) {
          const totalMembers = cellsList.reduce((sum, c: any) => sum + (c.memberCount || 0), 0);
          setStats(prev => ({
            ...prev,
            cellsCount: cellsList.length,
            membersCount: totalMembers > 0 ? totalMembers : prev.membersCount
          }));
        }
      } catch (err) {
        console.warn('Erro ao buscar dados da igreja:', err);
      }
    };
    fetchChurchSettings();
  }, []);

  // Inicializa a grade de dias quando o mês/ano muda
  useEffect(() => {
    initializeMonthGrid(selectedMonthYear);
  }, [selectedMonthYear]);

  // Função para criar a lista de dias do mês e carregar dados salvos
  const initializeMonthGrid = (monthYearStr: string) => {
    const [yearStr, monthStr] = monthYearStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-indexed
    const startDate = new Date(year, month, 1);
    const totalDays = getDaysInMonth(startDate);

    const weekNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    let sundayCount = 0;

    const baseEntries: DailyEntry[] = [];
    for (let day = 1; day <= totalDays; day++) {
      const currentDate = new Date(year, month, day);
      const dayOfWeek = getDay(currentDate);
      const isSunday = dayOfWeek === 0;
      if (isSunday) {
        sundayCount++;
      }
      const isThirdSunday = isSunday && sundayCount === 3;
      const isCulto = dayOfWeek === 0 || dayOfWeek === 2 || dayOfWeek === 5; // Dom, Ter, Sex

      baseEntries.push({
        day,
        dateStr: format(currentDate, 'dd/MM/yyyy'),
        dayOfWeek,
        dayOfWeekName: weekNames[dayOfWeek],
        isCulto,
        isThirdSunday,
        tithes: 0,
        offeringGeneral: 0,
        offeringSpecial: 0,
        missions: 0,
        total: 0
      });
    }

    try {
      const savedStr = localStorage.getItem(`refc_data_${monthYearStr}`);
      if (savedStr) {
        const saved = JSON.parse(savedStr);
        if (saved.dailyEntries && Array.isArray(saved.dailyEntries)) {
          const merged = baseEntries.map(b => {
            const found = saved.dailyEntries.find((s: any) => s.day === b.day);
            if (found) {
              return {
                ...b,
                tithes: Number(found.tithes) || 0,
                offeringGeneral: Number(found.offeringGeneral) || 0,
                offeringSpecial: Number(found.offeringSpecial) || 0,
                missions: Number(found.missions) || 0,
                total: Number(found.total) || 0
              };
            }
            return b;
          });
          setDailyEntries(merged);
        } else {
          setDailyEntries(baseEntries);
        }

        if (saved.expenses && Array.isArray(saved.expenses)) {
          setExpenses(saved.expenses);
        } else {
          setExpenses([]);
        }

        if (saved.totalGeneralTarget !== undefined) setTotalGeneralTarget(saved.totalGeneralTarget);
        if (saved.targetTithes !== undefined) setTargetTithes(saved.targetTithes);
        if (saved.targetOfferingGeneral !== undefined) setTargetOfferingGeneral(saved.targetOfferingGeneral);
        if (saved.targetOfferingSpecial !== undefined) setTargetOfferingSpecial(saved.targetOfferingSpecial);
        if (saved.targetMissions !== undefined) setTargetMissions(saved.targetMissions);
        return;
      }
    } catch (e) {
      console.warn('Erro ao ler cache local de relatórios:', e);
    }

    // Padrão limpo e zerado
    setDailyEntries(baseEntries);
    setExpenses([]);
    setTotalGeneralTarget('');
    setTargetTithes('');
    setTargetOfferingGeneral('');
    setTargetOfferingSpecial('');
    setTargetMissions('');
  };

  // Salva automaticamente as alterações no cache local da competência
  useEffect(() => {
    if (dailyEntries.length > 0) {
      try {
        localStorage.setItem(`refc_data_${selectedMonthYear}`, JSON.stringify({
          dailyEntries,
          expenses,
          totalGeneralTarget,
          targetTithes,
          targetOfferingGeneral,
          targetOfferingSpecial,
          targetMissions
        }));
      } catch (e) {
        // ignore
      }
    }
  }, [dailyEntries, expenses, totalGeneralTarget, targetTithes, targetOfferingGeneral, targetOfferingSpecial, targetMissions, selectedMonthYear]);

  // ⚡ DIVISÃO AUTOMÁTICA NOS DIAS DE CULTO (Terça, Sexta e Domingo)
  const handleAutoDistribute = () => {
    if (dailyEntries.length === 0) return;

    let tTithes = 0;
    let tOffGen = 0;
    let tOffSpec = 0;
    let tMissions = 0;

    if (distMode === 'total') {
      const total = parseFloat(totalGeneralTarget) || 0;
      if (total <= 0) {
        alert('Por favor, informe um valor total maior que zero para distribuir.');
        return;
      }
      // Distribuição proporcional típica de igreja:
      // 80% Dízimos, 14% Oferta Geral, 4.8% Oferta Especial, 1.2% Missões
      tMissions = Math.min(50, Math.round(total * 0.012));
      const remaining = total - tMissions;
      tTithes = Math.round(remaining * 0.82);
      tOffGen = Math.round(remaining * 0.14);
      tOffSpec = total - (tTithes + tOffGen + tMissions);
    } else {
      tTithes = parseFloat(targetTithes) || 0;
      tOffGen = parseFloat(targetOfferingGeneral) || 0;
      tOffSpec = parseFloat(targetOfferingSpecial) || 0;
      tMissions = parseFloat(targetMissions) || 0;
    }

    // Filtrar os cultos (Terças, Sextas, Domingos)
    const cultoDays = dailyEntries.filter(d => d.isCulto);
    if (cultoDays.length === 0) return;

    // Pesos: Domingo tem peso maior (2.0), Terça (1.0), Sexta (1.2)
    let totalWeightTithes = 0;
    let totalWeightOffGen = 0;
    let totalWeightOffSpec = 0;

    cultoDays.forEach(d => {
      const weight = d.dayOfWeek === 0 ? 2.2 : (d.dayOfWeek === 5 ? 1.2 : 1.0);
      totalWeightTithes += weight;
      totalWeightOffGen += weight;
      totalWeightOffSpec += weight;
    });

    let allocatedTithes = 0;
    let allocatedOffGen = 0;
    let allocatedOffSpec = 0;

    const newEntries = dailyEntries.map(entry => {
      if (!entry.isCulto) {
        return {
          ...entry,
          tithes: 0,
          offeringGeneral: 0,
          offeringSpecial: 0,
          missions: 0,
          total: 0
        };
      }

      const weight = entry.dayOfWeek === 0 ? 2.2 : (entry.dayOfWeek === 5 ? 1.2 : 1.0);
      
      // Cálculo proporcional arredondado a 2 casas decimais
      const rawTithe = (tTithes * weight) / totalWeightTithes;
      const titheVal = Math.round(rawTithe * 100) / 100;
      allocatedTithes += titheVal;

      const rawOffGen = (tOffGen * weight) / totalWeightOffGen;
      const offGenVal = Math.round(rawOffGen * 100) / 100;
      allocatedOffGen += offGenVal;

      const rawOffSpec = (tOffSpec * weight) / totalWeightOffSpec;
      const offSpecVal = Math.round(rawOffSpec * 100) / 100;
      allocatedOffSpec += offSpecVal;

      // Missões vai exclusivamente no 3º Domingo do mês!
      const missionsVal = entry.isThirdSunday ? tMissions : 0;

      const totalVal = titheVal + offGenVal + offSpecVal + missionsVal;

      return {
        ...entry,
        tithes: titheVal,
        offeringGeneral: offGenVal,
        offeringSpecial: offSpecVal,
        missions: missionsVal,
        total: Math.round(totalVal * 100) / 100
      };
    });

    // Ajuste de centavos no último culto para bater a soma perfeitamente
    const lastCultoIndex = newEntries.map(e => e.isCulto).lastIndexOf(true);
    if (lastCultoIndex !== -1) {
      const diffTithes = Math.round((tTithes - allocatedTithes) * 100) / 100;
      const diffOffGen = Math.round((tOffGen - allocatedOffGen) * 100) / 100;
      const diffOffSpec = Math.round((tOffSpec - allocatedOffSpec) * 100) / 100;

      newEntries[lastCultoIndex].tithes = Math.round((newEntries[lastCultoIndex].tithes + diffTithes) * 100) / 100;
      newEntries[lastCultoIndex].offeringGeneral = Math.round((newEntries[lastCultoIndex].offeringGeneral + diffOffGen) * 100) / 100;
      newEntries[lastCultoIndex].offeringSpecial = Math.round((newEntries[lastCultoIndex].offeringSpecial + diffOffSpec) * 100) / 100;
      newEntries[lastCultoIndex].total = Math.round((
        newEntries[lastCultoIndex].tithes +
        newEntries[lastCultoIndex].offeringGeneral +
        newEntries[lastCultoIndex].offeringSpecial +
        newEntries[lastCultoIndex].missions
      ) * 100) / 100;
    }

    setDailyEntries(newEntries);
    setSyncStatus('Distribuição de cultos (Terça-Sexta-Domingo) concluída com sucesso!');
    setTimeout(() => setSyncStatus(null), 4000);
  };

  // Alterar valor manual em uma célula da tabela
  const handleCellChange = (day: number, field: 'tithes' | 'offeringGeneral' | 'offeringSpecial' | 'missions', valStr: string) => {
    const val = parseFloat(valStr.replace(',', '.')) || 0;
    setDailyEntries(prev => prev.map(entry => {
      if (entry.day === day) {
        const updated = { ...entry, [field]: val };
        updated.total = Math.round((updated.tithes + updated.offeringGeneral + updated.offeringSpecial + updated.missions) * 100) / 100;
        return updated;
      }
      return entry;
    }));
  };

  // Totais Calculados de Entradas
  const totalTithesSum = dailyEntries.reduce((sum, d) => sum + (d.tithes || 0), 0);
  const totalOfferingGenSum = dailyEntries.reduce((sum, d) => sum + (d.offeringGeneral || 0), 0);
  const totalOfferingSpecSum = dailyEntries.reduce((sum, d) => sum + (d.offeringSpecial || 0), 0);
  const totalMissionsSum = dailyEntries.reduce((sum, d) => sum + (d.missions || 0), 0);
  const totalArrecadacao = totalTithesSum + totalOfferingGenSum + totalOfferingSpecSum + totalMissionsSum;

  // Taxa da Região / Sede (25% sobre a arrecadação total)
  const taxaSede25 = Math.round((totalArrecadacao * 0.25) * 100) / 100;

  // Total para a Sede no Resumo Diário
  const totalSedeResumo = taxaSede25 - totalMissionsSum;

  // Totais de Saídas (incluindo a taxa de 25% da região)
  const manualExpensesSum = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalSaidasComTaxa = manualExpensesSum + taxaSede25;

  // Saldo Final do Mês
  const saldoFinalMes = totalArrecadacao - totalSaidasComTaxa;

  // Manipular Despesas
  const handleAddExpense = () => {
    const newId = Date.now().toString();
    setExpenses(prev => [...prev, { id: newId, date: format(new Date(), 'dd/MM'), description: '', amount: 0 }]);
  };

  const handleQuickAddExpense = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newExpenseDesc.trim()) {
      alert('Por favor, informe a descrição da despesa (ex: Água, Luz, Sustento Pastoral).');
      return;
    }
    const val = parseFloat(newExpenseAmount.replace(',', '.')) || 0;
    if (val <= 0) {
      alert('Por favor, informe um valor maior que zero para a despesa.');
      return;
    }

    let dateFormatted = newExpenseDate.trim();
    if (!dateFormatted) {
      dateFormatted = format(new Date(), 'dd/MM');
    } else if (dateFormatted.includes('-')) {
      const parts = dateFormatted.split('-');
      if (parts.length >= 3) {
        dateFormatted = `${parts[2]}/${parts[1]}`;
      }
    }

    const newExp: ExpenseEntry = {
      id: Date.now().toString(),
      date: dateFormatted,
      description: newExpenseDesc.trim().toUpperCase(),
      amount: val
    };

    setExpenses(prev => [...prev, newExp]);
    setNewExpenseDesc('');
    setNewExpenseAmount('');
    setSyncStatus(`Despesa "${newExp.description}" de ${fmtCurrency(val)} adicionada ao REFC!`);
    setTimeout(() => setSyncStatus(null), 3500);
  };

  // Importar despesas reais registradas no Firestore para o mês selecionado
  const handleImportExpensesFromFirestore = async () => {
    setIsImportingExpenses(true);
    try {
      const transRef = collection(db, 'transactions');
      const q = query(transRef, where('type', '==', 'expense'));
      const snap = await getDocs(q);
      
      const imported: ExpenseEntry[] = [];
      const [selYear, selMonth] = selectedMonthYear.split('-');
      
      snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const tDate = data.date || '';
        // Verificar se a data pertence ao mês/ano selecionado (ex: "2026-07")
        if (tDate.startsWith(`${selYear}-${selMonth}`) || tDate.includes(`/${selMonth}/${selYear}`) || tDate.includes(`-${selMonth}-`)) {
          let dateStr = '';
          if (tDate.includes('-')) {
            const parts = tDate.split('-');
            if (parts.length >= 3) dateStr = `${parts[2]}/${parts[1]}`;
          } else {
            dateStr = tDate;
          }
          imported.push({
            id: docSnap.id,
            date: dateStr || format(new Date(), 'dd/MM'),
            description: (data.description || data.category || 'DESPESA').toUpperCase(),
            amount: parseFloat(data.amount) || 0
          });
        }
      });

      if (imported.length > 0) {
        setExpenses(imported);
        setSyncStatus(`${imported.length} despesa(s) importada(s) do módulo financeiro!`);
      } else {
        alert(`Nenhuma despesa cadastrada no sistema encontrada especificamente para ${selectedMonthYear}. Você pode cadastrar usando o formulário acima.`);
      }
    } catch (err: any) {
      console.warn('Erro ao importar despesas:', err);
      alert('Erro ao importar despesas do banco de dados: ' + err.message);
    } finally {
      setIsImportingExpenses(false);
      setTimeout(() => setSyncStatus(null), 4000);
    }
  };

  const handleOpenEditExpense = (exp: ExpenseEntry) => {
    setEditingExpense(exp);
    setEditDate(exp.date || '');
    setEditDesc(exp.description || '');
    setEditAmount(exp.amount ? exp.amount.toString() : '');
  };

  const handleSaveEditExpense = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingExpense) return;
    if (!editDesc.trim()) {
      alert('Por favor, informe a descrição da despesa.');
      return;
    }
    const val = parseFloat(editAmount.replace(',', '.')) || 0;
    if (val <= 0) {
      alert('Por favor, informe um valor maior que zero para a despesa.');
      return;
    }

    setExpenses(prev => prev.map(exp => {
      if (exp.id === editingExpense.id) {
        return {
          ...exp,
          date: editDate.trim() || format(new Date(), 'dd/MM'),
          description: editDesc.trim().toUpperCase(),
          amount: val
        };
      }
      return exp;
    }));

    setEditingExpense(null);
    setSyncStatus(`Despesa "${editDesc.trim().toUpperCase()}" alterada com sucesso!`);
    setTimeout(() => setSyncStatus(null), 3500);
  };

  const handleRemoveExpense = (id: string, description?: string) => {
    if (window.confirm(`Deseja realmente excluir a despesa "${description || 'selecionada'}"? Ela será removida da folha e dos cálculos.`)) {
      setExpenses(prev => prev.filter(exp => exp.id !== id));
      setSyncStatus('Despesa excluída com sucesso do REFC!');
      setTimeout(() => setSyncStatus(null), 3000);
    }
  };

  // Zerar todos os lançamentos do mês selecionado
  const handleClearAll = () => {
    if (window.confirm(`Deseja ZERAR todos os lançamentos e despesas de ${competenciaExtenso}? Esta ação limpará todos os valores para novos lançamentos.`)) {
      setTotalGeneralTarget('');
      setTargetTithes('');
      setTargetOfferingGeneral('');
      setTargetOfferingSpecial('');
      setTargetMissions('');
      setExpenses([]);
      setDailyEntries(prev => prev.map(e => ({
        ...e,
        tithes: 0,
        offeringGeneral: 0,
        offeringSpecial: 0,
        missions: 0,
        total: 0
      })));
      try {
        localStorage.removeItem(`refc_data_${selectedMonthYear}`);
      } catch (e) {}
      setSyncStatus('Todos os valores foram zerados!');
      setTimeout(() => setSyncStatus(null), 3500);
    }
  };

  // Salvar configurações e histórico
  const handleSaveChurchSettings = async () => {
    try {
      await setDoc(doc(db, 'settings', 'church'), {
        name: churchInfo.churchName,
        pastorName: churchInfo.pastorName,
        address: churchInfo.address,
        region: churchInfo.region
      }, { merge: true });
      await logAction('Relatório Quadrangular', 'Atualizou dados do cabeçalho oficial');
      alert('Dados da igreja salvos com sucesso!');
    } catch (err: any) {
      alert('Erro ao salvar dados: ' + err.message);
    }
  };

  // Formatação de Mês e Ano por extenso (ex: "JULHO / 2026")
  const [currentYear, currentMonthNum] = selectedMonthYear.split('-');
  const dateObj = new Date(parseInt(currentYear, 10), parseInt(currentMonthNum, 10) - 1, 1);
  const monthNameUpper = format(dateObj, 'MMMM', { locale: ptBR }).toUpperCase();
  const competenciaExtenso = `${monthNameUpper} / ${currentYear}`;

  // Formatação de Moeda BRL
  const fmtCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Exportar Excel Oficial (.xlsx com as duas abas REFC e Entradas)
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // ABA 1: REFC
    const refcData: any[][] = [
      ['', '', 'IGREJA DO EVANGELHO QUADRANGULAR', '', '', '', '', '', '', ''],
      ['', '', 'RELATÓRIO ESTATÍSTICO E FINANCEIRO DE CULTO MENSAL', '', '', '', '', '', '', ''],
      ['', '', churchInfo.churchName, '', '', '', '', '', '', ''],
      ['', '', `PASTOR: ${churchInfo.pastorName}`, '', '', '', '', '', '', ''],
      ['', '', `ENDEREÇO: ${churchInfo.address}`, '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['MÊS / ANO', 'Nº MEMBROS', '', stats.membersCount, 'Nº VISITANTES MÊS', '', '', stats.visitorsCount, '', ''],
      [monthNameUpper, 'Nº CÉLULAS', '', stats.cellsCount, 'Nº ACEITAÇÕES E RECONCILIAÇÕES', '', '', stats.conversionsCount, '', ''],
      [currentYear, 'Nº BATISMOS NAS ÁGUAS', '', stats.baptismsWaterCount, 'Nº BATISMOS C/ ESPÍRITO SANTO', '', '', stats.baptismsHolySpiritCount, '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', 'DEMONSTRATIVO FINANCEIRO', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['ARRECADAÇÃO', '', fmtCurrency(totalArrecadacao), '', 'TOTAL DE SAÍDAS', '', '', fmtCurrency(totalSaidasComTaxa), '', ''],
      ['OFERTA DE MISSÕES', '', fmtCurrency(totalMissionsSum), '', 'SEDE (25%)', '', '', fmtCurrency(taxaSede25), '', ''],
      ['', '', '', '', 'SALDO DO MÊS', '', '', fmtCurrency(saldoFinalMes), '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['', '', 'DESCRIMINAÇÃO DE SAÍDAS', '', '', '', '', '', '', ''],
      ['DATA', 'DESCRIMINAÇÃO', '', '', '', 'VALOR', '', '', '', ''],
    ];

    expenses.forEach(exp => {
      refcData.push([exp.date || '-', exp.description, '', '', '', fmtCurrency(exp.amount), '', '', '', '']);
    });
    refcData.push(['-', 'TAXA REGIÃO (25%)', '', '', '', fmtCurrency(taxaSede25), '', '', '', '']);
    refcData.push(['', 'TOTAL DE SAÍDAS', '', '', '', fmtCurrency(totalSaidasComTaxa), '', '', '', '']);

    const wsRefc = XLSX.utils.aoa_to_sheet(refcData);
    XLSX.utils.book_append_sheet(wb, wsRefc, 'REFC');

    // ABA 2: Entradas
    const entradasData: any[][] = [
      ['RESUMO FINANCEIRO', '', '', '', '', '', '', '', '', ''],
      [churchInfo.churchName, '', '', '', 'REGIÃO:', churchInfo.region, '', 'PASTOR:', churchInfo.pastorName, ''],
      ['ANO:', currentYear, '', '', 'MÊS:', monthNameUpper, '', '', '', ''],
      ['', '', '', '', '', '', '', '', '', ''],
      ['DIA', 'Dízimo', 'Oferta Geral', 'Oferta Especial', '3º domingo', 'Total', '', '', '', ''],
    ];

    dailyEntries.forEach(entry => {
      entradasData.push([
        entry.dateStr,
        entry.tithes > 0 ? fmtCurrency(entry.tithes) : 'R$ -',
        entry.offeringGeneral > 0 ? fmtCurrency(entry.offeringGeneral) : 'R$ -',
        entry.offeringSpecial > 0 ? fmtCurrency(entry.offeringSpecial) : 'R$ -',
        entry.missions > 0 ? fmtCurrency(entry.missions) : 'R$ -',
        entry.total > 0 ? fmtCurrency(entry.total) : 'R$ -'
      ]);
    });

    entradasData.push([
      'TOTAL',
      fmtCurrency(totalTithesSum),
      fmtCurrency(totalOfferingGenSum),
      fmtCurrency(totalOfferingSpecSum),
      fmtCurrency(totalMissionsSum),
      fmtCurrency(totalArrecadacao)
    ]);
    entradasData.push(['', '', '', '', '', '']);
    entradasData.push(['SOMA GERAL', '', fmtCurrency(totalArrecadacao), '', '', '']);
    entradasData.push(['TAXA (25%)', '', fmtCurrency(taxaSede25), '', '', '']);
    entradasData.push(['OFERTA MISSÕES', '', fmtCurrency(totalMissionsSum), '', '', '']);
    entradasData.push(['TOTAL SEDE', '', fmtCurrency(totalSedeResumo), '', '', '']);

    const wsEntradas = XLSX.utils.aoa_to_sheet(entradasData);
    XLSX.utils.book_append_sheet(wb, wsEntradas, 'Entradas');

    // Salvar arquivo
    XLSX.writeFile(wb, `RELATORIO_QUADRANGULAR_${monthNameUpper}_${currentYear}.xlsx`);
  };

  // Gerar PDF direto de alta resolução (1 Página A4 para cada Aba)
  const handleDownloadPdf = async (targetTab: 'refc' | 'entradas' | 'expenses' | 'both') => {
    setIsGeneratingPdf(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = 210;
      const pdfHeight = 297;

      const effectiveTab = targetTab === 'expenses' ? 'refc' : targetTab;

      if (effectiveTab === 'refc' || effectiveTab === 'both') {
        const elem = document.getElementById('print-refc-sheet');
        if (elem) {
          const canvas = await html2canvas(elem, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
          });
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        }
      }

      if (effectiveTab === 'both') {
        pdf.addPage();
      }

      if (effectiveTab === 'entradas' || effectiveTab === 'both') {
        const elem = document.getElementById('print-entradas-sheet');
        if (elem) {
          const canvas = await html2canvas(elem, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
          });
          const imgData = canvas.toDataURL('image/png');
          if (effectiveTab === 'entradas') {
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
          } else {
            pdf.setPage(2);
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
          }
        }
      }

      pdf.save(`RELATORIO_QUADRANGULAR_${effectiveTab.toUpperCase()}_${monthNameUpper}_${currentYear}.pdf`);
    } catch (err: any) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao gerar arquivo PDF. Você também pode usar o botão Imprimir.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Disparar Impressão Oficial do Navegador
  const handlePrint = (mode: 'single' | 'both') => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  return (
    <div className="space-y-6">
      {/* Barra Superior de Controle */}
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 border border-zinc-200 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Modelo Oficial
              </span>
              <h2 className="text-xl font-bold text-zinc-900">Relatório Quadrangular (REFC & Entradas)</h2>
            </div>
            <p className="text-sm text-zinc-500">
              Divisão automática nos dias de culto (Terça, Sexta e Domingo) e cálculo exato dos 25% da Sede.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Competência */}
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
              <Calendar size={18} className="text-zinc-500" />
              <label htmlFor="competence-select" className="text-xs font-bold text-zinc-600 uppercase">Mês:</label>
              <input
                id="competence-select"
                type="month"
                value={selectedMonthYear}
                onChange={(e) => setSelectedMonthYear(e.target.value)}
                className="bg-transparent font-bold text-zinc-900 outline-none cursor-pointer"
              />
            </div>

            {/* Alternador de Abas de Visualização */}
            <div className="flex rounded-xl border border-zinc-200 bg-zinc-100 p-1">
              <button
                onClick={() => setActiveTab('refc')}
                className={cn(
                  "rounded-lg px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-1.5",
                  activeTab === 'refc' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                <FileText size={14} />
                1. REFC (Mensal)
              </button>
              <button
                onClick={() => setActiveTab('entradas')}
                className={cn(
                  "rounded-lg px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-1.5",
                  activeTab === 'entradas' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                <Calculator size={14} />
                2. Entradas (Cultos)
              </button>
              <button
                onClick={() => setActiveTab('expenses')}
                className={cn(
                  "rounded-lg px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-1.5",
                  activeTab === 'expenses' ? "bg-white text-rose-700 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                )}
              >
                <ArrowDownCircle size={14} className="text-rose-600" />
                3. Inserir Despesas ({expenses.length})
              </button>
            </div>

            {/* Botões de Ação de Impressão e Download */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePrint('single')}
                className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-zinc-800 transition-all active:scale-95"
                title="Imprime exatamente 1 página A4 da aba selecionada"
              >
                <Printer size={15} />
                Imprimir Aba Atual (1 Pág)
              </button>

              <button
                onClick={() => handlePrint('both')}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-900 bg-white px-3.5 py-2 text-xs font-bold text-zinc-900 shadow-sm hover:bg-zinc-50 transition-all active:scale-95"
                title="Imprime as 2 páginas (REFC + Entradas)"
              >
                <Printer size={15} />
                Imprimir Ambas (2 Págs)
              </button>

              <button
                onClick={() => handleDownloadPdf(activeTab)}
                disabled={isGeneratingPdf}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition-all active:scale-95 disabled:opacity-50"
                title="Baixar PDF Oficial"
              >
                <Download size={15} />
                {isGeneratingPdf ? 'Gerando...' : 'PDF'}
              </button>

              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-all active:scale-95"
                title="Exportar Planilha Excel com fórmulas"
              >
                <FileSpreadsheet size={15} />
                Excel (.xlsx)
              </button>

              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-500 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-all active:scale-95"
                title="Zerar todos os lançamentos de entradas e saídas deste mês"
              >
                <RotateCcw size={14} />
                Zerar Mês
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ⚡ PAINEL MÁGICO: LANÇAMENTO DO TOTAL & DIVISÃO AUTOMÁTICA NOS CULTOS */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-white p-5 shadow-sm print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-blue-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <Sparkles size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                Divisão Automática de Cultos (Terça, Sexta e Domingo)
              </h3>
              <p className="text-xs text-zinc-500">
                Digite o valor total do mês e o sistema distribui perfeitamente em todos os cultos de {competenciaExtenso}, com a oferta de missões no 3º domingo!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-blue-200 bg-white p-0.5 text-xs font-semibold">
              <button
                onClick={() => setDistMode('total')}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-all",
                  distMode === 'total' ? "bg-blue-600 text-white shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                )}
              >
                Valor Total Global
              </button>
              <button
                onClick={() => setDistMode('detailed')}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-all",
                  distMode === 'detailed' ? "bg-blue-600 text-white shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                )}
              >
                Totais por Categoria
              </button>
            </div>
          </div>
        </div>

        {/* Inputs de Valores */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 items-end">
          {distMode === 'total' ? (
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 mb-1">
                Valor Total Arrecadado no Mês (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  value={totalGeneralTarget}
                  onChange={(e) => setTotalGeneralTarget(e.target.value)}
                  placeholder="Ex: 4300.00"
                  className="w-full rounded-xl border border-blue-300 bg-white py-2 pl-10 pr-3 text-base font-bold text-blue-950 focus:border-blue-600 focus:outline-hidden shadow-xs"
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Total Dízimos (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={targetTithes}
                  onChange={(e) => setTargetTithes(e.target.value)}
                  placeholder="3500.00"
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2 px-3 text-sm font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Oferta Geral (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={targetOfferingGeneral}
                  onChange={(e) => setTargetOfferingGeneral(e.target.value)}
                  placeholder="600.00"
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2 px-3 text-sm font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Oferta Especial (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={targetOfferingSpecial}
                  onChange={(e) => setTargetOfferingSpecial(e.target.value)}
                  placeholder="150.00"
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2 px-3 text-sm font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">3º Dom. (Missões) (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={targetMissions}
                  onChange={(e) => setTargetMissions(e.target.value)}
                  placeholder="50.00"
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2 px-3 text-sm font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                />
              </div>
            </>
          )}

          <div className="sm:col-span-2 lg:col-span-1">
            <button
              onClick={handleAutoDistribute}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95"
            >
              <Sparkles size={16} />
              Distribuir nos Cultos
            </button>
          </div>
        </div>

        {syncStatus && (
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 animate-fade-in">
            <CheckCircle2 size={16} className="text-emerald-600" />
            {syncStatus}
          </div>
        )}

        {/* Resumo Instantâneo dos Cálculos */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-blue-100 text-center">
          <div className="rounded-xl bg-white/80 p-2.5 border border-zinc-200/80">
            <p className="text-[10px] font-bold uppercase text-zinc-400">Total Arrecadado</p>
            <p className="text-sm font-bold text-blue-700">{fmtCurrency(totalArrecadacao)}</p>
          </div>
          <div className="rounded-xl bg-white/80 p-2.5 border border-zinc-200/80">
            <p className="text-[10px] font-bold uppercase text-zinc-400">Sede / Região (25%)</p>
            <p className="text-sm font-bold text-indigo-700">{fmtCurrency(taxaSede25)}</p>
          </div>
          <div className="rounded-xl bg-white/80 p-2.5 border border-zinc-200/80">
            <p className="text-[10px] font-bold uppercase text-zinc-400">Total de Saídas</p>
            <p className="text-sm font-bold text-rose-600">{fmtCurrency(totalSaidasComTaxa)}</p>
          </div>
          <div className="rounded-xl bg-white/80 p-2.5 border border-zinc-200/80">
            <p className="text-[10px] font-bold uppercase text-zinc-400">Saldo Líquido</p>
            <p className={cn("text-sm font-bold", saldoFinalMes >= 0 ? "text-emerald-600" : "text-amber-600")}>
              {fmtCurrency(saldoFinalMes)}
            </p>
          </div>
        </div>
      </div>

      {/* 💸 PAINEL PRINCIPAL DE LANÇAMENTO & GESTÃO DE DESPESAS / SAÍDAS DO REFC */}
      <div className={cn(
        "rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50/80 via-orange-50/30 to-white p-5 shadow-sm print:hidden",
        activeTab === 'entradas' ? "hidden" : "block"
      )}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-rose-100 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm">
              <ArrowDownCircle size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-zinc-900">
                  Lançamento de Despesas / Saídas (REFC)
                </h3>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                  {expenses.length} lançadas
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Insira as saídas do mês de {competenciaExtenso} (Água, Luz, Sustento Pastoral, etc.). O total e os 25% da Sede são recalculados em tempo real!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleImportExpensesFromFirestore}
              disabled={isImportingExpenses}
              className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 transition-all shadow-xs disabled:opacity-50"
              title="Importa as despesas que já foram lançadas no módulo Financeiro da igreja"
            >
              <Download size={14} />
              {isImportingExpenses ? 'Importando...' : '📥 Importar do Módulo Financeiro'}
            </button>
            
            <button
              onClick={handleAddExpense}
              className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 transition-all shadow-xs"
            >
              <Plus size={14} /> Nova Linha
            </button>
          </div>
        </div>

        {/* Formulário de Inserção Rápida de Despesa */}
        <form onSubmit={handleQuickAddExpense} className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end bg-white/80 p-3.5 rounded-xl border border-rose-100 shadow-xs">
          <div className="sm:col-span-3">
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Data (ex: 05/07 ou AAAA-MM-DD)
            </label>
            <input
              type="text"
              placeholder="ex: 10/07"
              value={newExpenseDate}
              onChange={(e) => setNewExpenseDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 px-3 text-xs font-mono font-bold text-zinc-900 focus:border-rose-600 focus:outline-hidden"
            />
          </div>

          <div className="sm:col-span-5">
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Descrição da Despesa / Saída
            </label>
            <input
              type="text"
              placeholder="Ex: TAXA DE LUZ, SUSTENTO PASTORAL..."
              value={newExpenseDesc}
              onChange={(e) => setNewExpenseDesc(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 px-3 text-xs font-bold uppercase text-zinc-900 focus:border-rose-600 focus:outline-hidden"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Valor (R$)
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">R$</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={newExpenseAmount}
                onChange={(e) => setNewExpenseAmount(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-8 pr-2 text-xs font-mono font-bold text-zinc-900 focus:border-rose-600 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-rose-600 py-2 px-3 text-xs font-bold text-white hover:bg-rose-700 transition-all shadow-sm"
            >
              <Plus size={15} /> Inserir Despesa
            </button>
          </div>
        </form>

        {/* Sugestões Rápidas de Despesas Comuns */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-zinc-500 mr-1">Sugestões rápidas:</span>
          {commonExpenseSuggestions.map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => {
                setNewExpenseDesc(sug);
                if (!newExpenseDate) setNewExpenseDate(format(new Date(), 'dd/MM'));
              }}
              className="rounded-lg border border-rose-200/80 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 transition-all"
            >
              + {sug}
            </button>
          ))}
        </div>

        {/* Lista de Despesas Lançadas com Botões de Alterar e Excluir */}
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
          <div className="bg-zinc-50 px-4 py-2.5 text-xs font-bold text-zinc-700 flex items-center justify-between border-b border-zinc-200">
            <span className="flex items-center gap-2">
              <FileText size={15} className="text-rose-600" />
              Despesas Registradas na Folha REFC ({expenses.length})
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono text-rose-700 font-bold text-sm">
                Total Saídas: {fmtCurrency(manualExpensesSum)}
              </span>
              {expenses.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Deseja excluir todas as despesas lançadas deste mês?')) {
                      setExpenses([]);
                      setSyncStatus('Todas as despesas foram removidas.');
                      setTimeout(() => setSyncStatus(null), 3000);
                    }
                  }}
                  className="text-[11px] text-zinc-400 hover:text-rose-600 font-semibold underline"
                >
                  Limpar todas
                </button>
              )}
            </div>
          </div>

          {expenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400 flex flex-col items-center justify-center gap-2">
              <ArrowDownCircle size={28} className="text-zinc-300" />
              <p className="font-semibold text-zinc-600">Nenhuma despesa lançada no momento.</p>
              <p className="text-[11px] text-zinc-400 max-w-md">
                Utilize o formulário acima para inserir as saídas da igreja (Água, Luz, Sustento Pastoral, etc.) ou clique em uma das sugestões rápidas. Todas as despesas entrarão automaticamente no cálculo do REFC.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-100/80 border-b border-zinc-200 text-zinc-600 font-bold uppercase text-[10px]">
                    <th className="py-2.5 px-3 w-28">Data</th>
                    <th className="py-2.5 px-3">Descriminação da Saída</th>
                    <th className="py-2.5 px-3 text-right w-36">Valor</th>
                    <th className="py-2.5 px-3 text-center w-44">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-rose-50/30 transition-colors group">
                      <td className="py-2.5 px-3 font-mono font-bold text-zinc-800">
                        {exp.date || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-bold uppercase text-zinc-900">
                        {exp.description}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700 text-sm">
                        {fmtCurrency(exp.amount)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Botão Alterar */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditExpense(exp)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] transition-all shadow-2xs active:scale-95"
                            title="Alterar valor, descrição ou data desta despesa"
                          >
                            <Pencil size={12} />
                            Alterar
                          </button>

                          {/* Botão Excluir */}
                          <button
                            type="button"
                            onClick={() => handleRemoveExpense(exp.id, exp.description)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-bold text-[11px] transition-all shadow-2xs active:scale-95"
                            title="Excluir esta despesa do relatório"
                          >
                            <Trash2 size={12} />
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL / DIALOG DE ALTERAÇÃO DE DESPESA */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-fade-in print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl border border-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <Pencil size={16} />
                </div>
                <h4 className="text-sm font-bold text-zinc-900">Alterar Despesa / Saída</h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditExpense} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Data da Despesa (ex: 10/07 ou DD/MM)
                </label>
                <input
                  type="text"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  placeholder="DD/MM"
                  className="w-full rounded-xl border border-zinc-300 bg-white p-2.5 text-xs font-mono font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Descrição da Despesa / Saída
                </label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Ex: TAXA DE LUZ, SUSTENTO PASTORAL..."
                  className="w-full rounded-xl border border-zinc-300 bg-white p-2.5 text-xs font-bold uppercase text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Valor da Despesa (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-xs font-mono font-bold text-zinc-900 focus:border-blue-600 focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setEditingExpense(null)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition-all shadow-sm"
                >
                  <Save size={14} />
                  Salvar Alteração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAINEL DE EDIÇÃO DOS DADOS DA IGREJA & ESTATÍSTICAS (Opcional / Recolhível) */}
      <details className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs print:hidden">
        <summary className="font-bold text-zinc-800 cursor-pointer flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Building2 size={16} className="text-zinc-500" />
            Editar Dados da Igreja e Estatísticas de Membresia do Mês
          </span>
          <span className="text-zinc-400 hover:text-zinc-600">Clique para abrir/fechar</span>
        </summary>
        
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-zinc-100">
          <div>
            <label className="block font-bold text-zinc-600 mb-1">Nome da Igreja</label>
            <input
              type="text"
              value={churchInfo.churchName}
              onChange={(e) => setChurchInfo(prev => ({ ...prev, churchName: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 p-2 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-zinc-600 mb-1">Pastor Titular</label>
            <input
              type="text"
              value={churchInfo.pastorName}
              onChange={(e) => setChurchInfo(prev => ({ ...prev, pastorName: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 p-2 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-zinc-600 mb-1">Endereço da Igreja</label>
            <input
              type="text"
              value={churchInfo.address}
              onChange={(e) => setChurchInfo(prev => ({ ...prev, address: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 p-2 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-zinc-600 mb-1">Região Eclesiástica</label>
            <input
              type="text"
              value={churchInfo.region}
              onChange={(e) => setChurchInfo(prev => ({ ...prev, region: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 p-2 text-xs font-semibold"
            />
          </div>
        </div>

        {/* Estatísticas */}
        <div className="mt-4 pt-3 border-t border-zinc-100">
          <p className="font-bold text-zinc-700 mb-2">Estatísticas do Mês</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div>
              <label className="block text-zinc-500 mb-1">Nº Membros</label>
              <input
                type="number"
                value={stats.membersCount}
                onChange={(e) => setStats(prev => ({ ...prev, membersCount: parseInt(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-zinc-300 p-1.5 text-xs text-center font-bold"
              />
            </div>
            <div>
              <label className="block text-zinc-500 mb-1">Nº Células</label>
              <input
                type="number"
                value={stats.cellsCount}
                onChange={(e) => setStats(prev => ({ ...prev, cellsCount: parseInt(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-zinc-300 p-1.5 text-xs text-center font-bold"
              />
            </div>
            <div>
              <label className="block text-zinc-500 mb-1">Visitantes Mês</label>
              <input
                type="number"
                value={stats.visitorsCount}
                onChange={(e) => setStats(prev => ({ ...prev, visitorsCount: parseInt(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-zinc-300 p-1.5 text-xs text-center font-bold"
              />
            </div>
            <div>
              <label className="block text-zinc-500 mb-1">Aceitações</label>
              <input
                type="number"
                value={stats.conversionsCount}
                onChange={(e) => setStats(prev => ({ ...prev, conversionsCount: parseInt(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-zinc-300 p-1.5 text-xs text-center font-bold"
              />
            </div>
            <div>
              <label className="block text-zinc-500 mb-1">Batismos Águas</label>
              <input
                type="number"
                value={stats.baptismsWaterCount}
                onChange={(e) => setStats(prev => ({ ...prev, baptismsWaterCount: parseInt(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-zinc-300 p-1.5 text-xs text-center font-bold"
              />
            </div>
            <div>
              <label className="block text-zinc-500 mb-1">Batismos Espírito</label>
              <input
                type="number"
                value={stats.baptismsHolySpiritCount}
                onChange={(e) => setStats(prev => ({ ...prev, baptismsHolySpiritCount: parseInt(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-zinc-300 p-1.5 text-xs text-center font-bold"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSaveChurchSettings}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-900"
          >
            <Save size={14} /> Salvar como Padrão
          </button>
        </div>
      </details>

      {/* ========================================================================= */}
      {/* VISUALIZAÇÃO DA FOLHA A4 OFICIAL (IDÊNTICA À PLANILHA QUADRANGULAR)        */}
      {/* ========================================================================= */}

      <div className="flex justify-center overflow-x-auto pb-8">
        {/* CONTAINER DO REFC (PÁGINA 1) */}
        <div
          id="print-refc-sheet"
          ref={refcPrintRef}
          className={cn(
            "w-[210mm] min-h-[297mm] bg-white p-[10mm] text-zinc-900 font-serif border border-zinc-300 shadow-md",
            activeTab !== 'refc' && printMode === 'single' ? "hidden print:hidden" : "block",
            printMode === 'both' ? "print:block print:break-after-page" : ""
          )}
          style={{ boxSizing: 'border-box' }}
        >
          {/* Cabeçalho Oficial Quadrangular */}
          <div className="text-center border-b-2 border-black pb-2 mb-3">
            <div className="flex items-center justify-between">
              {/* Emblema / 4 Cores da Quadrangular ou Logo Personalizada */}
              <div className="flex flex-col items-center justify-center w-16 h-16 border border-zinc-800 rounded-lg p-1 bg-zinc-50 overflow-hidden">
                {churchInfo.logoUrl ? (
                  <img 
                    src={churchInfo.logoUrl} 
                    alt="Logo Igreja" 
                    className="max-h-full max-w-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-0.5 w-8 h-8 mb-0.5">
                      <div className="bg-rose-600 rounded-xs" title="Jesus Salva (Vermelho)"></div>
                      <div className="bg-amber-400 rounded-xs" title="Jesus Batiza c/ Espírito Santo (Amarelo)"></div>
                      <div className="bg-blue-600 rounded-xs" title="Jesus Cura (Azul)"></div>
                      <div className="bg-purple-700 rounded-xs" title="Jesus Voltará (Roxo)"></div>
                    </div>
                    <span className="text-[7px] font-sans font-bold tracking-tighter text-zinc-800 leading-none">IEQ</span>
                  </>
                )}
              </div>

              <div className="flex-1 px-2">
                <h1 className="text-lg font-bold tracking-wider uppercase font-sans text-black">
                  IGREJA DO EVANGELHO QUADRANGULAR
                </h1>
                <h2 className="text-sm font-bold tracking-normal uppercase text-zinc-800 mt-0.5">
                  RELATÓRIO ESTATÍSTICO E FINANCEIRO DE CULTO MENSAL
                </h2>
                <h3 className="text-sm font-bold uppercase text-zinc-900 mt-0.5">
                  {churchInfo.churchName}
                </h3>
                <p className="text-[11px] font-sans text-zinc-700">
                  PASTOR: {churchInfo.pastorName}
                </p>
                <p className="text-[10px] font-sans text-zinc-600">
                  ENDEREÇO: {churchInfo.address}
                </p>
              </div>

              {/* Logo / Selo Sede */}
              <div className="w-16 text-right">
                <span className="text-[10px] font-sans font-bold text-zinc-500 uppercase block">REFC</span>
                <span className="text-xs font-mono font-bold text-zinc-800">Região {churchInfo.region}</span>
              </div>
            </div>
          </div>

          {/* Quadro Mês / Ano e Estatísticas de Membresia */}
          <div className="border border-black mb-3">
            <table className="w-full text-xs border-collapse">
              <tbody>
                <tr className="border-b border-black bg-zinc-100/70 font-sans font-bold">
                  <td className="p-1.5 border-r border-black w-1/4 text-center">MÊS / ANO</td>
                  <td className="p-1.5 border-r border-black w-1/4 text-left">Nº MEMBROS</td>
                  <td className="p-1.5 border-r border-black w-1/6 text-center bg-white font-mono text-sm">{stats.membersCount}</td>
                  <td className="p-1.5 border-r border-black w-1/4 text-left">Nº VISITANTES MÊS</td>
                  <td className="p-1.5 text-center bg-white font-mono text-sm">{stats.visitorsCount}</td>
                </tr>
                <tr className="border-b border-black">
                  <td rowSpan={2} className="p-1.5 border-r border-black text-center font-bold text-sm bg-zinc-50 font-sans">
                    {monthNameUpper}<br /><span className="text-xs font-normal text-zinc-600">{currentYear}</span>
                  </td>
                  <td className="p-1.5 border-r border-black text-left font-semibold">Nº CÉLULAS</td>
                  <td className="p-1.5 border-r border-black text-center font-mono font-bold">{stats.cellsCount}</td>
                  <td className="p-1.5 border-r border-black text-left font-semibold">Nº ACEITAÇÕES E RECONCILIAÇÕES</td>
                  <td className="p-1.5 text-center font-mono font-bold">{stats.conversionsCount}</td>
                </tr>
                <tr>
                  <td className="p-1.5 border-r border-black text-left font-semibold">Nº BATISMOS NAS ÁGUAS</td>
                  <td className="p-1.5 border-r border-black text-center font-mono font-bold">{stats.baptismsWaterCount}</td>
                  <td className="p-1.5 border-r border-black text-left font-semibold">Nº BATISMOS C/ ESPÍRITO SANTO</td>
                  <td className="p-1.5 text-center font-mono font-bold">{stats.baptismsHolySpiritCount}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Demonstrativo Financeiro Resumido */}
          <div className="mb-3">
            <div className="bg-zinc-800 text-white text-center py-1 text-xs font-sans font-bold uppercase tracking-wider">
              DEMONSTRATIVO FINANCEIRO
            </div>
            <table className="w-full text-xs border border-black border-t-0 border-collapse">
              <tbody>
                <tr className="border-b border-black">
                  <td className="p-1.5 font-bold border-r border-black w-1/3 bg-zinc-50">ARRECADAÇÃO</td>
                  <td className="p-1.5 font-bold font-mono text-right border-r border-black w-1/6 text-blue-900 bg-white">
                    {fmtCurrency(totalArrecadacao)}
                  </td>
                  <td className="p-1.5 font-bold border-r border-black w-1/3 bg-zinc-50">TOTAL DE SAÍDAS</td>
                  <td className="p-1.5 font-bold font-mono text-right w-1/6 text-rose-900 bg-white">
                    {fmtCurrency(totalSaidasComTaxa)}
                  </td>
                </tr>
                <tr className="border-b border-black">
                  <td className="p-1.5 font-bold border-r border-black bg-zinc-50">OFERTA DE MISSÕES</td>
                  <td className="p-1.5 font-bold font-mono text-right border-r border-black bg-white">
                    {fmtCurrency(totalMissionsSum)}
                  </td>
                  <td className="p-1.5 font-bold border-r border-black bg-zinc-50">SEDE (25%)</td>
                  <td className="p-1.5 font-bold font-mono text-right bg-white">
                    {fmtCurrency(taxaSede25)}
                  </td>
                </tr>
                <tr className="bg-zinc-100 font-bold">
                  <td colSpan={2} className="p-1.5 border-r border-black text-right uppercase text-[11px] font-sans">
                    SALDO FINAL DO MÊS:
                  </td>
                  <td colSpan={2} className={cn("p-1.5 font-mono text-right text-sm", saldoFinalMes >= 0 ? "text-emerald-800" : "text-amber-800")}>
                    {fmtCurrency(saldoFinalMes)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Discriminação de Saídas */}
          <div className="mb-4">
            <div className="bg-zinc-800 text-white text-center py-1 text-xs font-sans font-bold uppercase tracking-wider">
              DESCRIMINAÇÃO DE SAÍDAS
            </div>
            <table className="w-full text-xs border border-black border-t-0 border-collapse">
              <thead>
                <tr className="bg-zinc-100 border-b border-black font-sans font-bold">
                  <th className="p-1 border-r border-black w-24 text-center">DATA</th>
                  <th className="p-1 border-r border-black text-left">DESCRIMINAÇÃO</th>
                  <th className="p-1 text-right w-36">VALOR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-300">
                {expenses.map((exp, idx) => (
                  <tr key={exp.id || idx} className="hover:bg-zinc-50 group">
                    <td className="p-1 border-r border-black text-center font-mono text-[11px]">
                      {exp.date || '-'}
                    </td>
                    <td className="p-1 border-r border-black font-medium">
                      <div className="flex items-center justify-between">
                        <span>{exp.description}</span>
                        {/* Botões de Alterar e Excluir na visualização em tela */}
                        <div className="hidden group-hover:flex items-center gap-1 print:hidden">
                          <button
                            type="button"
                            onClick={() => handleOpenEditExpense(exp)}
                            className="p-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 text-[10px] font-bold flex items-center gap-0.5"
                            title="Alterar despesa"
                          >
                            <Pencil size={10} /> Alterar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveExpense(exp.id, exp.description)}
                            className="p-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 text-[10px] font-bold flex items-center gap-0.5"
                            title="Excluir despesa"
                          >
                            <Trash2 size={10} /> Excluir
                          </button>
                        </div>
                      </div>
                    </td>
                    <td className="p-1 text-right font-mono font-bold">
                      {fmtCurrency(exp.amount)}
                    </td>
                  </tr>
                ))}
                {/* Taxa Região (25%) */}
                <tr className="bg-zinc-50 font-bold">
                  <td className="p-1 border-r border-black text-center font-mono text-[11px]">-</td>
                  <td className="p-1 border-r border-black">TAXA REGIÃO (25%)</td>
                  <td className="p-1 text-right font-mono text-indigo-900">{fmtCurrency(taxaSede25)}</td>
                </tr>
                {/* Linhas vazias para preencher folha A4 com elegância */}
                {Array.from({ length: Math.max(0, 6 - expenses.length) }).map((_, i) => (
                  <tr key={`empty-${i}`} className="h-6">
                    <td className="p-1 border-r border-black text-center text-zinc-300">-</td>
                    <td className="p-1 border-r border-black text-zinc-300"></td>
                    <td className="p-1 text-right text-zinc-300 font-mono">R$ -</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black bg-zinc-200 font-bold font-sans">
                  <td colSpan={2} className="p-1.5 border-r border-black text-right uppercase tracking-wider">
                    TOTAL DE SAÍDAS:
                  </td>
                  <td className="p-1.5 text-right font-mono text-sm text-rose-900">
                    {fmtCurrency(totalSaidasComTaxa)}
                  </td>
                </tr>
              </tfoot>
            </table>
            
            {/* Botão conveniente na visualização da folha na tela */}
            <div className="mt-2 flex items-center justify-between print:hidden">
              <span className="text-[11px] text-zinc-500">
                💡 Passe o mouse sobre uma despesa para <strong className="text-blue-700">Alterar</strong> ou <strong className="text-rose-700">Excluir</strong> diretamente, ou clique ao lado:
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('expenses')}
                className="flex items-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-xs font-bold transition-all shadow-xs"
              >
                <Plus size={14} /> + Inserir / Gerenciar Despesas
              </button>
            </div>
          </div>

          {/* Assinaturas Oficiais no Rodapé */}
          <div className="mt-8 pt-4 border-t border-zinc-400 grid grid-cols-2 gap-12 text-center text-xs font-sans">
            <div>
              <div className="border-b border-black pb-1 mb-1">
                <p className="font-bold uppercase text-zinc-900">{churchInfo.pastorName}</p>
              </div>
              <p className="text-[10px] uppercase font-bold text-zinc-600">Pastor Titular</p>
            </div>
            <div>
              <div className="border-b border-black pb-1 mb-1">
                <p className="font-bold uppercase text-zinc-900">TESOURARIA / SECRETARIA</p>
              </div>
              <p className="text-[10px] uppercase font-bold text-zinc-600">Responsável Financeiro</p>
            </div>
          </div>

          <div className="mt-4 text-center text-[9px] font-sans text-zinc-400 uppercase">
            Documento Oficial • Igreja do Evangelho Quadrangular • Gerado em {format(new Date(), 'dd/MM/yyyy HH:mm')}
          </div>
        </div>

        {/* CONTAINER DE ENTRADAS DIÁRIAS (PÁGINA 2) */}
        <div
          id="print-entradas-sheet"
          ref={entradasPrintRef}
          className={cn(
            "w-[210mm] min-h-[297mm] bg-white p-[8mm] text-zinc-900 font-sans border border-zinc-300 shadow-md",
            activeTab !== 'entradas' && printMode === 'single' ? "hidden print:hidden" : "block",
            printMode === 'both' ? "print:block" : ""
          )}
          style={{ boxSizing: 'border-box' }}
        >
          {/* Cabeçalho do Resumo Financeiro */}
          <div className="border-b-2 border-black pb-1.5 mb-2">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-sm font-bold tracking-wider uppercase text-black">
                  RESUMO FINANCEIRO — {churchInfo.churchName}
                </h1>
                <div className="flex items-center gap-4 text-xs font-semibold text-zinc-700 mt-0.5">
                  <span>REGIÃO: <strong className="font-bold text-black">{churchInfo.region}</strong></span>
                  <span>PASTOR: <strong className="font-bold text-black">{churchInfo.pastorName}</strong></span>
                </div>
              </div>
              <div className="text-right text-xs">
                <p className="font-bold uppercase text-zinc-800">
                  ANO: <span className="font-mono">{currentYear}</span> | MÊS: <span>{monthNameUpper}</span>
                </p>
                <span className="text-[9px] text-zinc-500 font-mono">Cultos: Terça • Sexta • Domingo</span>
              </div>
            </div>
          </div>

          {/* Tabela de Lançamentos Diários dos Cultos (Dias 1 a 31) */}
          <table className="w-full text-[10px] border border-black border-collapse mb-2">
            <thead>
              <tr className="bg-zinc-800 text-white font-bold text-center">
                <th className="p-1 border-r border-black w-24">DIA</th>
                <th className="p-1 border-r border-black w-24">Dízimo</th>
                <th className="p-1 border-r border-black w-24">Oferta Geral</th>
                <th className="p-1 border-r border-black w-24">Oferta Especial</th>
                <th className="p-1 border-r border-black w-24">3º domingo</th>
                <th className="p-1 w-24">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {dailyEntries.map((entry) => {
                const isCultoDay = entry.isCulto;
                const isSunday = entry.dayOfWeek === 0;
                
                return (
                  <tr 
                    key={entry.day} 
                    className={cn(
                      "h-4.5 hover:bg-yellow-50",
                      isSunday ? "bg-amber-50/50 font-semibold" : (isCultoDay ? "bg-blue-50/30" : "text-zinc-400 bg-white")
                    )}
                  >
                    {/* Dia com Nome da Semana */}
                    <td className="p-0.5 px-1 border-r border-black font-mono text-[9.5px] whitespace-nowrap">
                      <span className="font-bold text-black">{entry.day.toString().padStart(2, '0')}/{currentMonthNum}</span>
                      <span className="ml-1 text-[8px] text-zinc-500 font-sans uppercase">
                        {entry.dayOfWeekName.substring(0, 3)}
                      </span>
                    </td>

                    {/* Dízimo */}
                    <td className="p-0.5 px-1 border-r border-black text-right font-mono">
                      {entry.tithes > 0 ? (
                        <input
                          type="number"
                          step="0.01"
                          value={entry.tithes || ''}
                          onChange={(e) => handleCellChange(entry.day, 'tithes', e.target.value)}
                          className="w-full text-right bg-transparent outline-none font-bold text-zinc-900 print:hidden"
                        />
                      ) : (
                        <span className="print:inline text-zinc-300">R$ -</span>
                      )}
                      <span className="hidden print:inline font-bold">
                        {entry.tithes > 0 ? fmtCurrency(entry.tithes) : 'R$ -'}
                      </span>
                    </td>

                    {/* Oferta Geral */}
                    <td className="p-0.5 px-1 border-r border-black text-right font-mono">
                      {entry.offeringGeneral > 0 ? (
                        <input
                          type="number"
                          step="0.01"
                          value={entry.offeringGeneral || ''}
                          onChange={(e) => handleCellChange(entry.day, 'offeringGeneral', e.target.value)}
                          className="w-full text-right bg-transparent outline-none font-bold text-zinc-900 print:hidden"
                        />
                      ) : (
                        <span className="print:inline text-zinc-300">R$ -</span>
                      )}
                      <span className="hidden print:inline font-bold">
                        {entry.offeringGeneral > 0 ? fmtCurrency(entry.offeringGeneral) : 'R$ -'}
                      </span>
                    </td>

                    {/* Oferta Especial */}
                    <td className="p-0.5 px-1 border-r border-black text-right font-mono">
                      {entry.offeringSpecial > 0 ? (
                        <input
                          type="number"
                          step="0.01"
                          value={entry.offeringSpecial || ''}
                          onChange={(e) => handleCellChange(entry.day, 'offeringSpecial', e.target.value)}
                          className="w-full text-right bg-transparent outline-none font-bold text-zinc-900 print:hidden"
                        />
                      ) : (
                        <span className="print:inline text-zinc-300">R$ -</span>
                      )}
                      <span className="hidden print:inline font-bold">
                        {entry.offeringSpecial > 0 ? fmtCurrency(entry.offeringSpecial) : 'R$ -'}
                      </span>
                    </td>

                    {/* 3º Domingo / Missões */}
                    <td className="p-0.5 px-1 border-r border-black text-right font-mono">
                      {entry.missions > 0 ? (
                        <input
                          type="number"
                          step="0.01"
                          value={entry.missions || ''}
                          onChange={(e) => handleCellChange(entry.day, 'missions', e.target.value)}
                          className="w-full text-right bg-transparent outline-none font-bold text-emerald-800 print:hidden"
                        />
                      ) : (
                        <span className="print:inline text-zinc-300">R$ -</span>
                      )}
                      <span className="hidden print:inline font-bold text-emerald-800">
                        {entry.missions > 0 ? fmtCurrency(entry.missions) : 'R$ -'}
                      </span>
                    </td>

                    {/* Total do Dia */}
                    <td className="p-0.5 px-1 text-right font-mono font-bold text-black bg-zinc-50/50">
                      {entry.total > 0 ? fmtCurrency(entry.total) : 'R$ -'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black bg-zinc-200 font-bold font-mono text-[10.5px]">
                <td className="p-1 border-r border-black text-center font-sans uppercase">TOTAL</td>
                <td className="p-1 border-r border-black text-right">{fmtCurrency(totalTithesSum)}</td>
                <td className="p-1 border-r border-black text-right">{fmtCurrency(totalOfferingGenSum)}</td>
                <td className="p-1 border-r border-black text-right">{fmtCurrency(totalOfferingSpecSum)}</td>
                <td className="p-1 border-r border-black text-right text-emerald-900">{fmtCurrency(totalMissionsSum)}</td>
                <td className="p-1 text-right text-blue-950 font-bold">{fmtCurrency(totalArrecadacao)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Resumo Final de Fechamento da Sede e Observações */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Bloco de Totais e 25% da Sede */}
            <div className="border border-black">
              <table className="w-full border-collapse">
                <tbody>
                  <tr className="border-b border-black bg-zinc-50">
                    <td className="p-1 border-r border-black font-bold uppercase text-[10px]">SOMA GERAL:</td>
                    <td className="p-1 text-right font-mono font-bold text-blue-900">{fmtCurrency(totalArrecadacao)}</td>
                  </tr>
                  <tr className="border-b border-black">
                    <td className="p-1 border-r border-black font-bold uppercase text-[10px]">TAXA (25%):</td>
                    <td className="p-1 text-right font-mono font-bold text-indigo-900">{fmtCurrency(taxaSede25)}</td>
                  </tr>
                  <tr className="border-b border-black bg-zinc-50">
                    <td className="p-1 border-r border-black font-bold uppercase text-[10px]">OFERTA MISSÕES:</td>
                    <td className="p-1 text-right font-mono font-bold text-emerald-900">{fmtCurrency(totalMissionsSum)}</td>
                  </tr>
                  <tr className="bg-zinc-100 font-bold">
                    <td className="p-1 border-r border-black uppercase text-[10px]">TOTAL SEDE:</td>
                    <td className="p-1 text-right font-mono">{fmtCurrency(totalSedeResumo)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Bloco de Observações */}
            <div className="border border-black p-1.5 flex flex-col justify-between text-[9.5px]">
              <div>
                <span className="font-bold uppercase block mb-1">OBSERVAÇÕES:</span>
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Espaço para observações da tesouraria..."
                  rows={2}
                  className="w-full border-none resize-none outline-none bg-transparent font-sans print:hidden"
                />
                <div className="hidden print:block min-h-[30px] font-sans">
                  {observations || '_________________________________________________________________________________'}
                </div>
              </div>
              <div className="border-t border-zinc-400 pt-1 text-[8.5px] text-zinc-500 text-center">
                Igreja do Evangelho Quadrangular • {churchInfo.churchName}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Regras CSS de Impressão A4 Exatas (1 Página por Aba) */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          body {
            background: white !important;
            color: black !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          #print-refc-sheet, #print-entradas-sheet {
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .print\\:break-after-page {
            page-break-after: always !important;
            break-after: page !important;
          }
        }
      `}</style>
    </div>
  );
}
