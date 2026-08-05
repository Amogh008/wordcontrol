require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { ensureDeutschProfile } = require('../src/languageProfiles');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({}).select('_id').lean();
  for (const user of users) await ensureDeutschProfile(user._id);
  console.info(`Ensured Deutsch profiles for ${users.length} users.`);
  await mongoose.disconnect();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
