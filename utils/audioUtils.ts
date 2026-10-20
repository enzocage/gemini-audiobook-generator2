import { SAMPLE_RATE, NUM_CHANNELS, PronunciationRule, AudioChunk } from '../types';

/**
 * Counts words in a string.
 */
export const countWords = (text: string): number => {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
};

/**
 * Checks if a string ends with sentence-ending punctuation (. ! ? …)
 * optionally followed by closing quotation marks or parentheses/brackets.
 */
export const isSentenceEnd = (text: string): boolean => {
  const trimmed = text.trim();
  return /[.!?…]["'”’»›“\)\]]*$/.test(trimmed);
};

/**
 * Splits text into sentences using lookbehind for sentence terminators.
 * Respects . ! ? … followed by optional quotes and whitespace.
 */
export const splitIntoSentences = (text: string): string[] => {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // Split on sentence terminators (. ! ? …) followed by optional quote/bracket and whitespace
  const sentenceEndRegex = /(?<=[.!?…]["'”’»›“\)\]]*)\s+/;
  const rawSentences = normalized.split(sentenceEndRegex);

  const sentences: string[] = [];
  for (const s of rawSentences) {
    const trimmed = s.trim();
    if (trimmed.length > 0) {
      sentences.push(trimmed);
    }
  }

  return sentences;
};

/**
 * Groups sentences into chunks of approximately targetWords (default: 300 words).
 * ALWAYS ensures every chunk ends cleanly at a sentence boundary.
 */
export const createSmartChunks = (text: string, targetWords: number = 300): string[] => {
  const normalized = text.trim();
  if (!normalized) return [];

  // Handle legacy callers who might pass character count like 2000+
  const effectiveTargetWords = targetWords > 1500 ? Math.round(targetWords / 6.5) : targetWords;

  const rawSentences = splitIntoSentences(normalized);
  if (rawSentences.length === 0) return [];

  // Ensure every sentence fragment has a sentence ending if followed by another sentence
  const sentences = rawSentences.map((s, idx) => {
    let sent = s.trim();
    if (idx < rawSentences.length - 1 && !isSentenceEnd(sent)) {
      sent = sent + '.';
    }
    return sent;
  });

  const chunks: string[] = [];
  let currentChunkSentences: string[] = [];
  let currentWords = 0;

  for (const sentence of sentences) {
    const sWords = countWords(sentence);

    if (currentChunkSentences.length === 0) {
      currentChunkSentences.push(sentence);
      currentWords = sWords;

      // If a single sentence alone is already at or above target words, close chunk
      if (currentWords >= effectiveTargetWords) {
        chunks.push(currentChunkSentences.join(' '));
        currentChunkSentences = [];
        currentWords = 0;
      }
    } else {
      const candidateWords = currentWords + sWords;

      if (candidateWords < effectiveTargetWords) {
        // Still below target, keep adding
        currentChunkSentences.push(sentence);
        currentWords = candidateWords;
      } else {
        // candidateWords >= effectiveTargetWords
        const diffCurrent = Math.abs(effectiveTargetWords - currentWords);
        const diffCandidate = Math.abs(candidateWords - effectiveTargetWords);

        // If current chunk is too short (< 55% target), or candidate is closer to target:
        if (currentWords < Math.floor(effectiveTargetWords * 0.55) || diffCandidate <= diffCurrent) {
          currentChunkSentences.push(sentence);
          chunks.push(currentChunkSentences.join(' '));
          currentChunkSentences = [];
          currentWords = 0;
        } else {
          // Current chunk is already closer to target words, finalize it at sentence end
          chunks.push(currentChunkSentences.join(' '));
          currentChunkSentences = [sentence];
          currentWords = sWords;

          if (currentWords >= effectiveTargetWords) {
            chunks.push(currentChunkSentences.join(' '));
            currentChunkSentences = [];
            currentWords = 0;
          }
        }
      }
    }
  }

  // Push remaining sentences as final chunk
  if (currentChunkSentences.length > 0) {
    chunks.push(currentChunkSentences.join(' '));
  }

  // Merge trailing tiny chunk (< 75 words) with previous chunk if combined <= targetWords * 1.3
  if (chunks.length > 1) {
    const lastChunk = chunks[chunks.length - 1];
    const prevChunk = chunks[chunks.length - 2];
    const lastWords = countWords(lastChunk);
    const prevWords = countWords(prevChunk);

    if (lastWords < 75 && (prevWords + lastWords) <= Math.round(effectiveTargetWords * 1.3)) {
      chunks[chunks.length - 2] = prevChunk + ' ' + lastChunk;
      chunks.pop();
    }
  }

  // Final verification: ensure every chunk ends with sentence punctuation
  return chunks.map(chunk => {
    const trimmed = chunk.trim();
    if (!isSentenceEnd(trimmed)) {
      return trimmed + '.';
    }
    return trimmed;
  });
};

/**
 * Decodes a base64 string into a Uint8Array.
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  // Gemini 3.8 TTS unary calls return a complete WAV file with a 44-byte RIFF header.
  // Strip the 44-byte WAV header if present so downstream MP3/WAV encoders receive clean raw 16-bit PCM.
  if (
    bytes.length > 44 &&
    bytes[0] === 0x52 && // 'R'
    bytes[1] === 0x49 && // 'I'
    bytes[2] === 0x46 && // 'F'
    bytes[3] === 0x46 && // 'F'
    bytes[8] === 0x57 && // 'W'
    bytes[9] === 0x41 && // 'A'
    bytes[10] === 0x56 && // 'V'
    bytes[11] === 0x45 // 'E'
  ) {
    return bytes.slice(44);
  }
  return bytes;
};

/**
 * Concatenates multiple Uint8Arrays (Raw PCM Int16 data) into one.
 */
export const concatenateAudioBuffers = (buffers: Uint8Array[]): Uint8Array => {
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    result.set(buffer, offset);
    offset += buffer.length;
  }
  return result;
};

/**
 * Writes a WAV header for the given PCM data.
 * Assumes 16-bit PCM, Monophonic, 24kHz (default Gemini output).
 */
export const createWavFile = (pcmData: Uint8Array): Blob => {
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.length, true); // ChunkSize
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, NUM_CHANNELS, true); // NumChannels
  view.setUint32(24, SAMPLE_RATE, true); // SampleRate
  view.setUint32(28, SAMPLE_RATE * NUM_CHANNELS * 2, true); // ByteRate
  view.setUint16(32, NUM_CHANNELS * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, pcmData.length, true); // Subchunk2Size

  const blob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
  return blob;
};

