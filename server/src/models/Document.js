import mongoose from 'mongoose';

export const STATUS = Object.freeze({
  UPLOADED: 'Uploaded',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
});

const summarySchema = new mongoose.Schema(
  {
    shortSummary: String,
    detailedSummary: String,
    keyPoints: [String],
    terms: [{ _id: false, term: String, definition: String }],
    actionItems: [String],
    generatedAt: Date,
    model: String,
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    originalFilename: { type: String, required: true, trim: true, maxlength: 255 },
    // Random name on disk. The user-supplied name is never used as a path.
    storedFilename: { type: String, required: true },
    fileType: { type: String, enum: ['pdf', 'txt'], required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true, min: 0 },
    pageCount: { type: Number, default: null },
    chunkCount: { type: Number, default: 0 },
    charCount: { type: Number, default: 0 },
    processingStatus: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.UPLOADED,
    },
    processingError: { type: String, default: null },
    processingAttempts: { type: Number, default: 0 },
    tags: {
      type: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],
      validate: [(v) => v.length <= 10, 'A document can have at most 10 tags.'],
    },
    // Cached summaries keyed by length: short | medium | long.
    // Only the (small) summary is stored here; the full text lives once, in DocumentChunk.
    summaries: {
      type: Map,
      of: summarySchema,
      default: undefined,
    },
  },
  { timestamps: true }
);

documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ userId: 1, tags: 1 });
documentSchema.index({ userId: 1, processingStatus: 1 });

documentSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    originalFilename: this.originalFilename,
    fileType: this.fileType,
    fileSize: this.fileSize,
    pageCount: this.pageCount,
    chunkCount: this.chunkCount,
    processingStatus: this.processingStatus,
    processingError: this.processingError,
    tags: this.tags,
    hasSummary: this.summaries ? this.summaries.size > 0 : false,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Document = mongoose.model('Document', documentSchema);
