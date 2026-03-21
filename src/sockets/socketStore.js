let ioInstance = null;

const setSocketServer = (io) => {
  ioInstance = io;
};

const getSocketServer = () => ioInstance;

const emitToUserRoom = (userId, event, payload) => {
  if (!ioInstance || !userId) return false;
  ioInstance.to(`user:${String(userId)}`).emit(event, payload);
  return true;
};

module.exports = {
  setSocketServer,
  getSocketServer,
  emitToUserRoom,
};
