import { GoogleGenAI, Modality, Type, GenerateContentConfig } from "@google/genai";
import { VoiceName } from "../types";

// State to hold dynamic user API key
let customApiKey: string | null = null;

export const setCustomApiKey = (key: string | null) => {
  if (key) {
    customApiKey = key.trim();
  } else {
    customApiKey = null;
  }
};

// Helper to get the client instance with the most current key
const getClient = () => {
  const key = customApiKey || process.env.API_KEY;
  if (!key) {
    // This might happen if env is missing and user hasn't set one
    throw new Error("API Key is missing. Please provide one in the settings.");
  }
  
  // Debug log (masked) to ensure we are using the expected key
  const masked = key.length > 4 ? `...${key.slice(-4)}` : 'INVALID';
  console.log(`[GeminiService] Using API Key ending in: ${masked}`);

  return new GoogleGenAI({ apiKey: key });
};

// Helper to get active key details for UI transparency
export const getActiveKeyDetails = (): { hasKey: boolean; source: 'custom' | 'env' | 'none'; masked: string } => {
  const key = customApiKey || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  if (!key || key.trim() === '') {
    return { hasKey: false, source: 'none', masked: 'Kein API-Key hinterlegt' };
  }
  const source = customApiKey ? 'custom' : 'env';
  const trimmed = key.trim();
  const masked = trimmed.length > 8 ? `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}` : 'Key hinterlegt';
  return { hasKey: true, source, masked };
};

// Enhanced helper to test the key with selected model (including TTS models)
export const validateApiKey = async (key: string, modelToTest?: string): Promise<{ success: boolean; message: string }> => {
    const testAi = new GoogleGenAI({ apiKey: key.trim() });
    const targetModel = modelToTest || 'gemini-3.8-flash';
    try {
        if (targetModel.includes('tts')) {
            // For TTS models, perform a tiny 1-word generation to verify actual audio quota
            await testAi.models.generateContent({
                model: targetModel,
                contents: { parts: [{ text: 'Test' }] },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: VoiceName.Puck,
                            }
                        }
                    }
                }
            });
        } else {
            await testAi.models.generateContent({
                model: targetModel,
                contents: { parts: [{ text: 'Ping' }] },
            });
        }
        return { success: true, message: `Key ist aktiv & Quota für ${targetModel} bestätigt!` };
    } catch (error: any) {
        handleGeminiError(error);
        throw error;
    }
};

const handleGeminiError = (error: any) => {
  let message = "Ein unerwarteter Fehler ist aufgetreten.";
  let isRateLimit = false;
  let isQuotaZero = false;
  let retryAfterSeconds: number | null = null;

  // Extract message from standard Error or JSON
  if (error instanceof Error) {
    message = error.message;
    try {
      if (message.trim().startsWith('{')) {
        const parsed = JSON.parse(message);
        if (parsed.error) {
          message = parsed.error.message || message;
          if (parsed.error.code === 429 || parsed.error.status === 'RESOURCE_EXHAUSTED') {
             isRateLimit = true;
          }
        }
      }
    } catch (e) {}
  } else if (typeof error === 'object' && error !== null) {
      if ((error as any).error) {
         const errObj = (error as any).error;
         message = errObj.message || JSON.stringify(errObj);
         if (errObj.code === 429 || errObj.status === 'RESOURCE_EXHAUSTED') {
            isRateLimit = true;
         }
      } else {
         message = String((error as any).message || JSON.stringify(error));
      }
  } else {
      message = String(error);
  }

  const lowerMsg = message.toLowerCase();

  // Check for quota zero (free tier or model not allowed)
  if (lowerMsg.includes('limit: 0') || lowerMsg.includes('limit:0')) {
      isQuotaZero = true;
      isRateLimit = true;
  }

  // Detect rate limit status / keywords
  if (
      lowerMsg.includes('429') || 
      lowerMsg.includes('quota') || 
      lowerMsg.includes('resource_exhausted') || 
      lowerMsg.includes('too many requests') ||
      lowerMsg.includes('rate limit')
  ) {
      isRateLimit = true;
  }

  // Parse retry delay if provided by Google API
  const retryMatch = message.match(/retry\s+(?:after|in)\s+([0-9.]+)\s*s/i) || message.match(/retrydelay["':\s]+([0-9.]+)/i);
  if (retryMatch && retryMatch[1]) {
      const parsedSeconds = Math.ceil(parseFloat(retryMatch[1]));
      if (parsedSeconds > 0 && parsedSeconds <= 120) {
          retryAfterSeconds = parsedSeconds;
      }
  }

  if (isQuotaZero) {
      console.error("Gemini API Quota Zero:", message);
      throw new Error("Quota-Limit ist 0 für dieses Modell. Bitte prüfe deinen Tier 2 API-Key in den Einstellungen.");
  }

  if (isRateLimit) {
      console.warn("Gemini API Rate Limit Hit:", message);
  } else {
      console.error("Gemini API Error:", error);
  }

  const enhancedError = new Error(message);
  (enhancedError as any).isRateLimit = isRateLimit;
  (enhancedError as any).retryAfterSeconds = retryAfterSeconds;
  (enhancedError as any).rawDetails = message;
  throw enhancedError;
};

export const generateSpeechChunk = async (
  text: string,
  voice: VoiceName,
  model: string,
  styleInstruction?: string
): Promise<string> => {
  try {
    const ai = getClient();

    const config: GenerateContentConfig = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
      },
    };

    // Note: TTS models (gemini-2.5-flash-preview-tts) may return 500 Internal Error 
    // if systemInstruction is set in the config. We prepend it to the text instead.
    let promptText = text;
    if (styleInstruction && styleInstruction.trim()) {
       // We format it to try to guide the style without the model reading it.
       // This is best-effort for the current preview model.
       promptText = `(Style: ${styleInstruction.trim()}) ${text}`;
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { text: promptText }
        ]
      },
      config: config,
    });

    // Extract inline data
    const candidate = response.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    
    if (!part || !part.inlineData || !part.inlineData.data) {
      throw new Error("No audio data returned from Gemini API");
    }

    return part.inlineData.data;
  } catch (error) {
    handleGeminiError(error);
    throw error;
  }
};

