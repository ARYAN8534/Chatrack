const express = require("express")
const router = express.Router()
const {
  registerUser,
  verifyOTP,
  resendOTP,
  loginUser,
  getUserProfile,
  updateUserProfile,
  updateUserLocation,
  getNearbyUsers,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriendRequests,
  getFriends,
  addContact,
  getContacts,
  blockUser,
  unblockUser,
  logoutUser,
} = require("../controllers/userController")
const { protect } = require("../middleware/authMiddleware")

// Public routes
router.post("/register", registerUser)
router.post("/verify-otp", verifyOTP)
router.post("/resend-otp", resendOTP)
router.post("/login", loginUser)

// Protected routes
router.get("/profile", protect, getUserProfile)
router.put("/profile", protect, updateUserProfile)
router.put("/location", protect, updateUserLocation)
router.get("/nearby", protect, getNearbyUsers)

// Friend system routes
router.post("/friend-request", protect, sendFriendRequest)
router.post("/accept-friend", protect, acceptFriendRequest)
router.post("/reject-friend", protect, rejectFriendRequest)
router.get("/friend-requests", protect, getFriendRequests)
router.get("/friends", protect, getFriends)

// Contact routes
router.post("/contacts", protect, addContact)
router.get("/contacts", protect, getContacts)

// Block/unblock routes
router.post("/block", protect, blockUser)
router.post("/unblock", protect, unblockUser)

// Logout route
router.post("/logout", protect, logoutUser)

module.exports = router
