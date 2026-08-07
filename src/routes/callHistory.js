const express = require('express');
const Call = require('../models/Call');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const [calls, total] = await Promise.all([
      Call.find({ participants: req.user.id })
        .sort({ startedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('participants', 'name')
        .lean(),
      Call.countDocuments({ participants: req.user.id }),
    ]);

    const items = calls.map((call) => {
      const partner = call.participants.find((p) => String(p._id) !== String(req.user.id));
      return {
        id: call._id.toString(),
        partnerId: partner?._id ? String(partner._id) : null,
        partnerName: partner?.name || 'Language learner',
        language: call.language,
        relationship: call.relationship,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        durationSeconds: call.durationSeconds,
        endReason: call.endReason,
      };
    });

    res.json({ items, page, limit, total });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
