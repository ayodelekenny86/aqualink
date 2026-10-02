const babel = require('@babel/core');
const fs = require('fs');

const code = fs.readFileSync('src/App.jsx', 'utf8');

try {
  const ast = babel.parseSync(code, {
    filename: 'src/App.jsx',
    presets: ['@babel/preset-react', '@babel/preset-env'],
  });
  console.log('Parsed OK with Babel');
} catch(e) {
  console.log('Babel Error:', e.message);
}
