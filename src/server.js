require('dotenv').config();
const { createApp } = require('./app');
const { connectDB } = require('./db');
const { startKeepAlive } = require('./keepAlive');

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDB(process.env.MONGODB_URI);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`wordcontrol-api listening on port ${PORT}`);
  });

  // Keep the pinger-api awake by pinging it every 10 minutes.
  startKeepAlive(process.env.PINGER_URL);
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
