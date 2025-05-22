const express = require("express")
const router = express.Router()
const { protect } = require("../middleware/authMiddleware")
const {
  createStory,
  getStories,
  getUserStories,
  viewStory,
  deleteStory,
  getStoryViewers,
} = require("../controllers/storyController")

// Protected routes
router.post("/", protect, createStory)
router.get("/", protect, getStories)
router.get("/user/:userId", protect, getUserStories)
router.put("/:storyId/view", protect, viewStory)
router.delete("/:storyId", protect, deleteStory)
router.get("/:storyId/viewers", protect, getStoryViewers)

module.exports = router
