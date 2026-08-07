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
