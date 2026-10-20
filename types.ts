export enum VoiceName {
  Zephyr = 'Zephyr',
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Leda = 'Leda',
  Orus = 'Orus',
  Aoede = 'Aoede',
  Callirrhoe = 'Callirrhoe',
  Autonoe = 'Autonoe',
  Enceladus = 'Enceladus',
  Iapetus = 'Iapetus',
  Umbriel = 'Umbriel',
  Algieba = 'Algieba',
  Despina = 'Despina',
  Erinome = 'Erinome',
  Algenib = 'Algenib',
  Rasalgethi = 'Rasalgethi',
  Laomedeia = 'Laomedeia',
  Achernar = 'Achernar',
  Alnilam = 'Alnilam',
  Schedar = 'Schedar',
  Gacrux = 'Gacrux',
  Pulcherrima = 'Pulcherrima',
  Achird = 'Achird',
  Zubenelgenubi = 'Zubenelgenubi',
  Vindemiatrix = 'Vindemiatrix',
  Sadachbia = 'Sadachbia',
  Sadaltager = 'Sadaltager',
  Sulafat = 'Sulafat',
}

export interface VoiceMetadata {
  name: VoiceName;
  gender: 'Female' | 'Male';
  tone: string;
  description: string;
  bestFor: string;
}

