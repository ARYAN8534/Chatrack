const jwt = require("jsonwebtoken")
const User = require("../models/User")

const protect = async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      // Obtener token del encabezado
      token = req.headers.authorization.split(" ")[1]

      // Verificar token
      const decoded = jwt.verify(token, process.env.JWT_SECRET)

      // Obtener usuario del token
      req.user = await User.findById(decoded.id).select("-password -otp")

      if (!req.user) {
        return res.status(401).json({ message: "Usuario no encontrado" })
      }

      next()
    } catch (error) {
      console.error("Error de autenticación:", error)

      // Mensaje de error más específico
      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({
          message: "Token inválido. Por favor, inicie sesión nuevamente.",
          error: error.message,
        })
      }

      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          message: "Su sesión ha expirado. Por favor, inicie sesión nuevamente.",
          error: error.message,
        })
      }

      return res.status(401).json({
        message: "No autorizado para acceder a este recurso",
        error: error.message,
      })
    }
  }

  if (!token) {
    return res.status(401).json({
      message: "No autorizado, no se proporcionó token de acceso",
    })
  }
}

module.exports = { protect }
