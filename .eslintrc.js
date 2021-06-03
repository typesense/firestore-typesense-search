module.exports = {
  "root": true,
  "env": {
    es6: true,
    node: true,
    jest: true,
  },
  "parserOptions": {
    "ecmaVersion": 2017,
  },
  "extends": [
    "eslint:recommended",
    "google",
  ],
  "rules": {
    "quotes": ["error", "double"],
    "max-len": [1, {"code": 100}],
  },
};