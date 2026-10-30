import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    ref: String, // "S1", "S2" ... the label used inside the answer text
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    documentName: String, // snapshot, so the reference still reads well if the doc is renamed/deleted
    chunkIndex: Number,
    pageNumber: { type: Number, default: null },
    startLine: { type: Number, default: null },
    endLine: { type: Number, default: null },
    excerpt: String,
    score: Number,
    cited: Boolean, // true = the model actually cited it in the answer
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 20000 },
    sourceReferences: { type: [sourceSchema], default: [] },
    insufficientEvidence: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ userId: 1 });

messageSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    conversationId: this.conversationId.toString(),
    role: this.role,
    content: this.content,
    sourceReferences: this.sourceReferences.map((s) => ({
      ref: s.ref,
      documentId: s.documentId?.toString(),
      documentName: s.documentName,
      chunkIndex: s.chunkIndex,
      pageNumber: s.pageNumber,
      startLine: s.startLine,
      endLine: s.endLine,
      excerpt: s.excerpt,
      score: s.score,
      cited: s.cited,
    })),
    insufficientEvidence: this.insufficientEvidence,
    createdAt: this.createdAt,
  };
};

export const Message = mongoose.model('Message', messageSchema);
