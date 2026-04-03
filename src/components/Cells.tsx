import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { Plus, Edit2, Trash2, X, Users as UsersIcon, Heart, User, FileText, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { logAction } from '../lib/logger';

interface Cell {
  id: string;
  name: string;
  leader: string;
  leaderId?: string;
  memberCount: number;
  conversions: number;
  members: string[];
  acceptedJesus: string[];
  wantBaptism: string[];
  createdBy: string;
  createdAt: any;
}

export default function Cells() {
  const navigate = useNavigate();
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<Cell | null>(null);
  const [activeTab, setActiveTab] = useState<'cells' | 'meetings'>('cells');
  const [meetings, setMeetings] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    leader: '',
    leaderId: '',
    memberCount: 0,
    conversions: 0,
    members: '',
    acceptedJesus: '',
    wantBaptism: '',
  });

  const [meetingData, setMeetingData] = useState({
    date: new Date().toISOString().split('T')[0],
    membersPresent: 0,
    visitors: 0,
    conversions: 0,
    baptisms: 0,
    members: '',
    acceptedJesus: '',
    wantBaptism: '',
  });

  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);

  useEffect(() => {
    console.log('DEBUG: currentUserProfile:', currentUserProfile);
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
    if (!currentUserProfile) return;
    const q = query(collection(db, 'meetings'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      if (currentUserProfile.role === 'cell') {
        const myCellIds = cells.map(c => c.id);
        data = data.filter(m => myCellIds.includes(m.cellId));
      }
      setMeetings(data);
    });
    return () => unsubscribe();
  }, [currentUserProfile, cells]);

  useEffect(() => {
    if (!currentUserProfile) return;
    
    let q = query(collection(db, 'cells'), orderBy('createdAt', 'desc'));
    if (currentUserProfile.role === 'cell') {
      // Filter by leaderId
      // This requires a composite index in Firestore
      // For now, I'll fetch all and filter in memory
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        name: doc.data().name || '',
        leader: doc.data().leader || '',
        leaderId: doc.data().leaderId || '',
        memberCount: doc.data().memberCount || 0,
        conversions: doc.data().conversions || 0,
        members: doc.data().members || [],
        acceptedJesus: doc.data().acceptedJesus || [],
        wantBaptism: doc.data().wantBaptism || [],
        meetings: doc.data().meetings || [],
        createdBy: doc.data().createdBy || '',
        createdAt: doc.data().createdAt
      } as Cell));
      
      if (currentUserProfile.role === 'cell') {
        console.log('DEBUG: Filtering cells for leaderId:', auth.currentUser?.uid);
        data = data.filter(c => {
          const match = c.leaderId === auth.currentUser?.uid;
          console.log('DEBUG: Cell:', c.name, 'Cell LeaderId:', c.leaderId, 'User Id:', auth.currentUser?.uid, 'Match:', match);
          return match;
        });
      }
      
      setCells(data);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching cells:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUserProfile]);

  const [editingMeeting, setEditingMeeting] = useState<any>(null);

  const handleMeetingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCellId && !editingMeeting) return;

    setSubmitting(true);
    try {
      const data = {
        cellId: editingMeeting ? editingMeeting.cellId : selectedCellId,
        ...meetingData,
        members: meetingData.members.split('\n').filter(s => s.trim() !== ''),
        acceptedJesus: meetingData.acceptedJesus.split('\n').filter(s => s.trim() !== ''),
        wantBaptism: meetingData.wantBaptism.split('\n').filter(s => s.trim() !== ''),
        updatedAt: serverTimestamp()
      };

      if (editingMeeting) {
        await updateDoc(doc(db, 'meetings', editingMeeting.id), data);
        await logAction('Editar Reuniao', `Editou reuniao da celula ID: ${data.cellId}`);
        alert('Reuniao atualizada com sucesso!');
      } else {
        await addDoc(collection(db, 'meetings'), {
          ...data,
          createdAt: serverTimestamp()
        });
        await logAction('Nova Reuniao', `Registrou nova reuniao para celula ID: ${data.cellId}`);
        alert('Reuniao registrada com sucesso!');
      }
      setIsMeetingModalOpen(false);
      setEditingMeeting(null);
      setMeetingData({ 
        date: new Date().toISOString().split('T')[0], 
        membersPresent: 0, 
        visitors: 0, 
        conversions: 0, 
        baptisms: 0, 
        members: '',
        acceptedJesus: '',
        wantBaptism: ''
      });
    } catch (err) {
      console.error('Erro ao salvar reuniao:', err);
      alert('Erro ao salvar reuniao.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    
    setSubmitting(true);
    try {
      const cellData = {
        name: formData.name,
        leader: formData.leader,
        leaderId: formData.leaderId,
        memberCount: Number(formData.memberCount),
        conversions: Number(formData.conversions),
        members: formData.members.split('\n').filter(s => s.trim() !== ''),
        acceptedJesus: formData.acceptedJesus.split('\n').filter(s => s.trim() !== ''),
        wantBaptism: formData.wantBaptism.split('\n').filter(s => s.trim() !== ''),
      };

      if (editingCell) {
        await updateDoc(doc(db, 'cells', editingCell.id), cellData);
        await logAction('Editar Celula', `Editou celula: ${cellData.name}`);
      } else {
        await addDoc(collection(db, 'cells'), {
          ...cellData,
          leaderId: formData.leaderId || auth.currentUser.uid,
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp()
        });
        await logAction('Nova Celula', `Criou nova celula: ${cellData.name}`);
      }
      setIsModalOpen(false);
      setEditingCell(null);
      setFormData({ name: '', leader: '', leaderId: '', memberCount: 0, conversions: 0, members: '', acceptedJesus: '', wantBaptism: '' });
    } catch (err: any) {
      console.error('Erro ao salvar celula:', err);
      alert(`Erro ao salvar celula: ${err.message || 'Verifique suas permissoes.'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteMeetingId, setDeleteMeetingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeleteId(id);
  };

  const handleDeleteMeeting = async (id: string) => {
    setDeleteMeetingId(id);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      try {
        const cell = cells.find(c => c.id === deleteId);
        await deleteDoc(doc(db, 'cells', deleteId));
        await logAction('Excluir Celula', `Excluiu celula: ${cell?.name}`);
        alert('Celula excluida com sucesso!');
      } catch (err) {
        console.error('Erro ao excluir celula:', err);
        alert(`Erro ao excluir celula: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
      } finally {
        setDeleteId(null);
      }
    } else if (deleteMeetingId) {
      try {
        await deleteDoc(doc(db, 'meetings', deleteMeetingId));
        await logAction('Excluir Reuniao', `Excluiu reuniao ID: ${deleteMeetingId}`);
        alert('Reuniao excluida com sucesso!');
      } catch (err) {
        console.error('Erro ao excluir reuniao:', err);
        alert(`Erro ao excluir reuniao: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
      } finally {
        setDeleteMeetingId(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Celulas</h1>
            <p className="text-zinc-500">Gerencie os grupos de crescimento da igreja</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg bg-zinc-100 p-1">
              <button onClick={() => setActiveTab('cells')} className={cn("px-4 py-2 rounded-md font-semibold transition-all", activeTab === 'cells' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500")}>Celulas</button>
              <button onClick={() => setActiveTab('meetings')} className={cn("px-4 py-2 rounded-md font-semibold transition-all", activeTab === 'meetings' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-500")}>Reunioes</button>
            </div>
            <button
              onClick={() => navigate('/reports?type=cells')}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 font-semibold text-zinc-700 transition-all hover:bg-zinc-50 active:scale-95"
            >
              <FileText size={20} />
              Relatorio
            </button>
            <button
              onClick={() => {
                setEditingCell(null);
                setFormData({ name: '', leader: '', leaderId: '', memberCount: 0, conversions: 0, members: '', acceptedJesus: '', wantBaptism: '' });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 font-semibold text-white transition-all hover:bg-zinc-800 active:scale-95"
            >
              <Plus size={20} />
              Nova Celula
            </button>
          </div>
        </header>

        {activeTab === 'cells' ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cells.map((cell) => (
              <motion.div
                key={cell.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative flex flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-200"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                    <UsersIcon size={24} />
                  </div>
                  <div className="flex gap-2">
                        <button
                      onClick={() => {
                        setSelectedCellId(cell.id);
                        setIsMeetingModalOpen(true);
                      }}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-900"
                    >
                      <Calendar size={18} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingCell(cell);
                        setFormData({
                          name: cell.name,
                          leader: cell.leader,
                          leaderId: cell.leaderId || '',
                          memberCount: cell.memberCount,
                          conversions: cell.conversions,
                          members: cell.members.join('\n'),
                          acceptedJesus: cell.acceptedJesus.join('\n'),
                          wantBaptism: cell.wantBaptism.join('\n')
                        });
                        setIsModalOpen(true);
                      }}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-900"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(cell.id)}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <h3 className="text-xl font-bold text-zinc-900">{cell.name}</h3>
                <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500">
                  <User size={14} />
                  <span>Lider: {cell.leader}</span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-zinc-100 pt-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Membros</p>
                    <div className="flex items-center gap-2">
                      <UsersIcon size={16} className="text-zinc-400" />
                      <span className="text-lg font-bold text-zinc-900">{cell.memberCount}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Conversoes</p>
                    <div className="flex items-center gap-2">
                      <Heart size={16} className="text-rose-500" />
                      <span className="text-lg font-bold text-zinc-900">{cell.conversions}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 scrollbar-hide">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Data</th>
                  <th className="px-6 py-4 font-semibold">Celula</th>
                  <th className="px-6 py-4 font-semibold">Membros Presentes</th>
                  <th className="px-6 py-4 font-semibold">Visitantes</th>
                  <th className="px-6 py-4 font-semibold">Conversoes</th>
                  <th className="px-6 py-4 font-semibold text-right">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {meetings.map(meeting => (
                  <tr key={meeting.id}>
                    <td className="px-6 py-4 text-zinc-900">{meeting.date}</td>
                    <td className="px-6 py-4 text-zinc-900 font-medium">{meeting.cellId ? (cells.find(c => c.id === meeting.cellId)?.name || 'N/A') : 'Sem Célula'}</td>
                    <td className="px-6 py-4 text-zinc-500">{meeting.membersPresent}</td>
                    <td className="px-6 py-4 text-zinc-500">{meeting.visitors}</td>
                    <td className="px-6 py-4 text-zinc-500">{meeting.conversions}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditingMeeting(meeting);
                            setMeetingData({
                              date: meeting.date,
                              membersPresent: meeting.membersPresent,
                              visitors: meeting.visitors,
                              conversions: meeting.conversions,
                              baptisms: meeting.baptisms,
                              members: (meeting.members || []).join('\n'),
                              acceptedJesus: (meeting.acceptedJesus || []).join('\n'),
                              wantBaptism: (meeting.wantBaptism || []).join('\n'),
                            });
                            setIsMeetingModalOpen(true);
                          }}
                          className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDeleteMeeting(meeting.id)} className="rounded-lg p-2 text-zinc-400 hover:bg-rose-50 hover:text-rose-600">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-zinc-50 font-bold text-zinc-900">
                <tr>
                  <td className="px-6 py-4">Total</td>
                  <td className="px-6 py-4">{meetings.length}</td>
                  <td className="px-6 py-4">{meetings.reduce((sum, m) => sum + (m.membersPresent || 0), 0)}</td>
                  <td className="px-6 py-4">{meetings.reduce((sum, m) => sum + (m.visitors || 0), 0)}</td>
                  <td className="px-6 py-4">{meetings.reduce((sum, m) => sum + (m.conversions || 0), 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsModalOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-zinc-900">
                {editingCell ? 'Editar Celula' : 'Nova Celula'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-zinc-900">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Nome da Celula</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  placeholder="Ex: Celula Esperanca"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Responsavel / Lider</label>
                <input
                  type="text"
                  required
                  value={formData.leader}
                  onChange={(e) => setFormData({ ...formData, leader: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  placeholder="Nome do líder"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Qtd. Membros</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.memberCount}
                    onChange={(e) => setFormData({ ...formData, memberCount: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Aceitaram Jesus</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.conversions}
                    onChange={(e) => setFormData({ ...formData, conversions: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Integrantes (um por linha)</label>
                <textarea
                  value={formData.members}
                  onChange={(e) => setFormData({ ...formData, members: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  rows={3}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Aceitaram Jesus (um por linha)</label>
                <textarea
                  value={formData.acceptedJesus}
                  onChange={(e) => setFormData({ ...formData, acceptedJesus: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  rows={3}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Querem se Batizar (um por linha)</label>
                <textarea
                  value={formData.wantBaptism}
                  onChange={(e) => setFormData({ ...formData, wantBaptism: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  rows={3}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-all hover:bg-zinc-800 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {editingCell ? 'Salvar Alteracoes' : 'Cadastrar Celula'}
              </button>
            </form>
          </motion.div>
        </div>,
        document.body
      )}
      {isMeetingModalOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMeetingModalOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-zinc-900">{editingMeeting ? 'Editar Reuniao' : 'Registrar Reuniao'}</h2>
              <button onClick={() => setIsMeetingModalOpen(false)} className="text-zinc-400 hover:text-zinc-900">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleMeetingSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Data</label>
                <input
                  type="date"
                  required
                  value={meetingData.date}
                  onChange={(e) => setMeetingData({ ...meetingData, date: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Membros Presentes</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={meetingData.membersPresent}
                    onChange={(e) => setMeetingData({ ...meetingData, membersPresent: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Visitantes</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={meetingData.visitors}
                    onChange={(e) => setMeetingData({ ...meetingData, visitors: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Aceitaram Jesus</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={meetingData.conversions}
                    onChange={(e) => setMeetingData({ ...meetingData, conversions: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Querem se Batizar</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={meetingData.baptisms}
                    onChange={(e) => setMeetingData({ ...meetingData, baptisms: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Aceitaram Jesus (nomes, um por linha)</label>
                <textarea
                  value={meetingData.acceptedJesus}
                  onChange={(e) => setMeetingData({ ...meetingData, acceptedJesus: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  rows={2}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Querem se Batizar (nomes, um por linha)</label>
                <textarea
                  value={meetingData.wantBaptism}
                  onChange={(e) => setMeetingData({ ...meetingData, wantBaptism: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  rows={2}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">Membros Presentes (nomes, um por linha)</label>
                <textarea
                  value={meetingData.members}
                  onChange={(e) => setMeetingData({ ...meetingData, members: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 outline-none focus:ring-2 focus:ring-zinc-900/10"
                  rows={3}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-all hover:bg-zinc-800 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {editingMeeting ? 'Salvar Alteracoes' : 'Registrar Reuniao'}
              </button>
            </form>
          </motion.div>
        </div>,
        document.body
      )}
      {(deleteId || deleteMeetingId) && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setDeleteId(null); setDeleteMeetingId(null); }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl text-center"
          >
            <h2 className="text-xl font-bold text-zinc-900 mb-4">Excluir {deleteId ? 'Celula' : 'Reuniao'}?</h2>
            <p className="text-zinc-500 mb-8">Esta acao nao pode ser desfeita.</p>
            <div className="flex gap-4">
              <button
                onClick={() => { setDeleteId(null); setDeleteMeetingId(null); }}
                className="flex-1 rounded-lg bg-zinc-100 py-2.5 font-semibold text-zinc-700 hover:bg-zinc-200"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 rounded-lg bg-rose-600 py-2.5 font-semibold text-white hover:bg-rose-700"
              >
                Excluir
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </>
  );
}