export const VOICE_CATALOG: VoiceMetadata[] = [
  { name: VoiceName.Zephyr, gender: 'Female', tone: 'Bright & Clear', description: 'Klare, strahlende und präsente Stimme', bestFor: 'Sachbuch & Moderne Romane' },
  { name: VoiceName.Puck, gender: 'Male', tone: 'Upbeat & Lively', description: 'Lebendige, dynamische und jugendliche Stimme', bestFor: 'Abenteuer & Jugendbuch' },
  { name: VoiceName.Charon, gender: 'Male', tone: 'Deep & Calm', description: 'Tiefe, ruhige und autoritative Erzählstimme', bestFor: 'Thriller, Krimi & Historisch' },
  { name: VoiceName.Kore, gender: 'Female', tone: 'Firm & Poised', description: 'Souveräne, feste und ausdrucksstarke Stimme', bestFor: 'Biografien & Business' },
  { name: VoiceName.Fenrir, gender: 'Male', tone: 'Passionate & Intense', description: 'Ausdrucksstarke, dramatische und energische Stimme', bestFor: 'Fantasy & Action-Literatur' },
  { name: VoiceName.Leda, gender: 'Female', tone: 'Youthful & Energetic', description: 'Frische, leichte und begeisternde Stimme', bestFor: 'Young Adult & Comedy' },
  { name: VoiceName.Orus, gender: 'Male', tone: 'Authoritative & Resonant', description: 'Kräftige, ruhige und vertrauenswürdige Stimme', bestFor: 'Epen & Wissenschaft' },
  { name: VoiceName.Aoede, gender: 'Female', tone: 'Breezy & Natural', description: 'Entspannte, flüssige und natürliche Erzählerin', bestFor: 'Belletristik & Erzählungen' },
  { name: VoiceName.Callirrhoe, gender: 'Female', tone: 'Easy-going & Warm', description: 'Sanfte, unaufgeregte und angenehme Stimme', bestFor: 'Romantik & Achtsamkeit' },
  { name: VoiceName.Autonoe, gender: 'Female', tone: 'Bright & Cheerful', description: 'Freundliche, helle und optimistische Stimme', bestFor: 'Kinderbuch & Ratgeber' },
  { name: VoiceName.Enceladus, gender: 'Male', tone: 'Breathy & Intimate', description: 'Sanfte, gehauchte und atmosphärische Stimme', bestFor: 'Mystery, Lyrik & Horror' },
  { name: VoiceName.Iapetus, gender: 'Male', tone: 'Clear & Articulate', description: 'Präzise, glasklare Studio-Sprecherstimme', bestFor: 'Dokumentation & Lehrbuch' },
  { name: VoiceName.Umbriel, gender: 'Male', tone: 'Smooth & Relaxed', description: 'Geschmeidige, entspannte Bariton-Stimme', bestFor: 'Langstrecken-Romane' },
  { name: VoiceName.Algieba, gender: 'Male', tone: 'Velvety & Rich', description: 'Samtige, warme und tiefe Klangfarbe', bestFor: 'Klassiker & Drama' },
  { name: VoiceName.Despina, gender: 'Female', tone: 'Smooth & Flowing', description: 'Weiche, harmonische und elegante Stimme', bestFor: 'Literarische Erzählungen' },
  { name: VoiceName.Erinome, gender: 'Female', tone: 'Crisp & Articulate', description: 'Prägnante, strukturierte und seriöse Stimme', bestFor: 'Reportagen & Fachbuch' },
  { name: VoiceName.Algenib, gender: 'Male', tone: 'Gravelly & Characterful', description: 'Markante, leicht raue Charakterstimme', bestFor: 'Noir-Krimi & Sci-Fi' },
  { name: VoiceName.Rasalgethi, gender: 'Male', tone: 'Informative & Steady', description: 'Ruhiger, gleichmäßiger Dokumentations-Stil', bestFor: 'Geschichte & Wissen' },
  { name: VoiceName.Laomedeia, gender: 'Female', tone: 'Upbeat & Engaging', description: 'Mitreißende, lebendige Erzählerin', bestFor: 'Kurzgeschichten & Dialoge' },
  { name: VoiceName.Achernar, gender: 'Female', tone: 'Soft & Gentle', description: 'Sehr sanfte, beruhigende und leise Stimme', bestFor: 'Schlafgeschichten & Meditation' },
  { name: VoiceName.Alnilam, gender: 'Male', tone: 'Firm & Grounded', description: 'Erdige, stabile und markante Stimme', bestFor: 'Historische Epen' },
  { name: VoiceName.Schedar, gender: 'Male', tone: 'Balanced & Neutral', description: 'Ausgeglichene, unaufdringliche Erzählstimme', bestFor: '30h Marathon-Hörbücher' },
  { name: VoiceName.Gacrux, gender: 'Female', tone: 'Mature & Seasoned', description: 'Reife, erfahrene und charaktervolle Stimme', bestFor: 'Chroniken & Memoiren' },
  { name: VoiceName.Pulcherrima, gender: 'Female', tone: 'Expressive & Forward', description: 'Theatralische, nuancenreiche Schauspielstimme', bestFor: 'Hörspiel & Dialoge' },
  { name: VoiceName.Achird, gender: 'Male', tone: 'Friendly & Conversational', description: 'Sympathische, nahbare Erzählerstimme', bestFor: 'Biografien & Essays' },
  { name: VoiceName.Zubenelgenubi, gender: 'Male', tone: 'Casual & Natural', description: 'Lockere, moderne und authentische Stimme', bestFor: 'Gegenwartsliteratur' },
  { name: VoiceName.Vindemiatrix, gender: 'Female', tone: 'Gentle & Soothing', description: 'Milde, tröstende und harmonische Stimme', bestFor: 'Poesie & Wohlfühlromane' },
  { name: VoiceName.Sadachbia, gender: 'Male', tone: 'Lively & Animated', description: 'Ausdrucksstarke, wendige Stimme für viele Rollen', bestFor: 'Dialogreiche Romane' },
  { name: VoiceName.Sadaltager, gender: 'Male', tone: 'Knowledgeable & Wise', description: 'Weise, bedachte und klassische Vorlesestimme', bestFor: 'Philosophie & Weltliteratur' },
  { name: VoiceName.Sulafat, gender: 'Female', tone: 'Warm & Comforting', description: 'Herzliche, einladende und runde Stimme', bestFor: 'Familiensagas & Romane' },
];

export enum ModelId {
  Flash38 = 'gemini-3.8-flash-tts',
  Flash38Lite = 'gemini-3.8-flash-lite-tts',
  Flash31 = 'gemini-3.1-flash-tts-preview',
  Flash = 'gemini-2.5-flash-preview-tts',
  Pro = 'gemini-2.5-pro-preview-tts',
}

export type AudioFormat = 'wav' | 'mp3';

export interface GeneratedImage {
  id: string;
  data: string; // base64 url
}

export interface PronunciationRule {
  id: string;
  original: string;
  phonetic: string;
}

export interface AudioChunk {
  id: number;
  text: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  data?: Uint8Array;
  mp3Blob?: Blob;
  durationSec?: number;
  customVoice?: VoiceName; // Feature: Per-chunk custom voice override
  customStyle?: string;    // Feature: Per-chunk custom style note
  chapterTitle?: string;   // Feature: Detected chapter marker
  images?: GeneratedImage[];
  isGeneratingImages?: boolean;
}

export interface GenerationState {
  isGenerating: boolean;
  progress: number;
  totalChunks: number;
  currentChunkIndex: number;
  error?: string;
}

export const SAMPLE_RATE = 24000;
export const NUM_CHANNELS = 1;