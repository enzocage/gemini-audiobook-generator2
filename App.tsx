import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Play,
  Square,
  Download,
  Loader2,
  Sparkles,
  StopCircle,
  Scissors,
  Volume2,
  X,
  Settings,
  Key,
  CheckCircle,
  AlertTriangle,
  ShieldCheck,
  LayoutTemplate,
  ChevronRight,
  Zap,
  Image as ImageIcon,
  Wand2,
  Languages,
  MessageSquare,
  HardDrive,
  Terminal,
  Copy,
  Check,
  BatteryCharging,
  Clock,
  Layers,
  Trash2,
  FileText,
  BookMarked,
  Sliders,
  Sparkle,
  RefreshCw,
  Subtitles,
  Save,
  FolderOpen,
  Flame,
  Music,
  Moon
} from 'lucide-react';
import {
  VoiceName,
  VOICE_CATALOG,
  ModelId,
  AudioChunk,
  GenerationState,
  AudioFormat,
  GeneratedImage,
  PronunciationRule
} from './types';
import {
  createSmartChunks,
  countWords,
  isSentenceEnd,
  base64ToUint8Array,
  concatenateAudioBuffers,
  createWavFile,
  createMp3File,
  mergeMp3BlobsZeroCopy,
  calculatePcmDurationSec,
  formatDurationHMS,
  cleanAndNormalizeManuscript,
  applyPronunciationLexicon,
  detectChapterTitle,
  generateSubtitles,
  generateChapterTimestamps,
  AmbienceSoundEngine
} from './utils/audioUtils';
import {
  saveChunkToDisk,
  loadAllChunksFromDisk,
  clearAllChunksFromDisk,
  saveProjectMetaToDisk,
  loadProjectMetaFromDisk,
  computeSimpleHash
} from './utils/storageUtils';
import {
  generateSpeechChunk,
  setCustomApiKey,
  validateApiKey,
  getActiveKeyDetails,
  generateStyleDescription,
  generateNanobanaImage,
  generateScenePrompts,
  translateText
} from './services/geminiService';
import VoiceSelector from './components/VoiceSelector';
import ModelSelector from './components/ModelSelector';
import FormatSelector from './components/FormatSelector';
import TextInput from './components/TextInput';

const CHUNKS_PER_PAGE = 40;

const STYLE_PRESETS = [
  { label: 'Krimi / Thriller', prompt: 'Spannend, ernst, leicht düster und fesselnd mit bewussten dramatischen Pausen.' },
  { label: 'Epische Fantasy', prompt: 'Warm, bildgewaltig, erhaben und erzählerisch wie ein klassischer Märchenerzähler.' },
  { label: 'Sachbuch Klar', prompt: 'Sachlich, präzise, freundlich, ruhig und hervorragend artikuliert.' },
  { label: 'Gute-Nacht Sanft', prompt: 'Sehr ruhig, sanft, langsam, beruhigend und warmherzig.' },
  { label: 'Hörspiel Dynamisch', prompt: 'Lebendig, emotional ausdrucksstark mit klarem Schauspiel in Dialogen.' },
  { label: 'Flüstern / Mystery', prompt: 'Geheimnisvoll, leise, intim und fast flüsternd.' },
];

