import { supabase } from '@/lib/supabase';

// Server API URL — uses relative path when served from same origin (Railway)
const API_BASE = process.env.EXPO_PUBLIC_API_URL || '';

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

/**
 * Analyze a face photo via the server-side Gemini proxy.
 * The API key stays on the server — the client only sends the image.
 */
export async function analyzeFace(base64Image: string, mimeType: string = 'image/jpeg'): Promise<FaceScores> {
  const response = await fetch(`${API_BASE}/api/analyze-face`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image, mimeType }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Server error: ${response.status}`);
  }

  return response.json();
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
