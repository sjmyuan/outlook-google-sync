const path = require('path');
module.exports = {
  entry: './src/app.js',
  target: 'node',
  module: {
    loaders: [{
      test: /\.js$/,
      loader: 'babel-loader',
      include: [
        path.resolve(__dirname, "src"),
        path.resolve(__dirname, "test")
      ],
      exclude: /node_modules/,
    }],
  },
};