const App: React.FC = () => {
  const [projectName, setProjectName] = useState<string>('Mein 30h Hörbuch');
  const [text, setText] = useState<string>('');
  const [voice, setVoice] = useState<VoiceName>(VoiceName.Fenrir);
  const [model, setModel] = useState<ModelId>(ModelId.Flash38Lite);
  const [format, setFormat] = useState<AudioFormat>('mp3');

  // 30-Hour Long-Form Settings (Strategy A & B)
  const [chunkTargetWords, setChunkTargetWords] = useState<number>(500);
  const [basePacingSec, setBasePacingSec] = useState<number>(3.5);
  const [autoDownloadChunks, setAutoDownloadChunks] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const wakeLockRef = useRef<any>(null);

  // Disk Cache & Studio Modals
  const [diskCacheCount, setDiskCacheCount] = useState<number>(0);
  const [diskCacheBytes, setDiskCacheBytes] = useState<number>(0);
  const [diskCacheDurationSec, setDiskCacheDurationSec] = useState<number>(0);
  const [showFfmpegModal, setShowFfmpegModal] = useState<boolean>(false);
  const [showLexiconModal, setShowLexiconModal] = useState<boolean>(false);
  const [CopiedState, setCopiedState] = useState<string | null>(null);
  const [timelinePage, setTimelinePage] = useState<number>(0);

  // Feature: Pronunciation Lexicon Rules
  const [pronunciationRules, setPronunciationRules] = useState<PronunciationRule[]>(() => {
    try {
      const saved = localStorage.getItem('gemini_pronunciation_rules');
      return saved ? JSON.parse(saved) : [
        { id: '1', original: 'AI', phonetic: 'Ey-Ai' },
        { id: '2', original: 'Cthulhu', phonetic: 'Kuh-tuh-luh' }
      ];
    } catch {
      return [];
    }
  });
  const [newRuleOrig, setNewRuleOrig] = useState('');
  const [newRulePhon, setNewRulePhon] = useState('');

  // Feature: Vocal Parameter Controls (Tempo & Timbre)
  const [speakingRate, setSpeakingRate] = useState<'Slow' | 'Normal' | 'Brisk'>('Normal');
  const [vocalTimbre, setVocalTimbre] = useState<'Natural' | 'Deep' | 'Warm' | 'Crisp'>('Natural');

  // Feature: AI Cover Art Generator
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [isGeneratingCover, setIsGeneratingCover] = useState<boolean>(false);

  // Feature: Background Ambience Mixer, Playback Speed & Sleep Timer
  const [ambiencePreset, setAmbiencePreset] = useState<'none' | 'rain' | 'fire' | 'forest' | 'vinyl'>('none');
  const [ambienceVolume, setAmbienceVolume] = useState<number>(0.15);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [sleepTimerMin, setSleepTimerMin] = useState<number>(0);
  const ambienceEngineRef = useRef<AmbienceSoundEngine | null>(null);

  // Feature: Single Chunk Mini-Player & Re-Roll
  const [playingChunkId, setPlayingChunkId] = useState<number | null>(null);
  const [rerollingChunkId, setRerollingChunkId] = useState<number | null>(null);
  const singleChunkAudioRef = useRef<HTMLAudioElement | null>(null);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [userApiKey, setUserApiKey] = useState('');
  const [keyStatus, setKeyStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [keyStatusMessage, setKeyStatusMessage] = useState('');

  // TTS Controls
  const [ttsStyle, setTtsStyle] = useState<string>('');
  const [demoText, setDemoText] = useState<string>('Es gibt wenige Dinge im Leben, die so unpraktisch sind wie das Sterben.');
  const [demoLanguage, setDemoLanguage] = useState<string>('German');
  const [isTranslating, setIsTranslating] = useState(false);

  // Preview & Selection
  const [previewChunks, setPreviewChunks] = useState<string[]>([]);
  const [startChunkIndex, setStartChunkIndex] = useState<number>(0);

  // Audio playback state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewChunkCount, setPreviewChunkCount] = useState<number>(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoResumeRef = useRef<{ shouldResume: boolean; startTime: number }>({ shouldResume: false, startTime: 0 });
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  const [audioChunks, setAudioChunks] = useState<AudioChunk[]>([]);
  const [generationState, setGenerationState] = useState<GenerationState>({
    isGenerating: false,
    progress: 0,
    totalChunks: 0,
    currentChunkIndex: 0
  });
  const [finalBlob, setFinalBlob] = useState<Blob | null>(null);

  // Image Generation State
  const [globalStylePrompt, setGlobalStylePrompt] = useState<string | null>(null);
  const [imageCounts, setImageCounts] = useState<Record<number, number>>({});

  const abortRef = useRef<boolean>(false);
  const skipRetryRef = useRef<boolean>(false);

  // Save pronunciation rules to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('gemini_pronunciation_rules', JSON.stringify(pronunciationRules));
    } catch {}
  }, [pronunciationRules]);

  // Combined effective TTS style instruction (merges vocal parameters + user style prompt)
  const effectiveStyleInstruction = useMemo(() => {
    const parts: string[] = [];
    if (speakingRate === 'Slow') parts.push('Speak at a slow, deliberate, unhurried pace');
    if (speakingRate === 'Brisk') parts.push('Speak at a brisk, dynamic, engaging pace');
    if (vocalTimbre === 'Deep') parts.push('Use a deep, resonant chest voice');
    if (vocalTimbre === 'Warm') parts.push('Use a warm, intimate, comforting tone');
    if (vocalTimbre === 'Crisp') parts.push('Use crisp, studio-clear articulation');
    if (ttsStyle.trim()) parts.push(ttsStyle.trim());
    return parts.join('. ');
  }, [speakingRate, vocalTimbre, ttsStyle]);

  // Ambience Mixer Effect
  useEffect(() => {
    if (!ambienceEngineRef.current) {
      ambienceEngineRef.current = new AmbienceSoundEngine();
    }
    if (ambiencePreset === 'none') {
      ambienceEngineRef.current.stop();
    } else {
      ambienceEngineRef.current.start(ambiencePreset, ambienceVolume);
    }
    return () => {
      ambienceEngineRef.current?.stop();
    };
  }, [ambiencePreset]);

  useEffect(() => {
    ambienceEngineRef.current?.setVolume(ambienceVolume);
  }, [ambienceVolume]);

  // Sync Playback Speed to <audio> element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, previewUrl, finalBlob]);

  // Sleep Timer Effect
  useEffect(() => {
    if (sleepTimerMin <= 0) return;
    const timer = setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      ambienceEngineRef.current?.stop();
      setAmbiencePreset('none');
      setSleepTimerMin(0);
    }, sleepTimerMin * 60 * 1000);
    return () => clearTimeout(timer);
  }, [sleepTimerMin]);

  // Initialize Custom Key from LocalStorage & Restore Disk Cache from IndexedDB
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setUserApiKey(savedKey);
      setCustomApiKey(savedKey);
    }

    (async () => {
      const [savedMeta, savedRecords] = await Promise.all([
        loadProjectMetaFromDisk(),
        loadAllChunksFromDisk()
      ]);

      if (savedRecords.length > 0) {
        const totalBytes = savedRecords.reduce((acc, r) => acc + (r.byteSize || r.mp3Blob.size), 0);
        const totalDur = savedRecords.reduce((acc, r) => acc + (r.durationSec || 0), 0);
        setDiskCacheCount(savedRecords.length);
        setDiskCacheBytes(totalBytes);
        setDiskCacheDurationSec(totalDur);
      }

      if (savedMeta && savedMeta.text) {
        setProjectName(savedMeta.projectName || 'Mein 30h Hörbuch');
        setText(savedMeta.text);
        if (savedMeta.chunkTargetWords) setChunkTargetWords(savedMeta.chunkTargetWords);
        const chunks = createSmartChunks(savedMeta.text, savedMeta.chunkTargetWords || 500);
        setPreviewChunks(chunks);

        const recordMap = new Map(savedRecords.map(r => [r.chunkIndex, r]));
        let firstIncomplete = 0;
        const restoredChunks: AudioChunk[] = chunks.map((t, idx) => {
          const rec = recordMap.get(idx);
          const expectedHash = computeSimpleHash(t);
          const chapterTitle = detectChapterTitle(t, idx);
          if (rec && rec.textHash === expectedHash) {
            if (idx === firstIncomplete) firstIncomplete = idx + 1;
            return {
              id: idx,
              text: t,
              status: 'completed',
              mp3Blob: rec.mp3Blob,
              durationSec: rec.durationSec,
              chapterTitle,
              images: []
            };
          }
          return {
            id: idx,
            text: t,
            status: 'pending',
            chapterTitle,
            images: []
          };
        });
        setAudioChunks(restoredChunks);
        if (firstIncomplete < chunks.length) {
          setStartChunkIndex(firstIncomplete);
        }
      }
    })();
  }, []);

  // Screen Wake Lock Manager
  const requestWakeLock = useCallback(async () => {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setWakeLockActive(true);
        wakeLockRef.current.addEventListener('release', () => {
          setWakeLockActive(false);
        });
      } catch (err) {
        setWakeLockActive(false);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (e) {}
    }
    setWakeLockActive(false);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && generationState.isGenerating) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [generationState.isGenerating, requestWakeLock]);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setUserApiKey(key);
    const trimmed = key.trim();
    setCustomApiKey(trimmed);
    setKeyStatus('idle');
    setKeyStatusMessage('');

    if (trimmed) {
      localStorage.setItem('gemini_api_key', trimmed);
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  };

  const testApiKey = async () => {
    const keyToTest = userApiKey.trim() || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
    if (!keyToTest) {
      setKeyStatus('invalid');
      setKeyStatusMessage('Bitte gib einen API-Key ein.');
      return;
    }
    setKeyStatus('validating');
    try {
      const res = await validateApiKey(keyToTest, model);
      setKeyStatus('valid');
      setKeyStatusMessage(res.message);
    } catch (e: any) {
      setKeyStatus('invalid');
      setKeyStatusMessage(e.message || 'Validierung fehlgeschlagen');
    }
  };

  // --- COST & 30H DURATION ESTIMATION LOGIC ---
  const costStats = useMemo(() => {
    const charCount = text.length;
    const totalWords = countWords(text);
    const estimatedTokens = Math.ceil(charCount / 4);

    let pricingPerMillion = 0.10;
    if (model === ModelId.Pro) {
      pricingPerMillion = 1.25;
    } else if (model === ModelId.Flash38) {
      pricingPerMillion = 0.15;
    } else if (model === ModelId.Flash38Lite) {
      pricingPerMillion = 0.05;
    } else if (model === ModelId.Flash31) {
      pricingPerMillion = 0.10;
    } else if (model === ModelId.Flash) {
      pricingPerMillion = 0.10;
    }
    const estimatedCost = (estimatedTokens / 1_000_000) * pricingPerMillion;

    const estimatedAudioMinutes = totalWords / 150;
    const estimatedAudioHours = estimatedAudioMinutes / 60;
    const estimatedChunks = totalWords > 0 ? Math.ceil(totalWords / chunkTargetWords) : 0;

    return {
      words: totalWords,
      tokens: estimatedTokens,
      cost: estimatedCost.toFixed(4),
      minutes: estimatedAudioMinutes.toFixed(1),
      hours: estimatedAudioHours.toFixed(1),
      estimatedChunks,
      currency: '$'
    };
  }, [text, model, chunkTargetWords]);

  const buildChunksForText = useCallback(async (inputText: string, targetWords: number) => {
    if (!inputText.trim()) return;
    const chunks = createSmartChunks(inputText, targetWords);
    setPreviewChunks(chunks);
    setTimelinePage(0);

    const savedRecords = await loadAllChunksFromDisk();
    const recordMap = new Map(savedRecords.map(r => [r.chunkIndex, r]));

    let firstPending = 0;
    const nextAudioChunks: AudioChunk[] = chunks.map((t, i) => {
      const rec = recordMap.get(i);
      const hash = computeSimpleHash(t);
      const chapterTitle = detectChapterTitle(t, i);
      if (rec && rec.textHash === hash) {
        if (i === firstPending) firstPending = i + 1;
        return {
          id: i,
          text: t,
          status: 'completed',
          mp3Blob: rec.mp3Blob,
          durationSec: rec.durationSec,
          chapterTitle,
          images: []
        };
      }
      return {
        id: i,
        text: t,
        status: 'pending',
        chapterTitle,
        images: []
      };
    });

    setAudioChunks(nextAudioChunks);
    setStartChunkIndex(firstPending < chunks.length ? firstPending : 0);

    await saveProjectMetaToDisk({
      id: 'current',
      projectName,
      text: inputText,
      chunkTargetWords: targetWords,
      voice,
      model,
      updatedAt: Date.now()
    });
  }, [projectName, voice, model]);

  const handlePreviewChunks = () => {
    buildChunksForText(text, chunkTargetWords);
  };

  // Feature: Smart Manuscript Cleaner
  const handleCleanManuscript = () => {
    if (!text.trim()) return;
    const cleaned = cleanAndNormalizeManuscript(text);
    setText(cleaned);
    buildChunksForText(cleaned, chunkTargetWords);
  };

  // Feature: AI Audiobook Cover Art Generator
  const handleGenerateCoverArt = async () => {
    if (!text.trim() && !projectName.trim()) return;
    setIsGeneratingCover(true);
    try {
      const sampleSnippet = text.slice(0, 1500) || projectName;
      const styleDesc = await generateStyleDescription(sampleSnippet);
      const coverPrompt = `High-resolution square audiobook cover art for "${projectName}". Theme and atmosphere: ${styleDesc}. Cinematic lighting, artistic book cover illustration, no text clutter.`;
      const imgData = await generateNanobanaImage(coverPrompt);
      setCoverImageUrl(imgData);
    } catch (err) {
      console.error('Cover generation failed:', err);
    } finally {
      setIsGeneratingCover(false);
    }
  };

  // Feature: Project JSON Export & Import
  const handleExportProjectJson = () => {
    const payload = {
      version: '3.8-studio',
      projectName,
      text,
      voice,
      model,
      chunkTargetWords,
      basePacingSec,
      ttsStyle,
      speakingRate,
      vocalTimbre,
      pronunciationRules,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const safeName = (projectName.trim() || 'hoerbuch').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadBlob(blob, `${safeName}.audiobook.json`);
  };

  const handleImportProjectJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.projectName) setProjectName(parsed.projectName);
        if (parsed.text) setText(parsed.text);
        if (parsed.voice) setVoice(parsed.voice);
        if (parsed.model) setModel(parsed.model);
        if (parsed.chunkTargetWords) setChunkTargetWords(parsed.chunkTargetWords);
        if (parsed.ttsStyle !== undefined) setTtsStyle(parsed.ttsStyle);
        if (parsed.speakingRate) setSpeakingRate(parsed.speakingRate);
        if (parsed.vocalTimbre) setVocalTimbre(parsed.vocalTimbre);
        if (Array.isArray(parsed.pronunciationRules)) setPronunciationRules(parsed.pronunciationRules);
        if (parsed.text) {
          buildChunksForText(parsed.text, parsed.chunkTargetWords || 500);
        }
      } catch (err) {
        console.error('Invalid project JSON', err);
      }
    };
    reader.readAsText(file);
  };

  const handleClearDiskCache = async () => {
    await clearAllChunksFromDisk();
    setDiskCacheCount(0);
    setDiskCacheBytes(0);
    setDiskCacheDurationSec(0);
    setFinalBlob(null);
    setPreviewUrl(null);
    setStartChunkIndex(0);
    setAudioChunks(prev => prev.map(c => ({ ...c, status: 'pending', mp3Blob: undefined, data: undefined, durationSec: undefined })));
  };

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, []);

  // Feature: Play or Re-Roll a single individual chunk
  const handlePlaySingleChunk = (chunkIndex: number) => {
    if (singleChunkAudioRef.current) {
      singleChunkAudioRef.current.pause();
      singleChunkAudioRef.current = null;
    }
    if (playingChunkId === chunkIndex) {
      setPlayingChunkId(null);
      return;
    }
    const chunk = audioChunks[chunkIndex];
    if (!chunk?.mp3Blob) return;
    const url = URL.createObjectURL(chunk.mp3Blob);
    const audio = new Audio(url);
    audio.playbackRate = playbackSpeed;
    singleChunkAudioRef.current = audio;
    audio.onended = () => {
      setPlayingChunkId(null);
      URL.revokeObjectURL(url);
    };
    audio.play();
    setPlayingChunkId(chunkIndex);
  };

  const handleRerollSingleChunk = async (chunkIndex: number) => {
    const chunkText = previewChunks[chunkIndex];
    if (!chunkText || rerollingChunkId !== null) return;

    setRerollingChunkId(chunkIndex);
    try {
      const chunkObj = audioChunks[chunkIndex];
      const activeVoice = chunkObj?.customVoice || voice;
      const activeStyle = chunkObj?.customStyle
        ? `${effectiveStyleInstruction}. ${chunkObj.customStyle}`
        : effectiveStyleInstruction;
      const spokenText = applyPronunciationLexicon(chunkText, pronunciationRules);

      const base64Data = await generateSpeechChunk(spokenText, activeVoice, model, activeStyle);
      const pcmData = base64ToUint8Array(base64Data);
      const mp3Blob = createMp3File(pcmData);
      const durationSec = calculatePcmDurationSec(pcmData.byteLength);

      await saveChunkToDisk({
        chunkIndex,
        textHash: computeSimpleHash(chunkText),
        mp3Blob,
        durationSec,
        byteSize: mp3Blob.size,
        wordCount: countWords(chunkText),
        createdAt: Date.now()
      });

      setAudioChunks(prev => prev.map(c => c.id === chunkIndex ? {
        ...c,
        status: 'completed',
        mp3Blob,
        durationSec
      } : c));
    } catch (err) {
      console.error('Re-roll failed:', err);
    } finally {
      setRerollingChunkId(null);
    }
  };

  const handleChunkVoiceChange = (chunkIndex: number, newVoice: string) => {
    setAudioChunks(prev => prev.map(c => {
      if (c.id !== chunkIndex) return c;
      return {
        ...c,
        customVoice: newVoice ? (newVoice as VoiceName) : undefined
      };
    }));
  };

  // Zero-RAM-Copy Blob Builder
  const generateBlobFromChunks = useCallback((chunks: AudioChunk[], targetFormat: AudioFormat): Blob | null => {
    const completedChunks = chunks.filter(c => c.status === 'completed' && (c.mp3Blob || c.data));
    if (completedChunks.length === 0) return null;

    if (targetFormat === 'mp3' || completedChunks.every(c => !!c.mp3Blob && !c.data)) {
      const mp3Blobs = completedChunks.map(c => c.mp3Blob || createMp3File(c.data!));
      return mergeMp3BlobsZeroCopy(mp3Blobs);
    }

    const pcmChunks = completedChunks.filter(c => !!c.data);
    if (pcmChunks.length > 0) {
      const combinedBuffer = concatenateAudioBuffers(pcmChunks.map(c => c.data!));
      return createWavFile(combinedBuffer);
    }

    const mp3Blobs = completedChunks.map(c => c.mp3Blob!);
    return mergeMp3BlobsZeroCopy(mp3Blobs);
  }, []);

  useEffect(() => {
    if (!generationState.isGenerating && audioChunks.length > 0 && audioChunks.some(c => c.status === 'completed')) {
      const blob = generateBlobFromChunks(audioChunks, format);
      setFinalBlob(blob);
    }
  }, [format, audioChunks, generationState.isGenerating, generateBlobFromChunks]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (previewUrl && autoResumeRef.current.shouldResume && audioRef.current) {
      const { startTime } = autoResumeRef.current;
      const player = audioRef.current;
      const timer = setTimeout(() => {
        if (Number.isFinite(startTime)) {
          player.currentTime = startTime;
        }
        player.playbackRate = playbackSpeed;
        player.play().catch(e => console.warn('Auto-resume playback interrupted', e));
      }, 50);
      autoResumeRef.current = { shouldResume: false, startTime: 0 };
      return () => clearTimeout(timer);
    }
  }, [previewUrl, playbackSpeed]);

  const handleAudioEnded = () => {
    const completedChunks = audioChunks.filter(c => c.status === 'completed' && c.mp3Blob);
    if (completedChunks.length > previewChunkCount) {
      const currentDuration = audioRef.current?.duration || 0;
      const combinedBlob = mergeMp3BlobsZeroCopy(completedChunks.map(c => c.mp3Blob!));
      const newUrl = URL.createObjectURL(combinedBlob);
      setPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return newUrl;
      });
      setPreviewChunkCount(completedChunks.length);
      autoResumeRef.current = { shouldResume: true, startTime: currentDuration };
    }
  };

  const handleTranslateDemo = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    setDemoLanguage(lang);
    setIsTranslating(true);
    try {
      const translated = await translateText(demoText, lang);
      setDemoText(translated);
    } catch (err) {
      console.error('Translation failed', err);
    } finally {
      setIsTranslating(false);
    }
  };

  // --- IMAGE GENERATION LOGIC ---
  const handleGenerateImages = async (chunkIndex: number) => {
    const count = imageCounts[chunkIndex] || 1;
    const chunkText = previewChunks[chunkIndex];
    if (!chunkText) return;

    setAudioChunks(prev => prev.map(c => c.id === chunkIndex ? { ...c, isGeneratingImages: true } : c));

    try {
      let stylePrompt = globalStylePrompt;
      if (!stylePrompt) {
        stylePrompt = await generateStyleDescription(text);
        setGlobalStylePrompt(stylePrompt);
      }

      const prompts = await generateScenePrompts(chunkText, stylePrompt, count);
      const promises = prompts.map(prompt => generateNanobanaImage(prompt));
      const results = await Promise.all(promises);

      const newImages: GeneratedImage[] = results.map((url, idx) => ({
        id: `${Date.now()}-${idx}`,
        data: url
      }));

      setAudioChunks(prev => prev.map(c => {
        if (c.id === chunkIndex) {
          return {
            ...c,
            isGeneratingImages: false,
            images: [...(c.images || []), ...newImages]
          };
        }
        return c;
      }));
    } catch (error) {
      console.error('Image generation failed', error);
      setAudioChunks(prev => prev.map(c => c.id === chunkIndex ? { ...c, isGeneratingImages: false } : c));
    }
  };

  const handleImageCountChange = (chunkIndex: number, val: number) => {
    setImageCounts(prev => ({ ...prev, [chunkIndex]: val }));
  };

  // --- 30-HOUR AUDIOBOOK GENERATION ENGINE ---
  const handleGenerate = useCallback(async () => {
    if (!text.trim()) return;

    setFinalBlob(null);
    setGenerationState({
      isGenerating: true,
      progress: 0,
      totalChunks: 0,
      currentChunkIndex: 0,
      error: undefined
    });
    abortRef.current = false;

    await requestWakeLock();

    const textChunksToProcess = previewChunks.length > 0
      ? previewChunks
      : createSmartChunks(text, chunkTargetWords);

    if (previewChunks.length === 0) {
      setPreviewChunks(textChunksToProcess);
    }

    await saveProjectMetaToDisk({
      id: 'current',
      projectName,
      text,
      chunkTargetWords,
      voice,
      model,
      updatedAt: Date.now()
    });

    let workingChunks: AudioChunk[] = audioChunks;
    if (workingChunks.length === 0 || workingChunks.length !== textChunksToProcess.length) {
      const savedRecords = await loadAllChunksFromDisk();
      const recordMap = new Map(savedRecords.map(r => [r.chunkIndex, r]));
      workingChunks = textChunksToProcess.map((t, i) => {
        const rec = recordMap.get(i);
        const chapterTitle = detectChapterTitle(t, i);
        if (rec && rec.textHash === computeSimpleHash(t)) {
          return {
            id: i,
            text: t,
            status: 'completed',
            mp3Blob: rec.mp3Blob,
            durationSec: rec.durationSec,
            chapterTitle
          };
        }
        return {
          id: i,
          text: t,
          status: i < startChunkIndex ? 'completed' : 'pending',
          chapterTitle
        };
      });
      setAudioChunks(workingChunks);
    }

    const totalToGenerate = Math.max(1, textChunksToProcess.length - startChunkIndex);
    setGenerationState(prev => ({ ...prev, totalChunks: textChunksToProcess.length }));

    const collectedMp3Blobs: Blob[] = workingChunks
      .slice(0, startChunkIndex)
      .filter(c => !!c.mp3Blob)
      .map(c => c.mp3Blob!);

    let interChunkDelay = Math.round(basePacingSec * 1000);
    const safeProjectName = (projectName.trim() || 'hoerbuch').replace(/[^a-zA-Z0-9_-]/g, '_');

    try {
      for (let i = startChunkIndex; i < textChunksToProcess.length; i++) {
        if (abortRef.current) break;

        const targetPage = Math.floor(i / CHUNKS_PER_PAGE);
        setTimelinePage(targetPage);

        setGenerationState(prev => ({
          ...prev,
          currentChunkIndex: i + 1,
          progress: ((i - startChunkIndex) / totalToGenerate) * 100
        }));

        setAudioChunks(prev => prev.map(c => c.id === i ? { ...c, status: 'generating' } : c));

        // Apply per-chunk voice override & pronunciation lexicon rules
        const chunkMeta = workingChunks[i];
        const chunkVoice = chunkMeta?.customVoice || voice;
        const chunkStyle = chunkMeta?.customStyle
          ? `${effectiveStyleInstruction}. ${chunkMeta.customStyle}`
          : effectiveStyleInstruction;
        const spokenChunkText = applyPronunciationLexicon(textChunksToProcess[i], pronunciationRules);

        let pcmData: Uint8Array | null = null;
        let attempts = 0;
        const maxRetries = 40;

        while (attempts < maxRetries && !pcmData && !abortRef.current) {
          try {
            const base64Data = await generateSpeechChunk(spokenChunkText, chunkVoice, model, chunkStyle);
            pcmData = base64ToUint8Array(base64Data);
            setGenerationState(prev => ({ ...prev, error: undefined }));
          } catch (err: any) {
            const isRateLimit = err?.isRateLimit === true;
            const errorMessage = err?.message || 'Unbekannter Fehler';

            console.warn(`Attempt ${attempts + 1} failed for chunk ${i + 1}.`, errorMessage);

            if (isRateLimit) {
              interChunkDelay = Math.max(interChunkDelay, 6000);
            }

            attempts++;

            if (!isRateLimit && attempts >= 4) {
              throw new Error(`Fehler bei Chunk ${i + 1}: ${errorMessage}`);
            }

            if (attempts >= maxRetries) {
              const friendlyError = isRateLimit
                ? `Rate-Limit für ${model} dauerhaft überschritten. Alle bisherigen Chunks (${collectedMp3Blobs.length}) sind sicher auf der Festplatte (IndexedDB) gespeichert! Klicke auf 'Resume from #${i + 1}' oder wechsle zu '3.8 Flash Lite'.`
                : errorMessage;
              throw new Error(friendlyError);
            }

            const baseDelay = err?.retryAfterSeconds
              ? Math.min(Math.max(err.retryAfterSeconds, 10), 60)
              : Math.min(12 + attempts * 6, 45);

            for (let s = baseDelay; s > 0; s--) {
              if (abortRef.current || skipRetryRef.current) break;
              setGenerationState(prev => ({
                ...prev,
                error: `Rate-Limit (RPM) Cooldown: ${s}s (Chunk ${i + 1}, Versuch ${attempts}/${maxRetries} – alle bisherigen Teile sind gespeichert)...`
              }));
              await new Promise(r => setTimeout(r, 1000));
            }
            skipRetryRef.current = false;
            setGenerationState(prev => ({ ...prev, error: undefined }));
          }
        }

        if (abortRef.current) break;

        if (pcmData) {
          const mp3Blob = createMp3File(pcmData);
          const durationSec = calculatePcmDurationSec(pcmData.byteLength);
          const chunkWords = countWords(textChunksToProcess[i]);

          await saveChunkToDisk({
            chunkIndex: i,
            textHash: computeSimpleHash(textChunksToProcess[i]),
            mp3Blob,
            durationSec,
            byteSize: mp3Blob.size,
            wordCount: chunkWords,
            createdAt: Date.now()
          });

          const wavOrMp3DownloadBlob = format === 'wav' ? createWavFile(pcmData) : mp3Blob;
          pcmData = null;

          collectedMp3Blobs.push(mp3Blob);
          setDiskCacheCount(prev => Math.max(prev, collectedMp3Blobs.length));
          setDiskCacheBytes(prev => prev + mp3Blob.size);
          setDiskCacheDurationSec(prev => prev + durationSec);

          setAudioChunks(prev => prev.map(c => c.id === i ? {
            ...c,
            status: 'completed',
            mp3Blob,
            durationSec,
            data: undefined
          } : c));

          setStartChunkIndex(i + 1);

          const currentCombinedBlob = mergeMp3BlobsZeroCopy(collectedMp3Blobs);
          const currentUrl = URL.createObjectURL(currentCombinedBlob);

          const player = audioRef.current;
          const wasPlaying = player && !player.paused;
          const currentTime = player ? player.currentTime : 0;

          setPreviewUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return currentUrl;
          });
          setPreviewChunkCount(collectedMp3Blobs.length);

          if (wasPlaying) {
            autoResumeRef.current = { shouldResume: true, startTime: currentTime };
          }

          if (autoDownloadChunks) {
            try {
              const paddedNum = String(i + 1).padStart(4, '0');
              const chunkFilename = `${safeProjectName}_teil_${paddedNum}.${format}`;
              downloadBlob(wavOrMp3DownloadBlob, chunkFilename);
            } catch (downloadErr) {
              console.error('Failed to auto-download chunk', downloadErr);
            }
          }
        }

        if (i < textChunksToProcess.length - 1 && !abortRef.current) {
          setGenerationState(prev => ({
            ...prev,
            error: `Pacing-Taktung (${(interChunkDelay / 1000).toFixed(1)}s Pause für RPM-Schutz)...`
          }));
          await new Promise(resolve => setTimeout(resolve, interChunkDelay));
          setGenerationState(prev => ({ ...prev, error: undefined }));
        }
      }

      if (collectedMp3Blobs.length > 0) {
        const finalMerged = mergeMp3BlobsZeroCopy(collectedMp3Blobs);
        setFinalBlob(finalMerged);
      }

      setGenerationState(prev => ({
        ...prev,
        isGenerating: false,
        progress: abortRef.current ? prev.progress : 100
      }));
    } catch (error) {
      console.error(error);
      setGenerationState(prev => ({
        ...prev,
        isGenerating: false,
        error: error instanceof Error ? error.message : 'Ein unerwarteter Fehler ist aufgetreten'
      }));
    } finally {
      await releaseWakeLock();
    }
  }, [
    text,
    voice,
    model,
    format,
    chunkTargetWords,
    basePacingSec,
    autoDownloadChunks,
    downloadBlob,
    previewChunks,
    startChunkIndex,
    projectName,
    audioChunks,
    effectiveStyleInstruction,
    pronunciationRules,
    requestWakeLock,
    releaseWakeLock
  ]);

  const handleStop = () => {
    abortRef.current = true;
    releaseWakeLock();
    setGenerationState(prev => ({ ...prev, isGenerating: false }));
  };

  const downloadFinalAudio = () => {
    const completedChunks = audioChunks.filter(c => c.status === 'completed' && c.mp3Blob);
    const blobToDownload = completedChunks.length > 0
      ? mergeMp3BlobsZeroCopy(completedChunks.map(c => c.mp3Blob!))
      : finalBlob;
    if (!blobToDownload) return;
    const safeProjectName = (projectName.trim() || 'hoerbuch').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadBlob(blobToDownload, `${safeProjectName}_komplett.mp3`);
  };

  // Strategy B: Group completed chunks into ~1-Hour MP3 chapter files
  const hourlyPartsInfo = useMemo(() => {
    const completed = audioChunks.filter(c => c.status === 'completed' && c.mp3Blob);
    if (completed.length === 0) return [];

    const parts: { partNumber: number; filename: string; blobs: Blob[]; durationSec: number; chunkRange: string; sizeMB: string }[] = [];
    const targetPartSeconds = 3600;

    let currentBlobs: Blob[] = [];
    let currentDur = 0;
    let currentBytes = 0;
    let startIdx = completed[0].id + 1;
    let lastIdx = startIdx;

    for (const chunk of completed) {
      const dur = chunk.durationSec || 120;
      const blob = chunk.mp3Blob!;
      currentBlobs.push(blob);
      currentDur += dur;
      currentBytes += blob.size;
      lastIdx = chunk.id + 1;

      if (currentDur >= targetPartSeconds) {
        const partNum = parts.length + 1;
        const padded = String(partNum).padStart(2, '0');
        parts.push({
          partNumber: partNum,
          filename: `teil_${padded}.mp3`,
          blobs: currentBlobs,
          durationSec: currentDur,
          chunkRange: `#${startIdx}–#${lastIdx}`,
          sizeMB: (currentBytes / (1024 * 1024)).toFixed(1)
        });
        currentBlobs = [];
        currentDur = 0;
        currentBytes = 0;
        startIdx = lastIdx + 1;
      }
    }

    if (currentBlobs.length > 0) {
      const partNum = parts.length + 1;
      const padded = String(partNum).padStart(2, '0');
      parts.push({
        partNumber: partNum,
        filename: `teil_${padded}.mp3`,
        blobs: currentBlobs,
        durationSec: currentDur,
        chunkRange: `#${startIdx}–#${lastIdx}`,
        sizeMB: (currentBytes / (1024 * 1024)).toFixed(1)
      });
    }

    return parts;
  }, [audioChunks]);

  const handleDownloadHourlyPart = (part: typeof hourlyPartsInfo[0]) => {
    const merged = mergeMp3BlobsZeroCopy(part.blobs);
    downloadBlob(merged, part.filename);
  };

  const handleDownloadAllHourlyParts = async () => {
    for (const part of hourlyPartsInfo) {
      const merged = mergeMp3BlobsZeroCopy(part.blobs);
      downloadBlob(merged, part.filename);
      await new Promise(r => setTimeout(r, 400));
    }
  };

  const handleDownloadFfmpegList = () => {
    const lines = hourlyPartsInfo.length > 0
      ? hourlyPartsInfo.map(p => `file '${p.filename}'`)
      : audioChunks
          .filter(c => c.status === 'completed')
          .map(c => {
            const safeName = (projectName.trim() || 'hoerbuch').replace(/[^a-zA-Z0-9_-]/g, '_');
            const padded = String(c.id + 1).padStart(4, '0');
            return `file '${safeName}_teil_${padded}.mp3'`;
          });

    const content = lines.join('\n') + '\n';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, 'liste.txt');
  };

  const handleExportSubtitles = (subFormat: 'srt' | 'vtt') => {
    const subContent = generateSubtitles(audioChunks, subFormat);
    const blob = new Blob([subContent], { type: 'text/plain;charset=utf-8' });
    const safeName = (projectName.trim() || 'hoerbuch').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadBlob(blob, `${safeName}_untertitel.${subFormat}`);
  };

  const handleExportChapterTimestamps = (type: 'youtube' | 'ffmetadata') => {
    const { youtube, ffmetadata } = generateChapterTimestamps(audioChunks, projectName);
    const safeName = (projectName.trim() || 'hoerbuch').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (type === 'youtube') {
      const blob = new Blob([youtube], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `${safeName}_kapitel_timestamps.txt`);
    } else {
      const blob = new Blob([ffmetadata], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `${safeName}_FFMETADATA1.txt`);
    }
  };

  const ffmpegCommand = `ffmpeg -f concat -safe 0 -i liste.txt -c copy hoerbuch_30_stunden.mp3`;

  const handleCopyText = (str: string, key: string) => {
    navigator.clipboard.writeText(str);
    setCopiedState(key);
    setTimeout(() => setCopiedState(null), 2500);
  };

  const readyChunksCount = useMemo(() => {
    return audioChunks.filter(c => c.status === 'completed' && (c.mp3Blob || c.data)).length;
  }, [audioChunks]);

  const totalGeneratedDurationSec = useMemo(() => {
    return audioChunks
      .filter(c => c.status === 'completed')
      .reduce((acc, c) => acc + (c.durationSec || 0), 0);
  }, [audioChunks]);

  const handleSelectPaidKey = async () => {
    if (typeof window.aistudio?.openSelectKey === 'function') {
      try {
        await window.aistudio.openSelectKey();
      } catch (e) {
        console.error(e);
      }
    }
  };

  const totalPages = Math.ceil(previewChunks.length / CHUNKS_PER_PAGE);
  const visibleChunks = useMemo(() => {
    const start = timelinePage * CHUNKS_PER_PAGE;
    return previewChunks.slice(start, start + CHUNKS_PER_PAGE).map((chunkText, offset) => ({
      chunkText,
      idx: start + offset
    }));
  }, [previewChunks, timelinePage]);

  return (
    <div className="h-screen bg-white text-zinc-900 flex overflow-hidden font-sans selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* --- LEFT SIDEBAR: STUDIO CONTROLS --- */}
      <aside className="w-80 bg-white border-r border-zinc-200 flex flex-col z-20 shadow-xl flex-shrink-0 overflow-y-auto relative">
        
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-zinc-100 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {coverImageUrl ? (
              <img
                src={coverImageUrl}
                alt="Cover"
                className="w-9 h-9 rounded-lg object-cover border border-indigo-200 shadow-sm"
              />
            ) : (
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                <BookOpen size={18} />
              </div>
            )}
            <div>
              <h1 className="text-base font-bold text-zinc-900 tracking-tight leading-none">Audiobook</h1>
              <span className="text-[10px] text-emerald-600 uppercase tracking-widest font-bold">30h Studio Gen 3.8</span>
            </div>
          </div>
          {wakeLockActive && (
            <span
              className="flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full"
              title="Ruhezustand des PCs wird während der Aufnahme aktiv blockiert"
            >
              <BatteryCharging size={11} /> Wach
            </span>
          )}
        </div>

        <div className="flex-1 p-4 space-y-5 overflow-y-auto">
          
          {/* API Key Status */}
          <div
            onClick={() => setShowSettings(true)}
            className={`
              p-3 rounded-xl border cursor-pointer transition-all group relative overflow-hidden
              ${userApiKey || keyStatus === 'valid'
                ? 'bg-white border-indigo-200 hover:border-indigo-400 shadow-sm'
                : 'bg-amber-50 border-amber-200 hover:border-amber-300'}
            `}
          >
            <div className="flex justify-between items-start mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">API Access (Tier 2 Ready)</span>
              <Settings size={14} className="text-zinc-400 group-hover:text-indigo-600 transition-colors" />
            </div>
            <div className="flex items-center gap-2">
              {userApiKey ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]" />
                  <span className="text-sm font-semibold text-zinc-700">Tier 2 Key Aktiv</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-sm font-semibold text-amber-700">API Key prüfen / setzen</span>
                </>
              )}
            </div>
          </div>

          {/* 30h Long-Form Engine Controls (Strategy A & B) */}
          <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={12} className="text-indigo-600" /> 30h Langstrecken-Modus
              </h2>
              <button
                type="button"
                onClick={() => setShowFfmpegModal(true)}
                className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 underline flex items-center gap-1"
              >
                <Terminal size={10} /> Export-Studio
              </button>
            </div>

            {/* Chunk Size Selector */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-500 font-medium">Chunk-Größe (am Satzende)</span>
                <span className="font-bold text-zinc-800">~{chunkTargetWords} Wörter</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { words: 300, label: '300 W.', sub: 'Standard' },
                  { words: 500, label: '500 W.', sub: '10h Buch' },
                  { words: 800, label: '800 W.', sub: '30h Ultra' }
                ].map(opt => (
                  <button
                    key={opt.words}
                    type="button"
                    disabled={generationState.isGenerating}
                    onClick={() => {
                      setChunkTargetWords(opt.words);
                      if (text.trim()) buildChunksForText(text, opt.words);
                    }}
                    className={`py-1.5 px-2 rounded-lg border text-center transition-all ${
                      chunkTargetWords === opt.words
                        ? 'bg-indigo-600 text-white border-indigo-600 font-semibold shadow-xs'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="text-xs leading-none">{opt.label}</div>
                    <div className={`text-[9px] mt-0.5 ${chunkTargetWords === opt.words ? 'text-indigo-100' : 'text-zinc-400'}`}>
                      {opt.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Pacing / Taktung Selector */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-zinc-500 font-medium">Pacing (RPM-Taktung)</span>
                <span className="font-bold text-zinc-800">{basePacingSec}s Pause</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[
                  { sec: 2.0, label: '2s' },
                  { sec: 3.5, label: '3.5s' },
                  { sec: 5.0, label: '5s' },
                  { sec: 8.0, label: '8s' }
                ].map(p => (
                  <button
                    key={p.sec}
                    type="button"
                    onClick={() => setBasePacingSec(p.sec)}
                    className={`py-1 rounded border text-[11px] font-medium transition-all ${
                      basePacingSec === p.sec
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-Download Individual Chunks Toggle */}
            <label className="flex items-center justify-between pt-1 border-t border-zinc-200/70 cursor-pointer select-none">
              <span className="text-[11px] text-zinc-600">Einzel-Chunks sofort laden (`teil_0001.mp3`)</span>
              <input
                type="checkbox"
                checked={autoDownloadChunks}
                onChange={e => setAutoDownloadChunks(e.target.checked)}
                className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              />
            </label>

            {/* IndexedDB Disk Cache Indicator */}
            <div className="pt-2 border-t border-zinc-200/70 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-zinc-600">
                <HardDrive size={12} className="text-emerald-600" />
                <span>
                  Festplatten-Cache: <strong>{readyChunksCount || diskCacheCount} Chunks</strong>
                </span>
              </div>
              {(readyChunksCount > 0 || diskCacheCount > 0) && !generationState.isGenerating && (
                <button
                  type="button"
                  onClick={handleClearDiskCache}
                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                  title="Gespeicherte Chunks im Browser-Cache löschen"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Zap size={12} /> Model & Format
            </h2>
            <div className="space-y-3">
              <ModelSelector
                selectedModel={model}
                onModelChange={setModel}
                disabled={generationState.isGenerating}
              />
              <FormatSelector
                selectedFormat={format}
                onFormatChange={setFormat}
                disabled={generationState.isGenerating}
              />
            </div>
          </div>

          <div className="w-full h-px bg-zinc-100" />

          {/* Feature: Vocal Parameter Controls & 1-Click Genre Style Presets */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders size={12} /> Stimmparameter & Regie
              </h2>
              <button
                type="button"
                onClick={() => setShowLexiconModal(true)}
                className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <BookMarked size={11} /> Lexikon ({pronunciationRules.length})
              </button>
            </div>

            {/* Speaking Rate & Vocal Timbre */}
            <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-2 rounded-lg border border-zinc-200 text-[11px]">
              <div>
                <span className="text-zinc-500 block mb-1 font-medium">Sprechtempo</span>
                <div className="grid grid-cols-3 gap-0.5">
                  {(['Slow', 'Normal', 'Brisk'] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSpeakingRate(r)}
                      className={`py-1 rounded text-[10px] font-semibold ${
                        speakingRate === r ? 'bg-indigo-600 text-white' : 'bg-white text-zinc-600 border border-zinc-200'
                      }`}
                    >
                      {r === 'Slow' ? '0.85x' : r === 'Normal' ? '1.0x' : '1.2x'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-zinc-500 block mb-1 font-medium">Klangfarbe</span>
                <select
                  value={vocalTimbre}
                  onChange={e => setVocalTimbre(e.target.value as any)}
                  className="w-full py-1 px-1.5 rounded border border-zinc-200 bg-white text-zinc-800 text-[11px] font-medium outline-none"
                >
                  <option value="Natural">Natürlich</option>
                  <option value="Deep">Tief & Sonor</option>
                  <option value="Warm">Warm & Intim</option>
                  <option value="Crisp">Klar & Präzise</option>
                </select>
              </div>
            </div>

            {/* 1-Click Genre Style Presets */}
            <div className="flex flex-wrap gap-1">
              {STYLE_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setTtsStyle(preset.prompt)}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 hover:bg-indigo-50 hover:text-indigo-700 text-zinc-600 border border-zinc-200 transition-colors"
                >
                  + {preset.label}
                </button>
              ))}
            </div>

            <textarea
              value={ttsStyle}
              onChange={(e) => setTtsStyle(e.target.value)}
              placeholder="Schauspiel-Anweisung (z.B. Ruhiger Erzähler, dramatische Pausen)..."
              className="w-full text-xs p-2 rounded-lg border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-indigo-400 outline-none resize-none h-14 placeholder:text-zinc-400"
            />
          </div>

          <div className="w-full h-px bg-zinc-100" />

          {/* All 30 Gemini 3.8 TTS Voices & Demo */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Volume2 size={12} /> 30 Stimmen (Flash 3.8 Katalog)
            </h2>

            <div className="flex gap-1.5">
              <div className="flex-1 relative">
                <MessageSquare size={12} className="absolute top-2.5 left-2.5 text-zinc-400" />
                <input
                  value={demoText}
                  onChange={(e) => setDemoText(e.target.value)}
                  className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-indigo-400 outline-none"
                  placeholder="Demo-Satz..."
                />
              </div>
              <div className="w-16 relative">
                <Languages size={11} className="absolute top-2 left-1.5 text-zinc-400" />
                <select
                  value={demoLanguage}
                  onChange={handleTranslateDemo}
                  disabled={isTranslating}
                  className="w-full pl-5 pr-1 py-1.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50 focus:bg-white focus:border-indigo-400 outline-none appearance-none"
                >
                  <option value="German">DE</option>
                  <option value="English">EN</option>
                  <option value="French">FR</option>
                  <option value="Spanish">ES</option>
                  <option value="Italian">IT</option>
                  <option value="Japanese">JP</option>
                </select>
                {isTranslating && <Loader2 size={10} className="absolute top-2 right-1 animate-spin text-indigo-500" />}
              </div>
            </div>

            <VoiceSelector
              selectedVoice={voice}
              onVoiceChange={setVoice}
              disabled={generationState.isGenerating}
              model={model}
              previewText={demoText}
              styleInstruction={effectiveStyleInstruction}
            />
          </div>

          <div className="w-full h-px bg-zinc-100" />

          {/* Stats */}
          <div className="bg-zinc-50 rounded-lg p-3.5 border border-zinc-100 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500">Wörter gesamt</span>
              <span className="font-mono text-zinc-800 font-semibold">{costStats.words.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500">Geschätzte Chunks</span>
              <span className="font-mono text-zinc-700">~{costStats.estimatedChunks.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-zinc-500">Geschätzte Audio-Länge</span>
              <span className="font-mono text-indigo-600 font-semibold">
                ~{costStats.minutes} Min ({costStats.hours} Std.)
              </span>
            </div>
            <div className="flex justify-between items-center text-xs pt-1.5 border-t border-zinc-200">
              <span className="text-zinc-500">Est. API Cost</span>
              <span className="font-mono text-emerald-600 font-bold">${costStats.cost}</span>
            </div>
          </div>

          <div className="h-6"></div>
        </div>
      </aside>

      {/* --- RIGHT MAIN AREA: MANUSCRIPT CANVAS --- */}
      <main className="flex-1 flex flex-col bg-stone-50 relative overflow-hidden">
        
        {/* Top Bar (Project Name & Studio Tools) */}
        <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-6 flex-shrink-0 z-10 gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <LayoutTemplate className="text-zinc-300 w-5 h-5 shrink-0" />
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="text-base font-semibold text-zinc-800 bg-transparent outline-none placeholder:text-zinc-300 w-full hover:bg-stone-50 focus:bg-stone-50 rounded px-2 py-1 transition-colors truncate"
              placeholder="Hörbuch-Titel..."
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {generationState.isGenerating && (
              <div className="flex items-center gap-2.5 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-lg">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase">
                    Chunk {generationState.currentChunkIndex} / {generationState.totalChunks}
                  </span>
                  <span className="text-[9px] text-indigo-500">
                    {formatDurationHMS(totalGeneratedDurationSec)} • Disk-Safe
                  </span>
                </div>
                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              </div>
            )}

            {/* Studio Feature Toolbar Buttons */}
            <button
              type="button"
              onClick={handleCleanManuscript}
              disabled={!text.trim() || generationState.isGenerating}
              className="flex items-center gap-1.5 px-2.5 py-2 text-zinc-700 hover:bg-zinc-100 rounded-lg text-xs font-medium border border-zinc-200 transition-colors disabled:opacity-40"
              title="Buchdruck-Bereinigung: Silbentrennung reparieren, Seitenzahlen entfernen & Abkürzungen ausschreiben"
            >
              <Sparkle className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden xl:inline">Text bereinigen</span>
            </button>

            <button
              type="button"
              onClick={() => setShowLexiconModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-2 text-zinc-700 hover:bg-zinc-100 rounded-lg text-xs font-medium border border-zinc-200 transition-colors"
              title="Aussprache-Lexikon für Eigennamen, Fantasy-Begriffe & Abkürzungen"
            >
              <BookMarked className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden xl:inline">Lexikon ({pronunciationRules.length})</span>
            </button>

            <button
              type="button"
              onClick={handleGenerateCoverArt}
              disabled={isGeneratingCover || (!text.trim() && !projectName.trim())}
              className="flex items-center gap-1.5 px-2.5 py-2 text-zinc-700 hover:bg-zinc-100 rounded-lg text-xs font-medium border border-zinc-200 transition-colors disabled:opacity-40"
              title="KI-Hörbuch-Cover (1:1) aus Manuskript generieren"
            >
              {isGeneratingCover ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" /> : <ImageIcon className="w-3.5 h-3.5 text-purple-600" />}
              <span className="hidden xl:inline">Cover Art</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFfmpegModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg text-xs font-semibold transition-all"
              title="1-Stunden-Teile, SRT-Untertitel, Kapitel-Timestamps & FFmpeg Export"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Export-Studio ({hourlyPartsInfo.length})</span>
            </button>

            <button
              onClick={handlePreviewChunks}
              disabled={!text || generationState.isGenerating}
              className="flex items-center gap-1.5 px-3 py-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg text-xs font-medium transition-all border border-zinc-200 disabled:opacity-40"
              title={`Text in Chunks von ~${chunkTargetWords} Wörtern am Satzende aufteilen`}
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>Chunks (~{chunkTargetWords} W.)</span>
            </button>

            {generationState.isGenerating ? (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 border border-red-200 transition-colors shadow-sm text-xs"
              >
                <StopCircle size={16} />
                Pause / Stop
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!text}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white shadow-md shadow-indigo-200 transition-all text-xs
                  ${!text
                    ? 'bg-zinc-300 cursor-not-allowed shadow-none'
                    : 'bg-indigo-600 hover:bg-indigo-700 hover:translate-y-[-1px]'
                  }
                `}
              >
                <Sparkles size={16} />
                {startChunkIndex > 0 ? `Fortsetzen ab #${startChunkIndex + 1}` : 'Hörbuch generieren'}
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Canvas Area */}
        <div className="flex-1 overflow-y-auto p-8 relative scroll-smooth">
          <div className="max-w-3xl mx-auto space-y-6 pb-32">

            {/* 30h Architecture + Cover Art + Project Backup Banner */}
            <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {coverImageUrl ? (
                  <div className="relative group w-14 h-14 rounded-lg overflow-hidden border border-stone-200 shrink-0 shadow-xs">
                    <img src={coverImageUrl} alt="Audiobook Cover" className="w-full h-full object-cover" />
                    <a
                      href={coverImageUrl}
                      download={`${projectName.replace(/\s+/g, '_')}_cover.png`}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                      title="Cover herunterladen"
                    >
                      <Download size={14} />
                    </a>
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
                    <HardDrive size={18} />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wide">
                      30-Stunden Zero-RAM-Copy Studio
                    </h3>
                    <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      IndexedDB Disk-Safe
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Gesichert: <strong className="text-zinc-800">{readyChunksCount} Chunks</strong> ({formatDurationHMS(totalGeneratedDurationSec || diskCacheDurationSec)} Audio,{' '}
                    {((diskCacheBytes || 0) / (1024 * 1024)).toFixed(1)} MB) • 30 Stimmen verfügbar
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleExportProjectJson}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[11px] font-medium transition-colors"
                  title="Projekt als .audiobook.json Datei sichern"
                >
                  <Save size={12} /> Backup
                </button>
                <button
                  type="button"
                  onClick={() => projectFileInputRef.current?.click()}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-[11px] font-medium transition-colors"
                  title="Projekt-Datei (.audiobook.json) laden"
                >
                  <FolderOpen size={12} /> Laden
                </button>
                <input
                  ref={projectFileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportProjectJson}
                  className="hidden"
                />
                {readyChunksCount > 0 && (
                  <button
                    type="button"
                    onClick={downloadFinalAudio}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Download size={13} />
                    <span>Gesamt-MP3</span>
                  </button>
                )}
              </div>
            </div>

            {/* Script Input (Visualized as Paper) */}
            <div className="bg-white rounded-xl shadow-sm border border-stone-200 min-h-[500px] p-10 relative group transition-shadow hover:shadow-md">
              <TextInput
                text={text}
                onTextChange={setText}
                disabled={generationState.isGenerating}
              />
            </div>

            {/* Chunk Visualization (Paginated Timeline with Multi-Voice Override & Single-Chunk Re-Roll) */}
            {previewChunks.length > 0 && (
              <div className="space-y-3 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wider">
                      Processing Timeline ({readyChunksCount} / {previewChunks.length} fertig)
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      ~{chunkTargetWords} Wörter • Satzende-Garantie • Pro Chunk eigene Stimme wählbar & einzeln neu generierbar
                    </p>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-lg p-1">
                      <button
                        type="button"
                        disabled={timelinePage === 0}
                        onClick={() => setTimelinePage(p => Math.max(0, p - 1))}
                        className="px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded disabled:opacity-40"
                      >
                        Zurück
                      </button>
                      <span className="text-xs font-mono px-2 text-zinc-700">
                        Seite {timelinePage + 1} / {totalPages} (#{timelinePage * CHUNKS_PER_PAGE + 1}–#{Math.min((timelinePage + 1) * CHUNKS_PER_PAGE, previewChunks.length)})
                      </span>
                      <button
                        type="button"
                        disabled={timelinePage >= totalPages - 1}
                        onClick={() => setTimelinePage(p => Math.min(totalPages - 1, p + 1))}
                        className="px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded disabled:opacity-40"
                      >
                        Weiter
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {visibleChunks.map(({ chunkText, idx }) => {
                    const chunkData = audioChunks[idx];
                    const isCompleted = chunkData?.status === 'completed';
                    const isGenerating = chunkData?.status === 'generating' || rerollingChunkId === idx;
                    const isPending = !isCompleted && !isGenerating;
                    const isSelected = idx === startChunkIndex;
                    const hasImages = chunkData?.images && chunkData.images.length > 0;
                    const isGeneratingImages = chunkData?.isGeneratingImages;
                    const words = countWords(chunkText);
                    const endsWithSentence = isSentenceEnd(chunkText);
                    const detectedChapter = chunkData?.chapterTitle || detectChapterTitle(chunkText, idx);

                    return (
                      <div
                        key={idx}
                        className={`
                          flex flex-col rounded-lg border transition-all overflow-hidden
                          ${isSelected ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-200' : 'bg-white border-stone-200 hover:border-stone-300'}
                          ${isGenerating ? 'border-indigo-500 bg-indigo-50' : ''}
                          ${isCompleted && !isSelected ? 'opacity-95 bg-stone-50/70' : ''}
                        `}
                      >
                        <div
                          onClick={() => !generationState.isGenerating && setStartChunkIndex(idx)}
                          className="flex items-start gap-3.5 p-3 cursor-pointer select-none"
                        >
                          <div
                            className={`
                              w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold shrink-0 transition-colors
                              ${isCompleted ? 'bg-emerald-100 text-emerald-700' : ''}
                              ${isGenerating ? 'bg-indigo-600 text-white animate-pulse' : ''}
                              ${isPending && !isSelected ? 'bg-zinc-100 text-zinc-500' : ''}
                              ${isSelected && !isGenerating ? 'bg-indigo-600 text-white' : ''}
                            `}
                          >
                            {isCompleted ? <CheckCircle size={14} /> : idx + 1}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              {detectedChapter && (
                                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                                  📖 {detectedChapter}
                                </span>
                              )}
                              <span className="text-[11px] font-semibold text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">
                                {words} Wörter
                              </span>
                              {endsWithSentence && (
                                <span className="text-[10px] text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  ✓ Satzende
                                </span>
                              )}
                              {chunkData?.durationSec && (
                                <span className="text-[10px] text-indigo-700 font-mono bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                                  {formatDurationHMS(chunkData.durationSec)}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-zinc-600 font-serif leading-relaxed line-clamp-2">{chunkText}</p>
                          </div>

                          {/* Per-Chunk Multi-Voice Selector & Action Buttons */}
                          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <select
                              value={chunkData?.customVoice || ''}
                              onChange={(e) => handleChunkVoiceChange(idx, e.target.value)}
                              disabled={generationState.isGenerating}
                              className="text-[11px] border border-zinc-200 rounded px-2 py-1 bg-white text-zinc-700 outline-none focus:border-indigo-400"
                              title="Sprecher-Stimme speziell für diesen Abschnitt überschreiben (Multi-Voice)"
                            >
                              <option value="">Global ({voice})</option>
                              {VOICE_CATALOG.map(v => (
                                <option key={v.name} value={v.name}>
                                  {v.name} ({v.gender === 'Female' ? 'W' : 'M'})
                                </option>
                              ))}
                            </select>

                            {isCompleted && chunkData?.mp3Blob && (
                              <button
                                type="button"
                                onClick={() => handlePlaySingleChunk(idx)}
                                className={`p-1.5 rounded transition-colors ${
                                  playingChunkId === idx
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-zinc-600 hover:text-indigo-600 hover:bg-indigo-50'
                                }`}
                                title="Diesen Chunk direkt anhören"
                              >
                                {playingChunkId === idx ? <Square size={13} className="fill-current" /> : <Play size={13} className="fill-current" />}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRerollSingleChunk(idx)}
                              disabled={generationState.isGenerating || rerollingChunkId !== null}
                              className="p-1.5 text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-40"
                              title="Diesen einzelnen Chunk neu generieren (Re-Roll)"
                            >
                              <RefreshCw size={13} className={rerollingChunkId === idx ? 'animate-spin text-indigo-600' : ''} />
                            </button>

                            {isCompleted && chunkData?.mp3Blob && (
                              <button
                                type="button"
                                onClick={() => {
                                  const safeName = (projectName.trim() || 'hoerbuch').replace(/[^a-zA-Z0-9_-]/g, '_');
                                  const padded = String(idx + 1).padStart(4, '0');
                                  downloadBlob(chunkData.mp3Blob!, `${safeName}_teil_${padded}.mp3`);
                                }}
                                className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70 rounded transition-colors"
                                title={`Chunk #${idx + 1} einzeln als MP3 herunterladen`}
                              >
                                <Download size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Image Generation Toolbar */}
                        <div className="px-3 pb-3 pt-1 flex flex-col gap-3">
                          <div className="flex items-center gap-2 border-t border-zinc-100 pt-2">
                            <select
                              value={imageCounts[idx] || 1}
                              onChange={(e) => handleImageCountChange(idx, parseInt(e.target.value))}
                              className="text-xs border border-zinc-200 rounded px-2 py-1 bg-zinc-50 text-zinc-700 outline-none focus:border-indigo-400"
                            >
                              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                <option key={n} value={n}>
                                  {n} Image{n > 1 ? 's' : ''}
                                </option>
                              ))}
                            </select>

                            <button
                              onClick={() => handleGenerateImages(idx)}
                              disabled={isGeneratingImages}
                              className="flex items-center gap-2 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium rounded border border-indigo-200 transition-colors disabled:opacity-50"
                            >
                              {isGeneratingImages ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                              <span>Szenen-Illustration generieren</span>
                            </button>
                          </div>

                          {hasImages && (
                            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                              {chunkData.images!.map((img) => (
                                <div key={img.id} className="relative aspect-square group rounded-md overflow-hidden bg-zinc-100 border border-zinc-200">
                                  <img
                                    src={img.data}
                                    alt="Generated illustration"
                                    className="w-full h-full object-cover transition-transform group-hover:scale-110"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <a
                                      href={img.data}
                                      download={`illustration_${idx}_${img.id}.png`}
                                      className="p-1.5 bg-white/90 text-zinc-900 rounded-full hover:bg-white"
                                      title="Download"
                                    >
                                      <Download size={14} />
                                    </a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* --- BOTTOM MASTERING & PLAYER DECK (Sticky) --- */}
        {(finalBlob || previewUrl || generationState.isGenerating || readyChunksCount > 0) && (
          <div className="h-24 bg-white border-t border-zinc-200 flex items-center px-6 gap-4 shadow-2xl z-30 flex-shrink-0">
            
            {/* Status / Error Message Area */}
            <div className="w-1/4 min-w-[230px]">
              {generationState.error ? (
                <div className="flex flex-col gap-1 p-2 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle size={14} className="shrink-0 text-amber-600" />
                    <span className="line-clamp-2" title={generationState.error}>{generationState.error}</span>
                  </div>
                  {generationState.error.includes('Rate-Limit') && (
                    <div className="flex items-center gap-2 pt-1 border-t border-amber-200/60">
                      <button
                        type="button"
                        onClick={() => { skipRetryRef.current = true; }}
                        className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-semibold transition-colors"
                      >
                        Jetzt wiederholen
                      </button>
                      {model !== ModelId.Flash38Lite && (
                        <button
                          type="button"
                          onClick={() => {
                            setModel(ModelId.Flash38Lite);
                            skipRetryRef.current = true;
                          }}
                          className="px-2 py-0.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded text-[11px] font-medium transition-colors"
                        >
                          Zu 3.8 Lite wechseln
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : !generationState.isGenerating && readyChunksCount > 0 ? (
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 text-emerald-600">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold">{readyChunksCount} Chunks ({formatDurationHMS(totalGeneratedDurationSec)})</span>
                  </div>
                  <span className="text-[10px] text-zinc-400">Lokal im IndexedDB-Cache gesichert</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-indigo-600">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="text-xs font-medium uppercase tracking-wide">
                    Generiere ({readyChunksCount}/{generationState.totalChunks || previewChunks.length})...
                  </span>
                </div>
              )}
            </div>

            {/* Player Center + Ambience Mixer + Speed + Sleep Timer */}
            <div className="flex-1 max-w-2xl flex flex-col items-center justify-center gap-1.5">
              <audio
                ref={audioRef}
                src={previewUrl || (finalBlob ? URL.createObjectURL(finalBlob) : undefined)}
                controls
                autoPlay={!!previewUrl}
                onEnded={handleAudioEnded}
                className="w-full h-8"
              />
              <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-zinc-600">
                {/* Playback Speed */}
                <div className="flex items-center gap-1 bg-zinc-100 px-2 py-0.5 rounded-full">
                  <span className="text-zinc-400 font-semibold">Speed:</span>
                  {[0.8, 1.0, 1.25, 1.5, 2.0].map(sp => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setPlaybackSpeed(sp)}
                      className={`px-1 rounded font-mono ${playbackSpeed === sp ? 'bg-indigo-600 text-white font-bold' : 'hover:text-zinc-900'}`}
                    >
                      {sp}x
                    </button>
                  ))}
                </div>

                {/* Background Ambience Mixer */}
                <div className="flex items-center gap-1.5 bg-zinc-100 px-2.5 py-0.5 rounded-full">
                  <Flame size={11} className="text-amber-500" />
                  <span className="text-zinc-400 font-semibold">Atmosphäre:</span>
                  <select
                    value={ambiencePreset}
                    onChange={e => setAmbiencePreset(e.target.value as any)}
                    className="bg-transparent font-semibold text-zinc-700 outline-none"
                  >
                    <option value="none">Aus</option>
                    <option value="fire">Kaminfeuer</option>
                    <option value="rain">Sanfter Regen</option>
                    <option value="forest">Nachtwald</option>
                    <option value="vinyl">Warmes Vinyl</option>
                  </select>
                  {ambiencePreset !== 'none' && (
                    <input
                      type="range"
                      min="0.02"
                      max="0.5"
                      step="0.02"
                      value={ambienceVolume}
                      onChange={e => setAmbienceVolume(parseFloat(e.target.value))}
                      className="w-14 accent-indigo-600"
                      title="Atmosphären-Lautstärke"
                    />
                  )}
                </div>

                {/* Sleep Timer */}
                <div className="flex items-center gap-1 bg-zinc-100 px-2 py-0.5 rounded-full">
                  <Moon size={11} className="text-indigo-500" />
                  <select
                    value={sleepTimerMin}
                    onChange={e => setSleepTimerMin(parseInt(e.target.value))}
                    className="bg-transparent font-semibold text-zinc-700 outline-none"
                  >
                    <option value={0}>Sleep: Aus</option>
                    <option value={15}>15 Min</option>
                    <option value={30}>30 Min</option>
                    <option value={60}>60 Min</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Actions Right */}
            <div className="w-1/4 flex justify-end gap-2">
              {readyChunksCount > 0 && (
                <>
                  <button
                    onClick={() => setShowFfmpegModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Layers size={14} />
                    <span>Export & SRT</span>
                  </button>
                  <button
                    onClick={downloadFinalAudio}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Download size={14} />
                    <span>MP3</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* --- PRONUNCIATION LEXICON MODAL (Feature 4) --- */}
      {showLexiconModal && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-zinc-200 flex flex-col max-h-[82vh]">
            <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-600 text-white">
                  <BookMarked size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">Aussprache-Lexikon (Phonetic Dictionary)</h3>
                  <p className="text-xs text-zinc-500">
                    Lege fest, wie Eigennamen, Fantasy-Wörter oder Abkürzungen im gesamten 30h-Buch ausgesprochen werden.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowLexiconModal(false)}
                className="p-2 text-zinc-400 hover:text-zinc-700 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto text-xs">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRuleOrig}
                  onChange={e => setNewRuleOrig(e.target.value)}
                  placeholder="Originalwort (z.B. Cthulhu)"
                  className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  value={newRulePhon}
                  onChange={e => setNewRulePhon(e.target.value)}
                  placeholder="Lautschrift (z.B. Kuh-tuh-luh)"
                  className="flex-1 px-3 py-2 rounded-lg border border-zinc-200 outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newRuleOrig.trim() || !newRulePhon.trim()) return;
                    setPronunciationRules(prev => [
                      ...prev,
                      { id: String(Date.now()), original: newRuleOrig.trim(), phonetic: newRulePhon.trim() }
                    ]);
                    setNewRuleOrig('');
                    setNewRulePhon('');
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shrink-0"
                >
                  Hinzufügen
                </button>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {pronunciationRules.length === 0 ? (
                  <p className="text-zinc-400 text-center py-4">Noch keine Aussprache-Regeln definiert.</p>
                ) : (
                  pronunciationRules.map(rule => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-200 bg-zinc-50"
                    >
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-zinc-800">{rule.original}</span>
                        <span className="text-zinc-400">→</span>
                        <span className="text-indigo-700 font-semibold">{rule.phonetic}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPronunciationRules(prev => prev.filter(r => r.id !== rule.id))}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- STRATEGY B & STUDIO EXPORT MODAL (1h Parts, FFmpeg, Subtitles, Chapters) --- */}
      {showFfmpegModal && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-zinc-200 flex flex-col max-h-[88vh]">
            <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-600 text-white">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-zinc-900">
                    30-Stunden Export-Studio (MP3, 1h-Teile, FFmpeg, SRT & Kapitel)
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Alle professionellen Export-Werkzeuge für lange Hörbücher, YouTube, Audible & Podcasts
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFfmpegModal(false)}
                className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Option 1: Hourly Parts Download */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-zinc-900">
                      1. Stundenteile (`teil_01.mp3`, `teil_02.mp3` ...)
                    </h4>
                    <p className="text-zinc-500">
                      Automatisch in ~1-Stunden-Blöcke gruppiert – ideal für sehr lange 10h–30h Hörbücher.
                    </p>
                  </div>
                  {hourlyPartsInfo.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadAllHourlyParts}
                      className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors"
                    >
                      <Download size={14} />
                      <span>Alle {hourlyPartsInfo.length} Teile herunterladen</span>
                    </button>
                  )}
                </div>

                {hourlyPartsInfo.length === 0 ? (
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-500 text-center">
                    Noch keine fertigen Audio-Chunks vorhanden. Starte die Generierung, um Stundenteile zu erzeugen.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {hourlyPartsInfo.map(part => (
                      <div
                        key={part.partNumber}
                        className="flex items-center justify-between p-3 rounded-xl border border-zinc-200 bg-white hover:border-indigo-300 transition-colors"
                      >
                        <div>
                          <div className="font-mono font-bold text-zinc-800">{part.filename}</div>
                          <div className="text-[11px] text-zinc-500">
                            Chunks {part.chunkRange} • {formatDurationHMS(part.durationSec)} • {part.sizeMB} MB
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadHourlyPart(part)}
                          className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-900 hover:text-white text-zinc-800 rounded-lg font-semibold flex items-center gap-1 transition-colors"
                        >
                          <Download size={12} /> MP3
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Option 2: Subtitles (.SRT / .VTT) & Chapter Timestamps (YouTube / M4B FFMETADATA1) */}
              <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-indigo-950">
                  <Subtitles size={16} className="text-indigo-600" />
                  <span>2. Synchronisierte Untertitel (SRT/VTT) & Kapitel-Sprungmarken</span>
                </div>
                <p className="text-indigo-900/80 text-[11px]">
                  Exportiere zeitcodierte Untertitel für YouTube/Video-Podcasts oder Kapitel-Timestamps aus den exakten Chunk-Längen.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={readyChunksCount === 0}
                    onClick={() => handleExportSubtitles('srt')}
                    className="px-3 py-1.5 bg-white hover:bg-indigo-600 hover:text-white text-indigo-900 border border-indigo-200 rounded-lg font-semibold transition-colors disabled:opacity-40"
                  >
                    Download .SRT Untertitel
                  </button>
                  <button
                    type="button"
                    disabled={readyChunksCount === 0}
                    onClick={() => handleExportSubtitles('vtt')}
                    className="px-3 py-1.5 bg-white hover:bg-indigo-600 hover:text-white text-indigo-900 border border-indigo-200 rounded-lg font-semibold transition-colors disabled:opacity-40"
                  >
                    Download .VTT Untertitel
                  </button>
                  <button
                    type="button"
                    disabled={readyChunksCount === 0}
                    onClick={() => handleExportChapterTimestamps('youtube')}
                    className="px-3 py-1.5 bg-white hover:bg-indigo-600 hover:text-white text-indigo-900 border border-indigo-200 rounded-lg font-semibold transition-colors disabled:opacity-40"
                  >
                    YouTube Kapitel-Timestamps (.txt)
                  </button>
                  <button
                    type="button"
                    disabled={readyChunksCount === 0}
                    onClick={() => handleExportChapterTimestamps('ffmetadata')}
                    className="px-3 py-1.5 bg-white hover:bg-indigo-600 hover:text-white text-indigo-900 border border-indigo-200 rounded-lg font-semibold transition-colors disabled:opacity-40"
                  >
                    FFmpeg M4B Kapitel (FFMETADATA1)
                  </button>
                </div>
              </div>

              {/* Option 3: FFmpeg liste.txt & Command */}
              <div className="p-4 bg-zinc-900 text-zinc-100 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-white">
                    <Terminal size={16} className="text-emerald-400" />
                    <span>3. Mit FFmpeg ohne Neucodierung in &lt; 5 Sek. zusammenfügen</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadFfmpegList}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold rounded-lg transition-colors"
                  >
                    <FileText size={13} />
                    <span>liste.txt herunterladen</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 bg-black/60 border border-zinc-700 p-2.5 rounded-lg font-mono text-xs text-emerald-300">
                  <span className="truncate flex-1">{ffmpegCommand}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(ffmpegCommand, 'ffmpeg')}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded flex items-center gap-1 shrink-0 font-sans font-semibold"
                  >
                    {CopiedState === 'ffmpeg' ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    <span>{CopiedState === 'ffmpeg' ? 'Kopiert!' : 'Befehl kopieren'}</span>
                  </button>
                </div>
              </div>

              {/* Option 4: Direct Browser Zero-RAM Merge */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <h4 className="font-bold text-emerald-950 text-sm">
                    4. Direkt im Browser als Gesamt-MP3 speichern (Zero-RAM-Copy)
                  </h4>
                  <p className="text-emerald-800 text-[11px] mt-0.5">
                    Verbindet alle im IndexedDB-Cache liegenden MP3-Chunks ohne RAM-Kopiervorgang zu einer Datei.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={readyChunksCount === 0}
                  onClick={downloadFinalAudio}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold rounded-xl shrink-0 flex items-center gap-2 transition-colors"
                >
                  <Download size={15} />
                  <span>Gesamt-MP3 laden</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-zinc-100 scale-100">
            <div className="px-6 py-5 border-b border-zinc-100 flex justify-between items-center bg-white">
              <h3 className="font-bold text-lg text-zinc-900 flex items-center gap-2">
                <Settings className="text-zinc-400" size={20} /> Settings & Tier 2 Konfiguration
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 -mr-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {(() => {
                const keyDetails = getActiveKeyDetails();
                return (
                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-zinc-700">Aktiver Key im System:</span>
                      <span className="font-mono text-zinc-900 bg-white px-2 py-0.5 rounded border border-zinc-200 font-bold">
                        {keyDetails.masked}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {keyDetails.source === 'custom'
                        ? '✓ Eigener Tier 2 Key (im Browser lokal gespeichert)'
                        : keyDetails.source === 'env'
                        ? 'Projekt-Umgebung (AI Studio Standard)'
                        : 'Kein Key vorhanden'}
                    </div>
                  </div>
                );
              })()}

              <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-xs space-y-2 text-indigo-950">
                <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                  <ShieldCheck size={16} className="text-indigo-600" />
                  <span>30-Stunden Hörbuch & Tier 2 Optimierung</span>
                </div>
                <p className="text-[11px] leading-relaxed text-indigo-900/90">
                  Für 10h–30h Hörbücher (300–600+ Chunks) kombiniert die App <strong>Pacing (Taktung)</strong>,{' '}
                  <strong>IndexedDB-Festplattenspeicherung</strong> und <strong>sanften Cooldown</strong>.
                </p>
                <p className="text-[11px] leading-relaxed text-indigo-900/90 font-medium">
                  💡 <strong>Tipp für 30h-Projekte:</strong> Wähle <strong>3.8 Flash Lite</strong> + <strong>500 oder 800 Wörter pro Chunk</strong> für maximalen Durchsatz ohne RPM-Blockaden.
                </p>
              </div>

              {/* Manual Key Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-zinc-700">Tier 2 API Key eingeben</label>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${
                      keyStatus === 'valid'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : keyStatus === 'invalid'
                        ? 'bg-red-50 text-red-600 border-red-200'
                        : keyStatus === 'validating'
                        ? 'bg-blue-50 text-blue-600 border-blue-200'
                        : 'bg-zinc-100 text-zinc-400 border-zinc-200'
                    }`}
                  >
                    {keyStatus === 'idle' ? 'Eingabe' : keyStatus}
                  </span>
                </div>

                <div className="relative">
                  <input
                    type="password"
                    value={userApiKey}
                    onChange={handleApiKeyChange}
                    placeholder="AIzaSy... (Tier 2 Key einfügen)"
                    className={`w-full pl-10 pr-28 py-3 rounded-xl border text-sm outline-none transition-all shadow-sm ${
                      keyStatus === 'valid'
                        ? 'border-emerald-500 focus:ring-emerald-200'
                        : keyStatus === 'invalid'
                        ? 'border-red-300 focus:ring-red-100'
                        : 'border-zinc-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'
                    }`}
                  />
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 w-4 h-4" />

                  <button
                    onClick={testApiKey}
                    disabled={(!userApiKey && !process.env.API_KEY) || keyStatus === 'validating'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {keyStatus === 'validating' ? <Loader2 size={12} className="animate-spin" /> : 'Gegen Modell testen'}
                  </button>
                </div>
                {keyStatusMessage && (
                  <div
                    className={`flex items-start gap-2 text-xs p-2.5 rounded-lg ${
                      keyStatus === 'valid'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-600 border border-red-200'
                    }`}
                  >
                    {keyStatus === 'valid' ? (
                      <CheckCircle size={14} className="shrink-0 mt-0.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-500" />
                    )}
                    <span>{keyStatusMessage}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs">
                <button
                  onClick={handleSelectPaidKey}
                  className="text-zinc-600 hover:text-zinc-900 font-medium underline flex items-center gap-1"
                >
                  <span>AI Studio Key-Auswahl öffnen</span>
                  <ChevronRight size={12} />
                </button>
                <a
                  href="https://ai.google.dev/pricing"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-zinc-400 hover:text-indigo-600 transition-colors"
                >
                  Preise & Quoten
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;