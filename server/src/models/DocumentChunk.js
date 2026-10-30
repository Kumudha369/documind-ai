import mongoose from 'mongoose';

// One row per passage of text. This is the ONLY place the document text is stored.
const chunkSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    // userId is copied onto every chunk so each search query can filter by owner directly.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    // PDFs: real page number. TXT: null (we store line numbers instead).
    pageNumber: { type: Number, default: null },
    startLine: { type: Number, default: null },
    endLine: { type: Number, default: null },
    // Vector data. select:false keeps the big array out of normal queries.
    embedding: { type: [Number], select: false },
    // Remember which model made the vector. Vectors from different models are not comparable.
    embeddingModel: { type: String, required: true },
  },
  { timestamps: false }
);

chunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
chunkSchema.index({ userId: 1, documentId: 1 });
// Powers keyword search ($text). Filtering by userId/documentId happens in the query.
chunkSchema.index({ text: 'text' });

export const DocumentChunk = mongoose.model('DocumentChunk', chunkSchema);
