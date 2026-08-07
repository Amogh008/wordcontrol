const mongoose = require('mongoose');
const { SUPPORTED_LANGUAGE_CODES, PROFILE_LANGUAGE_CODES } = require('../languages');

const THEMES = ['light', 'dark', 'system'];

// Denormalized copy of User.languageProfiles, kept in sync so preferences can be
// read without joining User. Shares the same _id values as the source entries.
const languageProfileSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    language: { type: String, enum: PROFILE_LANGUAGE_CODES, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userPreferenceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    appLanguage: { type: String, enum: SUPPORTED_LANGUAGE_CODES, default: 'en' },
    theme: { type: String, enum: THEMES, default: 'dark' },
    // References User.languageProfiles.[]._id (embedded, no longer a standalone collection).
    activeLanguageProfileId: { type: mongoose.Schema.Types.ObjectId, default: null },
    languageProfiles: { type: [languageProfileSchema], default: [] },
    onboardingDone: { type: Boolean, default: false },
    onboardingCompletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userPreferenceSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const { dbName } = require('../dbTableNames');
module.exports = mongoose.model('UserPreference', userPreferenceSchema, dbName('userpreferences'));
module.exports.THEMES = THEMES;
