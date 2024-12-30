module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
    jest: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
  },
  extends: ["eslint:recommended", "google"],
  rules: {
    quotes: ["error", "double"],
    "max-len": [1, {code: 200}],
    "quote-props": [1, "as-needed"],
    indent: ["error", 2],
    "linebreak-style": 0,
  },
};
