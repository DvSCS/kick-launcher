/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";
import { Play, Square, UploadCloud, AlertCircle, Plus, Trash2, ListVideo, Type, Image as ImageIcon, Layout, X, Clock, Navigation, Square as BoxIcon, RefreshCw, CheckCircle2, XCircle, Loader2, Copy, ArrowUp, ArrowDown, Settings, Move, Palette } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Rnd } from "react-rnd";

type LayerType = 'text' | 'media' | 'clock' | 'marquee' | 'box' | 'blur' | 'progress';

interface PlaylistItemUI {
  id: string;
  type: 'url' | 'file';
  url: string;
  file: File | null;
  duration: number;
  unit: 'min' | 'h' | 'auto';
}

interface PresetUI {
  id: string;
  name: string;
  actionOnEnd: 'loop' | 'next' | 'stop';
  items: PlaylistItemUI[];
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
  blurAmount?: number;
  progressDuration?: number;
}

interface GlobalFiltersUI {
  brightness: number;
  contrast: number;
  saturation: number;
}


export default function Home() {
  const [streamUrl, setStreamUrl] = useState("rtmps://stream.kick.com:443/app");
  const [streamKey, setStreamKey] = useState("");
  const [workerUrl, setWorkerUrl] = useState("");
  const [workerStatus, setWorkerStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  
  const [presets, setPresets] = useState<PresetUI[]>([
    {
      id: '1',
      name: 'Preset 1',
      actionOnEnd: 'loop',
      items: [{ id: '1', type: 'url', url: '', file: null, duration: 1, unit: 'h' }]
    }
  ]);
  const [activePresetId, setActivePresetId] = useState<string>('1');
  const [globalFilters, setGlobalFilters] = useState<GlobalFiltersUI>({ brightness: 0, contrast: 1, saturation: 1 });
  
  // Streaming Configuration
  const [canvasWidth, setCanvasWidth] = useState(1920);
  const [canvasHeight, setCanvasHeight] = useState(1080);
  const [fps, setFps] = useState(30);
  const [videoBitrate, setVideoBitrate] = useState(3000);
  const [audioBitrate, setAudioBitrate] = useState(160);

  // Derived Canvas Constants
  const PREVIEW_MAX_W = 960;
  const PREVIEW_MAX_H = 540;
  const displayScale = Math.min(PREVIEW_MAX_W / canvasWidth, PREVIEW_MAX_H / canvasHeight);
  const PREVIEW_W = Math.round(canvasWidth * displayScale);
  const PREVIEW_H = Math.round(canvasHeight * displayScale);
  const RATIO = canvasWidth / PREVIEW_W;

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
        if (data.presets) {
          setPresets(data.presets);
          if (data.presets.length > 0) setActivePresetId(data.presets[0].id);
        }
        if (data.globalFilters) setGlobalFilters(data.globalFilters);
        if (data.canvasWidth) setCanvasWidth(data.canvasWidth);
        if (data.canvasHeight) setCanvasHeight(data.canvasHeight);
        if (data.fps) setFps(data.fps);
        if (data.videoBitrate) setVideoBitrate(data.videoBitrate);
        if (data.audioBitrate) setAudioBitrate(data.audioBitrate);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('kick_launcher_data', JSON.stringify({
      streamUrl,
      streamKey,
      workerUrl,
      presets,
      globalFilters,
      canvasWidth,
      canvasHeight,
      fps,
      videoBitrate,
      audioBitrate
    }));
  }, [streamUrl, streamKey, workerUrl, presets, globalFilters, canvasWidth, canvasHeight, fps, videoBitrate, audioBitrate]);

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

  const addPlaylistItem = (type: 'url' | 'file') => {
    setPresets(presets.map(p => {
      if (p.id !== activePresetId) return p;
      return {
        ...p,
        items: [...p.items, { id: Math.random().toString(), type, url: '', file: null, duration: 1, unit: 'h' }]
      };
    }));
  };

  const updatePlaylistItem = (itemId: string, field: keyof PlaylistItemUI, value: any) => {
    setPresets(presets.map(p => {
      if (p.id !== activePresetId) return p;
      return {
        ...p,
        items: p.items.map(item => item.id === itemId ? { ...item, [field]: value } : item)
      };
    }));
  };

  const removePlaylistItem = (itemId: string) => {
    setPresets(presets.map(p => {
      if (p.id !== activePresetId) return p;
      return {
        ...p,
        items: p.items.filter(item => item.id !== itemId)
      };
    }));
  };

  const updateActivePresetField = (field: keyof PresetUI, value: any) => {
    setPresets(presets.map(p => p.id === activePresetId ? { ...p, [field]: value } : p));
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
      x: canvasWidth / 2 - 100,
      y: canvasHeight / 2 - 50,
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
      backgroundPadding: 5,
      blurAmount: type === 'blur' ? 10 : undefined,
      progressDuration: type === 'progress' ? 3600 : undefined
    };
    
    if (type === 'marquee') {
       newLayer.y = canvasHeight - 100;
       newLayer.x = 0; // x é controlado pelo math, mas deixamos 0 no estado visual
    }
    if (type === 'box') {
       newLayer.x = 0;
       newLayer.y = canvasHeight - 100;
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

  const startStream = async () => {
    if (!streamUrl || !streamKey) {
      setError("Preencha a URL e a Key da Kick.");
      return;
    }

    const activePreset = presets.find(p => p.id === activePresetId);
    if (!activePreset || activePreset.items.length === 0) {
      setError("Adicione pelo menos uma mídia na playlist do Preset atual.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("streamUrl", streamUrl);
    formData.append("streamKey", streamKey);

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
          backgroundPadding: l.backgroundPadding,
          blurAmount: l.blurAmount,
          progressDuration: l.progressDuration
       }));
       formData.append("overlayItems", JSON.stringify(mappedLayers));

       layers.forEach(l => {
          if (l.type === 'media' && l.file) {
             formData.append(`media_${l.id}`, l.file);
          }
       });
    }
    
    // We will send the full presets state to the backend
    // But we need to separate the File objects from the JSON structure
    const presetsToSend = presets.map(p => {
       const presetData = {
          id: p.id,
          name: p.name,
          actionOnEnd: p.actionOnEnd,
          items: p.items.map(item => {
             // For "auto" duration, durationMs is not calculated from slider.
             const durationMs = item.unit === 'auto' 
                 ? 0 
                 : (item.unit === 'min' ? item.duration * 60000 : item.duration * 3600000);
             return {
                id: item.id,
                type: item.type,
                url: item.type === 'url' ? item.url : 'LOCAL_FILE',
                durationMs: durationMs,
                isLoop: item.unit !== 'auto', // Only loop if not 'auto'
             };
          })
       };
       return presetData;
    });

    formData.append("presets", JSON.stringify(presetsToSend));
    formData.append("activePresetId", activePresetId);
    formData.append("globalFilters", JSON.stringify(globalFilters));
    formData.append("config", JSON.stringify({
       canvasWidth,
       canvasHeight,
       fps,
       videoBitrate,
       audioBitrate
    }));

    // Append video files
    presets.forEach(p => {
      p.items.forEach(item => {
        if (item.type === 'file' && item.file) {
          formData.append(`preset_file_${p.id}_${item.id}`, item.file);
        }
      });
    });

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
          backgroundPadding: l.backgroundPadding,
          blurAmount: l.blurAmount,
          progressDuration: l.progressDuration
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
    <main className="min-h-screen bg-[var(--color-bg-dark)] text-white">

      {/* TELA PRINCIPAL */}
      <div className={`transition-all duration-300 ease-out flex flex-col items-center justify-center min-h-screen p-4 ${isStudioOpen ? 'opacity-0 pointer-events-none absolute inset-0' : 'opacity-100'}`}>
         <div className="w-full max-w-xl bg-[var(--color-bg-panel)] rounded-xl p-7 border border-[#222] z-10">
            <div className="flex items-center justify-between mb-7">
               <div className="flex items-center gap-3">
                  <img src="/kick-logo.svg" alt="Kick" className="w-8 h-8" />
                  <h1 className="text-xl font-semibold text-white/90">Launcher</h1>
               </div>
               <div className={`flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium ${isStreaming ? 'bg-kick/10 text-kick border border-kick/20' : 'bg-[#1a1a1a] text-[#555] border border-[#252525]'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-kick' : 'bg-[#444]'}`} />
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

            <div className="space-y-5">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                     <label className="block text-[11px] font-medium text-[#666] mb-1.5">Stream URL</label>
                     <input type="text" value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} disabled={isStreaming} className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-kick" />
                  </div>
                  <div>
                     <label className="block text-[11px] font-medium text-[#666] mb-1.5">Stream Key</label>
                     <input type="password" value={streamKey} onChange={(e) => setStreamKey(e.target.value)} disabled={isStreaming} className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-kick" />
                  </div>
               </div>
               
               <div>
                  <div className="flex justify-between items-end mb-1.5">
                     <label className="block text-[11px] font-medium text-[#666]">Motor de renderização</label>
                     <a href="/KickWorker.zip" download className="text-[11px] font-medium text-kick hover:underline flex items-center gap-1"><UploadCloud className="w-3 h-3"/> Baixar motor</a>
                  </div>
                  <div className="relative flex items-center">
                    <input type="text" value={workerUrl} onChange={(e) => setWorkerUrl(e.target.value)} disabled={isStreaming} placeholder="https://xxx.loca.lt" className="w-full bg-[#111] border border-[#222] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-kick pr-10" />
                    <div className="absolute right-3">
                       {workerStatus === 'checking' && <Loader2 className="w-4 h-4 text-[#444] animate-spin" />}
                       {workerStatus === 'valid' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                       {workerStatus === 'invalid' && <XCircle className="w-4 h-4 text-red-500" />}
                    </div>
                  </div>
                  {workerStatus === 'invalid' && workerUrl.length > 0 && <p className="text-[11px] text-red-400 mt-1.5">Motor offline ou link inválido.</p>}
               </div>

               <div className="h-px bg-[#1e1e1e]"></div>

               <div>
                  <div className="flex gap-2 mb-3 bg-[#111] p-1 rounded-lg overflow-x-auto no-scrollbar">
                     {presets.map(p => (
                        <button key={p.id} onClick={() => setActivePresetId(p.id)} disabled={isStreaming} className={`px-4 py-1.5 text-[12px] font-medium rounded-md transition-colors whitespace-nowrap ${p.id === activePresetId ? 'bg-[var(--color-bg-panel)] text-white shadow-sm' : 'text-[#555] hover:text-white'}`}>
                           {p.name}
                        </button>
                     ))}
                     <button onClick={() => setPresets([...presets, { id: Math.random().toString(), name: `Preset ${presets.length + 1}`, actionOnEnd: 'loop', items: [] }])} disabled={isStreaming} className="px-3 py-1.5 text-[12px] font-medium text-[#555] hover:text-white transition-colors flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Novo
                     </button>
                  </div>

                  {(() => {
                     const activePreset = presets.find(p => p.id === activePresetId);
                     if (!activePreset) return null;

                     return (
                        <div className="space-y-3">
                           {/* Loop Logic Config */}
                           <div className="flex justify-between items-center bg-[#111] border border-[#222] p-2.5 rounded-lg">
                              <span className="text-[11px] font-medium text-[#666]">Ação ao final da playlist:</span>
                              <select value={activePreset.actionOnEnd} onChange={(e) => updateActivePresetField('actionOnEnd', e.target.value)} disabled={isStreaming} className="bg-[#0e0e0e] border border-[#222] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-kick">
                                 <option value="loop">Fazer Loop (Voltar ao início)</option>
                                 <option value="next">Pular para Próximo Preset</option>
                                 <option value="stop">Parar Transmissão</option>
                              </select>
                           </div>

                           <div className="space-y-2">
                              {activePreset.items.map((item, index) => (
                                 <div key={item.id} className="bg-[#111] border border-[#222] p-2.5 rounded-lg flex items-center gap-2">
                                    {item.type === 'url' ? (
                                       <input type="text" value={item.url} onChange={(e) => updatePlaylistItem(item.id, 'url', e.target.value)} disabled={isStreaming} className="flex-1 bg-transparent text-sm text-white focus:outline-none min-w-0" placeholder="http://iptv.com/live.ts" />
                                    ) : (
                                       <div className="flex-1 min-w-0 flex items-center relative">
                                          <input type="file" accept="video/mp4" onChange={(e) => e.target.files && e.target.files.length > 0 && updatePlaylistItem(item.id, 'file', e.target.files[0])} disabled={isStreaming} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                          <div className="truncate text-sm text-white/80 font-medium">
                                             {item.file ? item.file.name : 'Clique para selecionar um Arquivo Local (.mp4)'}
                                          </div>
                                       </div>
                                    )}
                                    
                                    <div className="flex items-center gap-1.5 shrink-0 border-l border-[#222] pl-2">
                                        <select value={item.unit} onChange={(e) => updatePlaylistItem(item.id, 'unit', e.target.value)} disabled={isStreaming} className="bg-[#0e0e0e] border border-[#222] rounded px-1 py-1 text-xs text-white">
                                           <option value="min">Min</option>
                                           <option value="h">Hrs</option>
                                           <option value="auto">Auto</option>
                                        </select>
                                        {item.unit !== 'auto' && (
                                           <input type="number" min="1" value={item.duration} onChange={(e) => updatePlaylistItem(item.id, 'duration', parseInt(e.target.value) || 1)} disabled={isStreaming} className="w-12 bg-[#0e0e0e] border border-[#222] rounded px-1.5 py-1 text-xs text-center" />
                                        )}
                                        <button onClick={() => removePlaylistItem(item.id)} disabled={isStreaming} className="p-1.5 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors ml-1">
                                          <Trash2 className="w-3.5 h-3.5" />
                                       </button>
                                    </div>
                                 </div>
                              ))}

                              <div className="flex gap-2">
                                 <button onClick={() => addPlaylistItem('url')} disabled={isStreaming} className="flex-1 py-2.5 border border-dashed border-[#252525] rounded-lg text-[#555] hover:text-white hover:border-[#333] flex justify-center items-center gap-1.5 text-[11px] transition-colors"><ListVideo className="w-3 h-3"/> + Link IPTV</button>
                                 <button onClick={() => addPlaylistItem('file')} disabled={isStreaming} className="flex-1 py-2.5 border border-dashed border-[#252525] rounded-lg text-[#555] hover:text-white hover:border-[#333] flex justify-center items-center gap-1.5 text-[11px] transition-colors"><UploadCloud className="w-3 h-3"/> + Arquivo Local</button>
                              </div>
                           </div>
                        </div>
                     );
                  })()}
               </div>

               <div className="h-px bg-[#1e1e1e]"></div>

               {/* GLOBAL FILTERS */}
               <div>
                  <div className="flex justify-between items-end mb-2">
                     <label className="block text-[11px] font-medium text-[#666]">Filtros de Imagem (Global)</label>
                  </div>
                  <div className="bg-[#111] border border-[#222] p-3 rounded-lg space-y-3">
                     <div className="flex items-center gap-3">
                        <span className="text-[10px] text-[#555] w-12 shrink-0">Brilho</span>
                        <input type="range" min="-1" max="1" step="0.1" value={globalFilters.brightness} onChange={(e) => setGlobalFilters({...globalFilters, brightness: parseFloat(e.target.value)})} disabled={isStreaming} className="flex-1 accent-kick h-1.5 bg-[#222] rounded-full appearance-none" />
                        <span className="text-[10px] text-[#888] w-6 text-right tabular-nums">{globalFilters.brightness}</span>
                     </div>
                     <div className="flex items-center gap-3">
                        <span className="text-[10px] text-[#555] w-12 shrink-0">Contraste</span>
                        <input type="range" min="-2" max="2" step="0.1" value={globalFilters.contrast} onChange={(e) => setGlobalFilters({...globalFilters, contrast: parseFloat(e.target.value)})} disabled={isStreaming} className="flex-1 accent-kick h-1.5 bg-[#222] rounded-full appearance-none" />
                        <span className="text-[10px] text-[#888] w-6 text-right tabular-nums">{globalFilters.contrast}</span>
                     </div>
                     <div className="flex items-center gap-3">
                        <span className="text-[10px] text-[#555] w-12 shrink-0">Saturação</span>
                        <input type="range" min="0" max="3" step="0.1" value={globalFilters.saturation} onChange={(e) => setGlobalFilters({...globalFilters, saturation: parseFloat(e.target.value)})} disabled={isStreaming} className="flex-1 accent-kick h-1.5 bg-[#222] rounded-full appearance-none" />
                        <span className="text-[10px] text-[#888] w-6 text-right tabular-nums">{globalFilters.saturation}</span>
                     </div>
                  </div>
               </div>

               <div className="h-px bg-[#1e1e1e]"></div>

               {/* STREAM CONFIGURATION */}
               <div>
                  <div className="flex justify-between items-end mb-2">
                     <label className="block text-[11px] font-medium text-[#666]">Configuração de Transmissão</label>
                  </div>
                  <div className="bg-[#111] border border-[#222] p-3 rounded-lg space-y-3">
                     
                     <div className="grid grid-cols-2 gap-2">
                        <div>
                           <label className="block text-[10px] text-[#555] mb-1">Resolução W</label>
                           <input type="number" value={canvasWidth} onChange={(e) => setCanvasWidth(parseInt(e.target.value) || 1920)} disabled={isStreaming} className="w-full bg-[#1a1a1a] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white focus:border-kick focus:outline-none transition-colors" />
                        </div>
                        <div>
                           <label className="block text-[10px] text-[#555] mb-1">Resolução H</label>
                           <input type="number" value={canvasHeight} onChange={(e) => setCanvasHeight(parseInt(e.target.value) || 1080)} disabled={isStreaming} className="w-full bg-[#1a1a1a] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white focus:border-kick focus:outline-none transition-colors" />
                        </div>
                     </div>

                     <div className="flex gap-2">
                        <button onClick={() => { setCanvasWidth(1920); setCanvasHeight(1080); }} disabled={isStreaming} className="flex-1 text-[10px] bg-[#1a1a1a] hover:bg-[#222] py-1 rounded text-white/70 border border-[#333]">16:9 HD</button>
                        <button onClick={() => { setCanvasWidth(1080); setCanvasHeight(1920); }} disabled={isStreaming} className="flex-1 text-[10px] bg-[#1a1a1a] hover:bg-[#222] py-1 rounded text-white/70 border border-[#333]">9:16 Vertical</button>
                        <button onClick={() => { setCanvasWidth(1080); setCanvasHeight(1080); }} disabled={isStreaming} className="flex-1 text-[10px] bg-[#1a1a1a] hover:bg-[#222] py-1 rounded text-white/70 border border-[#333]">1:1 Quad</button>
                     </div>

                     <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#1a1a1a]">
                        <div>
                           <label className="block text-[10px] text-[#555] mb-1">FPS</label>
                           <input type="number" value={fps} onChange={(e) => setFps(parseInt(e.target.value) || 30)} disabled={isStreaming} className="w-full bg-[#1a1a1a] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white focus:border-kick focus:outline-none transition-colors" />
                        </div>
                        <div>
                           <label className="block text-[10px] text-[#555] mb-1">Vídeo (k)</label>
                           <input type="number" value={videoBitrate} onChange={(e) => setVideoBitrate(parseInt(e.target.value) || 3000)} disabled={isStreaming} className="w-full bg-[#1a1a1a] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white focus:border-kick focus:outline-none transition-colors" />
                        </div>
                        <div>
                           <label className="block text-[10px] text-[#555] mb-1">Áudio (k)</label>
                           <input type="number" value={audioBitrate} onChange={(e) => setAudioBitrate(parseInt(e.target.value) || 160)} disabled={isStreaming} className="w-full bg-[#1a1a1a] border border-[#333] rounded px-2.5 py-1.5 text-xs text-white focus:border-kick focus:outline-none transition-colors" />
                        </div>
                     </div>

                  </div>
               </div>

               <div className="h-px bg-[#1e1e1e]"></div>

               <div className="flex gap-3">
                  <button onClick={() => setIsStudioOpen(true)} className="flex-1 bg-[#111] border border-[#222] hover:border-[#333] py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 text-[12px] transition-colors">
                     <Layout className="w-3.5 h-3.5"/> Overlays
                     {layers.length > 0 && <span className="bg-kick text-black px-1.5 py-0.5 rounded text-[10px] font-semibold">{layers.length}</span>}
                  </button>

                  {isStreaming ? (
                     <button onClick={stopStream} disabled={isLoading} className="flex-1 bg-red-500/10 text-red-400 hover:bg-red-500/15 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 text-[12px] border border-red-500/20 transition-colors">
                        <Square className="w-4 h-4 fill-current" /> Parar
                     </button>
                  ) : (
                     <button onClick={startStream} disabled={isLoading || workerStatus !== 'valid'} className={`flex-1 ${workerStatus !== 'valid' ? 'bg-[#1a1a1a] text-[#444] cursor-not-allowed border border-[#222]' : 'bg-kick text-black hover:bg-kick/85 border border-kick'} py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 text-[12px] transition-colors`}>
                        <Play className="w-4 h-4 fill-current" /> {isLoading ? 'Iniciando...' : 'Iniciar'}
                     </button>
                  )}
               </div>
            </div>
         </div>
      </div>

      {/* STUDIO MODE */}
      <div className={`fixed inset-0 bg-[#0a0a0a] z-50 flex flex-col md:flex-row transition-opacity duration-300 ${isStudioOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
         
         <div className="absolute top-4 left-4 z-50 flex items-center gap-3">
            <button onClick={() => setIsStudioOpen(false)} className="bg-[#1a1a1a] hover:bg-[#222] p-2.5 rounded-lg text-white/70 hover:text-white transition-colors border border-[#252525]">
               <X className="w-5 h-5"/>
            </button>
            {isStreaming && (
               <button onClick={updateLiveStream} disabled={isLoading} className="bg-kick text-black hover:bg-kick/85 px-3.5 py-2 rounded-lg font-semibold flex items-center gap-2 text-[12px] transition-colors">
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
               </button>
            )}
         </div>

         {/* CANVAS AREA */}
         <div className="flex-1 flex flex-col p-5 pt-16 pb-3 items-center justify-center bg-[#090909] relative">
            
            <div className="absolute top-4 right-4 flex gap-1.5 z-20">
               <button onClick={() => addLayer('text')} className="px-2.5 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white/60 hover:text-white border border-[#222] rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors"><Type className="w-3 h-3"/> Texto</button>
               <button onClick={() => addLayer('marquee')} className="px-2.5 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white/60 hover:text-white border border-[#222] rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors"><Navigation className="w-3 h-3 rotate-90"/> Letreiro</button>
               <button onClick={() => addLayer('clock')} className="px-2.5 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white/60 hover:text-white border border-[#222] rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors"><Clock className="w-3 h-3"/> Relógio</button>
               <button onClick={() => addLayer('media')} className="px-2.5 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white/60 hover:text-white border border-[#222] rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors"><ImageIcon className="w-3 h-3"/> Mídia</button>
               <button onClick={() => addLayer('box')} className="px-2.5 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white/60 hover:text-white border border-[#222] rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors"><BoxIcon className="w-3 h-3"/> Caixa</button>
               <button onClick={() => addLayer('blur')} className="px-2.5 py-1.5 bg-[#141414] hover:bg-[#1a1a1a] text-white/60 hover:text-white border border-[#222] rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors"><ImageIcon className="w-3 h-3"/> Desfoque (Blur)</button>
            </div>

            <div 
               ref={canvasRef}
               className="relative bg-black border border-[#1a1a1a] rounded-md overflow-hidden shrink-0"
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

                  if (layer.type === 'blur') {
                     styleObj.backdropFilter = `blur(${layer.blurAmount || 10}px)`;
                     styleObj.WebkitBackdropFilter = `blur(${layer.blurAmount || 10}px)`;
                     styleObj.backgroundColor = 'rgba(255,255,255,0.05)';
                  }

                  const previewX = layer.x / RATIO;
                  const previewY = layer.y / RATIO;
                  
                  let previewW = 0;
                  let previewH = 0;
                  if (layer.type === 'box' || layer.type === 'media' || layer.type === 'blur') {
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
                           width: (layer.type === 'box' || layer.type === 'media' || layer.type === 'blur') ? previewW : 'auto',
                           height: (layer.type === 'box' || layer.type === 'media' || layer.type === 'blur') ? previewH : 'auto'
                        }}
                        onDragStop={(e: any, d: any) => {
                           if (layer.type === 'marquee') return;
                           updateLayer(layer.id, {
                              x: Math.round(d.x * RATIO),
                              y: Math.round(d.y * RATIO)
                           });
                        }}
                        onResizeStop={(e: any, direction: any, ref: any, delta: any, position: any) => {
                           if (layer.type === 'box' || layer.type === 'media' || layer.type === 'blur') {
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
            <div className="mt-3 flex items-center justify-between w-full max-w-[960px]">
               <div className="flex items-center gap-2 px-2.5 py-1 bg-[#111] rounded border border-[#1e1e1e]">
                  <div className="w-1.5 h-1.5 rounded-full bg-kick"></div>
                  <span className="text-[10px] text-[#444] font-medium">1080p</span>
               </div>
               <span className="text-[10px] text-[#333]">1920×1080</span>
            </div>
         </div>

         {/* SIDEBAR DO STUDIO (PROPRIEDADES) */}
         <div className="w-full md:w-[400px] bg-[var(--color-bg-panel)] border-l border-[#1e1e1e] p-5 overflow-y-auto flex flex-col z-10 shrink-0">
            <div className="flex items-center gap-2.5 border-b border-[#1e1e1e] pb-4 mb-5">
               <Settings className="w-4 h-4 text-[#444]"/>
               <h2 className="text-[13px] font-medium text-white/80">Propriedades</h2>
            </div>

            {activeLayerId ? (
               <div className="flex flex-col gap-4">
                  {layers.map(layer => layer.id === activeLayerId && (
                     <div key={layer.id} className="space-y-4">
                        {/* LAYER HEADER */}
                        <div className="flex justify-between items-center bg-[#111] px-3 py-2 rounded-md border border-[#1e1e1e]">
                            <span className="text-[12px] font-medium text-white/80">
                                {layer.type === 'text' ? 'Texto' : layer.type === 'box' ? 'Caixa' : layer.type === 'media' ? 'Mídia' : layer.type === 'clock' ? 'Relógio' : 'Letreiro'}
                            </span>
                            <div className="flex gap-0.5">
                                <button onClick={() => moveLayerUp(layer.id)} className="text-[#555] hover:text-white p-1 rounded transition-colors" title="Subir"><ArrowUp className="w-3.5 h-3.5"/></button>
                                <button onClick={() => moveLayerDown(layer.id)} className="text-[#555] hover:text-white p-1 rounded transition-colors" title="Descer"><ArrowDown className="w-3.5 h-3.5"/></button>
                                <button onClick={() => removeLayer(activeLayerId)} className="text-red-400/50 hover:text-red-400 p-1 rounded transition-colors ml-1"><Trash2 className="w-3.5 h-3.5"/></button>
                            </div>
                        </div>

                        {/* GERAL */}
                        <div>
                            <div className="flex items-center gap-1.5 mb-3">
                                <Settings className="w-3 h-3 text-[#444]" />
                                <span className="text-[10px] font-medium text-[#555] uppercase tracking-wider">Geral</span>
                            </div>
                            
                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-[11px] text-[#666]">Opacidade</span>
                                        <span className="text-[11px] text-white/60 tabular-nums">{layer.opacity}%</span>
                                    </div>
                                    <input type="range" min="0" max="100" value={layer.opacity} onChange={(e) => updateFromSidebar(layer.id, { opacity: parseInt(e.target.value) })} className="w-full" />
                                </div>

                                {(layer.type === 'text' || layer.type === 'marquee') && (
                                    <div>
                                        <span className="block text-[11px] text-[#666] mb-1.5">Conteúdo</span>
                                        <input type="text" value={layer.text} onChange={(e) => updateFromSidebar(layer.id, { text: e.target.value })} className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-3 py-2 text-[13px] text-white focus:border-kick focus:outline-none" />
                                    </div>
                                )}

                                {layer.type === 'media' && (
                                    <div>
                                        <span className="block text-[11px] text-[#666] mb-1.5">Arquivo</span>
                                        <input type="file" accept="image/*,video/mp4" onChange={(e) => e.target.files && updateLayer(layer.id, { file: e.target.files[0] })} className="w-full bg-[#111] border border-[#1e1e1e] rounded-md p-2 text-[12px] text-[#888] file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:bg-kick file:text-black file:text-[11px] file:font-medium hover:file:bg-kick/85" />
                                    </div>
                                )}
                                {layer.type === 'blur' && (
                                    <div>
                                        <span className="block text-[11px] text-[#666] mb-1.5">Intensidade do Desfoque</span>
                                        <input type="range" min="1" max="50" value={layer.blurAmount || 10} onChange={(e) => updateFromSidebar(layer.id, { blurAmount: parseInt(e.target.value) })} className="w-full accent-kick h-1.5 bg-[#222] rounded-full appearance-none" />
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="h-px bg-[#1a1a1a]"></div>

                        {/* POSIÇÃO */}
                        <div>
                            <div className="flex items-center gap-1.5 mb-3">
                                <Move className="w-3 h-3 text-[#444]" />
                                <span className="text-[10px] font-medium text-[#555] uppercase tracking-wider">Posição</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                {(layer.type === 'media' || layer.type === 'box' || layer.type === 'blur') && (
                                    <>
                                        <div>
                                            <span className="block text-[10px] text-[#555] mb-1">W</span>
                                            <input type="number" value={layer.width} onChange={(e) => updateFromSidebar(layer.id, { width: e.target.value })} className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-2.5 py-1.5 text-[12px] text-white tabular-nums focus:border-kick focus:outline-none" />
                                        </div>
                                        <div>
                                            <span className="block text-[10px] text-[#555] mb-1">H</span>
                                            <input type="number" value={layer.height} onChange={(e) => updateFromSidebar(layer.id, { height: e.target.value })} className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-2.5 py-1.5 text-[12px] text-white tabular-nums focus:border-kick focus:outline-none" />
                                        </div>
                                    </>
                                )}

                                {layer.type !== 'marquee' && (
                                    <>
                                        <div>
                                            <span className="block text-[10px] text-[#555] mb-1">X</span>
                                            <input type="number" value={layer.x} onChange={(e) => updateFromSidebar(layer.id, { x: parseInt(e.target.value) || 0 })} className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-2.5 py-1.5 text-[12px] text-white tabular-nums focus:border-kick focus:outline-none" />
                                        </div>
                                        <div>
                                            <span className="block text-[10px] text-[#555] mb-1">Y</span>
                                            <input type="number" value={layer.y} onChange={(e) => updateFromSidebar(layer.id, { y: parseInt(e.target.value) || 0 })} className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-2.5 py-1.5 text-[12px] text-white tabular-nums focus:border-kick focus:outline-none" />
                                        </div>
                                    </>
                                )}

                                {layer.type === 'marquee' && (
                                    <div className="col-span-2">
                                        <span className="block text-[10px] text-[#555] mb-1">Y</span>
                                        <input type="number" value={layer.y} onChange={(e) => updateFromSidebar(layer.id, { y: parseInt(e.target.value) || 0 })} className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-2.5 py-1.5 text-[12px] text-white tabular-nums focus:border-kick focus:outline-none" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ESTILO DO TEXTO */}
                        {(layer.type === 'text' || layer.type === 'clock' || layer.type === 'marquee') && (
                            <>
                                <div className="h-px bg-[#1a1a1a]"></div>
                                <div>
                                    <div className="flex items-center gap-1.5 mb-3">
                                        <Palette className="w-3 h-3 text-[#444]" />
                                        <span className="text-[10px] font-medium text-[#555] uppercase tracking-wider">Aparência</span>
                                    </div>
                                    
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <div className="flex items-center gap-1.5 flex-1 bg-[#111] border border-[#1e1e1e] rounded-md px-2 py-1.5">
                                                <input type="color" value={layer.color} onChange={(e) => updateFromSidebar(layer.id, { color: e.target.value })} className="w-5 h-5 shrink-0 rounded cursor-pointer border-0 p-0 bg-transparent" />
                                                <input type="text" value={layer.color} onChange={(e) => updateFromSidebar(layer.id, { color: e.target.value })} className="flex-1 bg-transparent text-[11px] text-white/70 focus:outline-none uppercase min-w-0" />
                                            </div>
                                            <div className="w-20 shrink-0">
                                                <input type="number" value={layer.fontsize} onChange={(e) => updateFromSidebar(layer.id, { fontsize: e.target.value })} className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-2.5 py-1.5 text-[12px] text-white tabular-nums text-center focus:border-kick focus:outline-none" title="Tamanho" />
                                            </div>
                                        </div>

                                        <select value={layer.font || 'arial'} onChange={(e) => updateFromSidebar(layer.id, { font: e.target.value })} className="w-full bg-[#111] border border-[#1e1e1e] rounded-md px-2.5 py-2 text-[12px] text-white focus:outline-none focus:border-kick">
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
                                </div>

                                <div className="h-px bg-[#1a1a1a]"></div>

                                <div>
                                    <div className="flex items-center gap-1.5 mb-3">
                                        <Palette className="w-3 h-3 text-[#444]" />
                                        <span className="text-[10px] font-medium text-[#555] uppercase tracking-wider">Efeitos</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        {/* FUNDO */}
                                        <div className="bg-[#111] rounded-md border border-[#1e1e1e] overflow-hidden">
                                            <label className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#141414] transition-colors">
                                                <span className="text-[11px] text-[#888]">Fundo</span>
                                                <input type="checkbox" checked={layer.hasBackground} onChange={(e) => updateFromSidebar(layer.id, { hasBackground: e.target.checked })} className="w-3.5 h-3.5 rounded border-[#333] bg-[#0e0e0e] text-kick focus:ring-0 focus:ring-offset-0 cursor-pointer" />
                                            </label>
                                            {layer.hasBackground && (
                                                <div className="px-3 pb-2.5 pt-0.5 border-t border-[#1a1a1a] space-y-2">
                                                    <div className="flex items-center gap-1.5 bg-[#0e0e0e] border border-[#1a1a1a] rounded px-2 py-1.5">
                                                        <input type="color" value={layer.backgroundColor} onChange={(e) => updateFromSidebar(layer.id, { backgroundColor: e.target.value })} className="w-4 h-4 shrink-0 rounded cursor-pointer border-0 p-0 bg-transparent" />
                                                        <input type="text" value={layer.backgroundColor} onChange={(e) => updateFromSidebar(layer.id, { backgroundColor: e.target.value })} className="flex-1 bg-transparent text-[10px] text-white/60 focus:outline-none uppercase min-w-0" />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-[#555] shrink-0">Margem</span>
                                                        <input type="number" value={layer.backgroundPadding} onChange={(e) => updateFromSidebar(layer.id, { backgroundPadding: parseInt(e.target.value) || 0 })} className="flex-1 bg-[#0e0e0e] border border-[#1a1a1a] rounded px-2 py-1 text-[11px] text-white tabular-nums focus:border-kick focus:outline-none" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* SOMBRA */}
                                        <div className="bg-[#111] rounded-md border border-[#1e1e1e] overflow-hidden">
                                            <label className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#141414] transition-colors">
                                                <span className="text-[11px] text-[#888]">Sombra</span>
                                                <input type="checkbox" checked={layer.hasShadow} onChange={(e) => updateFromSidebar(layer.id, { hasShadow: e.target.checked })} className="w-3.5 h-3.5 rounded border-[#333] bg-[#0e0e0e] text-kick focus:ring-0 focus:ring-offset-0 cursor-pointer" />
                                            </label>
                                            {layer.hasShadow && (
                                                <div className="px-3 pb-2.5 pt-0.5 border-t border-[#1a1a1a] space-y-2">
                                                    <div className="flex items-center gap-1.5 bg-[#0e0e0e] border border-[#1a1a1a] rounded px-2 py-1.5">
                                                        <input type="color" value={layer.shadowColor} onChange={(e) => updateFromSidebar(layer.id, { shadowColor: e.target.value })} className="w-4 h-4 shrink-0 rounded cursor-pointer border-0 p-0 bg-transparent" />
                                                        <input type="text" value={layer.shadowColor} onChange={(e) => updateFromSidebar(layer.id, { shadowColor: e.target.value })} className="flex-1 bg-transparent text-[10px] text-white/60 focus:outline-none uppercase min-w-0" />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] text-[#555]">X</span>
                                                            <input type="number" value={layer.shadowX} onChange={(e) => updateFromSidebar(layer.id, { shadowX: parseInt(e.target.value) || 0 })} className="flex-1 bg-[#0e0e0e] border border-[#1a1a1a] rounded px-2 py-1 text-[11px] text-white tabular-nums focus:border-kick focus:outline-none" />
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] text-[#555]">Y</span>
                                                            <input type="number" value={layer.shadowY} onChange={(e) => updateFromSidebar(layer.id, { shadowY: parseInt(e.target.value) || 0 })} className="flex-1 bg-[#0e0e0e] border border-[#1a1a1a] rounded px-2 py-1 text-[11px] text-white tabular-nums focus:border-kick focus:outline-none" />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* BORDA */}
                                        <div className="bg-[#111] rounded-md border border-[#1e1e1e] overflow-hidden">
                                            <label className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#141414] transition-colors">
                                                <span className="text-[11px] text-[#888]">Traçado</span>
                                                <input type="checkbox" checked={layer.hasBorder} onChange={(e) => updateFromSidebar(layer.id, { hasBorder: e.target.checked })} className="w-3.5 h-3.5 rounded border-[#333] bg-[#0e0e0e] text-kick focus:ring-0 focus:ring-offset-0 cursor-pointer" />
                                            </label>
                                            {layer.hasBorder && (
                                                <div className="px-3 pb-2.5 pt-0.5 border-t border-[#1a1a1a] space-y-2">
                                                    <div className="flex items-center gap-1.5 bg-[#0e0e0e] border border-[#1a1a1a] rounded px-2 py-1.5">
                                                        <input type="color" value={layer.borderColor} onChange={(e) => updateFromSidebar(layer.id, { borderColor: e.target.value })} className="w-4 h-4 shrink-0 rounded cursor-pointer border-0 p-0 bg-transparent" />
                                                        <input type="text" value={layer.borderColor} onChange={(e) => updateFromSidebar(layer.id, { borderColor: e.target.value })} className="flex-1 bg-transparent text-[10px] text-white/60 focus:outline-none uppercase min-w-0" />
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-[#555] shrink-0">Largura</span>
                                                        <input type="number" value={layer.borderWidth} onChange={(e) => updateFromSidebar(layer.id, { borderWidth: parseInt(e.target.value) || 0 })} className="flex-1 bg-[#0e0e0e] border border-[#1a1a1a] rounded px-2 py-1 text-[11px] text-white tabular-nums focus:border-kick focus:outline-none" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ESTILO DA CAIXA */}
                        {layer.type === 'box' && (
                            <>
                                <div className="h-px bg-[#1a1a1a]"></div>
                                <div>
                                    <div className="flex items-center gap-1.5 mb-3">
                                        <Palette className="w-3 h-3 text-[#444]" />
                                        <span className="text-[10px] font-medium text-[#555] uppercase tracking-wider">Cor</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-[#111] border border-[#1e1e1e] rounded-md px-2.5 py-2">
                                        <input type="color" value={layer.color.split('@')[0]} onChange={(e) => updateLayer(layer.id, 'color', e.target.value)} className="w-5 h-5 shrink-0 rounded cursor-pointer border-0 p-0 bg-transparent" />
                                        <input type="text" value={layer.color} onChange={(e) => updateLayer(layer.id, 'color', e.target.value)} className="flex-1 bg-transparent text-[12px] text-white/70 focus:outline-none min-w-0" placeholder="#000@0.5" />
                                    </div>
                                </div>
                            </>
                        )}
                     </div>
                  ))}
               </div>
            ) : (
               <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                  <Layout className="w-8 h-8 mb-3 text-[#222]" />
                  <span className="text-[12px] text-[#444]">Selecione um elemento ou crie um novo.</span>
               </div>
            )}
         </div>
      </div>

      {contextMenu && (
         <div 
            className="fixed z-50 bg-[#161616] border border-[#222] rounded-lg py-1 min-w-[140px]"
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
                  <div className="px-3 py-1 text-[10px] text-[#444] font-medium mb-0.5">Adicionar</div>
                  <button onClick={() => addLayer('text')} className="w-full text-left px-3 py-1.5 text-[12px] text-white/80 hover:bg-[#1a1a1a] flex items-center gap-2">
                     <Type className="w-3.5 h-3.5" /> Texto
                  </button>
                  <button onClick={() => addLayer('box')} className="w-full text-left px-3 py-1.5 text-[12px] text-white/80 hover:bg-[#1a1a1a] flex items-center gap-2">
                     <BoxIcon className="w-3.5 h-3.5" /> Caixa
                  </button>
                  <button onClick={() => addLayer('media')} className="w-full text-left px-3 py-1.5 text-[12px] text-white/80 hover:bg-[#1a1a1a] flex items-center gap-2">
                     <ImageIcon className="w-3.5 h-3.5" /> Mídia
                  </button>
               </>
            )}
         </div>
      )}

    </main>
  );
}