// Define global type for lamejs since we load it via script tag
declare global {
  interface Window {
    lamejs: any;
  }
}

/**
 * Encodes PCM data to MP3 using lamejs
 */
export const createMp3File = (pcmData: Uint8Array): Blob => {
  if (!window.lamejs) {
    throw new Error("MP3 encoder library (lamejs) failed to load.");
  }

  // Ensure we are working with 16-bit samples
  const samples = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
  
  // Initialize encoder: 1 channel, 24000 Hz, 128kbps
  const mp3encoder = new window.lamejs.Mp3Encoder(NUM_CHANNELS, SAMPLE_RATE, 128);
  const mp3Data: Uint8Array[] = [];
  
  const blockSize = 1152; 
  
  for (let i = 0; i < samples.length; i += blockSize) {
    const sampleChunk = samples.subarray(i, i + blockSize);
    const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }
  
  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
};

/**
 * Zero-RAM-copy concatenation of MP3 Blobs.
 * Since each chunk is encoded as CBR 128kbps raw MP3 frames without ID3 headers,
 * browser Blob composition joins them without allocating a contiguous ArrayBuffer,
 * supporting 30+ hour MP3 files (~1.7 GB) in milliseconds without out-of-memory errors.
 */
export const mergeMp3BlobsZeroCopy = (mp3Blobs: Blob[]): Blob => {
  return new Blob(mp3Blobs, { type: 'audio/mp3' });
};

