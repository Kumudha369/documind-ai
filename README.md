# DocuMind AI — Smart Document Assistant

Upload PDF/TXT documents, get AI summaries, ask questions in plain English and get answers **with sources you can verify**, and search across all your documents.

**Stack:** React + Vite + Tailwind · Node.js + Express 5 · MongoDB + Mongoose · JWT (httpOnly cookie) · RAG (retrieval-augmented generation)

---

## 1. Quick start (about 5 minutes)

You need **Node 20.6+** and a **MongoDB** (Docker, or a free MongoDB Atlas cluster).

```bash
# 1. Start MongoDB (skip if you use Atlas and put its URI in server/.env)
docker compose up -d

# 2. Backend
cd server
cp .env.example .env
#   open .env and set JWT_SECRET (generate one with the command written inside the file)
npm install
npm run dev            # http://localhost:5000

# 3. Frontend (new terminal)
cd client
npm install
npm run dev            # http://localhost:5173
```

Open http://localhost:5173, register, upload `server/sample-docs/sample-policy.txt`, and ask *"When is the acknowledgement form due?"*.

### Offline mode vs. real AI

Out of the box the app runs with **no API keys** (`LLM_PROVIDER=mock`, `EMBEDDING_PROVIDER=local`). Everything works end to end, but:

| Setting | Offline default | What you lose |
|---|---|---|
| `LLM_PROVIDER=mock` | Answers are the best-matching passages quoted back | No written answers, and summaries are just selected sentences |
| `EMBEDDING_PROVIDER=local` | Hashed bag-of-words vectors | Matches **words**, not **meaning** ("car" ≠ "automobile") |

For the real experience, edit `server/.env`:

```env
LLM_PROVIDER=anthropic            # or openai
ANTHROPIC_API_KEY=sk-ant-...
EMBEDDING_PROVIDER=voyage         # or openai   (Anthropic has no embeddings API)
VOYAGE_API_KEY=...
```

**Important:** vectors from different embedding models are not comparable. Each chunk stores the model that made it, and search only compares matching vectors. If you change `EMBEDDING_PROVIDER`, re-upload (or use **Retry** on) your documents.

### Production-style run (one server)

```bash
npm --prefix client run build      # creates client/dist
NODE_ENV=production npm --prefix server start
```
Express then serves the built app and the API from the same origin. Use HTTPS in front of it (cookies are `secure` in production).

---

## 2. How it works

```
 Upload ──► validate (ext + MIME + size + magic bytes) ──► save file ──► Document(status=Uploaded)
                                                                  │  returns 202 immediately
                                                                  ▼
                                   background queue (2 at a time)  status=Processing
              extract text (PDF per page / TXT) ► chunk (1000 chars, 200 overlap)
              ► embed ► save DocumentChunk rows ► status=Completed  (or Failed + reason)

 Ask  ──► embed question ─┐
                          ├─► rank fusion (RRF) ─► top 6 passages ─► LLM (answers ONLY from them,
          keyword search ─┘    (user-scoped)                          cites [S1], [S2]) ─► verify
                                                                      citations ─► save + show sources
```

### Chunking
Small passages give sharper search results and fit in the LLM's context. Chunks break at sentence/paragraph boundaries and **overlap by 200 characters** so a sentence on a boundary is still found. PDF chunks never cross a page boundary, so every PDF citation has a **real page number**. TXT files get **line ranges** instead. No page numbers or citations are ever invented.

### Vector storage strategy
Embeddings are stored in MongoDB on each `DocumentChunk` (`embedding: [Number]`, hidden from normal queries). At question time the server streams *only the authenticated user's chunks for the chosen documents*, computes cosine similarity in Node, and keeps the best *k* with a small heap. This needs **no extra service**, is exact, and is plenty fast up to roughly tens of thousands of chunks per user.
**Scaling path:** MongoDB Atlas Vector Search (`$vectorSearch` with a `userId` pre-filter) or a dedicated vector DB. Only `searchChunks()` in `server/src/services/retrieval.js` would change.

