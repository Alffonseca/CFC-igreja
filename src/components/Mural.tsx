import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { logError } from '../lib/logger';
import { Plus, Image as ImageIcon, Video, Link as LinkIcon, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Activity {
  id: string;
  title: string;
  description: string;
  type: 'image' | 'video' | 'link';
  url: string;
  createdBy: string;
  createdAt: any;
}

export default function Mural() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'image' | 'video' | 'link'>('link');
  const [url, setUrl] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'activities'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setActivities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity)));
    });
    return () => unsubscribe();
  }, []);

  const [pendingAction, setPendingAction] = useState<{ type: 'create', data: any } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setPendingAction({ type: 'create', data: { title, description, type, url } });
  };

  const executeAction = async () => {
    if (!pendingAction || !auth.currentUser) return;
    setSubmitting(true);
    const { data } = pendingAction;
    try {
      await addDoc(collection(db, 'activities'), {
        ...data,
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp()
      });
      setTitle('');
      setDescription('');
      setUrl('');
      alert('Atividade adicionada com sucesso!');
    } catch (err: any) {
      console.error(err);
      await logError('Erro ao adicionar atividade', err.message);
      alert('Erro ao adicionar atividade. Verifique se todos os campos estão preenchidos corretamente.');
    } finally {
      setSubmitting(false);
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-zinc-900">Mural de Atividades</h1>
      
      <form onSubmit={handleAddActivity} className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-200 space-y-4">
        <input type="text" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-4 py-2" required />
        <textarea placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-4 py-2" />
        <div className="flex gap-4">
          <select value={type} onChange={(e) => setType(e.target.value as any)} className="rounded-lg border border-zinc-200 px-4 py-2">
            <option value="link">Link</option>
            <option value="image">Imagem</option>
            <option value="video">Vídeo</option>
          </select>
          <input type="url" placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1 rounded-lg border border-zinc-200 px-4 py-2" required />
        </div>
        <button type="submit" className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800">
          <Plus size={20} /> Adicionar Atividade
        </button>
      </form>

      <AnimatePresence>
        {pendingAction && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPendingAction(null)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl text-center"
            >
              <h2 className="text-xl font-bold text-zinc-900 mb-4">Confirmar criação?</h2>
              <p className="text-zinc-500 mb-8">Tem certeza que deseja adicionar esta atividade?</p>
              <div className="flex gap-4">
                <button
                  onClick={() => setPendingAction(null)}
                  className="flex-1 rounded-lg bg-zinc-100 py-2.5 font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={executeAction}
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-zinc-900 py-2.5 font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {submitting ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedImage && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
            <motion.img
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              src={selectedImage}
              alt="Expanded"
              className="max-w-full max-h-full rounded-lg"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activities.map(activity => (
          <div key={activity.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 space-y-2">
            <h3 className="font-bold text-lg">{activity.title}</h3>
            <p className="text-zinc-600 text-sm">{activity.description}</p>
            {activity.type === 'image' && (
              <img 
                src={activity.url} 
                alt={activity.title} 
                className="rounded-lg w-full h-40 object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                referrerPolicy="no-referrer" 
                onClick={() => setSelectedImage(activity.url)}
              />
            )}
            {activity.type === 'video' && <iframe src={activity.url.replace('watch?v=', 'embed/')} className="rounded-lg w-full h-40" />}
            {activity.type === 'link' && <a href={activity.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-sm">Acessar Link</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
