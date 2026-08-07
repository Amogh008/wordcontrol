const { EventEmitter } = require('events');

// Lets REST routes (which have no direct handle on the Socket.IO server)
// push a real-time event to whatever sockets an account currently has open,
// without realtime.js and the routers needing to import each other.
const emitter = new EventEmitter();

function notifyAccount(accountId, event, payload) {
  if (!accountId) return;
  emitter.emit('notify', { accountId: String(accountId), event, payload });
}

function onAccountNotify(handler) {
  emitter.on('notify', handler);
}

module.exports = { notifyAccount, onAccountNotify };
