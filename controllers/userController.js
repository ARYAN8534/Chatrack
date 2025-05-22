const User = require("../models/User")
const jwt = require("jsonwebtoken")
const twilio = require("twilio")
const { generateUniqueAppId } = require("../utils/appIdGenerator")


// Initialize Twilio client with environment variables
let twilioClient
let twilioPhoneNumber

try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER
    console.log("Twilio client initialized successfully")
  } else {
    console.warn("Twilio credentials not found in environment variables")
  }
} catch (error) {
  console.error("Error initializing Twilio client:", error)
}

// @desc    Register a new user
// @route   POST /api/users/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    console.log("Registration request received:", req.body)

    const { phone, name, age, gender, about, interests, email, password, avatar, latitude, longitude } = req.body

    // Validate required fields
    if (!phone || !name) {
      return res.status(400).json({
        success: false,
        message: "Phone number and name are required",
      })
    }

    // Check if user already exists
    const userExists = await User.findOne({ phone })
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: "User with this phone number already exists",
      })
    }

    // Check if email exists if provided
    if (email) {
      const emailExists = await User.findOne({ email })
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "User with this email already exists",
        })
      }
    }

    // Create user with unique app ID
    const appId = generateUniqueAppId()

    // Create location object if coordinates are provided
    const location = {
      type: "Point",
      coordinates: [0, 0],
    }

    if (latitude && longitude) {
      location.coordinates = [Number.parseFloat(longitude), Number.parseFloat(latitude)]
    }

    // Parse interests if it's a string
    let parsedInterests = interests
    if (typeof interests === "string") {
      try {
        parsedInterests = JSON.parse(interests)
      } catch (error) {
        console.error("Error parsing interests:", error)
        parsedInterests = []
      }
    }

    const user = new User({
      phone,
      name,
      age,
      gender,
      about,
      interests: Array.isArray(parsedInterests) ? parsedInterests : [],
      email,
      password,
      appId,
      avatar,
      location,
      isVerified: false,
    })

    // Generate OTP
    const otp = user.generateOTP()
    await user.save()

    console.log(`Generated OTP for ${phone}: ${otp}`)

    // Send OTP via Twilio if configured
    if (twilioClient && twilioPhoneNumber) {
      try {
        console.log("Sending OTP via Twilio to:", phone)
        console.log("Using Twilio phone number:", twilioPhoneNumber)

        const message = await twilioClient.messages.create({
          body: `Your ChatApp verification code is: ${otp}`,
          from: twilioPhoneNumber,
          to: phone,
        })

        console.log(`OTP sent to ${phone}, Twilio SID:`, message.sid)

        res.status(201).json({
          success: true,
          message: "User registered. Please verify your phone number with the OTP sent.",
          userId: user._id,
        })
      } catch (error) {
        console.error("Error sending SMS:", error)
        // For development, return OTP in response
        return res.status(201).json({
          success: true,
          message: "User registered. OTP sending failed, but here it is for testing:",
          otp,
          userId: user._id,
        })
      }
    } else {
      // If Twilio is not configured, return OTP in response for testing
      return res.status(201).json({
        success: true,
        message: "User registered. Twilio not configured, here is the OTP for testing:",
        otp,
        userId: user._id,
      })
    }
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({
      success: false,
      message: "Server error during registration",
      error: error.message,
    })
  }
}

// @desc    Verify OTP
// @route   POST /api/users/verify-otp
// @access  Public
const verifyOTP = async (req, res) => {
  try {
    const { userId, otp } = req.body

    console.log("OTP verification request:", { userId, otp })

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP are required",
      })
    }

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "User is already verified",
      })
    }

    if (!user.isValidOTP(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      })
    }

    user.isVerified = true
    user.otp = { code: null, expiresAt: null }
    user.status = "online"
    await user.save()

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "your_jwt_secret", { expiresIn: "30d" })

    res.status(200).json({
      success: true,
      message: "Phone number verified successfully",
      token,
      user: {
        _id: user._id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        appId: user.appId,
        avatar: user.avatar,
        age: user.age,
        gender: user.gender,
        status: user.status,
        isVerified: user.isVerified,
      },
    })
  } catch (error) {
    console.error("OTP verification error:", error)
    res.status(500).json({
      success: false,
      message: "Server error during OTP verification",
      error: error.message,
    })
  }
}

