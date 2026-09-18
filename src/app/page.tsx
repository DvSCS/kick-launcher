/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";
import { Play, Square, UploadCloud, AlertCircle, Plus, Trash2, ListVideo, Type, Image as ImageIcon, Layout, X, Clock, Navigation, Square as BoxIcon, RefreshCw, CheckCircle2, XCircle, Loader2, Copy, ArrowUp, ArrowDown, Settings, Move, Palette } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Rnd } from "react-rnd";

type StreamMode = 'upload' | 'reback';
type LayerType = 'text' | 'media' | 'clock' | 'marquee' | 'box';

interface PlaylistItemUI {
  id: string;
  url: string;
  duration: number;
  unit: 'min' | 'h';
}

interface LayerUI {
  id: string;
  type: LayerType;
  text: string;
  color: string;
  fontsize: string;
  width: string;
  height: string;
  x: number;
  y: number;
  font?: string;
  file: File | null;
  shadowColor?: string;
  shadowX?: number;
  shadowY?: number;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
  hasShadow?: boolean;
  hasBorder?: boolean;
  hasBackground?: boolean;
  backgroundColor?: string;
  backgroundPadding?: number;
}

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const PREVIEW_W = 960;
const PREVIEW_H = 540;
const RATIO = CANVAS_W / PREVIEW_W; // 2

