const mongoose = require('mongoose');

const pendingPasswordResetSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);

const { dbName } = require('../dbTableNames');
module.exports = mongoose.model('PendingPasswordReset', pendingPasswordResetSchema, dbName('pendingpasswordresets'));