// @desc    Resend OTP
// @route   POST /api/users/resend-otp
// @access  Public
const resendOTP = async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      })
    }

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "User is already verified",
      })
    }

    const otp = user.generateOTP()
    await user.save()

    console.log(`Resent OTP for ${user.phone}: ${otp}`)

    // Send OTP via Twilio if configured
    if (twilioClient && twilioPhoneNumber) {
      try {
        console.log("Resending OTP via Twilio to:", user.phone)

        const message = await twilioClient.messages.create({
          body: `Your ChatApp verification code is: ${otp}`,
          from: twilioPhoneNumber,
          to: user.phone,
        })

        console.log(`OTP resent to ${user.phone}, Twilio SID:`, message.sid)

        res.status(200).json({
          success: true,
          message: "OTP resent successfully",
        })
      } catch (error) {
        console.error("Error sending SMS:", error)
        return res.status(200).json({
          success: true,
          message: "OTP resend failed, but here it is for testing:",
          otp,
        })
      }
    } else {
      // If Twilio is not configured, return OTP in response for testing
      return res.status(200).json({
        success: true,
        message: "OTP resend successful. Twilio not configured, here is the OTP for testing:",
        otp,
      })
    }
  } catch (error) {
    console.error("Resend OTP error:", error)
    res.status(500).json({
      success: false,
      message: "Server error during OTP resend",
      error: error.message,
    })
  }
}

// @desc    Login user
// @route   POST /api/users/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { phone, email, appId, password } = req.body

    console.log("Login request received:", req.body)

    // Check if at least one identifier is provided
    if (!phone && !email && !appId) {
      return res.status(400).json({
        success: false,
        message: "Please provide phone number, email, or app ID",
      })
    }

    // Find user by provided identifier
    let user
    if (phone) {
      user = await User.findOne({ phone })
    } else if (email) {
      user = await User.findOne({ email })
    } else if (appId) {
      user = await User.findOne({ appId })
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please register first.",
      })
    }

    // If password is provided, verify it
    if (password) {
      const isMatch = await user.matchPassword(password)
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Invalid password",
        })
      }

      // If user is verified and password matches, create token and return user
      if (user.isVerified) {
        // Update user status
        user.status = "online"
        user.lastSeen = new Date()
        await user.save()

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "your_jwt_secret", { expiresIn: "30d" })

        return res.status(200).json({
          success: true,
          message: "Login successful",
          token,
          user: {
            _id: user._id,
            phone: user.phone,
            name: user.name,
            email: user.email,
            appId: user.appId,
            avatar: user.avatar,
            age: user.age,
            gender: user.gender,
            status: user.status,
            isVerified: user.isVerified,
          },
        })
      }
    }

    // If user is not verified or no password provided, send OTP
    const otp = user.generateOTP()
    await user.save()

    console.log(`Login OTP for ${user.phone}: ${otp}`)

    // Send OTP via Twilio if configured
    if (twilioClient && twilioPhoneNumber) {
      try {
        console.log("Sending login OTP via Twilio to:", user.phone)

        const message = await twilioClient.messages.create({
          body: `Your ChatApp login code is: ${otp}`,
          from: twilioPhoneNumber,
          to: user.phone,
        })

        console.log(`Login OTP sent to ${user.phone}, Twilio SID:`, message.sid)

        res.status(200).json({
          success: true,
          message: "OTP sent for login verification",
          userId: user._id,
        })
      } catch (error) {
        console.error("Error sending SMS:", error)
        return res.status(200).json({
          success: true,
          message: "Login OTP sending failed, but here it is for testing:",
          otp,
          userId: user._id,
        })
      }
    } else {
      // If Twilio is not configured, return OTP in response for testing
      return res.status(200).json({
        success: true,
        message: "Login OTP sent. Twilio not configured, here is the OTP for testing:",
        otp,
        userId: user._id,
      })
    }
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({
      success: false,
      message: "Server error during login",
      error: error.message,
    })
  }
}

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-otp -password")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.status(200).json({
      success: true,
      user,
    })
  } catch (error) {
    console.error("Get profile error:", error)
    res.status(500).json({
      success: false,
      message: "Server error getting user profile",
      error: error.message,
    })
  }
}

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const { name, avatar, age, gender, about, interests, theme, customBackground, email, password } = req.body

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Update fields if provided
    if (name) user.name = name
    if (avatar) user.avatar = avatar
    if (age) user.age = age
    if (gender) user.gender = gender
    if (about !== undefined) user.about = about
    if (interests) user.interests = interests
    if (theme) user.theme = theme
    if (customBackground !== undefined) user.customBackground = customBackground

    // Update email if provided and not already taken
    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email })
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already in use",
        })
      }
      user.email = email
    }

    // Update password if provided
    if (password) {
      user.password = password
    }

    const updatedUser = await user.save()

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        _id: updatedUser._id,
        phone: updatedUser.phone,
        name: updatedUser.name,
        email: updatedUser.email,
        appId: updatedUser.appId,
        avatar: updatedUser.avatar,
        age: updatedUser.age,
        gender: updatedUser.gender,
        about: updatedUser.about,
        interests: updatedUser.interests,
        status: updatedUser.status,
        theme: updatedUser.theme,
        customBackground: updatedUser.customBackground,
      },
    })
  } catch (error) {
    console.error("Update profile error:", error)
    res.status(500).json({
      success: false,
      message: "Server error updating user profile",
      error: error.message,
    })
  }
}

