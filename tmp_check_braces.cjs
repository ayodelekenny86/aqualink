const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8');

let braceDepth = 0;
let inString = false;
let inTemplate = false;
let inComment = false;
let stringChar = '';
let lastOpenBrace = [];

for (let i = 0; i < c.length; i++) {
  const ch = c[i];
  const next = c[i+1];
  
  if (!inString && !inTemplate && !inComment && ch === '/' && next === '/') {
    inComment = 'line';
    i++;
    continue;
  }
  if (inComment === 'line' && ch === '\n') inComment = false;
  
  if (!inString && !inTemplate && !inComment && ch === '/' && next === '*') {
    inComment = 'block';
    i++;
    continue;
  }
  if (inComment === 'block' && ch === '*' && next === '/') {
    inComment = false;
    i++;
    continue;
  }
  
  if (inComment) continue;
  
  if (!inTemplate && (ch === '"' || ch === "'" || ch === '`')) {
    if (inString && ch === stringChar && c[i-1] !== '\\') {
      inString = false;
      stringChar = '';
    } else if (!inString) {
      inString = true;
      stringChar = ch;
      if (ch === '`') inTemplate = true;
    }
  }
  
  if (inString && stringChar !== '`' && ch === '\\') {
    i++;
    continue;
  }
  
  if (!inString && ch === '`') {
    inTemplate = !inTemplate;
  }
  
  if (inTemplate && ch === '$' && next === '{') {
    braceDepth++;
    lastOpenBrace.push({pos: i, context: c.substring(Math.max(0,i-20), i+20)});
    i++;
    continue;
  }
  
  if (!inString && !inTemplate) {
    if (ch === '{') {
      braceDepth++;
      lastOpenBrace.push({pos: i, context: c.substring(Math.max(0,i-20), i+20)});
    }
    if (ch === '}') {
      braceDepth--;
      if (braceDepth < 0) {
        console.log('Extra } at position', i);
        console.log('Context:', JSON.stringify(c.substring(Math.max(0,i-50), i+50)));
      }
    }
  }
}
console.log('Final brace depth:', braceDepth);
console.log('Last 5 open braces:');
lastOpenBrace.slice(-5).forEach(b => {
  console.log('Pos', b.pos, ':', JSON.stringify(b.context));
});
