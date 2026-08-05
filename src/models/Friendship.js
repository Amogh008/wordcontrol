const mongoose = require('mongoose');
const { SUPPORTED_LANGUAGE_CODES } = require('../languages');

const friendshipSchema = new mongoose.Schema(
  {
    requesterProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'LanguageProfile', required: true, index: true },
    addresseeProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'LanguageProfile', required: true, index: true },
    language: { type: String, enum: SUPPORTED_LANGUAGE_CODES, required: true, index: true },
    status: { type: String, enum: ['pending', 'accepted', 'blocked'], default: 'pending' },
  },
  { timestamps: true },
);

friendshipSchema.index({ requesterProfileId: 1, addresseeProfileId: 1 }, { unique: true });
const { dbName } = require('../dbTableNames');
module.exports = mongoose.model('Friendship', friendshipSchema, dbName('friendships'));
