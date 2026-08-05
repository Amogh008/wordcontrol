const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    passwordHash: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    name: { type: String, trim: true, default: '' },
    profileInfoUpdatedAt: { type: Date, default: null },
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

const { dbName } = require('../dbTableNames');
module.exports = mongoose.model('User', userSchema, dbName('users'));
