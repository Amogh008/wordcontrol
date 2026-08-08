const mongoose = require('mongoose');
const { dbName } = require('../dbTableNames');

const ratingSchema = new mongoose.Schema(
  {
    call: { type: mongoose.Schema.Types.ObjectId, ref: 'Call', required: true },
    rater: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ratee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, required: true, min: 1, max: 5 },
  },
  { timestamps: true },
);

ratingSchema.index({ call: 1, rater: 1 }, { unique: true });

module.exports = mongoose.model('Rating', ratingSchema, dbName('ratings'));
