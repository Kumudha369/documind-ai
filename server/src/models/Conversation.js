import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120, default: 'New conversation' },
    // The documents this conversation is about (what the user ticked in the chat screen).
    documentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
  },
  { timestamps: true }
);

conversationSchema.index({ userId: 1, updatedAt: -1 });

conversationSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    title: this.title,
    documentIds: this.documentIds.map(String),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const Conversation = mongoose.model('Conversation', conversationSchema);