### Ranking (hybrid search)
Two ranked lists are produced: **semantic** (cosine similarity) and **keyword** (MongoDB `$text` index). They are merged with **Reciprocal Rank Fusion**: `score = Σ 1 / (60 + rank)` over the lists. A passage ranked high in *both* beats one that is #1 in only one, and no score calibration between the two methods is needed. Displayed relevance is normalised so 100% means "ranked first in every list used". Semantic hits below a minimum similarity are dropped, which is how the app knows when it has **no evidence** and says so instead of guessing.

### Grounded answers and prompt-injection defence
- The model is told to answer only from `<source>` blocks and to reply `INSUFFICIENT_EVIDENCE` otherwise; that becomes a clear "the documents do not provide enough information" message.
- Document text is **untrusted data**: it is escaped (so it cannot close the `<source>` tag), the system prompt says to ignore instructions inside it, and the model has **no tools**, so even a successful injection cannot do anything except change wording.
- Citations like `[S3]` are validated: references to sources that were never provided are removed. Sources the model actually cited are shown first; the rest are available under "Other passages retrieved".

### Summaries
Long documents use **map-reduce**: each ~12k-character section is summarised into notes, notes are merged (recursively if still too long), then one structured JSON summary (short, detailed, key points, terms, action items) is produced. Length is `short | medium | long`. Results are cached on the document and cleared if it is reprocessed. Limit: about 360k characters.

### Failures and retries
- *Permanent* problems (corrupt, password-protected, empty, scanned PDF) → `Failed` immediately with a readable reason.
- *Temporary* problems (embedding API down, rate limit) → retried with back-off (1s, 2s, 4s…) up to `MAX_PROCESSING_ATTEMPTS`, then `Failed`.
- Every attempt deletes old chunks first, so retries never duplicate data.
- On server start, documents left in `Uploaded`/`Processing` are re-queued.
- The UI has a **Retry** button for failed documents.

**Scanned (image-only) PDFs are not supported** (no OCR in this version); the user gets a clear message.

---

## 3. Database design (MongoDB / Mongoose)

| Collection | Key fields | Indexes |
|---|---|---|
| **User** | name, email, passwordHash (`select:false`) | unique `email` |
| **Document** | userId, originalFilename, storedFilename (random UUID), fileType, fileSize, pageCount, processingStatus, tags, summaries (cached) | `{userId, createdAt}`, `{userId, tags}`, `{userId, processingStatus}` |
| **DocumentChunk** | documentId, **userId**, chunkIndex, text, pageNumber / startLine / endLine, embedding, embeddingModel | unique `{documentId, chunkIndex}`, `{userId, documentId}`, **text index** |
| **Conversation** | userId, title, documentIds | `{userId, updatedAt}` |
| **Message** | conversationId, userId, role, content, sourceReferences[], insufficientEvidence | `{conversationId, createdAt}`, `{userId}` |

- The full document text is stored **once**, in `DocumentChunk`; `Document` only holds metadata and small cached summaries.
- `userId` is copied onto chunks and messages so every query can filter by owner directly.
- `sourceReferences` snapshot the document name and excerpt, so old answers stay readable if a document is renamed or deleted.
- **Deletion:** deleting a document removes its chunks (and embeddings), its file on disk, and its id from conversations. Deleting a conversation removes its messages.

---

## 4. REST API

