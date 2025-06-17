codex/build-unified-node.js-express-backend
# SeenAI Unified Backend

This Express server provides a single `/analyze` endpoint that accepts a video file and returns a transcript along with a detailed tone analysis report.

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
  "raw_metrics": {
    "wpm": 165.2,
    "pitch": 230.5,
zgf5e4-codex/add-pitch-detection-to-raw-metrics
    "filler_words": 3,
    "filler_word_breakdown": {
      "um": 2,
      "like": 1
    }
  }
}
```
`wpm` is calculated from the transcript duration reported by Whisper. The `filler_words` count attempts to ignore grammatical uses of words like "like" or "so" and focuses on verbal fillers. A per-word breakdown is available under `filler_word_breakdown`. `pitch` reports the median detected pitch of the audio in Hertz.

    "filler_words": 3
  }
}
```
`wpm` is calculated from the transcript duration reported by Whisper, while `filler_words` counts common verbal fillers such as "um" or "like". `pitch` reports the median detected pitch of the audio in Hertz.
main

## Error Handling
If an error occurs, a JSON response with `error` is returned and the server logs the error to the console.

