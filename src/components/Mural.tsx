import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Plus, Image as ImageIcon, Video, Link as LinkIcon, Trash2 } from 'lucide-react';

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

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    await addDoc(collection(db, 'activities'), {
      title,
      description,
      type,
      url,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp()
    });
    setTitle('');
    setDescription('');
    setUrl('');
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activities.map(activity => (
          <div key={activity.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 space-y-2">
            <h3 className="font-bold text-lg">{activity.title}</h3>
            <p className="text-zinc-600 text-sm">{activity.description}</p>
            {activity.type === 'image' && <img src={activity.url} alt={activity.title} className="rounded-lg w-full h-40 object-cover" referrerPolicy="no-referrer" />}
            {activity.type === 'video' && <iframe src={activity.url.replace('watch?v=', 'embed/')} className="rounded-lg w-full h-40" />}
            {activity.type === 'link' && <a href={activity.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-sm">Acessar Link</a>}
          </div>
        ))}
      </div>
    </div>
  );
}