All responses are JSON. Errors look like `{ "error": { "code", "message", "details?" } }`. All routes except register/login/logout/health require the login cookie. The user id always comes from the verified token, never from the request.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | liveness check |
| POST | `/api/auth/register` | create account (name, email, password) → 201 |
| POST | `/api/auth/login` | log in, sets httpOnly cookie |
| POST | `/api/auth/logout` | clears the cookie → 204 |
| GET | `/api/auth/me` | current user |
| POST | `/api/documents/upload` | multipart, field `files` (up to 5 PDF/TXT) → 202 |
| GET | `/api/documents` | list; query `q`, `tag`, `status`, `page`, `limit` |
| GET | `/api/documents/tags` | the user's distinct tags |
| GET | `/api/documents/:id` | details |
| GET | `/api/documents/:id/status` | processing status (for polling) |
| GET | `/api/documents/:id/file` | the original file (inline) |
| PATCH | `/api/documents/:id` | rename and/or set `tags` |
| POST | `/api/documents/:id/retry` | re-run processing of a failed document |
| DELETE | `/api/documents/:id` | delete document, chunks, file → 204 |
| POST | `/api/ai/summarize` | `{documentId, length, refresh?}` |
| POST | `/api/ai/ask` | `{question, conversationId?, documentIds?}` → answer + sources |
| POST | `/api/ai/search` | `{query, mode, documentIds?, tags?, documentName?, limit?}` |
| POST | `/api/conversations` | create |
| GET | `/api/conversations` | list (newest activity first) |
| GET | `/api/conversations/:id` | conversation + messages |
| PATCH | `/api/conversations/:id` | rename / change documents |
| DELETE | `/api/conversations/:id` | delete with messages → 204 |

Status codes used: 200, 201, 202, 204, 400 (validation), 401, 404 (also used for "belongs to someone else"), 409 (conflict, e.g. document still processing), 413 (file too large), 422 (nothing to search / unreadable), 429 (rate limit).

---

## 5. Security checklist

- Passwords hashed with **bcrypt** (12 rounds, via `bcryptjs`, a pure-JS build that installs everywhere); equal-time response for unknown email vs wrong password.
- JWT in an **httpOnly, SameSite=Lax, Secure-in-production cookie**; JavaScript cannot read it. Login/register are rate limited; AI endpoints are rate limited.
- Every document/conversation lookup includes `userId`; foreign ids return 404. Retrieval is filtered by `userId` in the database query. The integration test checks this with two users.
- Input validated with **zod** (types are enforced, so `{"email": {"$ne": null}}` is rejected: no NoSQL injection). Malformed ids → 400.
- Uploads: extension + MIME + size + **magic-byte check**; stored under a random UUID name in a per-user folder (user filenames never touch the file system); `.txt` is served with a locked-down CSP.
- `helmet` security headers, CORS limited to `CLIENT_ORIGIN`, JSON body limit 100 kb.
- Secrets live only in `server/.env` (git-ignored); the server refuses to start with a missing/short `JWT_SECRET`.

---

## 6. Tests

```bash
cd server
npm test                                    # unit tests (chunking, ranking, citations, excerpts)
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/documind_test npm test   # also runs the API tests
```
The API tests cover registration/login, validation, upload → processing → ask → follow-up → search → summarise → delete, and **cross-user isolation** (a second user gets 404 on every route that touches the first user's data). They use the offline mock providers and **drop the database named in `MONGODB_TEST_URI`**, so point them at a throwaway database.

---

## 7. Known limitations and next steps

- No OCR (scanned PDFs rejected). Next: Tesseract or a cloud OCR as a fallback step in `extract.js`.
- The queue is in-process (restart-safe thanks to recovery on start, but single-server). Next: BullMQ + Redis for multiple workers.
- Vector search is brute-force per user. Next: Atlas Vector Search.
- Answers are returned in one piece, not streamed. Next: server-sent events.
- Only PDF and TXT. Next: DOCX/Markdown extractors.

## 8. Project layout

```
server/src
  config/       env validation, DB connection
  models/       Mongoose schemas
  middleware/   auth (JWT cookie), validation (zod), upload (multer + magic bytes), errors
  routes/       URL → controller wiring + request schemas
  controllers/  HTTP layer (thin)
  services/     extract, chunker, embeddings, vector, retrieval, qa, summarize, llm, processor
client/src
  pages/        Login, Register, Documents, DocumentDetail, Chat, Search
  components/   Layout, ProtectedRoute, SourceCard, DocumentPicker, ConfirmDialog, …
  context/      AuthContext      api/  axios client
```