// @desc    Update user location
// @route   PUT /api/users/location
// @access  Private
const updateUserLocation = async (req, res) => {
  try {
    const { longitude, latitude } = req.body

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: "Longitude and latitude are required",
      })
    }

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    user.location = {
      type: "Point",
      coordinates: [longitude, latitude],
    }

    await user.save()

    res.status(200).json({
      success: true,
      message: "Location updated successfully",
    })
  } catch (error) {
    console.error("Update location error:", error)
    res.status(500).json({
      success: false,
      message: "Server error updating location",
      error: error.message,
    })
  }
}

// @desc    Get nearby users
// @route   GET /api/users/nearby
// @access  Private
const getNearbyUsers = async (req, res) => {
  try {
    const { maxDistance = 10000 } = req.query // Default 10km

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    if (!user.location || (user.location.coordinates[0] === 0 && user.location.coordinates[1] === 0)) {
      return res.status(400).json({
        success: false,
        message: "Please update your location first",
      })
    }

    // Only get real users (verified users)
    const nearbyUsers = await User.find({
      _id: { $ne: req.user.id }, // Exclude current user
      isVerified: true, // Only get verified users
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: user.location.coordinates,
          },
          $maxDistance: Number.parseInt(maxDistance),
        },
      },
    }).select("-otp -password")

    res.status(200).json({
      success: true,
      users: nearbyUsers,
    })
  } catch (error) {
    console.error("Get nearby users error:", error)
    res.status(500).json({
      success: false,
      message: "Server error getting nearby users",
      error: error.message,
    })
  }
}

// @desc    Send friend request
// @route   POST /api/users/friend-request
// @access  Private
const sendFriendRequest = async (req, res) => {
  try {
    const { recipientId } = req.body

    if (!recipientId) {
      return res.status(400).json({
        success: false,
        message: "Recipient ID is required",
      })
    }

    const sender = await User.findById(req.user.id)
    const recipient = await User.findById(recipientId)

    if (!sender || !recipient) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Check if request already sent
    if (sender.sentFriendRequests.includes(recipientId)) {
      return res.status(400).json({
        success: false,
        message: "Friend request already sent",
      })
    }

    // Check if users are already friends
    if (sender.friends.includes(recipientId)) {
      return res.status(400).json({
        success: false,
        message: "Users are already friends",
      })
    }

    // Check if recipient has blocked sender
    if (recipient.blockedUsers.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: "Cannot send friend request",
      })
    }

    // Add to sent requests for sender
    sender.sentFriendRequests.push(recipientId)
    await sender.save()

    // Add to received requests for recipient
    recipient.receivedFriendRequests.push(req.user.id)
    await recipient.save()

    res.status(200).json({
      success: true,
      message: "Friend request sent successfully",
    })
  } catch (error) {
    console.error("Send friend request error:", error)
    res.status(500).json({
      success: false,
      message: "Server error sending friend request",
      error: error.message,
    })
  }
}

