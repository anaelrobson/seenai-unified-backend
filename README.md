# SeenAI Unified Backend

This Express server provides a single `/analyze` endpoint that accepts a video file and returns a transcript and basic tone analysis.

## Setup

1. Install dependencies
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
  "tone": "positive"
}
```

## Error Handling
If an error occurs, a JSON response with `error` is returned and the server logs the error to the console.
