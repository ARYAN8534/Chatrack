const Story = require("../models/Story")
const User = require("../models/User")

// @desc    Create a new story
// @route   POST /api/stories
// @access  Private
const createStory = async (req, res) => {
  try {
    const { content, mediaType, mediaUrl, music, textStyle } = req.body

    // Crear nueva historia
    const newStory = new Story({
      user: req.user._id, // Usar _id en lugar de id
      content: content || "",
      mediaType: mediaType || "text",
      mediaUrl: mediaUrl || null,
      music: music || null,
      textStyle: textStyle || null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 horas
    })

    const savedStory = await newStory.save()

    // Populate user info for response
    const populatedStory = await Story.findById(savedStory._id).populate("user", "name avatar")

    res.status(201).json({
      success: true,
      story: populatedStory,
    })
  } catch (error) {
    console.error("Create story error:", error)
    res.status(500).json({
      success: false,
      message: "Server error creating story",
      error: error.message,
    })
  }
}

// @desc    Get all stories
// @route   GET /api/stories
// @access  Private
const getStories = async (req, res) => {
  try {
    // Obtener solo historias que no han expirado
    const currentTime = new Date()

    const stories = await Story.find({
      expiresAt: { $gt: currentTime },
    })
      .populate("user", "name avatar")
      .sort({ createdAt: -1 })

    // Agrupar historias por usuario
    const storyGroups = []
    const userMap = {}

    stories.forEach((story) => {
      const userId = story.user._id.toString()

      if (!userMap[userId]) {
        userMap[userId] = {
          user: story.user,
          stories: [],
        }
        storyGroups.push(userMap[userId])
      }

      userMap[userId].stories.push(story)
    })

    res.status(200).json({
      success: true,
      storyGroups,
    })
  } catch (error) {
    console.error("Get stories error:", error)
    res.status(500).json({
      success: false,
      message: "Server error getting stories",
      error: error.message,
    })
  }
}

// @desc    Get stories by a specific user
// @route   GET /api/stories/user/:userId
// @access  Private
const getUserStories = async (req, res) => {
  try {
    // Obtener solo historias que no han expirado
    const currentTime = new Date()

    const stories = await Story.find({
      user: req.params.userId,
      expiresAt: { $gt: currentTime },
    })
      .populate("user", "name avatar")
      .sort({ createdAt: -1 })

    if (!stories || stories.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No stories found for this user",
      })
    }

    res.status(200).json({
      success: true,
      stories,
    })
  } catch (error) {
    console.error("Get user stories error:", error)
    res.status(500).json({
      success: false,
      message: "Server error getting user stories",
      error: error.message,
    })
  }
}

// @desc    Mark a story as viewed
// @route   PUT /api/stories/:storyId/view
// @access  Private
const viewStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId)

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      })
    }

    // Verificar si el usuario ya ha visto la historia
    const alreadyViewed = story.viewers.some((viewer) => viewer.user.toString() === req.user._id.toString())

    if (!alreadyViewed) {
      // Añadir usuario a la lista de viewers
      story.viewers.push({
        user: req.user._id,
        viewedAt: new Date(),
      })

      await story.save()
    }

    res.status(200).json({
      success: true,
      message: "Story marked as viewed",
    })
  } catch (error) {
    console.error("View story error:", error)
    res.status(500).json({
      success: false,
      message: "Server error viewing story",
      error: error.message,
    })
  }
}

// @desc    Delete a story
// @route   DELETE /api/stories/:storyId
// @access  Private
const deleteStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId)

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      })
    }

    // Check if the logged-in user owns the story
    if (story.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this story",
      })
    }

    await Story.deleteOne({ _id: req.params.storyId })

    res.status(200).json({
      success: true,
      message: "Story deleted successfully",
    })
  } catch (error) {
    console.error("Delete story error:", error)
    res.status(500).json({
      success: false,
      message: "Server error deleting story",
      error: error.message,
    })
  }
}

// @desc    Get story viewers
// @route   GET /api/stories/:storyId/viewers
// @access  Private
const getStoryViewers = async (req, res) => {
  try {
    const story = await Story.findById(req.params.storyId).populate("viewers.user", "name avatar")

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      })
    }

    // Verificar si el usuario es el propietario de la historia
    if (story.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view story viewers",
      })
    }

    res.status(200).json({
      success: true,
      viewers: story.viewers || [],
    })
  } catch (error) {
    console.error("Get story viewers error:", error)
    res.status(500).json({
      success: false,
      message: "Server error getting story viewers",
      error: error.message,
    })
  }
}

module.exports = {
  createStory,
  getStories,
  getUserStories,
  viewStory,
  deleteStory,
  getStoryViewers,
}
