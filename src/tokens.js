const jwt = require('jsonwebtoken');

function signToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

module.exports = { signToken };
