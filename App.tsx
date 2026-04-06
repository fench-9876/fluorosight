
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import JSZip from 'jszip';
import { ProcessingParams, ColorMapType } from './types';
import { INITIAL_PARAMS } from './constants';
import { processImageData, getHistogram } from './services/imageUtils';
import { buildPresetPayload, parsePresetJson } from './services/paramPreset';
import Controls from './components/Controls';
import Histogram from './components/Histogram';

/** Longest edge for preview processing (full resolution still used for export). */
const PREVIEW_MAX_EDGE = 1152;

function createPreviewImageData(full: ImageData, maxEdge: number): ImageData {
  const w = full.width;
  const h = full.height;
  if (w <= 0 || h <= 0) return full;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  if (scale >= 1) {
    return new ImageData(new Uint8ClampedArray(full.data), w, h);
  }
  const pw = Math.max(1, Math.round(w * scale));
  const ph = Math.max(1, Math.round(h * scale));
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = w;
  srcCanvas.height = h;
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  if (!sctx) return full;
  sctx.putImageData(full, 0, 0);
  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = pw;
  dstCanvas.height = ph;
  const dctx = dstCanvas.getContext('2d', { willReadFrequently: true });
  if (!dctx) return full;
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = 'high';
  dctx.drawImage(srcCanvas, 0, 0, w, h, 0, 0, pw, ph);
  return dctx.getImageData(0, 0, pw, ph);
}

interface ImageEntry {
  id: string;
  name: string;
  originalData: ImageData;
  width: number;
  height: number;
  /** Downscaled RGBA for preview pipeline only. */
  previewOriginal: ImageData;
  previewWidth: number;
  previewHeight: number;
  rawUrl: string;
  processedUrl: string | null;
}

