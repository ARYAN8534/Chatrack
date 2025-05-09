const express = require("express")
const router = express.Router()
const User = require("../models/User")
const { protect } = require("../middleware/authMiddleware")
const mongoose = require("mongoose")

// @desc    Update user location
// @route   PUT /api/nearby/location
// @access  Private
router.put("/location", protect, async (req, res) => {
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
})

// @desc    Get nearby users
// @route   GET /api/nearby/users
// @access  Private
router.get("/users", protect, async (req, res) => {
  try {
    const { maxDistance = 10000, limit = 50 } = req.query // Default 10km, max 50 users

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Check if user has location set
    if (!user.location || (user.location.coordinates[0] === 0 && user.location.coordinates[1] === 0)) {
      return res.status(400).json({ message: "Please update your location first" })
    }

    // Find nearby users
    const nearbyUsers = await User.find({
      _id: { $ne: req.user.id }, // Exclude current user
      blockedUsers: { $ne: req.user.id }, // Exclude users who blocked current user
      location: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: user.location.coordinates,
          },
          $maxDistance: Number.parseInt(maxDistance),
        },
      },
    })
      .select("name avatar status lastSeen location interests age gender about")
      .limit(Number.parseInt(limit))

    // Calculate distance for each user
    const usersWithDistance = nearbyUsers.map((user) => {
      // Calculate distance in kilometers
      const distance = calculateDistance(
        req.user.location.coordinates[1], // Current user latitude
        req.user.location.coordinates[0], // Current user longitude
        user.location.coordinates[1], // Nearby user latitude
        user.location.coordinates[0], // Nearby user longitude
      )

      return {
        ...user.toObject(),
        distance: Number.parseFloat(distance.toFixed(1)),
      }
    })

    res.status(200).json(usersWithDistance)
  } catch (error) {
    console.error("Get nearby users error:", error)
    res.status(500).json({ message: "Server error getting nearby users", error: error.message })
  }
})

// @desc    Get popular locations nearby
// @route   GET /api/nearby/locations
// @access  Private
router.get("/locations", protect, async (req, res) => {
  try {
    const { radius = 5000 } = req.query // Default 5km radius

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Check if user has location set
    if (!user.location || (user.location.coordinates[0] === 0 && user.location.coordinates[1] === 0)) {
      return res.status(400).json({ message: "Please update your location first" })
    }

    // Aggregate users by location to find popular spots
    const popularLocations = await User.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: user.location.coordinates,
          },
          distanceField: "distance",
          maxDistance: Number.parseInt(radius),
          spherical: true,
        },
      },
      {
        $group: {
          _id: {
            // Group by approximate location (rounded coordinates)
            lat: { $round: [{ $arrayElemAt: ["$location.coordinates", 1] }, 3] },
            lng: { $round: [{ $arrayElemAt: ["$location.coordinates", 0] }, 3] },
          },
          count: { $sum: 1 },
          users: { $push: { id: "$_id", name: "$name" } },
          avgLocation: {
            $avg: {
              $map: {
                input: "$location.coordinates",
                as: "coord",
                in: "$$coord",
              },
            },
          },
        },
      },
      {
        $match: {
          count: { $gt: 1 }, // Only locations with more than 1 user
        },
      },
      {
        $project: {
          _id: 0,
          location: "$_id",
          count: 1,
          users: { $slice: ["$users", 5] }, // Limit to 5 users per location
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10, // Top 10 popular locations
      },
    ])

    res.status(200).json(popularLocations)
  } catch (error) {
    console.error("Get popular locations error:", error)
    res.status(500).json({ message: "Server error getting popular locations", error: error.message })
  }
})

// @desc    Get user activity heatmap
// @route   GET /api/nearby/heatmap
// @access  Private
router.get("/heatmap", protect, async (req, res) => {
  try {
    const { radius = 10000 } = req.query // Default 10km radius

    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Check if user has location set
    if (!user.location || (user.location.coordinates[0] === 0 && user.location.coordinates[1] === 0)) {
      return res.status(400).json({ message: "Please update your location first" })
    }

    // Generate heatmap data based on user density
    const heatmapData = await User.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: user.location.coordinates,
          },
          distanceField: "distance",
          maxDistance: Number.parseInt(radius),
          spherical: true,
        },
      },
      {
        $group: {
          _id: {
            // Group by grid cells
            lat: { $round: [{ $arrayElemAt: ["$location.coordinates", 1] }, 2] },
            lng: { $round: [{ $arrayElemAt: ["$location.coordinates", 0] }, 2] },
          },
          count: { $sum: 1 },
          avgLat: { $avg: { $arrayElemAt: ["$location.coordinates", 1] } },
          avgLng: { $avg: { $arrayElemAt: ["$location.coordinates", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          lat: "$avgLat",
          lng: "$avgLng",
          weight: "$count",
        },
      },
    ])

    res.status(200).json(heatmapData)
  } catch (error) {
    console.error("Get heatmap data error:", error)
    res.status(500).json({ message: "Server error getting heatmap data", error: error.message })
  }
})

// Helper function to calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371 // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c // Distance in km
  return distance
}

function deg2rad(deg) {
  return deg * (Math.PI / 180)
}

module.exports = router
