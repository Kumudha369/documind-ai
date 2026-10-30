// End-to-end API test. Needs a real MongoDB:
//   MONGODB_TEST_URI=mongodb://127.0.0.1:27017/documind_test npm test
// Skipped automatically when MONGODB_TEST_URI is not set.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

const URI = process.env.MONGODB_TEST_URI;

describe('API', { skip: !URI && 'set MONGODB_TEST_URI to run API tests' }, () => {
  let server, base, mongoose;

  // Minimal cookie-aware fetch helper (one "browser" per user).
  const makeClient = () => {
    let cookie = '';
    return async (method, path, body, isForm = false) => {
      const res = await fetch(base + path, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(body && !isForm ? { 'content-type': 'application/json' } : {}) },
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      });
      const set = res.headers.getSetCookie?.()[0];
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    };
  };

  const waitCompleted = async (api, id) => {
    for (let i = 0; i < 50; i++) {
      const { body } = await api('GET', `/api/documents/${id}/status`);
      if (body.status === 'Completed' || body.status === 'Failed') return body;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('processing timed out');
  };

  before(async () => {
    process.env.MONGODB_URI = URI;
    process.env.JWT_SECRET = 'x'.repeat(48);
    process.env.LLM_PROVIDER = 'mock';
    process.env.EMBEDDING_PROVIDER = 'local';
    process.env.UPLOAD_DIR = './uploads-test';
    process.env.AUTH_RATE_LIMIT = '1000';
    mongoose = (await import('mongoose')).default;
    const { connectDb } = await import('../src/config/db.js');
    await connectDb();
    await mongoose.connection.dropDatabase();
    const models = await Promise.all(['User', 'Document', 'DocumentChunk', 'Conversation', 'Message'].map((n) => mongoose.model(n)));
    await Promise.all(models.map((m) => m.init()));
    const { createApp } = await import('../src/app.js');
    server = createApp().listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server?.close();
    await mongoose?.connection.dropDatabase();
    await mongoose?.disconnect();
    const fs = await import('node:fs/promises');
    await fs.rm('./uploads-test', { recursive: true, force: true });
  });

  const upload = (api, name, content, type = 'text/plain') => {
    const form = new FormData();
    form.append('files', new Blob([content], { type }), name);
    return api('POST', '/api/documents/upload', form, true);
  };

  test('auth: validation, register, me, duplicate, login, logout', async () => {
    const api = makeClient();
    assert.equal((await api('POST', '/api/auth/register', { name: 'A', email: 'bad', password: '1' })).status, 400);
    assert.equal((await api('GET', '/api/auth/me')).status, 401);

    const reg = await api('POST', '/api/auth/register', { name: 'Alice', email: 'Alice@Example.com', password: 'secret123' });
    assert.equal(reg.status, 201);
    assert.equal(reg.body.user.email, 'alice@example.com');
    assert.equal(reg.body.user.passwordHash, undefined);
    assert.equal((await api('GET', '/api/auth/me')).status, 200);

    assert.equal((await makeClient()('POST', '/api/auth/register', { name: 'Alice', email: 'alice@example.com', password: 'secret123' })).status, 409);
    assert.equal((await makeClient()('POST', '/api/auth/login', { email: 'alice@example.com', password: 'wrong-pass1' })).status, 401);
    // NoSQL injection attempt must be rejected by validation
    assert.equal((await makeClient()('POST', '/api/auth/login', { email: { $ne: null }, password: 'x' })).status, 400);

    assert.equal((await api('POST', '/api/auth/logout')).status, 204);
  });

  test('upload -> process -> ask with sources -> search -> summarize -> delete', async () => {
    const api = makeClient();
    await api('POST', '/api/auth/register', { name: 'Bob', email: 'bob@example.com', password: 'secret123' });

    const text =
      'Project Alpha aims to reduce hospital waiting times. The final report deadline is 15 March 2027. ' +
      'The study found that triage automation cut waiting by 30 percent. A limitation is the small sample size.';
    const up = await upload(api, 'alpha.txt', text);
    assert.equal(up.status, 202);
    const id = up.body.documents[0].id;
    assert.equal((await waitCompleted(api, id)).status, 'Completed');

    // wrong type is rejected
    assert.equal((await upload(api, 'evil.txt', Buffer.from([0, 1, 2, 3]))).status, 400);
    assert.equal((await upload(api, 'x.exe', 'hi', 'application/octet-stream')).status, 400);

    const ask = await api('POST', '/api/ai/ask', { question: 'What is the report deadline?', documentIds: [id] });
    assert.equal(ask.status, 201);
    assert.ok(ask.body.assistantMessage.sourceReferences.length > 0);
    assert.equal(ask.body.assistantMessage.sourceReferences[0].documentName, 'alpha.txt');

    const convId = ask.body.conversation.id;
    const follow = await api('POST', '/api/ai/ask', { question: 'And the limitation?', conversationId: convId });
    assert.equal(follow.status, 201);
    const conv = await api('GET', `/api/conversations/${convId}`);
    assert.equal(conv.body.messages.length, 4);
    assert.deepEqual(conv.body.messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);

    const nothing = await api('POST', '/api/ai/ask', { question: 'zxqv blorptastic quantum yoghurt?', documentIds: [id] });
    assert.equal(nothing.body.assistantMessage.insufficientEvidence, true);

    const s = await api('POST', '/api/ai/search', { query: 'waiting times', mode: 'hybrid' });
    assert.equal(s.status, 200);
    assert.ok(s.body.results.length > 0);

    const sum = await api('POST', '/api/ai/summarize', { documentId: id, length: 'short' });
    assert.equal(sum.status, 200);
    assert.ok(sum.body.summary.shortSummary);

    const patched = await api('PATCH', `/api/documents/${id}`, { originalFilename: 'renamed.txt', tags: ['Health', 'health', 'q1'] });
    assert.deepEqual(patched.body.document.tags, ['health', 'q1']);

    assert.equal((await api('DELETE', `/api/documents/${id}`)).status, 204);
    const { DocumentChunk } = await import('../src/models/DocumentChunk.js');
    assert.equal(await DocumentChunk.countDocuments({ documentId: id }), 0);
    assert.equal((await api('GET', `/api/documents/${id}`)).status, 404);
  });

  test('isolation: a second user cannot reach the first user\'s data', async () => {
    const a = makeClient();
    const b = makeClient();
    await a('POST', '/api/auth/register', { name: 'Carol', email: 'carol@example.com', password: 'secret123' });
    await b('POST', '/api/auth/register', { name: 'Dave', email: 'dave@example.com', password: 'secret123' });

    const up = await upload(a, 'secret.txt', 'Carol private plan: launch codename is Bluebird on Tuesday.');
    const id = up.body.documents[0].id;
    await waitCompleted(a, id);
    const conv = await a('POST', '/api/ai/ask', { question: 'What is the codename?', documentIds: [id] });
    const convId = conv.body.conversation.id;

    assert.equal((await b('GET', `/api/documents/${id}`)).status, 404);
    assert.equal((await b('GET', `/api/documents/${id}/file`)).status, 404);
    assert.equal((await b('PATCH', `/api/documents/${id}`, { originalFilename: 'hacked' })).status, 404);
    assert.equal((await b('DELETE', `/api/documents/${id}`)).status, 404);
    assert.equal((await b('POST', '/api/ai/summarize', { documentId: id, length: 'short' })).status, 404);
    assert.equal((await b('POST', '/api/ai/ask', { question: 'What is the codename?', documentIds: [id] })).status, 404);
    assert.equal((await b('GET', `/api/conversations/${convId}`)).status, 404);
    assert.equal((await b('DELETE', `/api/conversations/${convId}`)).status, 404);
    assert.equal((await b('GET', '/api/documents')).body.total, 0);
    // Dave has no documents of his own, so searching all documents finds nothing (and leaks nothing).
    assert.equal((await b('POST', '/api/ai/search', { query: 'Bluebird codename' })).status, 422);
    assert.equal((await b('GET', '/api/conversations')).body.conversations.length, 0);
  });
});
