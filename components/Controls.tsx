
import React from 'react';
import { ProcessingParams, ColorMapType } from '../types';

interface ControlsProps {
  params: ProcessingParams;
  onChange: (updates: Partial<ProcessingParams>) => void;
  onReset: () => void;
}

const ControlGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="mb-6">
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4 border-b border-slate-700/50 pb-1">{label}</label>
    <div className="space-y-4">
      {children}
    </div>
  </div>
);

const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  icon?: string;
}> = ({ label, value, min, max, step = 1, onChange, icon }) => (
  <div className="space-y-1 group">
    <div className="flex justify-between text-[11px]">
      <span className="text-slate-400 flex items-center gap-2 group-hover:text-slate-200 transition-colors">
        {icon && <i className={`fas ${icon} text-[9px] w-3 text-emerald-500/70`}></i>}
        {label}
      </span>
      <span className="text-emerald-400 font-mono font-bold bg-emerald-500/10 px-1 rounded">{value.toFixed(step < 1 ? 2 : 0)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-all"
    />
  </div>
);

const COLOR_MAP_LABELS: Partial<Record<ColorMapType, string>> = {
  [ColorMapType.ORIGINAL]: 'Original',
};

const Controls: React.FC<ControlsProps> = ({ params, onChange, onReset }) => {
  return (
    <div className="w-80 bg-slate-900 border-l border-white/5 h-full overflow-y-auto p-6 scrollbar-hide shadow-2xl z-20">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-sm font-bold flex items-center gap-2 tracking-tight">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          SIGNAL ANALYZER
        </h2>
        <button 
          onClick={onReset}
          className="text-[10px] uppercase font-bold text-slate-500 hover:text-emerald-400 transition-colors tracking-tighter"
        >
          Reset Params
        </button>
      </div>

      <ControlGroup label="Pre-Processing">
        <Slider 
          label="De-noise (Median)" 
          value={params.denoise} 
          min={0} 
          max={100} 
          icon="fa-filter"
          onChange={(v) => onChange({ denoise: v })} 
        />
        <Slider 
          label="Sharpen (Kernel)" 
          value={params.sharpness} 
          min={0} 
          max={100} 
          icon="fa-bullseye"
          onChange={(v) => onChange({ sharpness: v })} 
        />
      </ControlGroup>

      <ControlGroup label="Targeted Signal Gain">
        <Slider 
          label="Selective Gain" 
          value={params.selectiveGain} 
          min={0} 
          max={500} 
          icon="fa-microscope"
          onChange={(v) => onChange({ selectiveGain: v })} 
        />
        <Slider 
          label="Gain Threshold" 
          value={params.gainThreshold} 
          min={0} 
          max={150} 
          icon="fa-level-up-alt"
          onChange={(v) => onChange({ gainThreshold: v })} 
        />
      </ControlGroup>

      <ControlGroup label="Signal Extraction">
        <Slider 
          label="Smooth BG Sub." 
          value={params.bgSubtraction} 
          min={0} 
          max={500} 
          icon="fa-eraser"
          onChange={(v) => onChange({ bgSubtraction: v })} 
        />
        <Slider 
          label="Global Signal Boost" 
          value={params.signalBoost} 
          min={0} 
          max={200} 
          icon="fa-bolt"
          onChange={(v) => onChange({ signalBoost: v })} 
        />
        <Slider 
          label="Outline Enhance" 
          value={params.outlineEnhance} 
          min={0} 
          max={100} 
          icon="fa-draw-polygon"
          onChange={(v) => onChange({ outlineEnhance: v })} 
        />
      </ControlGroup>

      <ControlGroup label="Exposure & Gamma">
        <Slider 
          label="Brightness" 
          value={params.brightness} 
          min={-200} 
          max={200} 
          icon="fa-sun"
          onChange={(v) => onChange({ brightness: v })} 
        />
        <Slider 
          label="Contrast" 
          value={params.contrast} 
          min={-200} 
          max={200} 
          icon="fa-adjust"
          onChange={(v) => onChange({ contrast: v })} 
        />
        <Slider 
          label="Gamma (Non-Linear)" 
          value={params.gamma} 
          min={0.01} 
          max={5.0} 
          step={0.01} 
          icon="fa-wave-square"
          onChange={(v) => onChange({ gamma: v })} 
        />
        <div className="flex gap-4 pt-2">
          <Slider 
            label="Black Point" 
            value={params.blackPoint} 
            min={0} 
            max={255} 
            icon="fa-caret-left"
            onChange={(v) => onChange({ blackPoint: v })} 
          />
          <Slider 
            label="White Point" 
            value={params.whitePoint} 
            min={0} 
            max={255} 
            icon="fa-caret-right"
            onChange={(v) => onChange({ whitePoint: v })} 
          />
        </div>
      </ControlGroup>

      <ControlGroup label="Pseudo-Color Mapping">
        <div className="grid grid-cols-2 gap-2">
          {Object.values(ColorMapType).map((map) => (
            <button
              key={map}
              onClick={() => onChange({ colorMap: map })}
              className={`text-[9px] font-bold py-2 px-2 rounded-md border uppercase tracking-tighter transition-all ${
                params.colorMap === map 
                  ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20' 
                  : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {COLOR_MAP_LABELS[map] ?? map}
            </button>
          ))}
        </div>
      </ControlGroup>
      
      <div className="mt-8 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
         <p className="text-[10px] text-slate-400 leading-relaxed italic">
           <i className="fas fa-info-circle mr-1 text-emerald-500"></i>
           <strong>Targeted Enhancing:</strong> 1. Apply <strong>Smooth BG Sub.</strong> to flatten background noise. 2. Set <strong>Gain Threshold</strong> just above the noise floor. 3. Crank up <strong>Selective Gain</strong> to pull out cell details.
         </p>
      </div>
    </div>
  );
};

export default Controls;
