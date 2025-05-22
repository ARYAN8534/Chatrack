/**
 * Utility to generate unique app IDs for users
 */

// Generate a random string of specified length
const generateRandomString = (length) => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  const charactersLength = characters.length

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }

  return result
}

// Generate a unique app ID with timestamp and random string
const generateUniqueAppId = () => {
  const timestamp = Date.now().toString(36)
  const randomStr = generateRandomString(8)
  return `${timestamp}-${randomStr}`
}

module.exports = {
  generateUniqueAppId,
}