// @desc    Accept friend request
// @route   POST /api/users/accept-friend
// @access  Private
const acceptFriendRequest = async (req, res) => {
  try {
    const { senderId } = req.body

    if (!senderId) {
      return res.status(400).json({
        success: false,
        message: "Sender ID is required",
      })
    }

    const recipient = await User.findById(req.user.id)
    const sender = await User.findById(senderId)

    if (!recipient || !sender) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Check if request exists
    if (!recipient.receivedFriendRequests.includes(senderId)) {
      return res.status(400).json({
        success: false,
        message: "No friend request from this user",
      })
    }

    // Add to friends for both users
    recipient.friends.push(senderId)
    sender.friends.push(req.user.id)

    // Remove from requests
    recipient.receivedFriendRequests = recipient.receivedFriendRequests.filter((id) => id.toString() !== senderId)
    sender.sentFriendRequests = sender.sentFriendRequests.filter((id) => id.toString() !== req.user.id)

    await recipient.save()
    await sender.save()

    res.status(200).json({
      success: true,
      message: "Friend request accepted",
    })
  } catch (error) {
    console.error("Accept friend request error:", error)
    res.status(500).json({
      success: false,
      message: "Server error accepting friend request",
      error: error.message,
    })
  }
}

// @desc    Reject friend request
// @route   POST /api/users/reject-friend
// @access  Private
const rejectFriendRequest = async (req, res) => {
  try {
    const { senderId } = req.body

    if (!senderId) {
      return res.status(400).json({
        success: false,
        message: "Sender ID is required",
      })
    }

    const recipient = await User.findById(req.user.id)
    const sender = await User.findById(senderId)

    if (!recipient || !sender) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Check if request exists
    if (!recipient.receivedFriendRequests.includes(senderId)) {
      return res.status(400).json({
        success: false,
        message: "No friend request from this user",
      })
    }

    // Remove from requests
    recipient.receivedFriendRequests = recipient.receivedFriendRequests.filter((id) => id.toString() !== senderId)
    sender.sentFriendRequests = sender.sentFriendRequests.filter((id) => id.toString() !== req.user.id)

    await recipient.save()
    await sender.save()

    res.status(200).json({
      success: true,
      message: "Friend request rejected",
    })
  } catch (error) {
    console.error("Reject friend request error:", error)
    res.status(500).json({
      success: false,
      message: "Server error rejecting friend request",
      error: error.message,
    })
  }
}

// @desc    Get friend requests
// @route   GET /api/users/friend-requests
// @access  Private
const getFriendRequests = async (req, res) => {
  try {
    // Use lean() to get plain JavaScript objects instead of Mongoose documents
    // This avoids the strictPopulate error
    const user = await User.findById(req.user.id).lean()

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Fetch received friend requests
    const receivedRequests = await User.find(
      { _id: { $in: user.receivedFriendRequests || [] } },
      "name avatar status",
    ).lean()

    // Fetch sent friend requests
    const sentRequests = await User.find({ _id: { $in: user.sentFriendRequests || [] } }, "name avatar status").lean()

    res.status(200).json({
      success: true,
      received: receivedRequests,
      sent: sentRequests,
    })
  } catch (error) {
    console.error("Get friend requests error:", error)
    res.status(500).json({
      success: false,
      message: "Server error getting friend requests",
      error: error.message,
    })
  }
}

// @desc    Get friends
// @route   GET /api/users/friends
// @access  Private
const getFriends = async (req, res) => {
  try {
    // Use lean() to get plain JavaScript objects
    const user = await User.findById(req.user.id).lean()

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Fetch friends
    const friends = await User.find({ _id: { $in: user.friends || [] } }, "name avatar status lastSeen").lean()

    res.status(200).json({
      success: true,
      friends: friends,
    })
  } catch (error) {
    console.error("Get friends error:", error)
    res.status(500).json({
      success: false,
      message: "Server error getting friends",
      error: error.message,
    })
  }
}

