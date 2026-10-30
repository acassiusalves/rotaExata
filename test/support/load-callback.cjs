const fs = require('node:fs');
const ts = require('typescript');
const { runInNewContext } = require('node:vm');
module.exports = function loadCallbacks(file, names, context) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(source))) found.set(node.name.getText(source), `const ${node.getText(source)};`);
    if (ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.getText(source))) found.set(node.name.getText(source), node.getText(source).replace(/^export /, ''));
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const name of names) if (!found.has(name)) throw new Error(`Callback não encontrado: ${name}`);
  const code = ts.transpileModule([...found.values()].join('\n') + '\n({ ' + names.join(',') + ' });', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(code, context);
};