const App: React.FC = () => {
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [params, setParams] = useState<ProcessingParams>(INITIAL_PARAMS);
  const [previewParams, setPreviewParams] = useState<ProcessingParams>(INITIAL_PARAMS);
  const [histogram, setHistogram] = useState<number[]>(new Array(256).fill(0));
  const [isProcessing, setIsProcessing] = useState(false);
  const [viewMode, setViewMode] = useState<'single' | 'split'>('split');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paramsPresetInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewDebounceImageIdRef = useRef<string | null>(null);

  const selectedImage = useMemo(() => images[selectedIndex] || null, [images, selectedIndex]);

  useEffect(() => {
    const imageId = selectedImage?.id ?? null;
    const imageChanged = imageId !== previewDebounceImageIdRef.current;
    if (imageChanged) {
      previewDebounceImageIdRef.current = imageId;
      setPreviewParams(params);
      return;
    }
    const t = window.setTimeout(() => setPreviewParams(params), 200);
    return () => window.clearTimeout(t);
  }, [params, selectedImage?.id]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newEntries: ImageEntry[] = [];
    
    for (const file of Array.from(files)) {
      const entry = await new Promise<ImageEntry>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const data = ctx.getImageData(0, 0, img.width, img.height);
              const previewOriginal = createPreviewImageData(data, PREVIEW_MAX_EDGE);
              resolve({
                id: Math.random().toString(36).substr(2, 9),
                name: file.name,
                originalData: data,
                width: img.width,
                height: img.height,
                previewOriginal,
                previewWidth: previewOriginal.width,
                previewHeight: previewOriginal.height,
                rawUrl: event.target?.result as string,
                processedUrl: null
              });
            }
          };
          img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
      });
      newEntries.push(entry);
    }

    setImages(prev => [...prev, ...newEntries]);
    if (images.length === 0) setSelectedIndex(0);
    // Clear input
    e.target.value = '';
  };

  const processSingleImage = (entry: ImageEntry, parameters: ProcessingParams): string => {
    const canvas = document.createElement('canvas');
    canvas.width = entry.width;
    canvas.height = entry.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const processedPixels = processImageData(
      entry.originalData.data,
      entry.width,
      entry.height,
      parameters
    );

    const processedImageData = new ImageData(processedPixels, entry.width, entry.height);
    ctx.putImageData(processedImageData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  const updateProcessedView = useCallback(() => {
    if (!selectedImage || !canvasRef.current) return;
    setIsProcessing(true);

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Enable high-quality smoothing for the viewer
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const { previewWidth, previewHeight, previewOriginal } = selectedImage;
    canvasRef.current.width = previewWidth;
    canvasRef.current.height = previewHeight;

    const processedPixels = processImageData(
      previewOriginal.data,
      previewWidth,
      previewHeight,
      previewParams
    );

    const processedImageData = new ImageData(processedPixels, previewWidth, previewHeight);
    ctx.putImageData(processedImageData, 0, 0);
    setHistogram(getHistogram(processedPixels));
    setIsProcessing(false);
  }, [selectedImage, previewParams]);

  useEffect(() => {
    updateProcessedView();
  }, [updateProcessedView]);

  const downloadAllAsZip = async () => {
    if (images.length === 0) return;
    const total = images.length;
    setIsZipping(true);
    setExportProgress(0);

    const waitForPaint = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

    const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

    try {
      await waitForPaint();

      const zip = new JSZip();

      for (let i = 0; i < images.length; i++) {
        const entry = images[i];
        const dataUrl = processSingleImage(entry, params);
        const base64Data = dataUrl.split(',')[1];
        const filename = entry.name.replace(/\.[^/.]+$/, "") + "_enhanced.png";
        zip.file(filename, base64Data, { base64: true });
        setExportProgress(Math.round(((i + 1) / total) * 70));
        await yieldToMain();
      }

      const content = await zip.generateAsync({ type: 'blob' }, (meta) => {
        const p = typeof meta.percent === 'number' ? meta.percent : 0;
        setExportProgress(70 + Math.round((p / 100) * 30));
      });

      const blobUrl = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `FluoroSight_Export_${Date.now()}.zip`;
      link.click();
      URL.revokeObjectURL(blobUrl);
      setExportProgress(100);
    } finally {
      setIsZipping(false);
      setExportProgress(0);
    }
  };

  const deleteImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = images.findIndex(img => img.id === id);
    if (idx === -1) return;
    
    setImages(prev => prev.filter(img => img.id !== id));
    if (selectedIndex >= images.length - 1) {
      setSelectedIndex(Math.max(0, images.length - 2));
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFocusMode(true);
    } else {
      document.exitFullscreen();
      setIsFocusMode(false);
    }
  };

  const handleParamsPresetFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parsePresetJson(text);
      if (parsed) {
        setParams(parsed);
      } else {
        alert('Invalid preset file. Choose a valid FluoroSight JSON preset.');
      }
      if (paramsPresetInputRef.current) paramsPresetInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const exportParamsPreset = async () => {
    const json = buildPresetPayload(params);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const suggestedName = 'fluorosight-preset.json';

    const w = window as Window & {
      showSaveFilePicker?: (options?: {
        suggestedName?: string;
        types?: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<FileSystemFileHandle>;
    };

    if (typeof w.showSaveFilePicker === 'function') {
      try {
        const handle = await w.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [
            {
              description: 'FluoroSight preset',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = suggestedName;
    link.click();
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <div ref={containerRef} className="flex h-screen w-screen overflow-hidden bg-slate-950 font-sans transition-all duration-500">
      {/* Sidebar / Left UI */}
      {!isFocusMode && (
        <div className="flex flex-col w-20 bg-slate-900 border-r border-slate-800 items-center py-6 gap-6 shrink-0 z-30">
          <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <i className="fas fa-microscope text-white text-xl"></i>
          </div>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all group"
            title="Upload Multiple Images"
          >
            <i className="fas fa-plus text-lg"></i>
          </button>

          <button
            type="button"
            onClick={() => paramsPresetInputRef.current?.click()}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Load parameter preset (JSON). Chrome/Edge: pick a file. Use before or after uploading images."
          >
            <i className="fas fa-file-import text-lg"></i>
          </button>

          <button
            type="button"
            onClick={() => void exportParamsPreset()}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Export parameters as JSON. Chrome/Edge: Save As dialog; other browsers: downloads fluorosight-preset.json."
          >
            <i className="fas fa-file-export text-lg"></i>
          </button>

          <button 
            onClick={() => setViewMode(prev => prev === 'single' ? 'split' : 'single')}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${viewMode === 'split' ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="Toggle Comparison"
          >
            <i className={`fas ${viewMode === 'split' ? 'fa-columns' : 'fa-square'} text-lg`}></i>
          </button>

          <button 
            onClick={toggleFullScreen}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            title="Focus Mode (Full Workspace)"
          >
            <i className="fas fa-expand-arrows-alt text-lg"></i>
          </button>

          <button 
            onClick={downloadAllAsZip}
            disabled={images.length === 0 || isZipping}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isZipping ? 'text-emerald-400 animate-spin' : 'text-slate-400 hover:text-white hover:bg-slate-800'} disabled:opacity-30 disabled:cursor-not-allowed`}
            title="Export All as ZIP"
          >
            <i className={`fas ${isZipping ? 'fa-spinner' : 'fa-file-archive'} text-lg`}></i>
          </button>

          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            multiple
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <input
            ref={paramsPresetInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleParamsPresetFile}
            className="hidden"
          />
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0a0f1d] relative">
        {/* Header */}
        {!isFocusMode && (
          <header className="h-16 border-b border-slate-800 px-8 flex items-center justify-between shrink-0 bg-slate-900/50 backdrop-blur-md z-30">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-sm font-bold tracking-widest text-slate-300 uppercase">FluoroSight</h1>
                <p className="text-[10px] text-slate-500 font-medium">Precision Bio-Imaging Processor</p>
              </div>
              {images.length > 0 && (
                <div className="bg-slate-800/50 px-3 py-1 rounded-md border border-slate-700 ml-4 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Batch:</span>
                  <span className="text-[10px] text-emerald-400 font-mono">{selectedIndex + 1} / {images.length}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {isProcessing && (
                <span className="flex items-center gap-2 text-xs text-emerald-400">
                  <i className="fas fa-circle-notch fa-spin"></i>
                  Processing...
                </span>
              )}
              {isZipping && (
                <div className="flex flex-col gap-1.5 min-w-[200px] max-w-xs">
                  <span className="flex items-center gap-2 text-xs text-blue-400">
                    <i className="fas fa-file-archive animate-pulse"></i>
                    Exporting… {exportProgress}%
                  </span>
                  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-[width] duration-150 ease-out"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="h-4 w-px bg-slate-800 mx-2"></div>
              <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
                 <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Status:</span>
                 <span className={`w-2 h-2 rounded-full ${images.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
                 <span className="text-[10px] text-slate-200">{images.length > 0 ? `${images.length} Image(s) Loaded` : 'No Data'}</span>
              </div>
            </div>
          </header>
        )}

        {/* Exit Focus Button (Overlay) */}
        {isFocusMode && (
          <button 
            onClick={() => setIsFocusMode(false)}
            className="absolute top-6 left-6 z-50 p-3 bg-slate-900/80 hover:bg-slate-800 text-white rounded-full border border-slate-700 shadow-xl transition-all group"
            title="Exit Focus Mode"
          >
            <i className="fas fa-compress-arrows-alt text-lg group-hover:scale-110 transition-transform"></i>
          </button>
        )}

        {/* Viewer */}
        <main className={`flex-1 relative overflow-hidden flex items-center justify-center bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 to-black ${isFocusMode ? 'p-0' : 'p-8 pb-4'}`}>
          {!selectedImage ? (
            <div className="text-center space-y-4 max-w-sm">
              <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-700">
                <i className="fas fa-images text-slate-500 text-3xl"></i>
              </div>
              <h3 className="text-xl font-semibold text-slate-200">Batch Signal Enhancement</h3>
              <p className="text-sm text-slate-500">Upload multiple cell microscopy images to process them all with fixed enhancement parameters.</p>
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-emerald-500/20"
                >
                  Upload Images
                </button>
                <button
                  type="button"
                  onClick={() => paramsPresetInputRef.current?.click()}
                  className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-sm font-medium transition-all"
                  title="Load a saved JSON preset before uploading so the same parameters apply to new images."
                >
                  Load preset (JSON)
                </button>
              </div>
            </div>
          ) : (
            <div className={`flex w-full h-full ${isFocusMode ? 'gap-0' : 'gap-8'} ${viewMode === 'split' ? 'items-stretch' : 'items-center justify-center'} transition-all duration-500`}>
              {viewMode === 'split' && (
                <div className={`flex-1 flex flex-col bg-slate-950 overflow-hidden shadow-2xl ${isFocusMode ? 'border-r border-slate-800' : 'rounded-2xl border border-slate-800'}`}>
                  {!isFocusMode && (
                    <div className="bg-slate-900/80 px-4 py-2 flex justify-between items-center border-b border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[200px]">{selectedImage.name} (RAW)</span>
                    </div>
                  )}
                  <div className="flex-1 flex items-center justify-center p-4">
                    <img src={selectedImage.rawUrl} className="max-w-full max-h-full object-contain" alt="Raw" />
                  </div>
                </div>
              )}
              
              <div className={`flex-1 flex flex-col bg-slate-950 overflow-hidden shadow-2xl relative ${isFocusMode ? '' : 'rounded-2xl border border-slate-800'}`}>
                {!isFocusMode && (
                  <div className="bg-slate-900/80 px-4 py-2 flex justify-between items-center border-b border-slate-800">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Enhanced Output</span>
                    <div className="flex gap-2">
                      <span className="text-[10px] text-slate-500">{selectedImage.width}x{selectedImage.height}px</span>
                    </div>
                  </div>
                )}
                <div className="flex-1 flex items-center justify-center p-4">
                  <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Bottom Panel: Gallery & Histogram */}
        {images.length > 0 && !isFocusMode && (
          <footer className="h-64 border-t border-slate-800 bg-slate-900/30 flex flex-col shrink-0 z-30 overflow-hidden">
            {/* Gallery Strip */}
            <div className="h-24 bg-slate-950/50 border-b border-slate-800 px-6 flex items-center gap-4 overflow-x-auto scrollbar-hide py-2">
              {images.map((img, idx) => (
                <div 
                  key={img.id}
                  onClick={() => setSelectedIndex(idx)}
                  className={`group relative h-16 min-w-[64px] rounded-lg border-2 cursor-pointer transition-all ${selectedIndex === idx ? 'border-emerald-500 scale-105 shadow-lg shadow-emerald-500/20' : 'border-slate-800 hover:border-slate-600'}`}
                >
                  <img src={img.rawUrl} className="w-full h-full object-cover rounded-md" />
                  <button 
                    onClick={(e) => deleteImage(img.id, e)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                  {selectedIndex === idx && (
                    <div className="absolute inset-0 bg-emerald-500/10 pointer-events-none rounded-md"></div>
                  )}
                </div>
              ))}
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="h-16 min-w-[64px] border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-600 hover:text-emerald-500 hover:border-emerald-500/50 transition-all"
              >
                <i className="fas fa-plus"></i>
              </button>
            </div>

            {/* Stats Panel */}
            <div className="flex-1 flex px-8 py-3 gap-8">
              <div className="w-1/3">
                <Histogram data={histogram} color={params.colorMap === ColorMapType.GRAYSCALE ? '#64748b' : '#10b981'} />
              </div>
              <div className="flex-1 grid grid-cols-3 gap-6">
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col justify-center">
                   <span className="text-[9px] text-slate-500 uppercase font-bold mb-1 tracking-wider">Mean Intensity</span>
                   <span className="text-lg font-mono text-slate-200">
                     {(() => {
                       const weighted = histogram.reduce((acc, c, i) => acc + c * i, 0);
                       const total = histogram.reduce((acc, c) => acc + c, 0);
                       return total > 0 ? (weighted / total).toFixed(2) : '0.00';
                     })()}
                   </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col justify-center">
                   <span className="text-[9px] text-slate-500 uppercase font-bold mb-1 tracking-wider">Peak Level</span>
                   <span className="text-lg font-mono text-slate-200">
                     {histogram.indexOf(Math.max(...histogram))}
                   </span>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex flex-col justify-center">
                   <span className="text-[9px] text-slate-500 uppercase font-bold mb-1 tracking-wider">Parameters</span>
                   <span className="text-[11px] font-mono text-emerald-400">Fixed for all</span>
                </div>
              </div>
            </div>
          </footer>
        )}
      </div>

      {/* Controls Sidebar - Parameters automatically apply to selected image */}
      <Controls 
        params={params} 
        onChange={(updates) => setParams(prev => ({ ...prev, ...updates }))}
        onReset={() => setParams(INITIAL_PARAMS)}
      />
    </div>
  );
};

export default App;
