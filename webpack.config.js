const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './src/app.js',
  target: 'node',
  resolve: {
    extensions: ['', '.js', '.json'],
  },
  module: {
    loaders: [{
      test: /\.js$/,
      loader: 'babel-loader',
      include: [
        path.resolve(__dirname, 'src'),
        path.resolve(__dirname, 'test'),
      ],
      exclude: /node_modules/,
    },
    {
      test: /\.json$/,
      loaders: ['json'],
    },
    ],
    plugins: [
      new webpack.IgnorePlugin(/regenerator|nodent|js\-beautify/, /ajv/),
    ],
  },
};
