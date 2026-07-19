// One-off migration: assign all pre-existing Word docs (created before the
// per-user model) to a single account. Run after that account is registered:
//
//   node scripts/assignOrphanWords.js someone@example.com
//
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/db');
const User = require('../src/models/User');
const Word = require('../src/models/Word');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/assignOrphanWords.js <email>');
    process.exit(1);
  }

  await connectDB(process.env.MONGODB_URI);

  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (!user) {
    console.error(`No user found with email ${email}. Register that account first.`);
    process.exit(1);
  }

  const result = await Word.updateMany({ userId: { $exists: false } }, { $set: { userId: user._id } });
  console.log(`Assigned ${result.modifiedCount} word(s) to ${email}.`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
