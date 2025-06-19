import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { File as NodeFile } from 'node:buffer';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { YIN } from 'pitchfinder';

dotenv.config();

if (typeof globalThis.File === 'undefined') {
  globalThis.File = NodeFile;
}

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const upload = multer({ storage: multer.memoryStorage() });

async function analyzeTranscript(transcript, metrics = {}) {
  const metricParts = [];
  if (metrics.wpm) metricParts.push(`words per minute: ${metrics.wpm}`);
  if (typeof metrics.pitch !== 'undefined') metricParts.push(`pitch: ${metrics.pitch}`);
  if (typeof metrics.pitch_variation !== 'undefined')
    metricParts.push(`pitch variation: ${metrics.pitch_variation}`);
  if (metrics.filler_word_total !== undefined)
    metricParts.push(`filler words: ${metrics.filler_word_total}`);
  if (metrics.energy_score !== undefined)
    metricParts.push(`energy score: ${metrics.energy_score}`);
  if (metrics.disfluency_score !== undefined)
    metricParts.push(`disfluency score: ${metrics.disfluency_score}`);
  if (metrics.repetition_score !== undefined)
    metricParts.push(`repetition score: ${metrics.repetition_score}`);
  if (metrics.cadence_score !== undefined)
    metricParts.push(`cadence score: ${metrics.cadence_score}`);
  const metricInfo = metricParts.length ? `\n\nMetrics: ${metricParts.join(', ')}` : '';

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a vocal delivery coach. Summarize the speaker\'s tone, energy and communication style in one paragraph. ' +
          'Metrics such as words per minute, pitch, pitch variation, energy score, repetition score, disfluency score and cadence score will be provided. ' +
          'Use them to judge the delivery\'s quality. Low energy, high disfluency or poor cadence should reduce the tone rating and be mentioned in your feedback. ' +
          'Provide a short descriptive tone label and a tone rating from 1-10 (5 is average, reserve 9-10 for exceptional delivery). ' +
          'Return a JSON object with keys "summary", "tone", "tone_rating", "tone_explanation", and "feedback". ' +
          'The "feedback" field should give one or two concise sentences of direct advice.'
      },
      { role: 'user', content: transcript + metricInfo }
    ]
  });

  try {
    return JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    // Fallback if parsing fails
    return {
      summary: completion.choices[0].message.content.trim(),
      tone: '',
      tone_rating: null,
      tone_explanation: '',
      feedback: ''
    };
  }
}

