const mongoose = require('mongoose');
const { PROFILE_LANGUAGE_CODES } = require('../languages');

const languageProfileSchema = new mongoose.Schema(
  {
    language: { type: String, enum: PROFILE_LANGUAGE_CODES, required: true },
    createdAt: { type: Date, default: Date.now },
  },
);

const languageFriendSchema = new mongoose.Schema(
  {
    friendId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'blocked'], default: 'pending' },
    // Who sent the original request, so each side can tell an incoming
    // request (actionable: accept/reject) from an outgoing one (waiting).
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const languageFriendsSchema = new mongoose.Schema(
  {
    language: { type: String, enum: PROFILE_LANGUAGE_CODES, required: true },
    friends: { type: [languageFriendSchema], default: [] },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    passwordHash: { type: String },
    googleId: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    name: { type: String, trim: true, default: '' },
    profileInfoUpdatedAt: { type: Date, default: null },
    languageProfiles: { type: [languageProfileSchema], default: [] },
    languageFriends: { type: [languageFriendsSchema], default: [] },
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    ret.rating = ret.ratingCount > 0 ? Math.round((ret.ratingSum / ret.ratingCount) * 10) / 10 : null;
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    delete ret.ratingSum;
    return ret;
  },
});

const { dbName } = require('../dbTableNames');
module.exports = mongoose.model('User', userSchema, dbName('users'));
