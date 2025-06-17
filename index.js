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

async function analyzeTranscript(transcript) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Summarize the speaker\'s tone, energy and communication style in one paragraph. ' +
          'Provide a short descriptive tone label, a tone rating from 1-10, and a concise explanation of the rating. ' +
          'Return a JSON object with keys "summary", "tone", "tone_rating", and "tone_explanation".'
      },
      { role: 'user', content: transcript }
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
      tone_explanation: ''
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
      resolve(+median.toFixed(2));
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

  let pitch = null;
  if (audioBuffer) {
    try {
      pitch = await detectPitch(audioBuffer);
    } catch (err) {
      console.error('Pitch detection error:', err);
    }
  }

  return {
    wpm,
    pitch: pitch ?? 'N/A',
    filler_words: filler_word_total,
    filler_word_total,
    filler_word_breakdown
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
    raw_metrics: null
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
      const analysis = await analyzeTranscript(result.transcript);
      result.summary = analysis.summary;
      result.tone = analysis.tone;
      result.tone_rating = analysis.tone_rating;
      result.tone_explanation = analysis.tone_explanation;
    } catch (err) {
      console.error('Tone analysis error:', err);
    }

    try {
      result.raw_metrics = await getRawMetrics(
        result.transcript,
        segments,
        req.file.buffer
      );
    } catch (err) {
      console.error('Metrics calculation error:', err);
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