// @desc    Add contact
// @route   POST /api/users/contacts
// @access  Private
const addContact = async (req, res) => {
  try {
    const { contactId } = req.body

    if (!contactId) {
      return res.status(400).json({
        success: false,
        message: "Contact ID is required",
      })
    }

    const user = await User.findById(req.user.id)
    const contactUser = await User.findById(contactId)

    if (!user || !contactUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    if (user.contacts.includes(contactId)) {
      return res.status(400).json({
        success: false,
        message: "User already in contacts",
      })
    }

    user.contacts.push(contactId)
    await user.save()

    res.status(200).json({
      success: true,
      message: "Contact added successfully",
    })
  } catch (error) {
    console.error("Add contact error:", error)
    res.status(500).json({
      success: false,
      message: "Server error adding contact",
      error: error.message,
    })
  }
}

// @desc    Get contacts
// @route   GET /api/users/contacts
// @access  Private
const getContacts = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("contacts", "-otp -password")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.status(200).json({
      success: true,
      contacts: user.contacts,
    })
  } catch (error) {
    console.error("Get contacts error:", error)
    res.status(500).json({
      success: false,
      message: "Server error getting contacts",
      error: error.message,
    })
  }
}

// @desc    Block user
// @route   POST /api/users/block
// @access  Private
const blockUser = async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      })
    }

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    if (user.blockedUsers.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: "User already blocked",
      })
    }

    user.blockedUsers.push(userId)

    // Remove from contacts if present
    user.contacts = user.contacts.filter((contact) => contact.toString() !== userId)

    // Remove from friends if present
    user.friends = user.friends.filter((friend) => friend.toString() !== userId)

    // Remove from friend requests if present
    user.receivedFriendRequests = user.receivedFriendRequests.filter((id) => id.toString() !== userId)
    user.sentFriendRequests = user.sentFriendRequests.filter((id) => id.toString() !== userId)

    await user.save()

    // Also remove the current user from the blocked user's friends/requests
    const blockedUser = await User.findById(userId)
    if (blockedUser) {
      blockedUser.friends = blockedUser.friends.filter((friend) => friend.toString() !== req.user.id)
      blockedUser.receivedFriendRequests = blockedUser.receivedFriendRequests.filter(
        (id) => id.toString() !== req.user.id,
      )
      blockedUser.sentFriendRequests = blockedUser.sentFriendRequests.filter((id) => id.toString() !== req.user.id)
      await blockedUser.save()
    }

    res.status(200).json({
      success: true,
      message: "User blocked successfully",
    })
  } catch (error) {
    console.error("Block user error:", error)
    res.status(500).json({
      success: false,
      message: "Server error blocking user",
      error: error.message,
    })
  }
}

// @desc    Unblock user
// @route   POST /api/users/unblock
// @access  Private
const unblockUser = async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      })
    }

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    user.blockedUsers = user.blockedUsers.filter((id) => id.toString() !== userId)
    await user.save()

    res.status(200).json({
      success: true,
      message: "User unblocked successfully",
    })
  } catch (error) {
    console.error("Unblock user error:", error)
    res.status(500).json({
      success: false,
      message: "Server error unblocking user",
      error: error.message,
    })
  }
}

// @desc    Logout user
// @route   POST /api/users/logout
// @access  Private
const logoutUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)

    if (user) {
      user.status = "offline"
      user.lastSeen = new Date()
      await user.save()
    }

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    })
  } catch (error) {
    console.error("Logout error:", error)
    res.status(500).json({
      success: false,
      message: "Server error during logout",
      error: error.message,
    })
  }
}

// Add these new functions at the end of the file, before the module.exports

