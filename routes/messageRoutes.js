const express = require("express")
const router = express.Router()
const {
  sendMessage,
  getMessages,
  markMessageRead,
  deleteMessage,
  addReaction,
  getRecentChats,
} = require("../controllers/messageController")
const { protect } = require("../middleware/authMiddleware")

// All routes are protected
router.use(protect)

router.post("/", sendMessage)
router.get("/chats", getRecentChats)
router.get("/:userId", getMessages)
router.put("/:messageId/read", markMessageRead)
router.delete("/:messageId", deleteMessage)
router.post("/:messageId/react", addReaction)

module.exports = router
