const Message = require("../models/Message")
const User = require("../models/User")
const mongoose = require("mongoose")

// @desc    Send a new message
// @route   POST /api/messages
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { receiver, text, messageType, mediaUrl, replyTo, oneTimeView } = req.body
    const sender = req.user.id

    // Check if receiver exists
    const receiverUser = await User.findById(receiver)
    if (!receiverUser) {
      return res.status(404).json({ message: "Receiver not found" })
    }

    // Check if sender is blocked by receiver
    if (receiverUser.blockedUsers.includes(sender)) {
      return res.status(403).json({ message: "You cannot send messages to this user" })
    }

    // Create new message
    const newMessage = new Message({
      sender,
      receiver,
      text,
      messageType: messageType || "text",
      mediaUrl: mediaUrl || null,
      replyTo: replyTo || null,
      oneTimeView: oneTimeView || false,
      timestamp: new Date(),
    })

    // Save message to database
    const savedMessage = await newMessage.save()

    // Populate sender info for the response
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

    res.status(201).json(populatedMessage)
  } catch (error) {
    console.error("Send message error:", error)
    res.status(500).json({ message: "Server error sending message", error: error.message })
  }
}

// @desc    Get messages between two users
// @route   GET /api/messages/:userId
// @access  Private
const getMessages = async (req, res) => {
  try {
    const currentUserId = req.user.id
    const otherUserId = req.params.userId

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({ message: "Invalid user ID" })
    }

    // Get messages where current user is either sender or receiver
    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: otherUserId },
        { sender: otherUserId, receiver: currentUserId },
      ],
      deletedFor: { $ne: currentUserId }, // Don't show messages deleted by current user
    })
      .sort({ timestamp: 1 })
      .populate("sender", "name avatar")
      .populate("receiver", "name avatar")
      .populate({
        path: "replyTo",
        populate: {
          path: "sender",
          select: "name avatar",
        },
      })

    // Mark messages as read
    const unreadMessages = messages.filter((msg) => msg.sender._id.toString() === otherUserId && !msg.isRead)

    if (unreadMessages.length > 0) {
      await Message.updateMany(
        {
          _id: { $in: unreadMessages.map((msg) => msg._id) },
        },
        {
          isRead: true,
          readAt: new Date(),
        },
      )
    }

    res.status(200).json(messages)
  } catch (error) {
    console.error("Get messages error:", error)
    res.status(500).json({ message: "Server error getting messages", error: error.message })
  }
}

// @desc    Mark message as read
// @route   PUT /api/messages/:messageId/read
// @access  Private
const markMessageRead = async (req, res) => {
  try {
    const messageId = req.params.messageId
    const userId = req.user.id

    const message = await Message.findById(messageId)

    if (!message) {
      return res.status(404).json({ message: "Message not found" })
    }

    // Only receiver can mark message as read
    if (message.receiver.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized to mark this message as read" })
    }

    // Update message
    message.isRead = true
    message.readAt = new Date()

    // If it's a one-time view message, also mark viewedAt
    if (message.oneTimeView && !message.viewedAt) {
      message.viewedAt = new Date()
    }

    await message.save()

    res.status(200).json({ message: "Message marked as read" })
  } catch (error) {
    console.error("Mark message read error:", error)
    res.status(500).json({ message: "Server error marking message as read", error: error.message })
  }
}

// @desc    Delete message
// @route   DELETE /api/messages/:messageId
// @access  Private
const deleteMessage = async (req, res) => {
  try {
    const messageId = req.params.messageId
    const userId = req.user.id
    const { deleteForEveryone } = req.query

    const message = await Message.findById(messageId)

    if (!message) {
      return res.status(404).json({ message: "Message not found" })
    }

    // Check if user is sender or receiver
    const isSender = message.sender.toString() === userId
    const isReceiver = message.receiver.toString() === userId

    if (!isSender && !isReceiver) {
      return res.status(403).json({ message: "Not authorized to delete this message" })
    }

    if (deleteForEveryone === "true" && isSender) {
      // If sender wants to delete for everyone, mark as deleted
      message.isDeleted = true
      message.text = "This message was deleted"
      await message.save()
    } else {
      // Delete just for current user
      message.deletedFor.push(userId)
      await message.save()
    }

    res.status(200).json({ message: "Message deleted successfully" })
  } catch (error) {
    console.error("Delete message error:", error)
    res.status(500).json({ message: "Server error deleting message", error: error.message })
  }
}

