const mongoose = require("mongoose")

const storySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: false,
    },
    mediaType: {
      type: String,
      enum: ["text", "image", "video", "audio"],
      default: "text",
    },
    mediaUrl: {
      type: String,
    },
    music: {
      type: String,
    },
    textStyle: {
      type: String,
    },
    viewers: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        viewedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    expiresAt: {
      type: Date,
      default: () => {
        // Establecer la fecha de expiración a 24 horas después de la creación
        const date = new Date()
        date.setHours(date.getHours() + 24)
        return date
      },
    },
  },
  { timestamps: true },
)

// Índice para expiración automática (opcional, si usas MongoDB TTL)
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model("Story", storySchema)
