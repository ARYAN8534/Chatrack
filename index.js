const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const dotenv = require("dotenv")
const http = require("http")
const socketIo = require("socket.io")
const userRoutes = require("./routes/userRoutes")
const messageRoutes = require("./routes/messageRoutes")
const nearbyRoutes = require("./routes/nearbyRoutes")
const storyRoutes = require("./routes/storyRoutes")
const User = require("./models/User")
const Message = require("./models/Message")

// Load environment variables
dotenv.config()

// Initialize Express app
const app = express()
const server = http.createServer(app)

// Socket.IO setup with CORS
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"], // Support both transport methods
})

// Middleware
app.use(
  cors({
    origin: "*", // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
)
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log(`MongoDB Connected: ${mongoose.connection.host}`))
  .catch((error) => {
    console.error(`Error connecting to MongoDB: ${error.message}`)
    process.exit(1)
  })

// Routes
app.use("/api/users", userRoutes)
app.use("/api/messages", messageRoutes)
app.use("/api/nearby", nearbyRoutes)
app.use("/api/stories", storyRoutes)

// Test route
app.get("/test", (req, res) => {
  res.json({ message: "API is working!" })
})

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`)

  // Store user ID in socket for later use
  let currentUserId = null

  // Join a room (for private messaging)
  socket.on("join", (userId) => {
    if (userId) {
      socket.join(userId)
      currentUserId = userId
      console.log(`User ${userId} joined their room`)

      // Update user status to online
      updateUserStatus(userId, "online")

      // Broadcast to all users that this user is online
      socket.broadcast.emit("userStatusUpdate", { userId, status: "online" })
    }
  })

  // Handle new messages
  socket.on("sendMessage", async (messageData) => {
    try {
      console.log("Received message data:", messageData)

      const { sender, receiver, text, messageType, mediaUrl, replyTo, oneTimeView } = messageData

      if (!sender || !receiver || !text) {
        socket.emit("messageError", { message: "Missing required fields" })
        return
      }

      // Check if receiver has blocked sender
      const receiverUser = await User.findById(receiver)
      if (receiverUser && receiverUser.blockedUsers.includes(sender)) {
        socket.emit("messageError", { message: "Cannot send message to this user" })
        return
      }

      // Create new message in database
      const newMessage = new Message({
        sender,
        receiver,
        text,
        messageType: messageType || "text",
        mediaUrl: mediaUrl || null,
        replyTo: replyTo || null,
        oneTimeView: oneTimeView || false,
      })

      // Save message to database
      const savedMessage = await newMessage.save()
      console.log("Message saved to database:", savedMessage._id)

      // Populate sender and receiver info
      const populatedMessage = await Message.findById(savedMessage._id)
        .populate("sender", "name avatar")
        .populate("receiver", "name avatar")
        .populate({
          path: "replyTo",
          populate: {
            path: "sender",
            select: "name avatar",
          },
        })

      // Emit to sender and receiver
      io.to(sender).emit("newMessage", populatedMessage)
      io.to(receiver).emit("newMessage", populatedMessage)

      console.log("Message emitted to sender and receiver")
    } catch (error) {
      console.error("Error handling message:", error)
      socket.emit("messageError", { message: "Failed to send message", error: error.message })
    }
  })

  // Handle new story
  socket.on("newStory", (storyData) => {
    try {
      const { userId, storyId } = storyData

      // Broadcast to all users that a new story is available
      socket.broadcast.emit("storyUpdate", { userId, storyId })
    } catch (error) {
      console.error("Error handling new story:", error)
    }
  })

  // Handle story view
  socket.on("viewStory", (data) => {
    try {
      const { storyId, viewerId, storyOwnerId } = data

      // Notify story owner that someone viewed their story
      socket.to(storyOwnerId).emit("storyViewed", { storyId, viewerId })
    } catch (error) {
      console.error("Error handling story view:", error)
    }
  })

  // Handle typing indicator
  socket.on("typing", (data) => {
    const { sender, receiver } = data
    if (receiver) {
      socket.to(receiver).emit("userTyping", { sender })
    }
  })

  // Handle stop typing
  socket.on("stopTyping", (data) => {
    const { sender, receiver } = data
    if (receiver) {
      socket.to(receiver).emit("userStopTyping", { sender })
    }
  })

  // Handle user online status
  socket.on("userOnline", async (userId) => {
    try {
      await updateUserStatus(userId, "online")
      // Broadcast to all users that this user is online
      socket.broadcast.emit("userStatusUpdate", { userId, status: "online" })
    } catch (error) {
      console.error("Error updating user status:", error)
    }
  })

  // Handle friend request
  socket.on("sendFriendRequest", async (data) => {
    try {
      const { senderId, recipientId } = data

      if (recipientId) {
        socket.to(recipientId).emit("newFriendRequest", { senderId })
      }
    } catch (error) {
      console.error("Error sending friend request:", error)
    }
  })

  // Handle friend request response
  socket.on("friendRequestResponse", async (data) => {
    try {
      const { senderId, recipientId, accepted } = data

      if (senderId) {
        socket.to(senderId).emit("friendRequestResponseReceived", {
          recipientId,
          accepted,
        })
      }
    } catch (error) {
      console.error("Error handling friend request response:", error)
    }
  })

  // Handle location update
  socket.on("updateLocation", async (data) => {
    try {
      const { userId, longitude, latitude } = data

      if (userId && longitude && latitude) {
        await User.findByIdAndUpdate(userId, {
          location: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
        })

        console.log(`Location updated for user ${userId}`)
      }
    } catch (error) {
      console.error("Error updating location:", error)
    }
  })

  // Handle message read status
  socket.on("messageRead", async (data) => {
    try {
      const { messageId, readerId } = data

      const message = await Message.findById(messageId)
      if (message && message.receiver.toString() === readerId) {
        message.isRead = true
        message.readAt = new Date()

        if (message.oneTimeView) {
          message.viewed = true
        }

        await message.save()

        // Notify sender that message was read
        socket.to(message.sender.toString()).emit("messageReadUpdate", {
          messageId,
          readAt: message.readAt,
        })
      }
    } catch (error) {
      console.error("Error marking message as read:", error)
    }
  })

  // Handle disconnect
  socket.on("disconnect", async () => {
    console.log(`User disconnected: ${socket.id}`)

    // Update user's online status if userId is available
    if (currentUserId) {
      await updateUserStatus(currentUserId, "offline")

      // Broadcast to all users that this user is offline
      socket.broadcast.emit("userStatusUpdate", { userId: currentUserId, status: "offline" })
    }
  })

  // Handle explicit logout/offline
  socket.on("userOffline", async (userId) => {
    try {
      await updateUserStatus(userId, "offline")

      // Broadcast to all users that this user is offline
      socket.broadcast.emit("userStatusUpdate", { userId, status: "offline" })
    } catch (error) {
      console.error("Error updating user status:", error)
    }
  })
})

// Helper function to update user status
async function updateUserStatus(userId, status) {
  try {
    await User.findByIdAndUpdate(userId, {
      status,
      lastSeen: status === "offline" ? new Date() : undefined,
    })
    return true
  } catch (error) {
    console.error(`Error updating status for user ${userId}:`, error)
    return false
  }
}

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
