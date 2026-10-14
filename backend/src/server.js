const app = require("./app");
const connectDB = require("./config/db");
const { port } = require("./config/env");

async function startServer() {
  try {
    await connectDB();

    const server = app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `\n❌ Port ${port} is already in use by another process!\n` +
          `👉 Solutions:\n` +
          `   1. Change PORT=${port + 1} in backend/.env and update frontend/.env (VITE_API_BASE_URL=http://localhost:${port + 1}/api)\n` +
          `   2. Or terminate the process currently listening on port ${port}.\n`
        );
      } else {
        console.error("Server error:", error.message);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error(
      `\n❌ Failed to connect to MongoDB: ${error.message}\n` +
      `👉 Please check your MONGODB_URI in backend/.env:\n` +
      `   - If using MongoDB Atlas, paste your mongodb+srv:// connection string into backend/.env\n` +
      `   - If using local MongoDB, ensure MongoDB service (mongod) is running.\n`
    );
    process.exit(1);
  }
}

startServer();
