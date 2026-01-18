const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const https = require("https");

// IMPORTANT for Codeforces TLS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Codeforces persistent agent
const agent = new https.Agent({ keepAlive: true });

/* ---------------- BASIC TEST ---------------- */
app.get("/", (req, res) => {
  res.send("Backend is running");
});

/* ---------------- C++ RUN API ---------------- */
app.post("/run", (req, res) => {
  const { code, input } = req.body;
  
  if (!code) {
    return res.json({ output: "No code provided" });
  }

  const filePath = path.join(__dirname, "main.cpp");
  fs.writeFileSync(filePath, code);

  const inputPath = path.join(__dirname, "input.txt");
  fs.writeFileSync(inputPath, (input ?? "") + "\n");

  exec(
    `g++ main.cpp -o main && ./main < input.txt`,
    { cwd: __dirname, timeout: 5000 },
    (error, stdout, stderr) => {
      if (error) {
        return res.json({ output: stderr || error.message });
      }
      res.json({ output: stdout });
    }
  );
});

/* ---------------- CODEFORCES META API ---------------- */
app.get("/cf/meta", async (req, res) => {
  const { contestId, index } = req.query;
  
  if (!contestId || !index) {
    return res.status(400).json({
      status: "FAILED",
      error: "Missing contestId or index",
    });
  }

  try {
    const response = await fetch(
      `https://codeforces.com/api/problemset.problem?contestId=${contestId}&index=${index}`,
      {
        agent,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept": "application/json",
          "Connection": "keep-alive",
        },
      }
    );
    
    const data = await response.json();
    
    if (data.status !== "OK") {
      return res.status(404).json({
        status: "FAILED",
        error: "Problem not found",
      });
    }
    
    return res.json(data);
  } catch (err) {
    console.error("CF error:", err);
    return res.status(500).json({
      status: "FAILED",
      error: "CF fetch failed",
    });
  }
});

/* ---------------- SOCKET.IO SETUP ---------------- */
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`✅ Socket ${socket.id} joined room ${roomId}`);
    const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    console.log(`   Room ${roomId} now has ${roomSize} user(s)`);
  });

  socket.on("draw", ({ roomId, x0, y0, x1, y1, color }) => {
    socket.to(roomId).emit("draw", { x0, y0, x1, y1, color });
  });

  socket.on("clear-board", (roomId) => {
    socket.to(roomId).emit("clear-board");
  });

  socket.on("code-change", ({ roomId, code }) => {
    socket.to(roomId).emit("code-update", code);
  });

  // FIXED: Broadcast to everyone INCLUDING sender, but send sender ID
  socket.on("open-problem", ({ roomId, link, sender }) => {
    console.log(`📢 Broadcasting open-problem to room ${roomId}:`, { link, sender });
    io.to(roomId).emit("open-problem", { link, sender });
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
  });
});

/* ---------------- START SERVER ---------------- */
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});