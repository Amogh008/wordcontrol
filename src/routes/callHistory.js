const express = require('express');
const Call = require('../models/Call');
const Rating = require('../models/Rating');
const User = require('../models/User');

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
        .populate('participants', 'name ratingSum ratingCount')
        .lean(),
      Call.countDocuments({ participants: req.user.id }),
    ]);

    const myRatings = await Rating.find({
      rater: req.user.id,
      call: { $in: calls.map((call) => call._id) },
    }).select('call score').lean();
    const myRatingByCall = new Map(myRatings.map((r) => [String(r.call), r.score]));

    const items = calls.map((call) => {
      const partner = call.participants.find((p) => String(p._id) !== String(req.user.id));
      return {
        id: call._id.toString(),
        partnerId: partner?._id ? String(partner._id) : null,
        partnerName: partner?.name || 'Language learner',
        partnerRating: partner?.ratingCount > 0 ? Math.round((partner.ratingSum / partner.ratingCount) * 10) / 10 : null,
        partnerRatingCount: partner?.ratingCount || 0,
        myRating: myRatingByCall.get(String(call._id)) || null,
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

router.post('/session/:sessionId/rating', async (req, res, next) => {
  try {
    const score = Number(req.body.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return res.status(400).json({ error: 'score must be an integer between 1 and 5.' });
    }

    const call = await Call.findOne({ sessionId: req.params.sessionId }).lean();
    if (!call) return res.status(404).json({ error: 'Call not found.' });

    const participantIds = call.participants.map((id) => String(id));
    if (!participantIds.includes(req.user.id)) {
      return res.status(403).json({ error: 'You were not part of this call.' });
    }
    const rateeId = participantIds.find((id) => id !== req.user.id);
    if (!rateeId) return res.status(400).json({ error: 'Could not determine who to rate.' });

    try {
      await Rating.create({ call: call._id, rater: req.user.id, ratee: rateeId, score });
    } catch (err) {
      if (err.code === 11000) return res.status(409).json({ error: 'You already rated this call.' });
      throw err;
    }

    await User.updateOne({ _id: rateeId }, { $inc: { ratingSum: score, ratingCount: 1 } });
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