// @desc    Request password reset
// @route   POST /api/users/request-password-reset
// @access  Public
const requestPasswordReset = async (req, res) => {
  try {
    const { email, phone } = req.body

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        message: "Email or phone number is required",
      })
    }

    // Find user by email or phone
    let user
    if (email) {
      user = await User.findOne({ email })
    } else if (phone) {
      user = await User.findOne({ phone })
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Generate OTP for password reset
    const otp = user.generateOTP()
    await user.save()

    console.log(`Password reset OTP for ${user.phone || user.email}: ${otp}`)

    // Send OTP via Twilio if phone is provided and Twilio is configured
    if (phone && twilioClient && twilioPhoneNumber) {
      try {
        console.log("Sending password reset OTP via Twilio to:", phone)

        const message = await twilioClient.messages.create({
          body: `Your ChatApp password reset code is: ${otp}`,
          from: twilioPhoneNumber,
          to: phone,
        })

        console.log(`Password reset OTP sent to ${phone}, Twilio SID:`, message.sid)

        res.status(200).json({
          success: true,
          message: "Password reset OTP sent to your phone",
          userId: user._id,
        })
      } catch (error) {
        console.error("Error sending SMS:", error)
        return res.status(200).json({
          success: true,
          message: "Password reset OTP sending failed, but here it is for testing:",
          otp,
          userId: user._id,
        })
      }
    } else {
      // If email is provided or Twilio is not configured, return OTP in response for testing
      return res.status(200).json({
        success: true,
        message: "Password reset OTP sent. For testing purposes:",
        otp,
        userId: user._id,
      })
    }
  } catch (error) {
    console.error("Request password reset error:", error)
    res.status(500).json({
      success: false,
      message: "Server error during password reset request",
      error: error.message,
    })
  }
}

// @desc    Verify reset OTP
// @route   POST /api/users/verify-reset-otp
// @access  Public
const verifyResetOTP = async (req, res) => {
  try {
    const { userId, otp } = req.body

    console.log("Reset OTP verification request:", { userId, otp })

    if (!userId || !otp) {
      return res.status(400).json({
        success: false,
        message: "User ID and OTP are required",
      })
    }

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    if (!user.isValidOTP(otp)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      })
    }

    res.status(200).json({
      success: true,
      message: "OTP verified successfully. You can now reset your password.",
    })
  } catch (error) {
    console.error("Verify reset OTP error:", error)
    res.status(500).json({
      success: false,
      message: "Server error during OTP verification",
      error: error.message,
    })
  }
}

// @desc    Reset password
// @route   POST /api/users/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { userId, password } = req.body

    if (!userId || !password) {
      return res.status(400).json({
        success: false,
        message: "User ID and new password are required",
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      })
    }

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Update password
    user.password = password
    // Clear OTP
    user.otp = { code: null, expiresAt: null }
    await user.save()

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    })
  } catch (error) {
    console.error("Reset password error:", error)
    res.status(500).json({
      success: false,
      message: "Server error during password reset",
      error: error.message,
    })
  }
}

// @desc    Resend reset OTP
// @route   POST /api/users/resend-reset-otp
// @access  Public
const resendResetOTP = async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      })
    }

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    const otp = user.generateOTP()
    await user.save()

    console.log(`Resent reset OTP for ${user.phone || user.email}: ${otp}`)

    // Send OTP via Twilio if phone is available and Twilio is configured
    if (user.phone && twilioClient && twilioPhoneNumber) {
      try {
        console.log("Resending reset OTP via Twilio to:", user.phone)

        const message = await twilioClient.messages.create({
          body: `Your ChatApp password reset code is: ${otp}`,
          from: twilioPhoneNumber,
          to: user.phone,
        })

        console.log(`Reset OTP resent to ${user.phone}, Twilio SID:`, message.sid)

        res.status(200).json({
          success: true,
          message: "Reset OTP resent successfully",
        })
      } catch (error) {
        console.error("Error sending SMS:", error)
        return res.status(200).json({
          success: true,
          message: "Reset OTP resend failed, but here it is for testing:",
          otp,
        })
      }
    } else {
      // If Twilio is not configured or no phone, return OTP in response for testing
      return res.status(200).json({
        success: true,
        message: "Reset OTP resend successful. For testing purposes:",
        otp,
      })
    }
  } catch (error) {
    console.error("Resend reset OTP error:", error)
    res.status(500).json({
      success: false,
      message: "Server error during OTP resend",
      error: error.message,
    })
  }
}

// Update the module.exports to include the new functions
module.exports = {
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
  requestPasswordReset,
  verifyResetOTP,
  resetPassword,
  resendResetOTP,
}
