# 🎧 Audiobook Generator

Ein modernes, leistungsstarkes Web-Tool zur Konvertierung von Texten und Manuskripten in lebendige, professionelle Hörbücher mithilfe der neuesten **Google Gemini Text-to-Speech (TTS)** Modelle.

---

## 🌟 Highlights & Funktionen

- **🎙️ Modernste Gemini TTS-Modelle**:
  - `gemini-3.8-flash-tts` & `gemini-3.8-flash-lite-tts` (Ultraschnell, kosteneffizient & expressiv)
  - `gemini-3.1-flash-tts-preview`
  - `gemini-2.5-flash-preview-tts` & `gemini-2.5-pro-preview-tts`
- **🎭 30+ Einzigartige Sprecherstimmen**:
  - Umfassender Katalog mit 30 männlichen und weiblichen Stimmen (u.a. *Fenrir*, *Puck*, *Charon*, *Aoede*, *Kore*, *Zephyr*, *Umbriel*).
  - Jede Stimme mit Klangfarben-Charakterisierung und Genre-Empfehlungen (z.B. Thriller, Fantasy, Sachbuch, Roman, Meditation).
- **✂️ Intelligentes Satz-Chunking**:
  - Automatische Aufteilung langer Texte unter strikter Wahrung natürlicher Satzgrenzen (`.`, `!`, `?`).
  - Frei konfigurierbare Chunk-Größen (z. B. 1000–3000 Zeichen).
- **🔍 Chunk-Vorschau & Gezielter Einstieg**:
  - *"Chunk Now (Preview)"*: Vollständige Vorschau aller Textsegmente vor dem Start.
  - *"Start from here"*: Beliebige Chunks überspringen oder bei einem bestimmten Abschnitt fortsetzen.
  - *Per-Chunk Override*: Individuelle Stimmen oder Tonlagen-Anweisungen für einzelne Abschnitte definieren.
- **💰 Echtzeit-Kosten- & Tokenrechner**:
  - Live-Berechnung der voraussichtlichen Tokens und USD-Kosten bei der Texteingabe.
- **🎶 High-Quality Audio-Export (WAV & MP3)**:
  - Automatischer Download einzelner Abschnitte während der Generierung (Sicherheits-Backup).
  - Client-seitige Zusammenführung aller Segmente zu einem vollständigen, lückenlosen Gesamthörbuch (`WAV` oder `MP3`).
- **📖 Aussprache-Wörterbuch (Phonetik)**:
  - Definition eigener Ersetzungs- und Ausspracheregeln für Eigennamen, Fachbegriffe und Fremdwörter.
- **🖼️ Szenen-Illustration (KI-Bildgenerierung)**:
  - Optionale visuelle Illustration von Szenen passend zu Textabschnitten.
- **🛡️ Ausfallsicherheit & Ratenlimit-Schutz**:
  - Automatische Erkennung von `429 RESOURCE_EXHAUSTED` / Quota-Limits mit intelligentem exponentiellem Backoff und Retry-Schleifen.
- **🔐 Lokale Datensicherheit**:
  - API-Keys können wahlweise per `.env.local` oder direkt in der Weboberfläche eingegeben und im Browser-Speicher abgelegt werden.

---

## 📋 Voraussetzungen

