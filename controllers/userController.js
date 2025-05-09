const User = require("../models/User")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const twilio = require("twilio")


const twilioClient = twilio(process.env.ACdf2512b21eaac398d320483fd26ebf44, process.env.fffb6c25981324023c93c4a75fdb80dd)

const registerUser = async (req, res) => {
  try {
    const { phone, name, age, gender } = req.body

    
    const userExists = await User.findOne({ phone })

    if (userExists) {
      return res.status(400).json({ message: "User with this phone number already exists" })
    }

    
    const user = new User({
      phone,
      name,
      age,
      gender,
      isVerified: false,
    })

    const otp = user.generateOTP()

    await user.save()

    try {
      await twilioClient.messages.create({
        body: `Your ChatApp verification code is: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: +17756185070,
      })

      console.log(`OTP sent to ${phone}`)
    } catch (error) {
      console.error("Error sending SMS:", error)
      return res.status(201).json({
        message: "User registered. OTP sending failed, but here it is for testing:",
        otp,
        userId: user._id,
      })
    }

    res.status(201).json({
      message: "User registered. Please verify your phone number with the OTP sent.",
      userId: user._id,
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ message: "Server error during registration", error: error.message })
  }
}


const verifyOTP = async (req, res) => {
  try {
    const { userId, otp } = req.body

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User is already verified" })
    }

    if (!user.isValidOTP(otp)) {
      return res.status(400).json({ message: "Invalid or expired OTP" })
    }

    user.isVerified = true
    user.otp = { code: null, expiresAt: null }
    await user.save()

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" })

    res.status(200).json({
      message: "Phone number verified successfully",
      token,
      user: {
        _id: user._id,
        phone: user.phone,
        name: user.name,
        avatar: user.avatar,
        age: user.age,
        gender: user.gender,
        status: user.status,
        isVerified: user.isVerified,
      },
    })
  } catch (error) {
    console.error("OTP verification error:", error)
    res.status(500).json({ message: "Server error during OTP verification", error: error.message })
  }
}


const resendOTP = async (req, res) => {
  try {
    const { userId } = req.body

    const user = await User.findById(userId)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User is already verified" })
    }

    const otp = user.generateOTP()
    await user.save()

    try {
      await twilioClient.messages.create({
        body: `Your ChatApp verification code is: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phone,
      })
    } catch (error) {
      console.error("Error sending SMS:", error)
      return res.status(200).json({
        message: "OTP resent failed, but here it is for testing:",
        otp,
      })
    }

    res.status(200).json({ message: "OTP resent successfully" })
  } catch (error) {
    console.error("Resend OTP error:", error)
    res.status(500).json({ message: "Server error during OTP resend", error: error.message })
  }
}


const loginUser = async (req, res) => {
  try {
    const { phone } = req.body

    const user = await User.findOne({ phone })

    if (!user) {
      return res.status(404).json({ message: "User not found. Please register first." })
    }

    const otp = user.generateOTP()
    await user.save()

    try {
      await twilioClient.messages.create({
        body: `Your ChatApp login code is: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: +17756185070,
        
      })
    } catch (error) {
      console.error("Error sending SMS:", error)
      return res.status(200).json({
        message: "Login OTP sending failed, but here it is for testing:",
        otp,
        userId: user._id,
      })
    }

    res.status(200).json({
      message: "OTP sent for login verification",
      userId: user._id,
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ message: "Server error during login", error: error.message })
  }
}

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-otp")

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    res.status(200).json(user)
  } catch (error) {
    console.error("Get profile error:", error)
    res.status(500).json({ message: "Server error getting user profile", error: error.message })
  }
}

const updateUserProfile = async (req, res) => {
  try {
    const { name, avatar, age, gender, about, interests, theme, customBackground } = req.body

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    if (name) user.name = name
    if (avatar) user.avatar = avatar
    if (age) user.age = age
    if (gender) user.gender = gender
    if (about !== undefined) user.about = about
    if (interests) user.interests = interests
    if (theme) user.theme = theme
    if (customBackground !== undefined) user.customBackground = customBackground

    const updatedUser = await user.save()

    res.status(200).json({
      message: "Profile updated successfully",
      user: {
        _id: updatedUser._id,
        phone: updatedUser.phone,
        name: updatedUser.name,
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
    res.status(500).json({ message: "Server error updating user profile", error: error.message })
  }
}


const updateUserLocation = async (req, res) => {
  try {
    const { longitude, latitude } = req.body

    if (!longitude || !latitude) {
      return res.status(400).json({ message: "Longitude and latitude are required" })
    }

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    user.location = {
      type: "Point",
      coordinates: [longitude, latitude],
    }

    await user.save()

    res.status(200).json({ message: "Location updated successfully" })
  } catch (error) {
    console.error("Update location error:", error)
    res.status(500).json({ message: "Server error updating location", error: error.message })
  }
}


const getNearbyUsers = async (req, res) => {
  try {
    const { maxDistance = 10000 } = req.query 

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    if (!user.location || (user.location.coordinates[0] === 0 && user.location.coordinates[1] === 0)) {
      return res.status(400).json({ message: "Please update your location first" })
    }

    const nearbyUsers = await User.find({
      _id: { $ne: req.user.id }, // Exclude current user
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: user.location.coordinates,
          },
          $maxDistance: Number.parseInt(maxDistance),
        },
      },
    }).select("-otp")

    res.status(200).json(nearbyUsers)
  } catch (error) {
    console.error("Get nearby users error:", error)
    res.status(500).json({ message: "Server error getting nearby users", error: error.message })
  }
}


const addContact = async (req, res) => {
  try {
    const { contactId } = req.body

    const user = await User.findById(req.user.id)
    const contactUser = await User.findById(contactId)

    if (!user || !contactUser) {
      return res.status(404).json({ message: "User not found" })
    }

    if (user.contacts.includes(contactId)) {
      return res.status(400).json({ message: "User already in contacts" })
    }

    user.contacts.push(contactId)
    await user.save()

    res.status(200).json({ message: "Contact added successfully" })
  } catch (error) {
    console.error("Add contact error:", error)
    res.status(500).json({ message: "Server error adding contact", error: error.message })
  }
}


const getContacts = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("contacts", "-otp")

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    res.status(200).json(user.contacts)
  } catch (error) {
    console.error("Get contacts error:", error)
    res.status(500).json({ message: "Server error getting contacts", error: error.message })
  }
}


const blockUser = async (req, res) => {
  try {
    const { userId } = req.body

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    if (user.blockedUsers.includes(userId)) {
      return res.status(400).json({ message: "User already blocked" })
    }

    user.blockedUsers.push(userId)

    user.contacts = user.contacts.filter((contact) => contact.toString() !== userId)

    await user.save()

    res.status(200).json({ message: "User blocked successfully" })
  } catch (error) {
    console.error("Block user error:", error)
    res.status(500).json({ message: "Server error blocking user", error: error.message })
  }
}


const unblockUser = async (req, res) => {
  try {
    const { userId } = req.body

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    user.blockedUsers = user.blockedUsers.filter((id) => id.toString() !== userId)
    await user.save()

    res.status(200).json({ message: "User unblocked successfully" })
  } catch (error) {
    console.error("Unblock user error:", error)
    res.status(500).json({ message: "Server error unblocking user", error: error.message })
  }
}

module.exports = {
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
}
