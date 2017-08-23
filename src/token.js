import jwt from 'jsonwebtoken';

const sign = (payload, key) => new Promise((resolve, reject) => {
  jwt.sign({
    exp: Math.floor(Date.now() / 1000) + (60 * 60),
    data: payload,
  }, key, (err, token) => {
    if (err) { reject(err); } else { resolve(token); }
  });
});

const verify = (token, key) => new Promise((resolve, reject) => {
  jwt.verify(token, key, (err, decoded) => {
    if (err) { reject(false); } else { resolve(true); }
  });
});

export {
  sign,
  verify,
};
