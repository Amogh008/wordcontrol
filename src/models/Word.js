const mongoose = require('mongoose');

const wordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    artikel: { type: String, enum: ['der', 'die', 'das', 'misc', ''], default: '' },
    wort: { type: String, required: true, trim: true },
    bedeutung: { type: String, required: true, trim: true },
    notizen: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

// The RN app reads either `id` or `_id`; this keeps responses simple either way.
wordSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Word', wordSchema);
