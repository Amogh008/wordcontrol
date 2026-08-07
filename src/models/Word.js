const mongoose = require('mongoose');

const wordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // References User.languageProfiles.[]._id (embedded, no longer a standalone collection).
    languageProfileId: { type: mongoose.Schema.Types.ObjectId, index: true },
    artikel: { type: String, trim: true, default: '' },
    wort: { type: String, required: true, trim: true },
    bedeutung: { type: String, required: true, trim: true },
    notizen: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);
wordSchema.index({ userId: 1, languageProfileId: 1, createdAt: -1 });

// The RN app reads either `id` or `_id`; this keeps responses simple either way.
wordSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const { dbName } = require('../dbTableNames');
module.exports = mongoose.model('Word', wordSchema, dbName('words'));