export const translateText = async (text: string, targetLanguage: string): Promise<string> => {
  try {
    const ai = getClient();
    // Basic prompt for translation
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `Translate the following text into ${targetLanguage}. Do not include any explanations, prologue, or epilogue, just return the translated text:\n\n"${text}"`,
    });

    return response.text?.trim() || text;
  } catch (error) {
    console.warn("Translation failed (non-fatal):", error);
    // Return original text on failure so user doesn't lose data
    return text;
  }
};

/**
 * Analyzes the text to create a comprehensive "Visual Vision" or Style Bible.
 */
export const generateStyleDescription = async (fullText: string): Promise<string> => {
    try {
        const ai = getClient();
        // Truncate to first 6000 chars to save tokens/time, usually enough to establish style
        const context = fullText.slice(0, 6000);
        
        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `You are a visionary art director for a high-end illustrated audiobook.
            
            Task:
            Analyze the following text excerpt and define a cohesive "Visual Vision" for the illustrations.
            
            Your Visual Vision must include:
            1. Art Style & Medium (e.g., oil painting, digital cel-shaded, watercolor, noir photography).
            2. Color Palette & Lighting (mood-appropriate colors).
            3. Character Design traits (if characters are present).
            4. Environmental/Background mood.
            5. Typography & Graphic Elements (e.g., "Use bold serif fonts for emphasis," "Include handwritten notes style," "Cinematic subtitles style").
            
            Output a single, descriptive paragraph that serves as a master prompt prefix.
            It should be evocative and precise.
            
            Text excerpt:
            "${context}"`
        });
        
        return response.text?.trim() || "Digital art, high resolution, cinematic lighting, vivid colors, detailed textures.";
    } catch (error) {
        console.warn("Style generation failed, using default", error);
        return "Digital art, high resolution, cinematic lighting, vivid colors.";
    }
};

/**
 * Generates sequential scene prompts based on the chunk text and global style.
 */
export const generateScenePrompts = async (chunkText: string, style: string, count: number): Promise<string[]> => {
    try {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: `
                You are a storyboard artist and prompter.

                Visual Vision / Style:
                "${style}"

                Current Story Segment:
                "${chunkText}"

                Task:
                Create exactly ${count} distinct, sequential image generation prompts to visualize this story segment.
                
                Requirements for each prompt:
                1.  **Full Sentences Only**: Do not use fragments. Describe the scene completely.
                2.  **Meaningful Visuals**: Focus on the specific moment, action, or emotion described in the sequence.
                3.  **Visual Objects & Backgrounds**: Explicitly mention the setting, props, and environment.
                4.  **Characters**: Describe characters' appearance and expressions if present.
                5.  **Typography**: If relevant to the style (e.g., a sign, a letter, a title card), describe it visually.
                6.  **Style Integration**: Ensure the global style (colors, medium) is woven into the description.
                7.  **Think in Scenes**: If count > 1, progress the visuals sequentially through the chunk's narrative.

                Output:
                A JSON array of strings. Each string is a standalone prompt.
            `,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });

        const jsonStr = response.text?.trim();
        if (!jsonStr) return [`${style}. Scene: ${chunkText}`];
        
        return JSON.parse(jsonStr);
    } catch (error) {
        console.warn("Scene prompt generation failed, falling back to raw text.", error);
        // Fallback: just repeat the chunk text with style if LLM fails
        return Array(count).fill(`${style}. Scene description: ${chunkText}`);
    }
};

/**
 * Generates an image using Nano Banana (gemini-2.5-flash-image)
 */
export const generateNanobanaImage = async (prompt: string): Promise<string> => {
    try {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-image',
            contents: {
                parts: [{ text: prompt }]
            },
            config: {
                imageConfig: {
                    aspectRatio: "1:1"
                }
            }
        });

        // Iterate parts to find image
        const parts = response.candidates?.[0]?.content?.parts;
        if (parts) {
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
        
        throw new Error("No image data found in response");
    } catch (error) {
        handleGeminiError(error);
        throw error;
    }
};