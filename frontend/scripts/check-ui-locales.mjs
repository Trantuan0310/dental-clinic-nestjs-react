// Run from frontend: node scripts/check-ui-locales.mjs [--verbose]
// Validates locale resources (vi/en parity, interpolation) and every key the code asks for:
// literal keys (t('uiX.a')), keys in vi.json/en.json (t('common.save')), and keys built at
// run time (t(`uiX.${MAP[x]}`), t(`uiX.${k}`) over an array literal) when the parts can be
// found in the same file. A built key whose parts cannot be resolved and that has no fallback
// is listed with --verbose; it is not an error.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const modules = ['uiCommon', 'uiClinical', 'uiEntry', 'uiOperations', 'uiScheduling', 'uiWorkforce', 'uiPlans', 'uiRecalls', 'uiMessaging', 'uiNotifications', 'uiAi', 'uiPatientHistory', 'uiVisitTemplates', 'uiPermissions'];
const verbose = process.argv.includes('--verbose');

function flatten(value, prefix = '', out = {}) {
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) flatten(item, path, out);
    else if (Array.isArray(item)) item.forEach((v, i) => { out[`${path}.${i}`] = v; });
    else out[path] = item;
  }
  return out;
}

const issues = [];
const tree = { vi: JSON.parse(readFileSync('src/locales/vi.json', 'utf8')), en: JSON.parse(readFileSync('src/locales/en.json', 'utf8')) };
{
  const a = flatten(tree.vi), b = flatten(tree.en);
  for (const key of Object.keys(a)) if (!(key in b)) issues.push(`vi.json/en.json: missing en ${key}`);
  for (const key of Object.keys(b)) if (!(key in a)) issues.push(`vi.json/en.json: missing vi ${key}`);
}
for (const name of modules) {
  // English lives in locales/en/<name>.ts (loaded on demand); join it back for the check.
  const enSource = readFileSync(`src/locales/en/${name}.ts`, 'utf8').replace(/^import type .*$/gm, '');
  const source = readFileSync(`src/locales/${name}.ts`, 'utf8') + '\n' + enSource;
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { vi, en } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const a = flatten(vi), b = flatten(en);
  for (const key of Object.keys(a)) if (!(key in b)) issues.push(`${name}: missing en ${key}`);
  for (const key of Object.keys(b)) if (!(key in a)) issues.push(`${name}: missing vi ${key}`);
  const params = (s) => [...String(s).matchAll(/{{\s*([^}]+)\s*}}/g)].map((m) => m[1].trim()).sort();
  for (const key of Object.keys(a)) {
    if (key in b && params(a[key]).join('|') !== params(b[key]).join('|')) issues.push(`${name}.${key}: interpolation mismatch`);
    if (key in b && !String(b[key]).trim()) issues.push(`${name}.${key}: empty English translation`);
  }
  tree.vi[name] = vi;
  tree.en[name] = en;
}
const namespaces = new Set(Object.keys(tree.vi));
const lookup = (locale, key) => {
  const get = (k) => k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), tree[locale]);
  const v = get(key);
  // i18next plurals: count-aware keys live as key_one / key_other.
  return v !== undefined ? v : get(`${key}_other`) ?? get(`${key}_one`);
};
const looksLikeKey = (s) => /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/.test(s) && namespaces.has(s.split('.')[0]);

let literal = 0, built = 0;
const unresolved = [];
function check(file, key, how) {
  for (const locale of ['vi', 'en']) if (lookup(locale, key) === undefined) issues.push(`${file}: missing ${locale} ${key}${how ? ` (${how})` : ''}`);
}

function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])); }

