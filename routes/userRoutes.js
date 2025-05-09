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
  addContact,
  getContacts,
  blockUser,
  unblockUser,
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
router.post("/contacts", protect, addContact)
router.get("/contacts", protect, getContacts)
router.post("/block", protect, blockUser)
router.post("/unblock", protect, unblockUser)

module.exports = router
