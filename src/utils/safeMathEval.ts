/**
 * safeMathEval.ts — Évaluateur d'expressions arithmétiques sans eval().
 *
 * Les toolkits mathématiques reçoivent leur expression depuis les arguments
 * d'un tool call, donc indirectement depuis le chat. La passer à eval() donne
 * une exécution de code arbitraire dans le process du bot; un parseur à
 * descente récursive n'évalue que de l'arithmétique.
 *
 * Grammaire (précédence croissante):
 *   expression := term (('+' | '-') term)*
 *   term       := unary (('*' | '/' | '%') unary)*
 *   unary      := ('+' | '-') unary | power
 *   power      := primary (('^' | '**') unary)?      // associatif à droite
 *   primary    := number | ident '(' expression ')' | ident | '(' expression ')'
 */

const FUNCTIONS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const MAX_LENGTH = 500;

/**
 * Évalue une expression arithmétique.
 *
 * @param expression L'expression, ex. "2*x^2 + sin(x)".
 * @param variables  Liaisons de variables, ex. `{ x: 1.5 }`. Prioritaires sur
 *                   les constantes, pour qu'une variable nommée `e` fonctionne.
 * @throws Si l'expression est malformée ou contient un identifiant inconnu.
 */
export function evaluateMathExpression(
  expression: string,
  variables: Record<string, number> = {},
): number {
  const src = expression.trim();
  if (!src) throw new Error("Expression vide");
  if (src.length > MAX_LENGTH) throw new Error(`Expression trop longue (max ${MAX_LENGTH})`);

  let pos = 0;

  const skipWs = (): void => {
    while (pos < src.length && (src[pos] === " " || src[pos] === "\t")) pos++;
  };

  const eat = (token: string): boolean => {
    skipWs();
    if (src.startsWith(token, pos)) {
      pos += token.length;
      return true;
    }
    return false;
  };

  const parseExpression = (): number => {
    let left = parseTerm();
    for (;;) {
      skipWs();
      if (eat("+")) left += parseTerm();
      else if (eat("-")) left -= parseTerm();
      else return left;
    }
  };

  const parseTerm = (): number => {
    let left = parseUnary();
    for (;;) {
      skipWs();
      // "**" appartient à parsePower, ne pas le consommer comme un "*".
      if (src.startsWith("**", pos)) return left;
      if (eat("*")) left *= parseUnary();
      else if (eat("/")) left /= parseUnary();
      else if (eat("%")) left %= parseUnary();
      else return left;
    }
  };

  const parseUnary = (): number => {
    skipWs();
    if (eat("-")) return -parseUnary();
    if (eat("+")) return parseUnary();
    return parsePower();
  };

  const parsePower = (): number => {
    const base = parsePrimary();
    skipWs();
    if (eat("**") || eat("^")) return Math.pow(base, parseUnary());
    return base;
  };

  const parsePrimary = (): number => {
    skipWs();

    if (eat("(")) {
      const value = parseExpression();
      if (!eat(")")) throw new Error("Parenthèse fermante manquante");
      return value;
    }

    const rest = src.slice(pos);

    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
    if (number) {
      pos += number[0].length;
      return Number(number[0]);
    }

    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (ident) {
      const name = ident[0];
      pos += name.length;
      skipWs();

      if (src[pos] === "(") {
        const fn = FUNCTIONS[name.toLowerCase()];
        if (!fn) throw new Error(`Fonction inconnue: ${name}`);
        pos++;
        const arg = parseExpression();
        if (!eat(")")) throw new Error("Parenthèse fermante manquante");
        return fn(arg);
      }

      if (Object.hasOwn(variables, name)) return variables[name];

      const constant = CONSTANTS[name.toLowerCase()];
      if (constant !== undefined) return constant;

      throw new Error(`Identifiant inconnu: ${name}`);
    }

    throw new Error(`Token inattendu à la position ${pos}`);
  };

  const result = parseExpression();
  skipWs();
  if (pos < src.length) throw new Error(`Caractères inattendus: ${src.slice(pos)}`);

  return result;
}

/**
 * Variante tolérante: renvoie `fallback` au lieu de lever, pour les boucles
 * d'intégration/limite qui échantillonnent une fonction en beaucoup de points.
 */
export function tryEvaluateMathExpression(
  expression: string,
  variables: Record<string, number>,
  fallback: number,
): number {
  try {
    const value = evaluateMathExpression(expression, variables);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