// @desc    Add reaction to message
// @route   POST /api/messages/:messageId/react
// @access  Private
const addReaction = async (req, res) => {
  try {
    const messageId = req.params.messageId
    const userId = req.user.id
    const { emoji } = req.body

    if (!emoji) {
      return res.status(400).json({ message: "Emoji is required" })
    }

    const message = await Message.findById(messageId)

    if (!message) {
      return res.status(404).json({ message: "Message not found" })
    }

    // Check if user has already reacted with this emoji
    const existingReaction = message.reactions.find(
      (reaction) => reaction.user.toString() === userId && reaction.emoji === emoji,
    )

    if (existingReaction) {
      // Remove the reaction if it already exists (toggle behavior)
      message.reactions = message.reactions.filter(
        (reaction) => !(reaction.user.toString() === userId && reaction.emoji === emoji),
      )
    } else {
      // Add new reaction
      message.reactions.push({ user: userId, emoji })
    }

    await message.save()

    res.status(200).json({ message: "Reaction updated", reactions: message.reactions })
  } catch (error) {
    console.error("Add reaction error:", error)
    res.status(500).json({ message: "Server error adding reaction", error: error.message })
  }
}

// @desc    Get recent chats (conversations)
// @route   GET /api/messages/chats
// @access  Private
const getRecentChats = async (req, res) => {
  try {
    const userId = req.user.id

    // Get all messages where user is sender or receiver
    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }],
      deletedFor: { $ne: userId }, // Don't include messages deleted by user
    })
      .sort({ timestamp: -1 })
      .populate("sender", "name avatar status")
      .populate("receiver", "name avatar status")

    // Create a map of conversations
    const conversationsMap = new Map()

    messages.forEach((message) => {
      // Determine the other user in the conversation
      const otherUser = message.sender._id.toString() === userId ? message.receiver : message.sender

      const otherUserId = otherUser._id.toString()

      // If this conversation is not yet in our map, add it
      if (!conversationsMap.has(otherUserId)) {
        conversationsMap.set(otherUserId, {
          user: {
            _id: otherUser._id,
            name: otherUser.name,
            avatar: otherUser.avatar,
            status: otherUser.status,
          },
          lastMessage: {
            _id: message._id,
            text: message.isDeleted ? "This message was deleted" : message.text,
            messageType: message.messageType,
            timestamp: message.timestamp,
            isRead: message.isRead,
            sender: message.sender._id.toString(),
          },
          unreadCount: 0,
        })
      }
    })

    // Count unread messages for each conversation
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          receiver: mongoose.Types.ObjectId(userId),
          isRead: false,
          deletedFor: { $ne: mongoose.Types.ObjectId(userId) },
        },
      },
      {
        $group: {
          _id: "$sender",
          count: { $sum: 1 },
        },
      },
    ])

    // Add unread counts to conversations
    unreadCounts.forEach((item) => {
      const senderId = item._id.toString()
      if (conversationsMap.has(senderId)) {
        conversationsMap.get(senderId).unreadCount = item.count
      }
    })

    // Convert map to array and sort by last message timestamp
    const conversations = Array.from(conversationsMap.values()).sort(
      (a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp),
    )

    res.status(200).json(conversations)
  } catch (error) {
    console.error("Get recent chats error:", error)
    res.status(500).json({ message: "Server error getting recent chats", error: error.message })
  }
}

module.exports = {
  sendMessage,
  getMessages,
  markMessageRead,
  deleteMessage,
  addReaction,
  getRecentChats,
}