async function detectPitch(buffer) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath || 'ffmpeg', [
      '-i', 'pipe:0',
      '-f', 's16le',
      '-ac', '1',
      '-ar', '44100',
      'pipe:1'
    ]);

    const pcmChunks = [];
    ff.stdout.on('data', c => pcmChunks.push(c));
    ff.on('error', reject);
    ff.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg exited with code ${code}`));
      }
      const pcm = Buffer.concat(pcmChunks);
      const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
      const yin = YIN({ sampleRate: 44100 });
      const frameSize = 2048;
      const pitches = [];
      for (let i = 0; i + frameSize <= samples.length; i += frameSize) {
        const frame = Array.from(samples.subarray(i, i + frameSize));
        const freq = yin(frame);
        if (freq) pitches.push(freq);
      }
      if (!pitches.length) return resolve(null);
      pitches.sort((a, b) => a - b);
      const median = pitches[Math.floor(pitches.length / 2)];
      const mean = pitches.reduce((s, p) => s + p, 0) / pitches.length;
      const variance = pitches.reduce((s, p) => s + (p - mean) ** 2, 0) / pitches.length;
      const std = Math.sqrt(variance);
      resolve({
        median: +median.toFixed(2),
        variation: +std.toFixed(2)
      });
    });
    ff.stdin.end(buffer);
  });
}

function countFillerWords(transcript) {
  const tokens = transcript.toLowerCase().split(/\s+/);
  const breakdown = {};
  let total = 0;
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i];
    if (word === 'like') {
      const next = tokens[i + 1] || '';
      if (
        ['to', 'a', 'an', 'the', 'my', 'your', 'his', 'her', 'our', 'their', 'this', 'that', 'these', 'those'].includes(
          next
        )
      ) {
        continue;
      }
    }
    if (word === 'you' && tokens[i + 1] === 'know') {
      breakdown['you know'] = (breakdown['you know'] || 0) + 1;
      total++;
      i++;
      continue;
    }
    if (word === 'i' && tokens[i + 1] === 'mean') {
      breakdown['i mean'] = (breakdown['i mean'] || 0) + 1;
      total++;
      i++;
      continue;
    }
    if (['um', 'uh', 'like', 'basically'].includes(word)) {
      breakdown[word] = (breakdown[word] || 0) + 1;
      total++;
    }
  }
  return { total, breakdown };
}

function detectRepetitions(transcript) {
  const tokens = transcript.toLowerCase().split(/\s+/);
  const counts = {};
  for (let n = 2; n <= 5; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const phrase = tokens.slice(i, i + n).join(' ');
      counts[phrase] = (counts[phrase] || 0) + 1;
    }
  }
  const phrases = Object.keys(counts).filter(p => counts[p] > 1);
  return { phrases, score: phrases.length };
}

async function getRawMetrics(transcript, segments = [], audioBuffer) {
  const words = transcript.trim().split(/\s+/);
  const { total: filler_word_total, breakdown: filler_word_breakdown } = countFillerWords(transcript);

  let wpm = 0;
  if (segments.length > 0) {
    const duration = segments[segments.length - 1].end - segments[0].start;
    if (duration > 0) {
      wpm = +(words.length / (duration / 60)).toFixed(2);
    }
  }

  let pitchInfo = null;
  if (audioBuffer) {
    try {
      pitchInfo = await detectPitch(audioBuffer);
    } catch (err) {
      console.error('Pitch detection error:', err);
    }
  }

  const { phrases: repetitive_phrases, score: repetition_score } = detectRepetitions(transcript);

  const pitch = pitchInfo ? pitchInfo.median : null;
  const pitch_variation = pitchInfo ? pitchInfo.variation : null;

  const wpmNorm = Math.min(1, wpm / 160);
  const pitchVarNorm = Math.min(1, (pitch_variation || 0) / 60);
  const energy_score = Math.round(((wpmNorm + pitchVarNorm) / 2) * 10);
  const energy_label =
    energy_score > 7 ? 'High' : energy_score >= 4 ? 'Moderate' : 'Low';

  const fillerRatio = filler_word_total / words.length;
  const sentences = transcript.split(/[.!?]+/).filter(Boolean);
  const avgSentenceLength = words.length / (sentences.length || 1);
  let disfluency_score = 10;
  disfluency_score -= Math.min(5, fillerRatio * 50);
  disfluency_score -= Math.min(3, repetition_score);
  if (avgSentenceLength > 20 || avgSentenceLength < 5) disfluency_score -= 2;
  disfluency_score = Math.max(1, Math.round(disfluency_score));
  const disfluency_label =
    disfluency_score > 7 ? 'Smooth' : disfluency_score >= 4 ? 'Somewhat Choppy' : 'Very Choppy';

  // Cadence score based on pause consistency, WPM and filler usage
  let avgGap = 0;
  let gapStd = 0;
  if (segments.length > 1) {
    const gaps = [];
    for (let i = 0; i < segments.length - 1; i++) {
      const gap = segments[i + 1].start - segments[i].end;
      if (gap > 0) gaps.push(gap);
    }
    if (gaps.length) {
      avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const mean = avgGap;
      const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
      gapStd = Math.sqrt(variance);
    }
  }
  let cadence_score = 10;
  cadence_score -= Math.min(3, avgGap * 3);
  cadence_score -= Math.min(2, gapStd * 2);
  cadence_score -= Math.min(3, Math.abs(wpm - 150) / 50);
  cadence_score -= Math.min(2, fillerRatio * 10);
  cadence_score = Math.max(1, Math.round(cadence_score));
  const cadence_description =
    cadence_score > 8
      ? 'Very Smooth'
      : cadence_score >= 6
      ? 'Smooth'
      : cadence_score >= 4
      ? 'Uneven'
      : 'Choppy';

  return {
    wpm,
    pitch: pitch ?? 'N/A',
    pitch_variation: pitch_variation ?? 'N/A',
    filler_words: filler_word_total,
    filler_word_total,
    filler_word_breakdown,
    repetitive_phrases,
    repetition_score,
    energy_score,
    energy_label,
    disfluency_score,
    disfluency_label,
    cadence_score,
    cadence_description
  };
}

app.post('/analyze', upload.single('video'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const result = {
    transcript: null,
    summary: null,
    tone: null,
    tone_rating: null,
    tone_explanation: null,
    raw_metrics: null,
    feedback: null
  };

  let segments = [];
  try {
    const file = await OpenAI.toFile(req.file.buffer, req.file.originalname);
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json'
    });
    result.transcript = transcription.text;
    segments = transcription.segments || [];
  } catch (err) {
    console.error('Transcription error:', err);
  }

  if (result.transcript) {
    try {
      result.raw_metrics = await getRawMetrics(
        result.transcript,
        segments,
        req.file.buffer
      );
    } catch (err) {
      console.error('Metrics calculation error:', err);
    }

    try {
      const analysis = await analyzeTranscript(result.transcript, result.raw_metrics);
      result.summary = analysis.summary;
      result.tone = analysis.tone;
      result.tone_rating = analysis.tone_rating;
      result.tone_explanation = analysis.tone_explanation;
      result.feedback = analysis.feedback;
    } catch (err) {
      console.error('Tone analysis error:', err);
    }
  }

  if (!result.transcript) {
    return next(new Error('Failed to transcribe video'));
  }

  res.json(result);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
