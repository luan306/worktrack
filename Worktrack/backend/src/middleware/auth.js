const jwt = require('jsonwebtoken');

module.exports = (roles = []) => (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'No token' });

  try {
    const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    req.user = decoded;
    if (roles.length && !roles.includes(decoded.role))
      return res.status(403).json({ success: false, message: 'Forbidden' });
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};
