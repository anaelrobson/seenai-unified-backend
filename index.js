import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const upload = multer({ storage: multer.memoryStorage() });

async function analyzeTone(transcript) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'Analyze the overall tone of the provided text. Respond with one word: positive, negative, or neutral.' },
      { role: 'user', content: transcript }
    ],
  });
  return completion.choices[0].message.content.trim();
}

app.post('/analyze', upload.single('video'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  try {
    const file = await OpenAI.toFile(req.file.buffer, req.file.originalname);
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    });

    const transcript = transcription.text;
    const tone = await analyzeTone(transcript);

    res.json({ transcript, tone });
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
