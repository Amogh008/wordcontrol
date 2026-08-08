const mongoose = require('mongoose');
const { dbName } = require('../dbTableNames');

const callSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
      required: true,
      validate: (value) => Array.isArray(value) && value.length === 2,
    },
    language: { type: String, required: true },
    relationship: { type: String, enum: ['friend', 'random'], default: 'random' },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    durationSeconds: { type: Number, required: true, min: 0 },
    endReason: { type: String, default: 'ended' },
  },
  { timestamps: true },
);

callSchema.index({ participants: 1, startedAt: -1 });

callSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Call', callSchema, dbName('calls'));
