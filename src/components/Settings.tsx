import { useEffect, useState, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Save, 
  Image as ImageIcon, 
  Church, 
  Upload, 
  X, 
  Check, 
  Sparkles, 
  Link as LinkIcon, 
  Trash2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import BackupRestore from './BackupRestore';
import ResetData from './ResetData';
import { logAction } from '../lib/logger';
import { uploadOrProcessImage, OFFICIAL_IEQ_LOGOS } from '../lib/imageUtils';

interface ChurchSettings {
  name: string;
  logoUrl?: string;
  pastorName?: string;
  qrCodeUrl?: string;
  titheMessage?: string;
  destinations?: string[];
}

interface SettingsProps {
  role: string | null;
}

export default function Settings({ role }: SettingsProps) {
  const [settings, setSettings] = useState<ChurchSettings>({ name: '', logoUrl: '', pastorName: '', qrCodeUrl: '', titheMessage: '', destinations: [] });
  const [newDestination, setNewDestination] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [pendingAction, setPendingAction] = useState<boolean>(false);
  const [logoInputMode, setLogoInputMode] = useState<'upload' | 'url' | 'presets'>('upload');
  const [isDragOverLogo, setIsDragOverLogo] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);

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

  const handleProcessLogoFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatusMessage({ type: 'error', text: 'Por favor, selecione um arquivo de imagem válido (PNG, JPG, SVG, WebP).' });
      return;
    }

    setUploadingLogo(true);
    setStatusMessage({ type: 'info', text: 'Otimizando e processando logo...' });

    try {
      // 1. Processa e otimiza a imagem localmente (Base64) e tenta enviar ao Storage
      const { url, method } = await uploadOrProcessImage(file, `church/logo_${Date.now()}`, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.90
      });

      setSettings(prev => ({ ...prev, logoUrl: url }));
      setStatusMessage({ 
        type: 'success', 
        text: method === 'storage' 
          ? 'Logo enviada e salva com sucesso no Storage!' 
          : 'Logo otimizada e salva com sucesso direto no banco!' 
      });
    } catch (err: any) {
      console.error('Erro detalhado no upload do logo:', err);
      setStatusMessage({ type: 'error', text: `Não foi possível carregar a imagem: ${err.message || 'Erro ao processar'}` });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleProcessQrFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatusMessage({ type: 'error', text: 'Por favor, selecione uma imagem válida para o QR Code.' });
      return;
    }

    setUploadingQr(true);
    setStatusMessage({ type: 'info', text: 'Otimizando QR Code...' });

    try {
      const { url } = await uploadOrProcessImage(file, `church/qr_${Date.now()}`, {
        maxWidth: 500,
        maxHeight: 500,
        quality: 0.92
      });

      setSettings(prev => ({ ...prev, qrCodeUrl: url }));
      setStatusMessage({ type: 'success', text: 'QR Code carregado com sucesso!' });
    } catch (err: any) {
      console.error('Erro no upload do QR Code:', err);
      setStatusMessage({ type: 'error', text: 'Erro ao processar QR Code: ' + err.message });
    } finally {
      setUploadingQr(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Tempo de salvamento esgotado (10s)')), 10000)
      );

      const savePromise = setDoc(doc(db, 'settings', 'church'), {
        ...settings,
        destinations: settings.destinations || []
      });
      await Promise.race([savePromise, timeoutPromise]);
      
      await logAction('Configuracoes', 'Alterou as configuracoes da igreja');
      setStatusMessage({ type: 'success', text: 'Configurações e Logo salvas com sucesso!' });
      alert('Configurações salvas com sucesso!');
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `Erro ao salvar: ${err.message || 'Erro desconhecido'}` });
      alert(`Erro ao salvar configurações: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setSaving(false);
      setPendingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"></div>
          <span>Carregando configurações...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <header>
        <h1 className="text-3xl font-bold text-zinc-900">Configurações</h1>
        <p className="text-zinc-500">Personalize o sistema com os dados e a identidade visual da sua igreja</p>
      </header>

      {statusMessage && (
        <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : statusMessage.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' && <Check size={16} className="text-emerald-600" />}
            {statusMessage.type === 'error' && <AlertCircle size={16} className="text-rose-600" />}
            {statusMessage.type === 'info' && <Sparkles size={16} className="text-blue-600" />}
            <span>{statusMessage.text}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setStatusMessage(null)}
            className="text-zinc-400 hover:text-zinc-700"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="mx-auto max-w-3xl">
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={(e) => { e.preventDefault(); setPendingAction(true); }}
          className="rounded-2xl bg-white p-6 sm:p-8 shadow-sm ring-1 ring-zinc-200"
        >
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-zinc-600">Nome da Igreja</label>
              <div className="relative">
                <Church className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                <input
                  type="text"
                  required
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 text-sm font-semibold outline-hidden transition-all focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                  placeholder="Ex: Igreja do Evangelho Quadrangular - Tabernáculo"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-zinc-600">Pastor Responsável</label>
              <div className="relative">
                <input
                  type="text"
                  value={settings.pastorName || ''}
                  onChange={(e) => setSettings({ ...settings, pastorName: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 px-4 text-sm font-semibold outline-hidden transition-all focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                  placeholder="Ex: Pr. João Silva"
                />
              </div>
            </div>

            {/* SEÇÃO DA LOGO DA IGREJA TOTALMENTE À PROVA DE FALHAS */}
            <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <label className="text-sm font-bold uppercase tracking-wider text-zinc-800 flex items-center gap-2">
                    <ImageIcon size={16} className="text-blue-600" />
                    Logo da Igreja
                  </label>
                  <p className="text-xs text-zinc-500">
                    Aparece no cabeçalho do sistema, recibos e relatórios oficiais.
                  </p>
                </div>

                {/* Seletores de Modo */}
                <div className="flex items-center rounded-lg bg-zinc-200/80 p-0.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setLogoInputMode('upload')}
                    className={`rounded-md px-2.5 py-1 transition-all ${
                      logoInputMode === 'upload' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Arquivo
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogoInputMode('url')}
                    className={`rounded-md px-2.5 py-1 transition-all ${
                      logoInputMode === 'url' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Link (URL)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLogoInputMode('presets')}
                    className={`rounded-md px-2.5 py-1 transition-all ${
                      logoInputMode === 'presets' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    IEQ Oficial
                  </button>
                </div>
              </div>

              {/* Modo 1: Upload de Arquivo / Drag and Drop */}
              {logoInputMode === 'upload' && (
                <div>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragOverLogo(true); }}
                    onDragLeave={() => setIsDragOverLogo(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragOverLogo(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleProcessLogoFile(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
                      isDragOverLogo 
                        ? 'border-blue-600 bg-blue-50/50' 
                        : 'border-zinc-300 bg-white hover:border-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProcessLogoFile(file);
                      }} 
                      className="hidden" 
                    />
                    
                    {uploadingLogo ? (
                      <div className="flex flex-col items-center gap-2 text-zinc-600">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                        <span className="text-xs font-semibold">Otimizando e enviando imagem...</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <Upload size={22} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-800">
                            Clique para escolher do seu dispositivo ou arraste a imagem aqui
                          </p>
                          <p className="text-[11px] text-zinc-400 mt-0.5">
                            Suporta PNG, JPG, SVG ou WebP (redimensionamento automático para máxima qualidade e leveza)
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Modo 2: Colar URL Direta */}
              {logoInputMode === 'url' && (
                <div className="space-y-2">
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                    <input
                      type="url"
                      value={settings.logoUrl || ''}
                      onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                      className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-4 text-xs font-mono outline-hidden focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                      placeholder="https://exemplo.com/logo-igreja.png"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Dica: Cole o link direto de uma imagem hospedada no Google Drive, Imgur, site oficial ou rede social.
                  </p>
                </div>
              )}

              {/* Modo 3: Presets Oficiais da Quadrangular */}
              {logoInputMode === 'presets' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {OFFICIAL_IEQ_LOGOS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSettings(prev => ({ ...prev, logoUrl: preset.preview }));
                        setStatusMessage({ type: 'success', text: `Logo definida: ${preset.name}` });
                      }}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                        settings.logoUrl === preset.preview 
                          ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20' 
                          : 'border-zinc-200 bg-white hover:border-zinc-400'
                      }`}
                    >
                      <img 
                        src={preset.preview} 
                        alt={preset.name} 
                        className="h-12 w-12 rounded-lg object-contain bg-white shadow-xs border border-zinc-200 p-0.5" 
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-zinc-900 leading-tight">{preset.name}</p>
                        <span className="text-[10px] text-blue-600 font-semibold mt-0.5 inline-block">
                          {settings.logoUrl === preset.preview ? '✓ Selecionada' : 'Clique para usar'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Pré-visualização da Logo Atual & Botão Limpar */}
              {settings.logoUrl && (
                <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <img 
                      src={settings.logoUrl} 
                      alt="Prévia da Logo" 
                      className="h-14 w-14 rounded-lg object-contain bg-zinc-50 border border-zinc-200 p-1" 
                      referrerPolicy="no-referrer"
                      onError={() => {
                        setStatusMessage({ type: 'error', text: 'Não foi possível carregar a prévia da logo inserida.' });
                      }}
                    />
                    <div>
                      <p className="text-xs font-bold text-zinc-900">Logo Atual da Igreja</p>
                      <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                        <Check size={12} /> Carregada e pronta para salvar
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSettings(prev => ({ ...prev, logoUrl: '' }));
                      setStatusMessage({ type: 'info', text: 'Logo removida.' });
                    }}
                    className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
                  >
                    <Trash2 size={13} /> Remover
                  </button>
                </div>
              )}
            </div>

            {/* SEÇÃO DO QR CODE PARA DÍZIMOS E OFERTAS (PIX) */}
            <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5">
              <label className="text-sm font-bold uppercase tracking-wider text-zinc-800 flex items-center gap-2">
                <ImageIcon size={16} className="text-emerald-600" />
                QR Code para Dízimos/Ofertas (PIX)
              </label>
              
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                <div className="sm:col-span-6">
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-white p-4 transition-all hover:border-zinc-600 hover:bg-zinc-50">
                    <input
                      type="file"
                      ref={qrInputRef}
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleProcessQrFile(file);
                      }}
                      className="hidden"
                    />
                    {uploadingQr ? (
                      <div className="flex items-center gap-2 text-zinc-500 text-xs font-semibold">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"></div>
                        Enviando...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-zinc-600 text-xs font-bold">
                        <Upload size={16} />
                        <span>Selecionar Imagem do QR Code</span>
                      </div>
                    )}
                  </label>
                </div>
                
                <div className="sm:col-span-6">
                  <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                    <input
                      type="url"
                      value={settings.qrCodeUrl || ''}
                      onChange={(e) => setSettings({ ...settings, qrCodeUrl: e.target.value })}
                      className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-4 text-xs font-mono outline-hidden focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                      placeholder="Ou cole a URL do QR Code"
                    />
                  </div>
                </div>
              </div>

              {settings.qrCodeUrl && (
                <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs">
                  <div className="flex items-center gap-3">
                    <img 
                      src={settings.qrCodeUrl} 
                      alt="QR Code Preview" 
                      className="h-16 w-16 object-contain rounded-lg border border-zinc-200 p-1"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <p className="text-xs font-bold text-zinc-900">Prévia do QR Code (PIX)</p>
                      <span className="text-[11px] text-zinc-500">Exibido na página de Dízimos e Ofertas</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, qrCodeUrl: '' }))}
                    className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
                  >
                    <Trash2 size={13} /> Remover
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-zinc-600">Mensagem para Dízimos/Ofertas</label>
              <textarea
                value={settings.titheMessage || ''}
                onChange={(e) => setSettings({ ...settings, titheMessage: e.target.value })}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 px-4 text-xs font-medium outline-hidden transition-all focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                placeholder="Ex: 'Cada um dê conforme determinou em seu coração...' - 2 Coríntios 9:7"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider text-zinc-600">Destinos de Ofertas Disponíveis</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDestination}
                  onChange={(e) => setNewDestination(e.target.value)}
                  className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 py-2 px-4 text-xs outline-hidden transition-all focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                  placeholder="Ex: Missões Mundiais, Reforma do Templo..."
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newDestination.trim()) {
                      setSettings(prev => ({ ...prev, destinations: [...(prev.destinations || []), newDestination.trim()] }));
                      setNewDestination('');
                    }
                  }}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800"
                >
                  Adicionar
                </button>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {settings.destinations?.map((dest, index) => (
                  <div key={index} className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
                    {dest}
                    <button
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, destinations: prev.destinations?.filter((_, i) => i !== index) }))}
                      className="text-zinc-400 hover:text-rose-600"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || uploadingLogo || uploadingQr}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-98 disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Salvando Configurações...' : 'Salvar Todas as Configurações'}
            </button>
          </div>
        </motion.form>

        <AnimatePresence>
          {pendingAction && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setPendingAction(false)}
                className="absolute inset-0 bg-black/50 backdrop-blur-xs"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center"
              >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-3">
                  <Save size={24} />
                </div>
                <h2 className="text-lg font-bold text-zinc-900 mb-1">Salvar alterações?</h2>
                <p className="text-xs text-zinc-500 mb-6">
                  As novas configurações e a logo serão salvas para toda a igreja.
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setPendingAction(false)}
                    className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-xs font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : 'Confirmar'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="mt-8 space-y-6">
          <BackupRestore />
          {role === 'admin' && <ResetData />}
        </div>
      </div>
    </div>
  );
}
