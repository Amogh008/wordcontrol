const mongoose = require('mongoose');
const { PROFILE_LANGUAGE_CODES } = require('../languages');

const languageProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    language: { type: String, enum: PROFILE_LANGUAGE_CODES, required: true },
  },
  { timestamps: true },
);

languageProfileSchema.index({ userId: 1, language: 1 }, { unique: true });
languageProfileSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
  },
});

const { dbName } = require('../dbTableNames');
module.exports = mongoose.model('LanguageProfile', languageProfileSchema, dbName('languageprofiles'));