- **Node.js**: Version 18.x oder neuer (empfohlen: v20+)
- **npm** oder ein alternativer Paketmanager (pnpm, yarn)
- **Google Gemini API Key**: Kostenlos oder mit Pay-As-You-Go unter [Google AI Studio](https://aistudio.google.com/app/apikey) erhältlich.

---

## 🚀 Schnellstart (Lokale Installation)

### 1. Repository klonen
```bash
git clone https://github.com/enzocage/gemini-audiobook-generator2.git
cd gemini-audiobook-generator2
```

### 2. Abhängigkeiten installieren
```bash
npm install
```

### 3. Umgebungsvariablen konfigurieren
Kopiere die Vorlage `.env.example` in eine neue Datei `.env.local`:
```bash
cp .env.example .env.local
```

Öffne `.env.local` und trage deinen Gemini API-Key ein:
```env
GEMINI_API_KEY=AIzaSy...DeinSchluesselHier
```

> **Hinweis:** Der API-Schlüssel kann alternativ auch direkt in der laufenden Web-App über das Zahnrad/Schlüssel-Symbol oben rechts hinterlegt und getestet werden.

### 4. Entwicklungsserver starten
```bash
npm run dev
```
Die App steht anschließend standardmäßig unter [http://localhost:5173](http://localhost:5173) im Browser bereit.

---

## 🛠️ Verfügbare NPM-Befehle

| Befehl | Beschreibung |
|---|---|
| `npm run dev` | Startet den Vite-Entwicklungsserver mit Hot Module Replacement (HMR) |
| `npm run build` | Erstellt das optimierte Produktions-Bundle im Verzeichnis `dist/` |
| `npm run preview` | Startet einen lokalen Webserver zur Vorschau des Produktions-Builds |

---

## 📁 Projektstruktur

```
gemini-audiobook-generator2/
├── .env.example              # Vorlage für Umgebungsvariablen
├── .gitignore                # Git-Ausschlussregeln
├── App.tsx                   # Hauptkomponente: State-Management, Chunking & Audio-UI
├── index.html                # HTML-Einstiegspunkt
├── index.tsx                 # React DOM Root
├── package.json              # Projekt-Metadaten und Abhängigkeiten
├── tsconfig.json             # TypeScript-Konfiguration
├── vite.config.ts            # Vite-Build-Konfiguration & API-Key-Injektion
├── types.ts                  # Datenmodelle, Voice-Katalog & Enums
├── components/
│   ├── FormatSelector.tsx    # Umschalter zwischen WAV und MP3
│   ├── ModelSelector.tsx     # Modellauswahl (Gemini 3.8 Flash, 3.8 Flash-Lite, etc.)
│   ├── TextInput.tsx         # Manuskript-Eingabe mit Zählern und Datei-Upload
│   └── VoiceSelector.tsx     # Filter- und Auswahldialog für alle 30 Stimmen
├── services/
│   └── geminiService.ts      # Google GenAI SDK Wrapper, TTS-Anfragen & Key-Validierung
└── utils/
    ├── audioUtils.ts         # PCM/WAV/MP3 Kodierung, Chunking & Audio-Merging
    └── storageUtils.ts       # Lokale Speicher- und Exporthelfer
```

---

## 🎙️ Überblick über die Sprachmodelle

| Modell | Beschreibung | Empfohlener Einsatz |
|---|---|---|
| `gemini-3.8-flash-tts` | Neuestes High-Speed TTS-Modell | Standard für die meisten Hörbücher & Romane |
| `gemini-3.8-flash-lite-tts` | Ultraleicht & maximal kostengünstig | Sehr lange Texte, Testläufe & Drafts |
| `gemini-3.1-flash-tts-preview` | Stabile Flash-TTS Vorschauversion | Allgemeine Sprachsynthese |
| `gemini-2.5-flash-preview-tts` | Bewährtes Flash-Audiomodell | Hohe Geschwindigkeit, geringe Latenz |
| `gemini-2.5-pro-preview-tts` | Pro-Modell für maximale Nuancierung | Komplexe dramatische Lesungen |

---

## 💡 Tipps für die Hörbuch-Erstellung

1. **Abschnittslänge (Chunking)**:
   - Halte Abschnitte zwischen 1.500 und 2.500 Zeichen. Dies liefert den flüssigsten Sprachrhythmus und minimiert API-Timeouts.
2. **Ratenlimits (Rate Limits)**:
   - Die App enthält bereits integrierte Verzögerungen und automatische Wiederholungsversuche bei `429`-Meldungen.
   - Bei Free-Tier Keys empfiehlt sich die Nutzung von `gemini-3.8-flash-lite-tts`.
3. **Format**:
   - Für die Weiterverarbeitung und DAW-Schnittprogramme empfiehlt sich **WAV** (unkomprimiertes 24kHz PCM).
   - Für das direkte Anhören auf mobilen Geräten oder geringeren Speicherplatzbedarf wähle **MP3**.

---

## 📄 Lizenz

Dieses Projekt ist für private und kommerzielle Entwicklungszwecke vorgesehen. Bitte beachte die Nutzungsbedingungen der [Google Gemini API](https://ai.google.dev/terms).
