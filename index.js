const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const dotenv = require("dotenv")
const http = require("http")
const socketIo = require("socket.io")
const path = require("path")
const userRoutes = require("./routes/userRoutes")
const messageRoutes = require("./routes/messageRoutes")
const nearbyRoutes = require("./routes/nearbyRoutes")

// Load environment variables
dotenv.config()

// Initialize Express app
const app = express()
const server = http.createServer(app)

// Socket.IO setup with CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
})

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")))

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err)
    process.exit(1)
  })

// Routes
app.use("/api/users", userRoutes)
app.use("/api/messages", messageRoutes)
app.use("/api/nearby", nearbyRoutes)

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`)

  // Join a room (for private messaging)
  socket.on("join", (userId) => {
    socket.join(userId)
    console.log(`User ${userId} joined their room`)
  })

  // Handle new messages
  socket.on("sendMessage", async (messageData) => {
    try {
      const { sender, receiver, text, messageType } = messageData

      // Emit to sender and receiver
      io.to(sender).emit("newMessage", messageData)
      io.to(receiver).emit("newMessage", messageData)

      console.log("Message emitted:", messageData)
    } catch (error) {
      console.error("Error handling message:", error)
    }
  })

  // Handle typing indicator
  socket.on("typing", (data) => {
    const { sender, receiver } = data
    socket.to(receiver).emit("userTyping", { sender })
  })

  // Handle stop typing
  socket.on("stopTyping", (data) => {
    const { sender, receiver } = data
    socket.to(receiver).emit("userStopTyping", { sender })
  })

  // Handle user online status
  socket.on("userOnline", (userId) => {
    // Broadcast to all users that this user is online
    socket.broadcast.emit("userStatusUpdate", { userId, status: "online" })
  })

  // Handle video/voice call signaling
  socket.on("callUser", (data) => {
    const { userToCall, signalData, from, name, isVideo } = data
    io.to(userToCall).emit("callIncoming", { signal: signalData, from, name, isVideo })
  })

  socket.on("answerCall", (data) => {
    io.to(data.to).emit("callAccepted", data.signal)
  })

  socket.on("endCall", (data) => {
    io.to(data.to).emit("callEnded")
  })

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`)
  })

  // Handle explicit logout/offline
  socket.on("userOffline", (userId) => {
    // Broadcast to all users that this user is offline
    socket.broadcast.emit("userStatusUpdate", { userId, status: "offline" })
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ message: "Something went wrong!", error: err.message })
})

// Start server
const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

module.exports = { app, server, io }