/**
 * Calculates exact duration in seconds from 24kHz 16-bit mono PCM byte length.
 */
export const calculatePcmDurationSec = (pcmByteLength: number): number => {
  return pcmByteLength / (SAMPLE_RATE * NUM_CHANNELS * 2);
};

/**
 * Formats seconds into human-readable HH:MM:SS or Xh Ym Zs.
 */
export const formatDurationHMS = (totalSeconds: number): string => {
  if (!totalSeconds || totalSeconds <= 0) return '0s';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Helper to play raw PCM buffer in browser for preview
 */
export const playAudioBuffer = async (pcmData: Uint8Array, context: AudioContext): Promise<void> => {
  const int16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }

  const audioBuffer = context.createBuffer(NUM_CHANNELS, float32.length, SAMPLE_RATE);
  audioBuffer.copyToChannel(float32, 0);

  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(context.destination);
  source.start();
};

/**
 * Feature: Smart Manuscript Cleaner & Normalizer
 * Fixes broken PDF hyphenation, strips standalone page numbers, normalizes quotes & spacing,
 * and expands common German/English abbreviations for natural TTS flow.
 */
export const cleanAndNormalizeManuscript = (rawText: string): string => {
  return rawText
    .replace(/\r\n/g, '\n')
    // Fix broken PDF hyphenated words across line breaks (e.g., "Ge-\nschichte" -> "Geschichte")
    .replace(/([a-zäöüß])-\s*\n\s*([a-zäöüß])/gi, '$1$2')
    // Remove standalone page number lines (e.g. "- 14 -", "Seite 23", "Page 12", or pure digits on a line)
    .replace(/^\s*(?:-\s*\d+\s*-|(?:Seite|Page)\s+\d+|\d{1,4})\s*$/gim, '')
    // Strip markdown formatting symbols (#, **, __, *) while keeping text
    .replace(/^[#>*]+\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // Expand common abbreviations for smoother German/English narration
    .replace(/\bz\.\s*B\./g, 'zum Beispiel')
    .replace(/\bd\.\s*h\./g, 'das heißt')
    .replace(/\bu\.\s*a\./g, 'unter anderem')
    .replace(/\bbzw\./g, 'beziehungsweise')
    .replace(/\bDr\./g, 'Doktor')
    .replace(/\bProf\./g, 'Professor')
    .replace(/\bca\./g, 'zirka')
    .replace(/\busw\./g, 'und so weiter')
    // Collapse excessive blank lines & spaces
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * Feature: Pronunciation Lexicon Replacer
 * Applies user-defined phonetic substitutions before TTS generation.
 */
export const applyPronunciationLexicon = (text: string, rules: PronunciationRule[]): string => {
  if (!rules || rules.length === 0) return text;
  let result = text;
  for (const rule of rules) {
    const orig = rule.original.trim();
    const phon = rule.phonetic.trim();
    if (!orig || !phon) continue;
    const escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(regex, phon);
  }
  return result;
};

/**
 * Feature: Automatic Chapter Heading Detector
 */
export const detectChapterTitle = (chunkText: string, index: number): string | undefined => {
  const firstSentence = chunkText.split(/(?<=[.!?…])\s+/)[0] || '';
  const match = firstSentence.match(/^(?:Kapitel|Chapter|Teil|Part|Prolog|Prologue|Epilog|Epilogue|Akt|Buch)\s+[0-9IVXLCDM]+[^.!?]*/i);
  if (match) {
    return match[0].trim().slice(0, 60);
  }
  if (index === 0) {
    return 'Kapitel 1 / Beginn';
  }
  return undefined;
};

const formatSrtTime = (seconds: number, vtt: boolean = false): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  const sep = vtt ? '.' : ',';
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`;
};

const formatTimestampHMS = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/**
 * Feature: SRT & VTT Subtitle Exporter
 */
export const generateSubtitles = (chunks: AudioChunk[], format: 'srt' | 'vtt' = 'srt'): string => {
  const completed = chunks.filter(c => c.status === 'completed');
  let currentSec = 0;
  const blocks: string[] = [];

  if (format === 'vtt') {
    blocks.push('WEBVTT\n');
  }

  completed.forEach((chunk, i) => {
    const dur = chunk.durationSec || Math.max(10, countWords(chunk.text) / 2.5);
    const start = formatSrtTime(currentSec, format === 'vtt');
    const end = formatSrtTime(currentSec + dur, format === 'vtt');
    currentSec += dur;
    blocks.push(`${i + 1}\n${start} --> ${end}\n${chunk.text.trim()}\n`);
  });

  return blocks.join('\n');
};

/**
 * Feature: YouTube / Podcast / Audible Chapter Timestamps & FFMETADATA1 Exporter
 */
export const generateChapterTimestamps = (chunks: AudioChunk[], bookTitle: string): { youtube: string; ffmetadata: string } => {
  const completed = chunks.filter(c => c.status === 'completed');
  let currentSec = 0;
  const ytLines: string[] = [];
  const ffLines: string[] = [';FFMETADATA1', `title=${bookTitle}`, ''];

  completed.forEach((chunk, idx) => {
    const dur = chunk.durationSec || Math.max(10, countWords(chunk.text) / 2.5);
    const detected = chunk.chapterTitle || detectChapterTitle(chunk.text, idx);
    // Include chapter if detected or every 15 chunks (~45-60 mins)
    if (detected || idx % 15 === 0) {
      const label = detected || `Abschnitt #${idx + 1}`;
      ytLines.push(`${formatTimestampHMS(currentSec)} - ${label}`);
      const startMs = Math.round(currentSec * 1000);
      const endMs = Math.round((currentSec + dur) * 1000);
      ffLines.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${startMs}`, `END=${endMs}`, `title=${label}`, '');
    }
    currentSec += dur;
  });

  return {
    youtube: ytLines.join('\n'),
    ffmetadata: ffLines.join('\n')
  };
};

/**
 * Feature: Web Audio API Procedural Background Ambience Synthesizer
 * Generates soothing background soundscapes (Rain, Fireplace, Night Forest, Warm Vinyl)
 * in real time without external audio files.
 */
export class AmbienceSoundEngine {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private isRunning: boolean = false;

  public start(preset: 'rain' | 'fire' | 'forest' | 'vinyl', volume: number = 0.15) {
    this.stop();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtx();
    const sampleRate = this.ctx.sampleRate;
    const seconds = 6;
    const bufferSize = sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink/Brown noise shaping
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      let sample = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;

      if (preset === 'fire') {
        // Add warm crackle impulses
        const crackle = Math.random() > 0.9985 ? (Math.random() * 2 - 1) * 0.65 : 0;
        sample = sample * 0.45 + crackle;
      } else if (preset === 'vinyl') {
        const dust = Math.random() > 0.9992 ? (Math.random() * 2 - 1) * 0.35 : 0;
        sample = sample * 0.25 + dust;
      } else if (preset === 'forest') {
        const breeze = Math.sin((i / sampleRate) * Math.PI * 0.33) * 0.4 + 0.6;
        sample = sample * 0.5 * breeze;
      }
      data[i] = Math.max(-1, Math.min(1, sample));
    }

    this.sourceNode = this.ctx.createBufferSource();
    this.sourceNode.buffer = buffer;
    this.sourceNode.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = preset === 'rain' ? 1400 : preset === 'fire' ? 950 : preset === 'forest' ? 700 : 1800;

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = volume;

    this.sourceNode.connect(filter);
    filter.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);
    this.sourceNode.start();
    this.isRunning = true;
  }

  public setVolume(volume: number) {
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
    }
  }

  public stop() {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
    this.isRunning = false;
  }
}