const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Server } = require('socket.io');
const User = require('./models/User');

function attachRealtimeServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN
        ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim())
        : true,
      credentials: true,
    },
  });

  const connections = new Map();
  const connectedUsers = new Map();
  const availableUsers = new Map();
  const matchingQueue = [];
  const matchingTimers = new Map();
  const calls = new Map();
  const userCalls = new Map();
  const networkOwners = new Map();

  const broadcastOwnership = (targetUserId) => {
    const ownerSocketId = networkOwners.get(targetUserId);
    (connections.get(targetUserId) || []).forEach((socketId) => {
      io.to(socketId).emit('network:ownership', {
        active: Boolean(ownerSocketId),
        owned: ownerSocketId === socketId,
        inCall: userCalls.has(targetUserId),
      });
    });
  };

  const endCall = (endingUserId, reason = 'ended', endedBy = '') => {
    const callId = userCalls.get(endingUserId);
    const call = callId ? calls.get(callId) : null;
    if (!call) return;

    call.participants.forEach((participantId) => {
      userCalls.delete(participantId);
      if (participantId !== endingUserId) {
        io.to(call.sockets.get(participantId)).emit('call:ended', { callId, reason, endedBy });
      }
    });
    calls.delete(callId);
    broadcastPresence();
  };

  const publicOnlineUsers = () =>
    [...connectedUsers.values()]
      .map(({ userId, name }) => {
        const call = calls.get(userCalls.get(userId));
        let status = 'online';
        if (call?.state === 'in_call') status = 'in_call';
        else if (call) status = 'matched';
        else if (matchingQueue.includes(userId)) status = 'searching';
        else if (availableUsers.has(userId)) status = 'available';
        return { id: userId, name, status };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

  const broadcastPresence = () => {
    io.emit('presence:list', publicOnlineUsers());
  };

  const removeFromQueue = (userId) => {
    let index = matchingQueue.indexOf(userId);
    while (index !== -1) {
      matchingQueue.splice(index, 1);
      index = matchingQueue.indexOf(userId);
    }
    const timer = matchingTimers.get(userId);
    if (timer) clearTimeout(timer);
    matchingTimers.delete(userId);
  };

  const setUnavailable = (userId) => {
    removeFromQueue(userId);
    if (availableUsers.delete(userId)) broadcastPresence();
  };

  const releaseOwnership = (userId, socketId) => {
    if (networkOwners.get(userId) !== socketId) return false;
    setUnavailable(userId);
    networkOwners.delete(userId);
    broadcastOwnership(userId);
    broadcastPresence();
    return true;
  };

  const claimAvailability = (userId, name, socketId, force = false) => {
    const currentOwner = networkOwners.get(userId);
    if (currentOwner && currentOwner !== socketId) {
      if (!force) {
        return { ok: false, code: 'AVAILABLE_ELSEWHERE' };
      }
      removeFromQueue(userId);
      io.to(currentOwner).emit('network:ownership-lost');

      const previousCallId = userCalls.get(userId);
      const previousCall = calls.get(previousCallId);
      if (previousCall) {
        const partnerId = previousCall.participants.find((participantId) => participantId !== userId);
        const partnerSocketId = previousCall.sockets.get(partnerId);
        const partner = connectedUsers.get(partnerId);
        const nextCallId = crypto.randomUUID();

        io.to(currentOwner).emit('call:transferred-away', { callId: previousCallId });
        io.to(partnerSocketId).emit('call:ended', {
          callId: previousCallId,
          reason: 'call-transferred',
          endedBy: name,
        });

        calls.delete(previousCallId);
        const nextCall = {
          id: nextCallId,
          participants: [partnerId, userId],
          sockets: new Map([
            [partnerId, partnerSocketId],
            [userId, socketId],
          ]),
          ready: new Set(),
          state: 'matched',
        };
        calls.set(nextCallId, nextCall);
        userCalls.set(userId, nextCallId);
        userCalls.set(partnerId, nextCallId);
        networkOwners.set(userId, socketId);
        availableUsers.delete(userId);
        broadcastOwnership(userId);
        broadcastPresence();

        io.to(socketId).emit('match:found', {
          callId: nextCallId,
          partner: { id: partnerId, name: partner?.name || 'German learner' },
          transferred: true,
        });
        io.to(partnerSocketId).emit('match:found', {
          callId: nextCallId,
          partner: { id: userId, name },
          transferred: true,
        });
        return { ok: true, available: false, callTransferred: true };
      }
    }

    networkOwners.set(userId, socketId);
    availableUsers.set(userId, { userId, name, socketId });
    broadcastOwnership(userId);
    broadcastPresence();
    return { ok: true, available: true };
  };

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Unauthorized'));

      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.sub).select('name').lean();
      if (!user) return next(new Error('Unauthorized'));

      socket.data.user = {
        id: user._id.toString(),
        name: user.name?.trim() || 'German learner',
      };
      return next();
    } catch (error) {
      console.warn('Realtime authentication failed:', error.message);
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { id: userId, name } = socket.data.user;
    const userSockets = connections.get(userId) || new Set();
    userSockets.add(socket.id);
    connections.set(userId, userSockets);
    connectedUsers.set(userId, { userId, name });

    broadcastPresence();
    broadcastOwnership(userId);

    socket.on('presence:set-availability', (isAvailable, acknowledge = () => {}) => {
      if (isAvailable === true) {
        acknowledge(claimAvailability(userId, name, socket.id));
      } else {
        const released = releaseOwnership(userId, socket.id);
        acknowledge({
          ok: true,
          available: false,
          elsewhere: !released && networkOwners.has(userId),
        });
      }
    });

    socket.on('presence:move-availability', (acknowledge = () => {}) => {
      acknowledge(claimAvailability(userId, name, socket.id, true));
    });

    socket.on('match:join', (acknowledge = () => {}) => {
      if (availableUsers.get(userId)?.socketId !== socket.id) {
        acknowledge({ ok: false, error: 'Set yourself as available before matching.' });
        return;
      }

      removeFromQueue(userId);
      const partnerId = matchingQueue.find(
        (candidateId) => candidateId !== userId && availableUsers.has(candidateId),
      );

      if (!partnerId) {
        matchingQueue.push(userId);
        const timer = setTimeout(() => {
          removeFromQueue(userId);
          if (availableUsers.get(userId)?.socketId === socket.id) {
            io.to(socket.id).emit('match:timeout');
          }
          broadcastPresence();
        }, 60 * 1000);
        matchingTimers.set(userId, timer);
        broadcastPresence();
        acknowledge({ ok: true, waiting: true });
        return;
      }

      removeFromQueue(partnerId);
      const partner = availableUsers.get(partnerId);
      const current = availableUsers.get(userId);
      availableUsers.delete(userId);
      availableUsers.delete(partnerId);
      broadcastPresence();

      const callId = crypto.randomUUID();
      const call = {
        id: callId,
        participants: [partnerId, userId],
        sockets: new Map([
          [partnerId, partner.socketId],
          [userId, current.socketId],
        ]),
        ready: new Set(),
        state: 'matched',
      };
      calls.set(callId, call);
      userCalls.set(userId, callId);
      userCalls.set(partnerId, callId);

      io.to(current.socketId).emit('match:found', {
        callId,
        partner: { id: partner.userId, name: partner.name },
      });
      io.to(partner.socketId).emit('match:found', {
        callId,
        partner: { id: current.userId, name: current.name },
      });
      acknowledge({ ok: true, waiting: false });
    });

    socket.on('match:leave', () => {
      removeFromQueue(userId);
      broadcastPresence();
    });

    socket.on('call:ready', ({ callId } = {}, acknowledge = () => {}) => {
      const call = calls.get(callId);
      if (!call || call.sockets.get(userId) !== socket.id) {
        acknowledge({ ok: false, error: 'Call is no longer available.' });
        return;
      }

      call.ready.add(userId);
      broadcastPresence();
      acknowledge({ ok: true, waiting: call.ready.size < 2 });
      if (call.ready.size !== 2) return;

      call.state = 'in_call';
      broadcastPresence();
      call.participants.forEach((participantId, index) => {
        io.to(call.sockets.get(participantId)).emit('call:start', {
          callId,
          initiator: index === 0,
        });
      });
    });

    socket.on('call:signal', ({ callId, signal } = {}) => {
      const call = calls.get(callId);
      if (!call || call.sockets.get(userId) !== socket.id || !signal) return;
      const partnerId = call.participants.find((participantId) => participantId !== userId);
      io.to(call.sockets.get(partnerId)).emit('call:signal', { callId, signal });
    });

    socket.on('call:end', ({ callId } = {}) => {
      const call = calls.get(callId);
      if (userCalls.get(userId) !== callId || call?.sockets.get(userId) !== socket.id) return;
      endCall(userId, 'user-ended', name);
    });

    socket.on('disconnect', () => {
      const remainingSockets = connections.get(userId);
      remainingSockets?.delete(socket.id);
      const call = calls.get(userCalls.get(userId));
      if (call?.sockets.get(userId) === socket.id) {
        endCall(userId, 'partner-disconnected');
      }
      releaseOwnership(userId, socket.id);
      if (!remainingSockets?.size) {
        connections.delete(userId);
        connectedUsers.delete(userId);
      } else {
        broadcastOwnership(userId);
      }
      broadcastPresence();
    });
  });

  return io;
}

module.exports = { attachRealtimeServer };