// The type checker gives the values of a built key's variable part when its type is a
// union of string literals (a status, a reason code…).
const config = ts.getParsedCommandLineOfConfigFile('tsconfig.app.json', {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const program = ts.createProgram(config.fileNames, config.options);
const checker = program.getTypeChecker();
const literalValues = (expr) => {
  const type = checker.getTypeAtLocation(expr);
  const parts = type.isUnion() ? type.types : [type];
  const out = [];
  for (const p of parts) {
    if (p.isStringLiteral()) out.push(p.value);
    else if (p.isNumberLiteral()) out.push(String(p.value));
    else if (p.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) continue;
    else return null;
  }
  return out.length ? out : null;
};

for (const file of walk('src').filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('/locales/') && !/\.(test|spec)\.tsx?$/.test(p))) {
  const sf = program.getSourceFile(join(process.cwd(), file)) ?? program.getSourceFile(file);
  if (!sf) continue;

  // Object-literal and array-literal constants of this file, by name.
  const consts = new Map();
  (function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) consts.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  })(sf);
  const unwrap = (e) => {
    while (e && (ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression?.(e))) e = e.expression;
    return e;
  };
  const stringsOf = (init, depth = 0) => {
    init = unwrap(init);
    if (!init || depth > 2) return null;
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return [init.text];
    if (ts.isArrayLiteralExpression(init)) {
      const out = [];
      for (const el of init.elements) { const s = stringsOf(el, depth + 1); if (!s) return null; out.push(...s); }
      return out;
    }
    if (ts.isObjectLiteralExpression(init)) {
      const out = [];
      for (const p of init.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const v = unwrap(p.initializer);
        if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) out.push(v.text);
        else if (ts.isObjectLiteralExpression(v)) { const s = stringsOf(v, depth + 1); if (s) out.push(...s); }
      }
      return out.length ? out : null;
    }
    if (ts.isIdentifier(init) && consts.has(init.text)) return stringsOf(consts.get(init.text), depth + 1);
    return null;
  };
  // Possible values of the expression inside ${…}.
  const candidates = (expr) => {
    expr = unwrap(expr);
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text];
    if (ts.isConditionalExpression(expr)) {
      const a = candidates(expr.whenTrue), b = candidates(expr.whenFalse);
      return a && b ? [...a, ...b] : null;
    }
    if (ts.isBinaryExpression(expr) && (expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || expr.operatorToken.kind === ts.SyntaxKind.BarBarToken)) return candidates(expr.left);
    if (ts.isElementAccessExpression(expr) && ts.isIdentifier(unwrap(expr.expression))) {
      const init = consts.get(unwrap(expr.expression).text);
      return init ? stringsOf(init) : null;
    }
    if (ts.isIdentifier(expr)) {
      // k in ['a','b'].map((k) => t(`ns.${k}`)) or for (const k of [...])
      for (let n = expr.parent; n; n = n.parent) {
        if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === expr.text)) {
          const call = n.parent;
          if (ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression) && ['map', 'forEach', 'flatMap', 'filter'].includes(call.expression.name.text) && n.parameters[0].name.text === expr.text) {
            return stringsOf(call.expression.expression);
          }
          return null;
        }
        if (ts.isForOfStatement(n) && ts.isVariableDeclarationList(n.initializer) && n.initializer.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === expr.text)) return stringsOf(n.expression);
      }
      if (consts.has(expr.text)) return stringsOf(consts.get(expr.text));
    }
    return literalValues(expr);
  };
  const hasFallback = (call) => {
    const second = call.arguments[1];
    if (!second) return false;
    if (ts.isStringLiteral(second) || ts.isIdentifier(second) || ts.isPropertyAccessExpression(second) || ts.isTemplateExpression(second)) return true;
    return ts.isObjectLiteralExpression(second) && second.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === 'defaultValue');
  };
  const isTranslateCall = (call) => {
    const c = call.expression;
    return (ts.isIdentifier(c) && c.text === 't') || (ts.isPropertyAccessExpression(c) && c.name.text === 't');
  };

  (function visit(node) {
    // Any string literal that is a whole key: t('ui…') calls and label maps alike.
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /^ui[A-Z][A-Za-z]+\.[A-Za-z0-9_.]+$/.test(node.text) && namespaces.has(node.text.split('.')[0])) {
      check(file, node.text);
      literal++;
    }
    if (ts.isCallExpression(node) && node.arguments.length) {
      const arg = node.arguments[0];
      if (isTranslateCall(node) && ts.isStringLiteral(arg) && !arg.text.startsWith('ui') && looksLikeKey(arg.text) && !hasFallback(node)) {
        check(file, arg.text);
        literal++;
      }
      // t(`ns.${x}.y`) or a wrapper like l = (k) => t(`uiVisitTemplates.${k}`)
      if (ts.isTemplateExpression(arg) && namespaces.has(arg.head.text.split('.')[0]) && arg.head.text.includes('.')) {
        const line = sf.getLineAndCharacterOfPosition(arg.getStart()).line + 1;
        if (arg.templateSpans.length === 1) {
          const span = arg.templateSpans[0];
          const values = candidates(span.expression);
          if (values) {
            for (const v of values) check(`${file}:${line}`, `${arg.head.text}${v}${span.literal.text}`, 'built key');
            built++;
            ts.forEachChild(node, visit);
            return;
          }
        }
        if (!hasFallback(node)) unresolved.push(`${file}:${line}  ${arg.getText(sf).slice(0, 90)}`);
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
}

if (verbose && unresolved.length) console.log(`Built keys not resolved statically (check by hand):\n  ${unresolved.join('\n  ')}`);
if (issues.length) {
  console.error([...new Set(issues)].join('\n'));
  process.exitCode = 1;
} else console.log(`PASS ${modules.length + 1} locale pairs, interpolation parity, ${literal} literal and ${built} built key references (${unresolved.length} built keys left to runtime)`);
