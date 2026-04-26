import { supabase } from '@/lib/supabase';

const GEMINI_API_KEY = 'AIzaSyD2loGC1LGUgt0fRQaDOHj5tqYkAMYRTxI';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

export interface FaceScores {
  jawline: number;
  skin_quality: number;
  eyes: number;
  lips: number;
  facial_symmetry: number;
  hair_quality: number;
  overall: number;
  potential: number;
  tips: string[];
}

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

/**
 * Analyze a face photo using Gemini Vision API.
 * @param base64Image - Base64-encoded image data (without data:image prefix)
 * @param mimeType - Image MIME type (e.g., 'image/jpeg')
 */
export async function analyzeFace(base64Image: string, mimeType: string = 'image/jpeg'): Promise<FaceScores> {
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: ANALYSIS_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${err}`);
  }

  const result = await response.json();
  const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('No response from Gemini');
  }

  // Parse JSON from response (strip markdown fences if present)
  const cleaned = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const scores: FaceScores = JSON.parse(cleaned);

  // Clamp values to valid ranges
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(v)));
  return {
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
}

/**
 * Save face scan results to Supabase.
 */
export async function saveFaceScan(userId: string, scores: FaceScores): Promise<void> {
  const { error } = await supabase.from('face_scans').insert({
    user_id: userId,
    overall_score: scores.overall,
    analysis: {
      jawline: scores.jawline,
      skin_quality: scores.skin_quality,
      eyes: scores.eyes,
      lips: scores.lips,
      facial_symmetry: scores.facial_symmetry,
      hair_quality: scores.hair_quality,
      potential: scores.potential,
      tips: scores.tips,
    },
  });

  if (error) {
    console.warn('Failed to save scan:', error.message);
    throw error;
  }
}

/**
 * Get the latest face scan for a user.
 */
export async function getLatestScan(userId: string): Promise<FaceScores | null> {
  const { data, error } = await supabase
    .from('face_scans')
    .select('overall_score, analysis')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  const a = data.analysis as any;
  return {
    jawline: a.jawline,
    skin_quality: a.skin_quality,
    eyes: a.eyes,
    lips: a.lips,
    facial_symmetry: a.facial_symmetry,
    hair_quality: a.hair_quality,
    overall: data.overall_score,
    potential: a.potential,
    tips: a.tips || [],
  };
}

/**
 * Get scan history count for a user.
 */
export async function getScanCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('face_scans')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  return count || 0;
}
