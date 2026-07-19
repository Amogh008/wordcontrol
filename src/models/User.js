const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    passwordHash: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    name: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
