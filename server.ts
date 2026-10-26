import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));


const HOI4_LANG_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  pl: 'Polish',
  pt: 'Brazilian Portuguese',
  ja: 'Japanese',
  'zh-CN': 'Simplified Chinese',
  ko: 'Korean',
  it: 'Italian',
  uk: 'Ukrainian',
};

// AI verification endpoint (requires user-supplied API key)
app.post('/api/ai/verify', async (req, res) => {
  try {
    const { apiKey } = req.body;
    const keyToUse = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!keyToUse) {
      res.status(400).json({ valid: false, error: 'Укажите ваш персональный Gemini API ключ' });
      return;
    }
    const userAi = new GoogleGenAI({
      apiKey: keyToUse,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    const result = await userAi.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Ping test. Reply with OK.',
    });
    if (result && result.text) {
      res.json({ valid: true });
      return;
    }
    res.json({ valid: false, error: 'Пустой ответ от Gemini API' });
  } catch (err: unknown) {
    res.status(400).json({ valid: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// AI Translation endpoint for HoI4 mod localization (requires user-supplied API key)
app.post('/api/ai/translate', async (req, res) => {
  try {
    const { texts, sourceLang = 'en', targetLang = 'ru', apiKey } = req.body;

    const keyToUse = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!keyToUse) {
      res.status(401).json({
        error: 'Требуется собственный Gemini API ключ. Введите ваш персональный API ключ в поле Gemini API Key.',
      });
      return;
    }

    if (!Array.isArray(texts) || texts.length === 0) {
      res.status(400).json({ error: 'texts must be a non-empty array of strings' });
      return;
    }

    const userAi = new GoogleGenAI({
      apiKey: keyToUse,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });

    const sourceName = HOI4_LANG_NAMES[sourceLang] || sourceLang;
    const targetName = HOI4_LANG_NAMES[targetLang] || targetLang;

    const systemInstruction = `You are an expert game localization director and translator for Paradox Interactive grand strategy games, specifically Hearts of Iron IV (HoI4).
Translate the provided array of localization texts from ${sourceName} into ${targetName}.
RULES:
1. Strict Token & Marker Preservation: NEVER alter, drop, or translate placeholder tokens like <<PH0>>, <<PH1>>, <<PH2>>, etc. They represent variables, color codes (§R, §!), or icons (£money). Keep them in their exact position.
2. Military & Political Tone: Use authentic Hearts of Iron IV terminology (e.g. division types, national focuses, ideologies, events, world tension, war support, political power).
3. Format: Each translation must correspond strictly to a single value line without literal carriage returns (physical newlines). Use \\n for line breaks.
4. Return an object with a "translations" array containing the translated texts in the exact order and length as the input.`;

    const prompt = `Translate the following ${texts.length} texts from ${sourceName} to ${targetName}:\n` +
      JSON.stringify(texts);

    const response = await userAi.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translations: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING,
              },
              description: 'Array of translated texts in the same order as the input.',
            },
          },
          required: ['translations'],
        },
      },
    });

    const outputText = response.text || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new Error('Failed to parse AI translation JSON response');
    }

    const translations = parsed.translations;
    if (!Array.isArray(translations) || translations.length !== texts.length) {
      // If array size differs, try fallback line by line or map available
      const safeTranslations = texts.map((original: string, idx: number) => {
        return translations && translations[idx] ? translations[idx] : original;
      });
      res.json({ translations: safeTranslations });
      return;
    }

    res.json({ translations });
  } catch (err: unknown) {
    console.error('Gemini AI translation error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown AI translation error',
    });
  }
});

// Setup Vite in middleware mode for dev, or static files for production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HoI4 Translator server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
