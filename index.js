import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { File as NodeFile } from 'node:buffer';

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
    model: 'gpt-3.5-turbo',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Summarize the speaker\'s tone, energy and communication style in one paragraph. ' +
          'Also provide a short descriptive tone label and a tone rating from 1-10. ' +
          'Return a JSON object with keys "summary", "tone", and "tone_rating".'
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
      tone_rating: null
    };
  }
}

function getRawMetrics(transcript) {
  const fillerList = ['um', 'uh', 'like', 'you know', 'i mean'];
  const words = transcript.trim().split(/\s+/);
  const filler_words = words.filter(w => fillerList.includes(w.toLowerCase())).length;
  return {
    wpm: 0, // duration information unavailable
    pitch: 0, // placeholder
    filler_words
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
    raw_metrics: null
  };

  try {
    const file = await OpenAI.toFile(req.file.buffer, req.file.originalname);
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1'
    });
    result.transcript = transcription.text;
  } catch (err) {
    console.error('Transcription error:', err);
  }

  if (result.transcript) {
    try {
      const analysis = await analyzeTranscript(result.transcript);
      result.summary = analysis.summary;
      result.tone = analysis.tone;
      result.tone_rating = analysis.tone_rating;
    } catch (err) {
      console.error('Tone analysis error:', err);
    }

    try {
      result.raw_metrics = getRawMetrics(result.transcript);
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
