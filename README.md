codex/build-unified-node.js-express-backend
# SeenAI Unified Backend

This Express server provides a single `/analyze` endpoint that accepts a video file and returns a transcript along with a detailed tone analysis report. The tone analysis now offers stricter scoring and a short feedback message to help improve delivery.

## Setup

1. Install dependencies (Node.js 18+)
   ```bash
   npm install
   ```
   The server relies on `ffmpeg` for audio decoding. A static build is
   included via the `ffmpeg-static` package, but you can also install
   `ffmpeg` from your system package manager if preferred.
2. Copy `.env.example` to `.env` and add your OpenAI API key
   ```bash
   cp .env.example .env
   # then edit .env
   ```
3. Start the server
   ```bash
   npm start
   ```

The server listens on `PORT` from `.env` (defaults to `3000`).

## Usage

Send a `POST` request to `/analyze` with a `video` file in `form-data`.
Example using `curl`:

```bash
curl -X POST -F "video=@/path/to/file.mp4" http://localhost:3000/analyze
```

Example response:
```json
{
  "transcript": "...",
  "summary": "...",
  "tone": "Confident, high-energy",
  "tone_rating": 8.9,
  "tone_explanation": "9: High because of excited delivery",
  "feedback": "Try varying your pitch more to avoid sounding monotone",
  "raw_metrics": {
    "wpm": 165.2,
    "pitch": 230.5,
    "filler_words": 3,
    "filler_word_total": 3,
    "filler_word_breakdown": {
      "um": 1,
      "uh": 1,
      "like": 1
    }
  }
}
```
`feedback` contains a short suggestion for improving vocal delivery. `wpm` is calculated from the transcript duration reported by Whisper. `filler_words` and `filler_word_total` count verbal fillers, while `filler_word_breakdown` shows the usage of each filler. `pitch` reports the median detected pitch of the audio in Hertz.

## Error Handling
If an error occurs, a JSON response with `error` is returned and the server logs the error to the console.

