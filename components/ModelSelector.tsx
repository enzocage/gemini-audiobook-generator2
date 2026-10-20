import React from 'react';
import { ModelId } from '../types';
import { Zap, Sparkles, Feather, Star } from 'lucide-react';

interface ModelSelectorProps {
  selectedModel: ModelId;
  onModelChange: (model: ModelId) => void;
  disabled?: boolean;
}

interface ModelOption {
  id: ModelId;
  name: string;
  badge?: string;
  badgeColor?: string;
  sub: string;
  icon: React.ReactNode;
  activeColor: string;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange, disabled }) => {
  const models: ModelOption[] = [
    {
      id: ModelId.Flash38,
      name: 'TTS 3.8 Flash',
      badge: 'Flagship',
      badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      sub: 'Studio acting & accents',
      icon: <Sparkles className="w-3.5 h-3.5 text-emerald-600" />,
      activeColor: 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-400/40 text-emerald-900',
    },
    {
      id: ModelId.Flash38Lite,
      name: '3.8 Flash Lite',
      badge: 'Fast',
      badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
      sub: 'High volume & low cost',
      icon: <Feather className="w-3.5 h-3.5 text-blue-600" />,
      activeColor: 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-400/40 text-blue-900',
    },
    {
      id: ModelId.Flash31,
      name: 'Flash 3.1',
      badge: 'Preview',
      badgeColor: 'bg-orange-100 text-orange-700 border-orange-200',
      sub: 'Expressive preview',
      icon: <Zap className="w-3.5 h-3.5 text-orange-600" />,
      activeColor: 'border-orange-500 bg-orange-50/60 ring-1 ring-orange-400/40 text-orange-900',
    },
    {
      id: ModelId.Flash,
      name: 'Flash 2.5',
      sub: 'Standard fast',
      icon: <Zap className="w-3.5 h-3.5 text-indigo-500" />,
      activeColor: 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-400/40 text-indigo-900',
    },
    {
      id: ModelId.Pro,
      name: 'Pro 2.5',
      sub: 'Pro quality',
      icon: <Star className="w-3.5 h-3.5 text-purple-600" />,
      activeColor: 'border-purple-500 bg-purple-50/60 ring-1 ring-purple-400/40 text-purple-900',
    },
  ];

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-1 gap-1.5">
        {models.map((m) => {
          const isSelected = selectedModel === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onModelChange(m.id)}
              disabled={disabled}
              className={`
                w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition-all flex items-center justify-between
                ${isSelected 
                  ? `${m.activeColor} shadow-xs font-semibold` 
                  : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="shrink-0">{m.icon}</span>
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-zinc-800">{m.name}</span>
                    {m.badge && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded-full border font-medium uppercase tracking-wider ${m.badgeColor}`}>
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-zinc-400 block leading-tight font-normal">
                    {m.sub}
                  </span>
                </div>
              </div>
              <div className="shrink-0 ml-2">
                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isSelected ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-300'}`}>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ModelSelector;