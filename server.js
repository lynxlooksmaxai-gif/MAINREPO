const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───
app.use(cors());
app.use(express.json({ limit: '15mb' })); // Large limit for base64 images

// ─── API Keys (server-side only) ───
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const ANALYSIS_PROMPT = `You are an expert facial aesthetics analyst. Analyze this selfie photo and provide honest, numerical scores for each facial feature.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "jawline": <number 1-100>,
  "skin_quality": <number 1-100>,
  "eyes": <number 1-100>,
  "lips": <number 1-100>,
  "facial_symmetry": <number 1-100>,
  "hair_quality": <number 1-100>,
  "overall": <number 1-100>,
  "potential": <number 1-50>,
  "tips": ["<tip1>", "<tip2>", "<tip3>"]
}

Rules:
- Be realistic and honest with scoring. Most people score 40-80.
- "potential" is how many points they could gain with improvements.
- "tips" should be 3 short, actionable improvement tips.
- Return ONLY the JSON object, nothing else.`;

// ─── API Routes ───

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'lynx-ai-server', timestamp: new Date().toISOString() });
});

// Face analysis endpoint
app.post('/api/analyze-face', async (req, res) => {
  try {
    const { image, mimeType } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: ANALYSIS_PROMPT },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: image } },
          ],
        }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini API error:', response.status, err);
      return res.status(response.status).json({ error: 'AI analysis failed' });
    }

    const result = await response.json();
    const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    // Parse JSON (strip markdown fences if present)
    const cleaned = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const scores = JSON.parse(cleaned);

    // Clamp values
    const clamp = (v, min, max) => Math.max(min, Math.min(max, Math.round(v)));
    const safeScores = {
      jawline: clamp(scores.jawline, 1, 100),
      skin_quality: clamp(scores.skin_quality, 1, 100),
      eyes: clamp(scores.eyes, 1, 100),
      lips: clamp(scores.lips, 1, 100),
      facial_symmetry: clamp(scores.facial_symmetry, 1, 100),
      hair_quality: clamp(scores.hair_quality, 1, 100),
      overall: clamp(scores.overall, 1, 100),
      potential: clamp(scores.potential, 1, 50),
      tips: scores.tips || [],
    };

    res.json(safeScores);
  } catch (err) {
    console.error('Analysis error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Serve Expo Web Build ───
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

// ─── Start ───
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐯 Lynx AI Server running on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/health`);
  console.log(`   Web: http://localhost:${PORT}`);
});
