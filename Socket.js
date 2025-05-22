// This is a simple Socket.io client implementation
// In a real app, you would use the actual Socket.io client library

class SocketClient {
  constructor() {
    this.id = "socket_" + Math.random().toString(36).substr(2, 9)
    this.connected = false
    this.events = {}
  }

  connect() {
    this.connected = true
    if (this.events["connect"]) {
      this.events["connect"].forEach((callback) => callback())
    }
    return this
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(callback)
    return this
  }

  off(event, callback) {
    if (this.events[event]) {
      if (callback) {
        this.events[event] = this.events[event].filter((cb) => cb !== callback)
      } else {
        delete this.events[event]
      }
    }
    return this
  }

  emit(event, data) {
    console.log(`Emitting ${event}:`, data)
    // In a real app, this would send data to the server
    // For demo purposes, we'll simulate receiving a response
    setTimeout(() => {
      if (event === "messageFromClient") {
        this.simulateResponse(data)
      }
    }, 1000)
    return this
  }

  simulateResponse(data) {
    if (this.events["messageFromServer"]) {
      const response = `Echo: ${data}`
      this.events["messageFromServer"].forEach((callback) => callback(response))
    }
  }
}

// Create and export a singleton instance
const Socket = new SocketClient().connect()

export default Socket
