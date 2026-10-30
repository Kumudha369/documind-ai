import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true, // creates a unique index
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    // The hash is never returned by default (select: false) so it can't leak by accident.
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function toPublic() {
  return { id: this._id.toString(), name: this.name, email: this.email, createdAt: this.createdAt };
};

export const User = mongoose.model('User', userSchema);
