8ato6u-codex/build-unified-node.js-express-backend
# SeenAI Unified Backend

This Express server provides a single `/analyze` endpoint that accepts a video file and returns a transcript along with a detailed tone analysis report.

## Setup

1. Install dependencies (Node.js 18+)
   ```bash
   npm install
   ```
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

Response:
```json
{
  "transcript": "...",
  "summary": "...",
  "tone": "Confident, high-energy",
  "tone_rating": 8.9,
  "raw_metrics": {
    "wpm": 165,
    "pitch": 220,
    "filler_words": 3
  }
}
```

## Error Handling
If an error occurs, a JSON response with `error` is returned and the server logs the error to the console.
main
