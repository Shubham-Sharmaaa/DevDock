import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { validateEnv } from './config/validateEnv.js';

const PORT = process.env.PORT || 5000;

async function main() {
  validateEnv();
  await connectDB(process.env.MONGO_URI);

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`[server] DevDock API listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