export default function Home() {
  const [streamUrl, setStreamUrl] = useState("rtmps://stream.kick.com:443/app");
  const [streamKey, setStreamKey] = useState("");
  const [workerUrl, setWorkerUrl] = useState("");
  const [workerStatus, setWorkerStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  
  const [mode, setMode] = useState<StreamMode>('upload');
  const [file, setFile] = useState<File | null>(null);
  
  const [playlist, setPlaylist] = useState<PlaylistItemUI[]>([
    { id: '1', url: '', duration: 1, unit: 'h' }
  ]);
  
  const [layers, setLayers] = useState<LayerUI[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);

  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, layerId: string | null } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const rndRefs = useRef<{ [key: string]: any }>({});

  useEffect(() => {
    const saved = localStorage.getItem('kick_launcher_data');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.streamUrl) setStreamUrl(data.streamUrl);
        if (data.streamKey) setStreamKey(data.streamKey);
        if (data.workerUrl) setWorkerUrl(data.workerUrl);
        if (data.mode) setMode(data.mode);
        if (data.playlist) setPlaylist(data.playlist);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('kick_launcher_data', JSON.stringify({
      streamUrl,
      streamKey,
      workerUrl,
      mode,
      playlist
    }));
  }, [streamUrl, streamKey, workerUrl, mode, playlist]);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const apiBase = workerUrl ? workerUrl.replace(/\/$/, '') : '';
        const res = await fetch(`${apiBase}/api/stream/status`, {
          headers: {
            "Bypass-Tunnel-Reminder": "true"
          }
        });
        if (res.ok) {
          const data = await res.json();
          setIsStreaming(data.isStreaming);
          if (data.isStreaming) {
            setCurrentIndex(data.currentIndex || 0);
          }
        }
      } catch (err) {
        console.error("Failed to check status", err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, [workerUrl]);

  useEffect(() => {
    if (!workerUrl) {
      setWorkerStatus('idle');
      return;
    }
    
    setWorkerStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const apiBase = workerUrl.replace(/\/$/, '');
        const res = await fetch(`${apiBase}/api/stream/status`, {
          headers: {
            "Bypass-Tunnel-Reminder": "true"
          }
        });
        
        if (res.ok) {
          const data = await res.json();
          if (typeof data.isStreaming !== 'undefined') {
            setWorkerStatus('valid');
          } else {
            setWorkerStatus('invalid');
          }
        } else {
          setWorkerStatus('invalid');
        }
      } catch (err) {
        setWorkerStatus('invalid');
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [workerUrl]);

  const handleBaseVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const addLayer = (type: LayerType) => {
    let defaultWidth = '200';
    let defaultHeight = '100';
    let defaultText = '';
    
    if (type === 'text') defaultText = 'Novo Texto';
    if (type === 'marquee') defaultText = 'NOTÍCIA URGENTE: Letreiro Rodando na Tela';
    if (type === 'box') {
      defaultWidth = '1920';
      defaultHeight = '100';
    }

    const newLayer: LayerUI = {
      id: Math.random().toString(),
      type,
      text: defaultText,
      color: type === 'box' ? 'black@0.5' : '#ffffff',
      fontsize: '48',
      width: defaultWidth,
      height: defaultHeight,
      x: CANVAS_W / 2 - 100,
      y: CANVAS_H / 2 - 50,
      font: 'arial',
      file: null,
      shadowColor: '#000000',
      shadowX: 0,
      shadowY: 0,
      borderColor: '#000000',
      borderWidth: 0,
      opacity: 100,
      hasShadow: false,
      hasBorder: false,
      hasBackground: false,
      backgroundColor: '#000000',
      backgroundPadding: 5
    };
    
    if (type === 'marquee') {
       newLayer.y = CANVAS_H - 100;
       newLayer.x = 0; // x é controlado pelo math, mas deixamos 0 no estado visual
    }
    if (type === 'box') {
       newLayer.x = 0;
       newLayer.y = CANVAS_H - 100;
    }

    setLayers([...layers, newLayer]);
    setActiveLayerId(newLayer.id);
  };

  const updateLayer = (id: string, keyOrUpdates: keyof LayerUI | Partial<LayerUI>, value?: any) => {
    setLayers(layers.map(l => {
      if (l.id !== id) return l;
      if (typeof keyOrUpdates === 'string') {
        return { ...l, [keyOrUpdates]: value };
      } else {
        return { ...l, ...keyOrUpdates };
      }
    }));
  };

  const updateFromSidebar = (id: string, updates: Partial<LayerUI>) => {
    updateLayer(id, updates);
    const layer = layers.find(l => l.id === id);
    if (!layer) return;
    const ref = rndRefs.current[id];
    if (ref) {
      if ('x' in updates || 'y' in updates) {
         const nx = ('x' in updates ? updates.x! : layer.x) / RATIO;
         const ny = ('y' in updates ? updates.y! : layer.y) / RATIO;
         ref.updatePosition({ x: nx, y: ny });
      }
      if (('width' in updates || 'height' in updates) && (layer.type === 'box' || layer.type === 'media')) {
         const nw = ('width' in updates ? parseInt(updates.width!) : parseInt(layer.width)) / RATIO;
         const nh = ('height' in updates ? parseInt(updates.height!) : parseInt(layer.height)) / RATIO;
         ref.updateSize({ width: nw || 'auto', height: nh || 'auto' });
      }
      if ('fontsize' in updates || 'font' in updates || 'text' in updates || 'hasBackground' in updates || 'backgroundPadding' in updates || 'hasBorder' in updates || 'borderWidth' in updates) {
         setTimeout(() => {
            ref.updateSize({ width: 'auto', height: 'auto' });
         }, 0);
      }
    }
  };

  const removeLayer = (id: string) => {
    setLayers(layers.filter(l => l.id !== id));
    if (activeLayerId === id) setActiveLayerId(null);
  };

  const moveLayerUp = (id: string) => {
    setLayers(prev => {
      const index = prev.findIndex(l => l.id === id);
      if (index < prev.length - 1) {
        const newLayers = [...prev];
        const temp = newLayers[index];
        newLayers[index] = newLayers[index + 1];
        newLayers[index + 1] = temp;
        return newLayers;
      }
      return prev;
    });
  };

  const moveLayerDown = (id: string) => {
    setLayers(prev => {
      const index = prev.findIndex(l => l.id === id);
      if (index > 0) {
        const newLayers = [...prev];
        const temp = newLayers[index];
        newLayers[index] = newLayers[index - 1];
        newLayers[index - 1] = temp;
        return newLayers;
      }
      return prev;
    });
  };

  const handleLayerPointerDown = (e: React.PointerEvent, layerId: string) => {
     setActiveLayerId(layerId);
  };

  const updatePlaylistItem = (id: string, field: keyof PlaylistItemUI, value: any) => {
    setPlaylist(playlist.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const startStream = async () => {
    if (!streamUrl || !streamKey) {
      setError("Preencha a URL e a Key da Kick.");
      return;
    }

    if (mode === 'upload' && !file) {
      setError("Selecione um arquivo MP4 para a live base.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("streamUrl", streamUrl);
    formData.append("streamKey", streamKey);
    formData.append("mode", mode);

    if (layers.length > 0) {
       const mappedLayers = layers.map(l => ({
          id: l.id,
          type: l.type,
          text: l.text,
          color: l.color,
          fontsize: l.fontsize,
          font: l.font,
          width: l.width,
          height: l.height,
          x: l.x,
          y: l.y,
          shadowColor: l.shadowColor,
          shadowX: l.shadowX,
          shadowY: l.shadowY,
          borderColor: l.borderColor,
          borderWidth: l.borderWidth,
          opacity: l.opacity,
          hasShadow: l.hasShadow,
          hasBorder: l.hasBorder,
          hasBackground: l.hasBackground,
          backgroundColor: l.backgroundColor,
          backgroundPadding: l.backgroundPadding
       }));
       formData.append("overlayItems", JSON.stringify(mappedLayers));

       layers.forEach(l => {
          if (l.type === 'media' && l.file) {
             formData.append(`media_${l.id}`, l.file);
          }
       });
    }
    
    if (mode === 'upload' && file) {
      formData.append("video", file);
    } else if (mode === 'reback') {
      const validItems = playlist.filter(p => p.url.trim() !== '');
      if (validItems.length === 0) {
        setError("Adicione pelo menos um link na playlist.");
        setIsLoading(false);
        return;
      }
      const finalPlaylist = validItems.map(p => ({
        url: p.url,
        durationMs: p.duration * (p.unit === 'h' ? 3600000 : 60000),
        isLoop: false
      }));
      formData.append("playlist", JSON.stringify(finalPlaylist));
    }

    if (workerStatus !== 'valid') {
      setError("Você precisa conectar um Link de Motor válido antes de iniciar a live.");
      setIsLoading(false);
      return;
    }

    try {
      const apiBase = workerUrl.replace(/\/$/, '');
      const res = await fetch(`${apiBase}/api/stream/start`, {
        method: "POST",
        body: formData,
        headers: {
          "Bypass-Tunnel-Reminder": "true"
        }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao iniciar stream");
      } else {
        setIsStreaming(true);
      }
    } catch (err) {
      setError("Erro de conexão ao servidor local.");
    } finally {
      setIsLoading(false);
    }
  };

  const stopStream = async () => {
    setIsLoading(true);
    try {
      const apiBase = workerUrl.replace(/\/$/, '');
      const res = await fetch(`${apiBase}/api/stream/stop`, { 
        method: "POST",
        headers: {
          "Bypass-Tunnel-Reminder": "true"
        }
      });
      if (res.ok) {
        setIsStreaming(false);
      } else {
        const data = await res.json();
        setError(data.error || "Erro ao parar stream");
      }
    } catch (err) {
      setError("Erro ao comunicar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  const updateLiveStream = async () => {
    setIsLoading(true);
    setError(null);
    const formData = new FormData();
    
    if (layers.length > 0) {
       const mappedLayers = layers.map(l => ({
          id: l.id,
          type: l.type,
          text: l.text,
          color: l.color,
          fontsize: l.fontsize,
          font: l.font,
          width: l.width,
          height: l.height,
          x: l.x,
          y: l.y
       }));
       formData.append("overlayItems", JSON.stringify(mappedLayers));

       layers.forEach(l => {
          if (l.type === 'media' && l.file) {
             formData.append(`media_${l.id}`, l.file);
          }
       });
    }

    try {
      const apiBase = workerUrl.replace(/\/$/, '');
      const res = await fetch(`${apiBase}/api/stream/update`, {
        method: "POST",
        body: formData,
        headers: {
          "Bypass-Tunnel-Reminder": "true"
        }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao atualizar stream");
      }
    } catch (err) {
      setError("Erro ao comunicar com o servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--color-bg-dark)] text-white relative">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-kick/5 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-kick/5 blur-[120px]" />
      </div>

      {/* TELA PRINCIPAL (SIMPLIFICADA) */}
      <div className={`transition-all duration-500 ease-in-out flex flex-col items-center justify-center min-h-screen p-4 ${isStudioOpen ? 'opacity-0 pointer-events-none scale-95 absolute inset-0' : 'opacity-100 scale-100'}`}>
         <div className="w-full max-w-xl bg-[var(--color-bg-panel)] rounded-2xl p-8 shadow-2xl border border-white/5 backdrop-blur-sm z-10">
            <div className="flex items-center justify-between mb-8">
               <div>
                  <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-3">
                     <span className="text-kick">Kick</span> Launcher
                  </h1>
                  <p className="text-text-secondary text-sm">Pronto para entrar ao vivo</p>
               </div>
               <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider ${isStreaming ? 'bg-kick/10 text-kick border border-kick/20' : 'bg-white/5 text-text-secondary border border-white/10'}`}>
                  <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-kick animate-pulse' : 'bg-text-secondary'}`} />
                  {isStreaming ? "Ao Vivo" : "Offline"}
               </div>
            </div>

            <AnimatePresence>
               {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-6 overflow-hidden">
                     <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 shrink-0" />
                        <p>{error}</p>
                     </div>
                  </motion.div>
               )}
            </AnimatePresence>

            <div className="space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                     <label className="block text-xs font-bold text-text-secondary mb-2 uppercase tracking-wider">Stream URL</label>
                     <input type="text" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} disabled={isStreaming} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-kick" />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-text-secondary mb-2 uppercase tracking-wider">Stream Key</label>
                     <input type="password" value={streamKey} onChange={(e) => setStreamKey(e.target.value)} disabled={isStreaming} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-kick" />
                  </div>
               </div>
               
               <div className="relative">
                  <div className="flex justify-between items-end mb-2">
                     <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider">Conexão do Motor (Obrigatório)</label>
                     <a href="/KickWorker.zip" download className="text-xs font-bold text-kick hover:underline flex items-center gap-1"><UploadCloud className="w-3 h-3"/> Baixar Motor (.exe)</a>
                  </div>
                  <div className="relative flex items-center">
                    <input type="text" value={workerUrl} onChange={(e) => setWorkerUrl(e.target.value)} disabled={isStreaming} placeholder="Cole o link gerado pelo Motor (ex: https://xxx.loca.lt)" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-kick pr-12" />
                    <div className="absolute right-3 flex items-center justify-center">
                       {workerStatus === 'checking' && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
                       {workerStatus === 'valid' && <CheckCircle2 className="w-5 h-5 text-green-500 bg-green-500/10 rounded-full" />}
                       {workerStatus === 'invalid' && <XCircle className="w-5 h-5 text-red-500 bg-red-500/10 rounded-full" />}
                    </div>
                  </div>
                  {workerStatus === 'invalid' && workerUrl.length > 0 && <p className="text-xs text-red-400 mt-2">Link inválido ou Motor offline.</p>}
               </div>

               <hr className="border-white/5" />

               <div>
                  <div className="flex gap-2 mb-4 bg-black/40 p-1 rounded-xl">
                     <button onClick={() => setMode('upload')} disabled={isStreaming} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${mode === 'upload' ? 'bg-[var(--color-bg-panel)] text-white shadow' : 'text-text-secondary hover:text-white'}`}>
                        <UploadCloud className="w-4 h-4" /> Arquivo Local
                     </button>
                     <button onClick={() => setMode('reback')} disabled={isStreaming} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${mode === 'reback' ? 'bg-[var(--color-bg-panel)] text-white shadow' : 'text-text-secondary hover:text-white'}`}>
                        <ListVideo className="w-4 h-4" /> Múltiplos Links (IPTV)
                     </button>
                  </div>

                  {mode === 'upload' ? (
                     <div onClick={() => !isStreaming && fileInputRef.current?.click()} className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl transition-all ${file ? 'border-kick/50 bg-kick/5' : 'border-white/10 bg-black/40 hover:border-kick/30'} cursor-pointer`}>
                        <input type="file" accept="video/mp4" className="hidden" ref={fileInputRef} onChange={handleBaseVideoChange} disabled={isStreaming} />
                        <span className="text-sm font-medium text-kick">{file ? file.name : 'Selecionar MP4 de Vídeo Base'}</span>
                     </div>
                  ) : (
                     <div className="space-y-3">
                        {playlist.map((item, index) => (
                           <div key={item.id} className="bg-black/40 border border-white/5 p-3 rounded-xl flex gap-3">
                              <input type="text" value={item.url} onChange={(e) => updatePlaylistItem(item.id, 'url', e.target.value)} disabled={isStreaming} className="flex-1 bg-transparent text-sm text-white focus:outline-none" placeholder="http://iptv.com/live.ts" />
                              
                              {playlist.length > 1 && (
                                 <div className="flex items-center gap-2 shrink-0 border-l border-white/10 pl-3">
                                    <input type="number" min="1" value={item.duration} onChange={(e) => updatePlaylistItem(item.id, 'duration', parseInt(e.target.value) || 1)} disabled={isStreaming} className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-center" />
                                    <select value={item.unit} onChange={(e) => updatePlaylistItem(item.id, 'unit', e.target.value)} disabled={isStreaming} className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm">
                                       <option value="min">Min</option><option value="h">Horas</option>
                                    </select>
                                 </div>
                              )}
                           </div>
                        ))}
                        <button onClick={() => setPlaylist([...playlist, { id: Math.random().toString(), url: '', duration: 1, unit: 'h' }])} disabled={isStreaming} className="w-full py-3 border border-dashed border-white/20 rounded-xl text-text-secondary hover:text-kick flex justify-center gap-2 text-sm"><Plus className="w-4 h-4"/> Add Mídia</button>
                     </div>
                  )}
               </div>

               <hr className="border-white/5" />

               <div className="flex gap-4 pt-2">
                  <button onClick={() => setIsStudioOpen(true)} className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 text-sm transition-all">
                     <Layout className="w-4 h-4"/> Personalizar Overlays
                     {layers.length > 0 && <span className="bg-kick text-black px-2 py-0.5 rounded-full text-[10px] ml-2">{layers.length} Ativos</span>}
                  </button>

                  {isStreaming ? (
                     <button onClick={stopStream} disabled={isLoading} className="flex-1 bg-red-500/20 text-red-500 hover:bg-red-500/30 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all">
                        <Square className="w-5 h-5 fill-current" /> Parar Live
                     </button>
                  ) : (
                     <button onClick={startStream} disabled={isLoading || workerStatus !== 'valid'} className={`flex-1 ${workerStatus !== 'valid' ? 'bg-kick/20 text-kick/40 cursor-not-allowed' : 'bg-kick text-black hover:bg-kick/80'} py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all`}>
                        <Play className="w-5 h-5 fill-current" /> {isLoading ? 'Ligando...' : 'Iniciar Transmissão'}
                     </button>
                  )}
               </div>
            </div>
         </div>
      </div>

      {/* STUDIO MODE (CANVAS MODAL) */}
      <div className={`fixed inset-0 bg-black z-50 flex flex-col md:flex-row transition-all duration-500 ease-in-out ${isStudioOpen ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-10'}`}>
         
         <div className="absolute top-4 left-4 z-50 flex items-center gap-4">
            <button onClick={() => setIsStudioOpen(false)} className="bg-white/10 hover:bg-white/20 p-3 rounded-full text-white transition-all backdrop-blur-md">
               <X className="w-6 h-6"/>
            </button>
            {isStreaming && (
               <button onClick={updateLiveStream} disabled={isLoading} className="bg-kick text-black hover:bg-kick/80 px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-kick/20">
                  <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} /> Salvar e Atualizar Live
               </button>
            )}
         </div>

         {/* CANVAS AREA */}
         <div className="flex-1 flex flex-col p-6 pt-20 pb-4 items-center justify-center bg-[#0a0a0a] relative">
            
            <div className="absolute top-6 right-6 flex gap-2 z-20">
               <button onClick={() => addLayer('text')} className="px-3 py-2 bg-black/40 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors backdrop-blur-sm"><Type className="w-3.5 h-3.5"/> Texto</button>
               <button onClick={() => addLayer('marquee')} className="px-3 py-2 bg-black/40 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors backdrop-blur-sm"><Navigation className="w-3.5 h-3.5 rotate-90"/> Letreiro</button>
               <button onClick={() => addLayer('clock')} className="px-3 py-2 bg-black/40 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors backdrop-blur-sm"><Clock className="w-3.5 h-3.5"/> Relógio</button>
               <button onClick={() => addLayer('media')} className="px-3 py-2 bg-black/40 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors backdrop-blur-sm"><ImageIcon className="w-3.5 h-3.5"/> Mídia</button>
               <button onClick={() => addLayer('box')} className="px-3 py-2 bg-black/40 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors backdrop-blur-sm"><BoxIcon className="w-3.5 h-3.5"/> Caixa</button>
            </div>

            <div 
               ref={canvasRef}
               className="relative bg-black border border-white/20 rounded-lg shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden shrink-0"
               onContextMenu={(e: React.MouseEvent) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, layerId: null });
               }}
               style={{ 
                  width: PREVIEW_W, 
                  height: PREVIEW_H,
                  backgroundImage: 'linear-gradient(45deg, #151515 25%, transparent 25%), linear-gradient(-45deg, #151515 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #151515 75%), linear-gradient(-45deg, transparent 75%, #151515 75%)', 
                  backgroundSize: '20px 20px', 
                  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px' 
               }}
            >
               {layers.map(layer => {
                  let styleObj: React.CSSProperties = {
                     width: '100%',
                     height: '100%',
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     opacity: layer.opacity !== undefined ? layer.opacity / 100 : 1
                  };

                  if (layer.type === 'text' || layer.type === 'clock' || layer.type === 'marquee') {
                     styleObj = {
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: layer.opacity !== undefined ? layer.opacity / 100 : 1
                     };
                  }

                  if (layer.type === 'box') {
                     let [color, alpha] = layer.color.split('@');
                     let alphaVal = alpha ? parseFloat(alpha) : 1;
                     styleObj.backgroundColor = color === 'black' ? `rgba(0,0,0,${alphaVal})` : layer.color; 
                  }

                  const previewX = layer.x / RATIO;
                  const previewY = layer.y / RATIO;
                  
                  let previewW = 0;
                  let previewH = 0;
                  if (layer.type === 'box' || layer.type === 'media') {
                     previewW = parseInt(layer.width) / RATIO;
                     previewH = parseInt(layer.height) / RATIO;
                  }

                  return (
                     <Rnd
                        key={layer.id}
                        ref={(c: any) => { if (c) rndRefs.current[layer.id] = c; }}
                        default={{
                           x: previewX,
                           y: previewY,
                           width: (layer.type === 'box' || layer.type === 'media') ? previewW : 'auto',
                           height: (layer.type === 'box' || layer.type === 'media') ? previewH : 'auto'
                        }}
                        onDragStop={(e: any, d: any) => {
                           if (layer.type === 'marquee') return;
                           updateLayer(layer.id, {
                              x: Math.round(d.x * RATIO),
                              y: Math.round(d.y * RATIO)
                           });
                        }}
                        onResizeStop={(e: any, direction: any, ref: any, delta: any, position: any) => {
                           if (layer.type === 'box' || layer.type === 'media') {
                              updateLayer(layer.id, {
                                 x: Math.round(position.x * RATIO),
                                 y: Math.round(position.y * RATIO),
                                 width: Math.round(ref.offsetWidth * RATIO).toString(),
                                 height: Math.round(ref.offsetHeight * RATIO).toString()
                              });
                           } else if (layer.type === 'text' || layer.type === 'clock' || layer.type === 'marquee') {
                              const currentFontSize = parseInt(layer.fontsize) || 48;
                              const newFontSize = Math.max(12, currentFontSize + Math.round(delta.height * RATIO));
                              updateLayer(layer.id, {
                                 x: Math.round(position.x * RATIO),
                                 y: Math.round(position.y * RATIO),
                                 fontsize: newFontSize.toString()
                              });
                              // Reseta o Rnd para "auto" após o resize para abraçar o texto novo sem bugar!
                              setTimeout(() => {
                                 if (rndRefs.current[layer.id]) {
                                    rndRefs.current[layer.id].updateSize({ width: 'auto', height: 'auto' });
                                 }
                              }, 0);
                           }
                        }}
                        enableResizing={activeLayerId === layer.id}
                        disableDragging={layer.type === 'marquee'}
                        lockAspectRatio={layer.type === 'text' || layer.type === 'clock' || layer.type === 'marquee'}
                        onPointerDown={(e: any) => handleLayerPointerDown(e, layer.id)}
                        onContextMenu={(e: any) => {
                           e.preventDefault();
                           e.stopPropagation();
                           setActiveLayerId(layer.id);
                           setContextMenu({ x: e.clientX, y: e.clientY, layerId: layer.id });
                        }}
                        className={`select-none ${activeLayerId === layer.id ? 'ring-2 ring-kick border-dashed z-20' : 'border border-transparent hover:border-white/20 z-10'}`}
                     >
                        <div style={styleObj}>
                           {(layer.type === 'text' || layer.type === 'clock' || layer.type === 'marquee') && (
                               <div style={{ 
                                 color: layer.color, 
                                 fontFamily: layer.font || 'Arial', 
                                 fontSize: `${Math.max(12, parseInt(layer.fontsize) / RATIO)}px`, 
                                 lineHeight: 1, 
                                 whiteSpace: 'nowrap', 
                                 fontWeight: 'bold', 
                                 textShadow: layer.hasShadow && (layer.shadowX || layer.shadowY) ? `${(layer.shadowX || 0)/RATIO}px ${(layer.shadowY || 0)/RATIO}px 0px ${layer.shadowColor || '#000'}` : 'none',
                                 WebkitTextStroke: layer.hasBorder && layer.borderWidth ? `${layer.borderWidth/RATIO}px ${layer.borderColor || '#000'}` : undefined,
                                 backgroundColor: layer.hasBackground ? layer.backgroundColor : 'transparent',
                                 padding: layer.hasBackground ? `${(layer.backgroundPadding || 0)/RATIO}px` : '0px'
                              }}>
                                 {layer.type === 'clock' ? '12:00:00' : (layer.text || 'Seu texto aqui')}
                              </div>
                           )}
                           {layer.type === 'media' && (
                              <div className="bg-white/10 backdrop-blur-sm w-full h-full flex flex-col items-center justify-center gap-2 rounded overflow-hidden">
                                 <ImageIcon className="w-8 h-8 text-white/50" />
                                 <span className="text-[10px] text-white/50 truncate max-w-full px-2">{layer.file ? layer.file.name : 'Mídia'}</span>
                              </div>
                           )}
                        </div>
                     </Rnd>
                  );
               })}

               {layers.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                     <Layout className="w-10 h-10 mb-3 text-white/50" />
                     <span className="text-white/60 text-sm font-medium">Nenhum elemento no layout</span>
                  </div>
               )}
            </div>
            <div className="mt-4 flex items-center justify-between w-full max-w-[960px]">
               <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 rounded border border-white/5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-[10px] text-white/50 font-medium uppercase tracking-wider">Preview 1080p</span>
               </div>
               <span className="text-[10px] text-white/30">1920x1080 • 60fps</span>
            </div>
         </div>

         {/* SIDEBAR DO STUDIO (PROPRIEDADES) */}
         <div className="w-full md:w-[450px] bg-[var(--color-bg-panel)] border-l border-white/10 p-6 overflow-y-auto flex flex-col z-10 shrink-0 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-3 border-b border-white/10 pb-5 mb-6">
               <div className="p-2 bg-kick/10 rounded-lg">
                  <Settings className="w-5 h-5 text-kick"/>
               </div>
               <h2 className="text-lg font-medium text-white/90 tracking-wide">Propriedades</h2>
            </div>

            {activeLayerId ? (
               <div className="flex flex-col gap-6">
                  {layers.map(layer => layer.id === activeLayerId && (
                     <div key={layer.id} className="space-y-6">
                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/10">
                            <span className="text-sm font-semibold tracking-wide text-white">
                                {layer.type === 'text' ? 'Texto' : layer.type === 'box' ? 'Caixa' : layer.type === 'media' ? 'Mídia' : layer.type === 'clock' ? 'Relógio' : 'Letreiro'}
                            </span>
                            <div className="flex gap-1.5">
                                <button onClick={() => moveLayerUp(layer.id)} className="text-white/40 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded transition-colors" title="Trazer para frente"><ArrowUp className="w-4 h-4"/></button>
                                <button onClick={() => moveLayerDown(layer.id)} className="text-white/40 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded transition-colors" title="Mandar para trás"><ArrowDown className="w-4 h-4"/></button>
                                <button onClick={() => removeLayer(activeLayerId)} className="text-red-400/70 hover:text-red-400 bg-red-400/5 hover:bg-red-400/10 p-1.5 rounded flex items-center justify-center transition-colors ml-2"><Trash2 className="w-4 h-4"/></button>
                            </div>
                        </div>

                        {/* SEÇÃO: GERAL */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 border-b border-white/5 pb-2 mb-3">
                                <Settings className="w-3.5 h-3.5 text-white/40" />
                                <h3 className="text-xs font-medium text-white/50 tracking-wide">Geral</h3>
                            </div>
                            
                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <label className="block text-[11px] font-medium text-text-secondary">Opacidade</label>
                                    <span className="text-xs text-white/70 font-mono">{layer.opacity}%</span>
                                </div>
                                <input type="range" min="0" max="100" value={layer.opacity} onChange={(e) => updateFromSidebar(layer.id, { opacity: parseInt(e.target.value) })} className="w-full accent-kick h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer" />
                            </div>

                            {(layer.type === 'text' || layer.type === 'marquee') && (
                                <div>
                                    <label className="block text-[11px] font-medium text-text-secondary mb-1">Conteúdo</label>
                                    <input type="text" value={layer.text} onChange={(e) => updateFromSidebar(layer.id, { text: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm focus:border-kick focus:outline-none" />
                                </div>
                            )}

                            {layer.type === 'media' && (
                                <div>
                                    <label className="block text-[11px] font-medium text-text-secondary mb-1">Arquivo de mídia</label>
                                    <input type="file" accept="image/*,video/mp4" onChange={(e) => e.target.files && updateLayer(layer.id, { file: e.target.files[0] })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-kick file:text-black file:font-medium hover:file:bg-kick/80" />
                                </div>
                            )}
                        </div>

                        {/* SEÇÃO: DIMENSÕES E POSIÇÃO */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 border-b border-white/5 pb-2 mb-3 mt-6">
                                <Move className="w-3.5 h-3.5 text-white/40" />
                                <h3 className="text-xs font-medium text-white/50 tracking-wide">Dimensões e Posição</h3>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                {(layer.type === 'media' || layer.type === 'box') && (
                                    <>
                                        <div>
                                            <label className="block text-[11px] font-medium text-text-secondary mb-1">Largura (px)</label>
                                            <input type="number" value={layer.width} onChange={(e) => updateFromSidebar(layer.id, { width: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm focus:border-kick focus:outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-medium text-text-secondary mb-1">Altura (px)</label>
                                            <input type="number" value={layer.height} onChange={(e) => updateFromSidebar(layer.id, { height: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm focus:border-kick focus:outline-none" />
                                        </div>
                                    </>
                                )}

                                {layer.type !== 'marquee' && (
                                    <>
                                        <div>
                                            <label className="block text-[11px] font-medium text-text-secondary mb-1">Eixo X (px)</label>
                                            <input type="number" value={layer.x} onChange={(e) => updateFromSidebar(layer.id, { x: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm focus:border-kick focus:outline-none" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-medium text-text-secondary mb-1">Eixo Y (px)</label>
                                            <input type="number" value={layer.y} onChange={(e) => updateFromSidebar(layer.id, { y: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm focus:border-kick focus:outline-none" />
                                        </div>
                                    </>
                                )}

                                {layer.type === 'marquee' && (
                                    <div className="col-span-2">
                                        <label className="block text-[11px] font-medium text-text-secondary mb-1">Eixo Y (px)</label>
                                        <input type="number" value={layer.y} onChange={(e) => updateFromSidebar(layer.id, { y: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm focus:border-kick focus:outline-none" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* SEÇÃO: ESTILO */}
                        {(layer.type === 'text' || layer.type === 'clock' || layer.type === 'marquee') && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-white/5 pb-2 mb-3 mt-6">
                                    <Palette className="w-3.5 h-3.5 text-white/40" />
                                    <h3 className="text-xs font-medium text-white/50 tracking-wide">Estilo do Texto</h3>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-medium text-text-secondary mb-1">Cor</label>
                                        <div className="flex gap-2">
                                            <input type="color" value={layer.color} onChange={(e) => updateFromSidebar(layer.id, { color: e.target.value })} className="h-8 w-8 shrink-0 bg-black border border-white/10 rounded cursor-pointer p-0" />
                                            <input type="text" value={layer.color} onChange={(e) => updateFromSidebar(layer.id, { color: e.target.value })} className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 text-xs focus:border-kick focus:outline-none uppercase" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-medium text-text-secondary mb-1">Tamanho</label>
                                        <input type="number" value={layer.fontsize} onChange={(e) => updateFromSidebar(layer.id, { fontsize: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs focus:border-kick focus:outline-none" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-medium text-text-secondary mb-1">Fonte</label>
                                    <select value={layer.font || 'arial'} onChange={(e) => updateFromSidebar(layer.id, { font: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-kick">
                                        <option value="arial">Arial</option>
                                        <option value="ariblk">Arial Black</option>
                                        <option value="impact">Impact</option>
                                        <option value="verdana">Verdana</option>
                                        <option value="tahoma">Tahoma</option>
                                        <option value="comic">Comic Sans</option>
                                        <option value="times">Times New Roman</option>
                                        <option value="cour">Courier New</option>
                                        <option value="georgia">Georgia</option>
                                        <option value="trebuc">Trebuchet MS</option>
                                        <option value="segoeui">Segoe UI</option>
                                        <option value="calibri">Calibri</option>
                                        <option value="consola">Consolas</option>
                                        <option value="pala">Palatino</option>
                                        <option value="gara">Garamond</option>
                                    </select>
                                </div>

                                {/* FUNDO DO TEXTO */}
                                <div className="bg-white/5 p-3 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[11px] font-medium text-text-secondary flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={layer.hasBackground} onChange={(e) => updateFromSidebar(layer.id, { hasBackground: e.target.checked })} className="w-3.5 h-3.5 rounded border-white/20 bg-black/40 text-kick focus:ring-kick focus:ring-offset-black" />
                                            Ativar fundo
                                        </label>
                                    </div>
                                    {layer.hasBackground && (
                                        <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-white/5">
                                            <div>
                                                <label className="block text-[10px] text-text-secondary mb-1">Cor do fundo</label>
                                                <div className="flex gap-2">
                                                    <input type="color" value={layer.backgroundColor} onChange={(e) => updateFromSidebar(layer.id, { backgroundColor: e.target.value })} className="h-8 w-8 shrink-0 bg-black border border-white/10 rounded cursor-pointer p-0" />
                                                    <input type="text" value={layer.backgroundColor} onChange={(e) => updateFromSidebar(layer.id, { backgroundColor: e.target.value })} className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 text-xs focus:border-kick focus:outline-none uppercase" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-text-secondary mb-1">Margem interna</label>
                                                <input type="number" value={layer.backgroundPadding} onChange={(e) => updateFromSidebar(layer.id, { backgroundPadding: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs focus:border-kick focus:outline-none" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                {/* SOMBRA */}
                                <div className="bg-white/5 p-3 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[11px] font-medium text-text-secondary flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={layer.hasShadow} onChange={(e) => updateFromSidebar(layer.id, { hasShadow: e.target.checked })} className="w-3.5 h-3.5 rounded border-white/20 bg-black/40 text-kick focus:ring-kick focus:ring-offset-black" />
                                            Sombra projetada
                                        </label>
                                    </div>
                                    {layer.hasShadow && (
                                        <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-white/5">
                                            <div className="col-span-2">
                                                <label className="block text-[10px] text-text-secondary mb-1">Cor da sombra</label>
                                                <div className="flex gap-2">
                                                    <input type="color" value={layer.shadowColor} onChange={(e) => updateFromSidebar(layer.id, { shadowColor: e.target.value })} className="h-8 w-8 shrink-0 bg-black border border-white/10 rounded cursor-pointer p-0" />
                                                    <input type="text" value={layer.shadowColor} onChange={(e) => updateFromSidebar(layer.id, { shadowColor: e.target.value })} className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 text-xs focus:border-kick focus:outline-none uppercase" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-text-secondary mb-1">Eixo X</label>
                                                <input type="number" value={layer.shadowX} onChange={(e) => updateFromSidebar(layer.id, { shadowX: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs focus:border-kick focus:outline-none" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-text-secondary mb-1">Eixo Y</label>
                                                <input type="number" value={layer.shadowY} onChange={(e) => updateFromSidebar(layer.id, { shadowY: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs focus:border-kick focus:outline-none" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* BORDA */}
                                <div className="bg-white/5 p-3 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[11px] font-medium text-text-secondary flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={layer.hasBorder} onChange={(e) => updateFromSidebar(layer.id, { hasBorder: e.target.checked })} className="w-3.5 h-3.5 rounded border-white/20 bg-black/40 text-kick focus:ring-kick focus:ring-offset-black" />
                                            Traçado (Borda)
                                        </label>
                                    </div>
                                    {layer.hasBorder && (
                                        <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-white/5">
                                            <div>
                                                <label className="block text-[10px] text-text-secondary mb-1">Cor</label>
                                                <div className="flex gap-2">
                                                    <input type="color" value={layer.borderColor} onChange={(e) => updateFromSidebar(layer.id, { borderColor: e.target.value })} className="h-8 w-8 shrink-0 bg-black border border-white/10 rounded cursor-pointer p-0" />
                                                    <input type="text" value={layer.borderColor} onChange={(e) => updateFromSidebar(layer.id, { borderColor: e.target.value })} className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 text-xs focus:border-kick focus:outline-none uppercase" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-text-secondary mb-1">Espessura</label>
                                                <input type="number" value={layer.borderWidth} onChange={(e) => updateFromSidebar(layer.id, { borderWidth: parseInt(e.target.value) || 0 })} className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs focus:border-kick focus:outline-none" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        )}

                        {layer.type === 'box' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 border-b border-white/5 pb-2 mb-3 mt-6">
                                    <Palette className="w-3.5 h-3.5 text-white/40" />
                                    <h3 className="text-xs font-medium text-white/50 tracking-wide">Estilo da Caixa</h3>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-medium text-text-secondary mb-1">Cor de preenchimento</label>
                                    <div className="flex gap-2">
                                        <input type="color" value={layer.color.split('@')[0]} onChange={(e) => updateLayer(layer.id, 'color', e.target.value)} className="h-8 w-8 shrink-0 bg-black border border-white/10 rounded cursor-pointer p-0" />
                                        <input type="text" value={layer.color} onChange={(e) => updateLayer(layer.id, 'color', e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2 text-sm focus:border-kick focus:outline-none" placeholder="#000000@0.5" />
                                    </div>
                                </div>
                            </div>
                        )}
                     </div>
                  ))}
               </div>
            ) : (
               <div className="flex-1 flex flex-col items-center justify-center text-text-secondary/50 text-center px-4">
                  <Layout className="w-12 h-12 mb-4 opacity-20" />
                  <span className="text-sm">Clique em um elemento no Canvas para editar suas configurações, ou adicione uma nova camada acima.</span>
               </div>
            )}
         </div>
      </div>

      {contextMenu && (
         <div 
            className="fixed z-50 bg-[#121212] border border-white/10 rounded-lg shadow-xl py-1 min-w-[150px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
         >
            {contextMenu.layerId ? (
               <>
                  <button onClick={() => {
                     const layer = layers.find(l => l.id === contextMenu.layerId);
                     if (layer) {
                        const newLayer = { ...layer, id: Math.random().toString(36).substr(2, 9), x: layer.x + 50, y: layer.y + 50 };
                        setLayers([...layers, newLayer]);
                        setActiveLayerId(newLayer.id);
                     }
                  }} className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/5 flex items-center gap-2">
                     <Copy className="w-4 h-4" /> Duplicar
                  </button>
                  <button onClick={() => removeLayer(contextMenu.layerId!)} className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-white/5 flex items-center gap-2">
                     <Trash2 className="w-4 h-4" /> Deletar
                  </button>
               </>
            ) : (
               <>
                  <div className="px-3 py-1 text-xs text-white/30 font-bold uppercase tracking-wider mb-1">Adicionar</div>
                  <button onClick={() => addLayer('text')} className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/5 flex items-center gap-2">
                     <Type className="w-4 h-4" /> Novo Texto
                  </button>
                  <button onClick={() => addLayer('box')} className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/5 flex items-center gap-2">
                     <BoxIcon className="w-4 h-4" /> Nova Caixa
                  </button>
                  <button onClick={() => addLayer('media')} className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/5 flex items-center gap-2">
                     <ImageIcon className="w-4 h-4" /> Nova Mídia
                  </button>
               </>
            )}
         </div>
      )}

    </main>
  );
}
