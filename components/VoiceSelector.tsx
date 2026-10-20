import React, { useState, useRef, useMemo, useEffect } from 'react';
import { VoiceName, VOICE_CATALOG, ModelId } from '../types';
import { Play, Square, Loader2, AlertCircle, Search, Star } from 'lucide-react';
import { generateSpeechChunk } from '../services/geminiService';
import { base64ToUint8Array, createWavFile } from '../utils/audioUtils';

interface VoiceSelectorProps {
  selectedVoice: VoiceName;
  onVoiceChange: (voice: VoiceName) => void;
  disabled?: boolean;
  model: ModelId;
  previewText: string;
  styleInstruction: string;
}

const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  selectedVoice,
  onVoiceChange,
  disabled,
  model,
  previewText,
  styleInstruction
}) => {
  const [playingVoice, setPlayingVoice] = useState<VoiceName | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<VoiceName | null>(null);
  const [errorVoice, setErrorVoice] = useState<VoiceName | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'Female' | 'Male' | 'FAV'>('ALL');
  const [favoriteVoices, setFavoriteVoices] = useState<VoiceName[]>(() => {
    try {
      const saved = localStorage.getItem('gemini_fav_voices');
      return saved ? JSON.parse(saved) : [VoiceName.Fenrir, VoiceName.Charon, VoiceName.Zephyr, VoiceName.Aoede];
    } catch {
      return [VoiceName.Fenrir, VoiceName.Charon, VoiceName.Zephyr, VoiceName.Aoede];
    }
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('gemini_fav_voices', JSON.stringify(favoriteVoices));
    } catch {}
  }, [favoriteVoices]);

  const toggleFavorite = (e: React.MouseEvent, voice: VoiceName) => {
    e.stopPropagation();
    setFavoriteVoices(prev =>
      prev.includes(voice) ? prev.filter(v => v !== voice) : [...prev, voice]
    );
  };

  const filteredVoices = useMemo(() => {
    return VOICE_CATALOG.filter(v => {
      if (genderFilter === 'Female' && v.gender !== 'Female') return false;
      if (genderFilter === 'Male' && v.gender !== 'Male') return false;
      if (genderFilter === 'FAV' && !favoriteVoices.includes(v.name)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          v.tone.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.bestFor.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [genderFilter, searchQuery, favoriteVoices]);

  const handlePlayPreview = async (e: React.MouseEvent, voice: VoiceName) => {
    e.stopPropagation();

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (playingVoice === voice) {
      setPlayingVoice(null);
      return;
    }

    setLoadingVoice(voice);
    setErrorVoice(null);
    setErrorMessage(null);

    try {
      let base64Data: string | null = null;
      let retries = 2;
      const textToSpeak = previewText.trim() || 'Es gibt wenige Dinge im Leben, die so fesselnd sind wie eine gute Geschichte.';

      while (retries > 0) {
        try {
          base64Data = await generateSpeechChunk(textToSpeak, voice, model, styleInstruction);
          break;
        } catch (err: any) {
          if (err.message && (err.message.includes('Limit is 0') || err.message.includes('API Key is missing'))) {
            throw err;
          }
          if (err?.isRateLimit && retries > 1) {
            await new Promise(r => setTimeout(r, 1500));
            retries--;
            continue;
          }
          throw err;
        }
      }

      if (!base64Data) throw new Error('Failed to generate preview');

      const pcmData = base64ToUint8Array(base64Data);
      const wavBlob = createWavFile(pcmData);
      const url = URL.createObjectURL(wavBlob);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setPlayingVoice(null);
        URL.revokeObjectURL(url);
      };

      await audio.play();
      setPlayingVoice(voice);
      setLoadingVoice(null);
    } catch (error: any) {
      console.error('Preview failed:', error);
      setLoadingVoice(null);
      setPlayingVoice(null);
      setErrorVoice(voice);
      setErrorMessage(error.message || 'Vorschau fehlgeschlagen');
    }
  };

  const selectedMeta = VOICE_CATALOG.find(v => v.name === selectedVoice);

  return (
    <div className="space-y-2.5">
      {/* Currently Selected Voice Highlight Card */}
      {selectedMeta && (
        <div className="p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-indigo-950">{selectedMeta.name}</span>
              <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                {selectedMeta.gender === 'Female' ? 'Weiblich' : 'Männlich'} • {selectedMeta.tone}
              </span>
            </div>
            <p className="text-[10px] text-indigo-800/80 truncate mt-0.5">{selectedMeta.bestFor}</p>
          </div>
          <button
            type="button"
            onClick={(e) => handlePlayPreview(e, selectedMeta.name)}
            disabled={disabled || (loadingVoice !== null && loadingVoice !== selectedMeta.name)}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold flex items-center gap-1 shrink-0 shadow-xs transition-colors"
          >
            {loadingVoice === selectedMeta.name ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : playingVoice === selectedMeta.name ? (
              <Square className="w-3 h-3 fill-current" />
            ) : (
              <Play className="w-3 h-3 fill-current" />
            )}
            <span>Test</span>
          </button>
        </div>
      )}

      {/* Search & Filter Controls for all 30 Voices */}
      <div className="space-y-1.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="30 Stimmen durchsuchen (z.B. Charon, Krimi, Warm)..."
            className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-indigo-400 outline-none"
          />
        </div>

        <div className="grid grid-cols-4 gap-1">
          {[
            { id: 'ALL', label: `Alle (${VOICE_CATALOG.length})` },
            { id: 'Female', label: 'Weiblich (14)' },
            { id: 'Male', label: 'Männlich (16)' },
            { id: 'FAV', label: `★ Fav (${favoriteVoices.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setGenderFilter(tab.id as any)}
              className={`py-1 px-1 rounded text-[10px] font-semibold transition-colors truncate ${
                genderFilter === tab.id
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable 30-Voice Grid */}
      <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
        {filteredVoices.map((meta) => {
          const voice = meta.name;
          const isSelected = selectedVoice === voice;
          const isPlaying = playingVoice === voice;
          const isLoading = loadingVoice === voice;
          const isError = errorVoice === voice;
          const isFav = favoriteVoices.includes(voice);

          return (
            <div
              key={voice}
              onClick={() => !disabled && onVoiceChange(voice)}
              className={`
                relative group flex flex-col justify-between p-2 rounded-lg border cursor-pointer transition-all
                ${isSelected
                  ? 'bg-indigo-600 border-indigo-500 shadow-sm text-white'
                  : isError
                  ? 'bg-red-50 border-red-200 hover:border-red-300'
                  : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              title={`${meta.name}: ${meta.description} (${meta.bestFor})`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => toggleFavorite(e, voice)}
                    className={`p-0.5 rounded transition-colors ${
                      isFav
                        ? isSelected ? 'text-amber-300' : 'text-amber-400'
                        : isSelected ? 'text-indigo-300 hover:text-white' : 'text-zinc-300 hover:text-amber-400'
                    }`}
                    title="Als Favorit markieren"
                  >
                    <Star className={`w-3 h-3 ${isFav ? 'fill-current' : ''}`} />
                  </button>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider ${
                      isSelected ? 'text-indigo-100' : isError ? 'text-red-400' : 'text-zinc-400'
                    }`}
                  >
                    {meta.gender === 'Female' ? 'Fem' : 'Masc'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => handlePlayPreview(e, voice)}
                  disabled={disabled || (loadingVoice !== null && loadingVoice !== voice)}
                  className={`
                    w-5 h-5 rounded-full flex items-center justify-center transition-all
                    ${isPlaying
                      ? 'bg-white text-indigo-600'
                      : isSelected
                      ? 'bg-indigo-500 text-white hover:bg-white hover:text-indigo-600'
                      : isError
                      ? 'bg-red-100 text-red-500 hover:bg-red-200'
                      : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800'
                    }
                  `}
                  title={`${voice} Probe hören`}
                >
                  {isLoading ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : isPlaying ? (
                    <Square className="w-2 h-2 fill-current" />
                  ) : isError ? (
                    <AlertCircle className="w-3 h-3" />
                  ) : (
                    <Play className="w-2 h-2 ml-0.5 fill-current" />
                  )}
                </button>
              </div>

              <div>
                <div className={`text-xs font-bold leading-tight truncate ${isSelected ? 'text-white' : 'text-zinc-800'}`}>
                  {voice}
                </div>
                <div className={`text-[9px] truncate mt-0.5 ${isSelected ? 'text-indigo-100' : 'text-zinc-400'}`}>
                  {meta.tone}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {errorMessage && (
        <div className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded p-1.5 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{errorMessage}</span>
        </div>
      )}
    </div>
  );
};

export default VoiceSelector;