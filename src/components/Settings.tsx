import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { Save, Image as ImageIcon, Church, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import BackupRestore from './BackupRestore';
import ResetData from './ResetData';
import { logAction } from '../lib/logger';

interface ChurchSettings {
  name: string;
  logoUrl?: string;
  pastorName?: string;
  qrCodeUrl?: string;
  titheMessage?: string;
}

export default function Settings() {
  const [settings, setSettings] = useState<ChurchSettings>({ name: '', logoUrl: '', pastorName: '', qrCodeUrl: '', titheMessage: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout fetching settings')), 5000)
      );

      try {
        const fetchPromise = getDoc(doc(db, 'settings', 'church'));
        const sDoc = await Promise.race([fetchPromise, timeoutPromise]) as any;
        
        if (sDoc.exists()) {
          setSettings(sDoc.data() as ChurchSettings);
        }
      } catch (err) {
        console.error('Error fetching church settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    console.log('Iniciando upload. Arquivo:', file.name, 'Tamanho:', file.size, 'Tipo:', file.type);
    try {
      const storageRef = ref(storage, `church/logo_${Date.now()}`);
      console.log('Referência de storage criada:', storageRef.fullPath);
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tempo de upload esgotado (120s)')), 120000)
      );

      console.log('Iniciando uploadBytes...');
      const uploadPromise = uploadBytes(storageRef, file);
      await Promise.race([uploadPromise, timeoutPromise]);
      
      console.log('Upload concluído, obtendo URL...');
      const url = await getDownloadURL(storageRef);
      console.log('URL obtida:', url);
      setImageLoading(true);
      setSettings(prev => ({ ...prev, logoUrl: url }));
      alert('Logo carregada com sucesso! Não esqueça de salvar as configurações.');
    } catch (err: any) {
      console.error('Erro detalhado no upload:', err);
      alert(`Erro ao fazer upload da imagem: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tempo de salvamento esgotado (10s)')), 10000)
      );

      const savePromise = setDoc(doc(db, 'settings', 'church'), settings);
      console.log('Salvando configuracoes:', settings);
      await Promise.race([savePromise, timeoutPromise]);
      
      await logAction('Configuracoes', 'Alterou as configuracoes da igreja');
      alert('Configuracoes salvas com sucesso!');
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao salvar configuracoes: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-zinc-900">Configuracoes</h1>
        <p className="text-zinc-500">Personalize o sistema com os dados da sua igreja</p>
      </header>

      <div className="mx-auto max-w-2xl">
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSave}
          className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-zinc-200"
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-zinc-500">Nome da Igreja</label>
              <div className="relative">
                <Church className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  type="text"
                  required
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 outline-none transition-all focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                  placeholder="Ex: Igreja Batista Central"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-zinc-500">Pastor Responsavel</label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.pastorName || ''}
                  onChange={(e) => setSettings({ ...settings, pastorName: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 px-4 outline-none transition-all focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                  placeholder="Ex: Pr. Joao Silva"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-zinc-500">QR Code para Dizimos/Ofertas</label>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-200 bg-zinc-50 p-6 transition-all hover:border-zinc-900 hover:bg-zinc-100">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploading(true);
                        try {
                          const storageRef = ref(storage, `church/qr_${Date.now()}`);
                          await uploadBytes(storageRef, file);
                          const url = await getDownloadURL(storageRef);
                          setSettings(prev => ({ ...prev, qrCodeUrl: url }));
                          alert('QR Code carregado com sucesso!');
                        } catch (err: any) {
                          alert('Erro ao fazer upload do QR Code: ' + err.message);
                        } finally {
                          setUploading(false);
                        }
                      }}
                      className="hidden"
                    />
                    {uploading ? (
                      <div className="flex items-center gap-2 text-zinc-500">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"></div>
                        Enviando...
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-zinc-500">
                        <Upload size={24} />
                        <span className="text-sm font-medium">Clique para selecionar QR Code</span>
                      </div>
                    )}
                  </label>
                </div>
                
                <div className="relative">
                  <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input
                    type="url"
                    value={settings.qrCodeUrl || ''}
                    onChange={(e) => setSettings({ ...settings, qrCodeUrl: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 outline-none transition-all focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="Ou cole o link do QR Code aqui (URL)"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-zinc-500">Mensagem para Dizimos/Ofertas</label>
              <textarea
                value={settings.titheMessage || ''}
                onChange={(e) => setSettings({ ...settings, titheMessage: e.target.value })}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-2.5 px-4 outline-none transition-all focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                placeholder="Ex: Contribua com a obra de Deus..."
                rows={3}
              />
            </div>

            {settings.qrCodeUrl && (
              <div className="rounded-xl bg-zinc-50 p-4 text-center">
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-zinc-400">Previa do QR Code</p>
                <img 
                  src={settings.qrCodeUrl} 
                  alt="QR Code Preview" 
                  className="mx-auto h-32 w-32 object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={saving || uploading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 py-3 font-semibold text-white transition-all hover:bg-zinc-800 active:scale-95 disabled:opacity-50"
            >
              <Save size={20} />
              {saving ? 'Salvando...' : 'Salvar Configuracoes'}
            </button>
          </div>
        </motion.form>
        <BackupRestore />
        <ResetData />
      </div>
    </div>
  );
}
