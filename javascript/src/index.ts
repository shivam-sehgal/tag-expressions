const OPERAND = 'operand'
const OPERATOR = 'operator'
const PREC: { [key: string]: number } = {
  '(': -2,
  ')': -1,
  or: 0,
  and: 1,
  not: 2,
}
const ASSOC: { [key: string]: string } = {
  or: 'left',
  and: 'left',
  not: 'right',
}
const VALID_TOKEN = /^(?:@[^@]*|and|or|not|\(|\))$/;

/**
 * Parses infix boolean expression (using Dijkstra's Shunting Yard algorithm)
 * and builds a tree of expressions. The root node of the expression is returned.
 *
 * This expression can be evaluated by passing in an array of literals that resolve to true
 */
export default function parse(infix: string): Node {
  const tokens = tokenize(infix)
  if (tokens.length === 0) {
    return new True()
  }
  const expressions: Node[] = []
  const operators: string[] = []
  let expectedTokenType = OPERAND

  tokens.forEach(function (token) {
    if (isUnary(token)) {
      check(expectedTokenType, OPERAND)
      operators.push(token)
      expectedTokenType = OPERAND
    } else if (isBinary(token)) {
      check(expectedTokenType, OPERATOR)
      while (
        operators.length > 0 &&
        isOp(peek(operators)) &&
        ((ASSOC[token] === 'left' && PREC[token] <= PREC[peek(operators)]) ||
          (ASSOC[token] === 'right' && PREC[token] < PREC[peek(operators)]))
      ) {
        pushExpr(pop(operators), expressions)
      }
      operators.push(token)
      expectedTokenType = OPERAND
    } else if ('(' === token) {
      check(expectedTokenType, OPERAND)
      operators.push(token)
      expectedTokenType = OPERAND
    } else if (')' === token) {
      check(expectedTokenType, OPERATOR)
      while (operators.length > 0 && peek(operators) !== '(') {
        pushExpr(pop(operators), expressions)
      }
      if (operators.length === 0) {
        throw new Error(
          `Tag expression "${infix}" could not be parsed because of syntax error: Unmatched ).`
        )
      }
      if (peek(operators) === '(') {
        pop(operators)
      }
      expectedTokenType = OPERATOR
    } else {
      check(expectedTokenType, OPERAND)
      pushExpr(token, expressions)
      expectedTokenType = OPERATOR
    }
  })

  while (operators.length > 0) {
    if (peek(operators) === '(') {
      throw new Error(
        `Tag expression "${infix}" could not be parsed because of syntax error: Unmatched (.`
      )
    }
    pushExpr(pop(operators), expressions)
  }

  return pop(expressions)

  function check(expectedTokenType: string, tokenType: string) {
    if (expectedTokenType !== tokenType) {
      throw new Error(
        `Tag expression "${infix}" could not be parsed because of syntax error: Expected ${expectedTokenType}.`
      )
    }
  }
}

function tokenize(expr: string): string[] {
  const tokens = []
  let isEscaped = false
  let token: string[] = []
  for (let i = 0; i < expr.length; i++) {
    const c = expr.charAt(i)
    if (isEscaped) {
      if (c === '(' || c === ')' || c === '\\' || /\s/.test(c)) {
        token.push(c)
        isEscaped = false
      } else {
        throw new Error(
          `Tag expression "${expr}" could not be parsed because of syntax error: Illegal escape before "${c}".`
        )
      }
    } else if (c === '\\') {
      isEscaped = true
    } else if (c === '(' || c === ')' || /\s/.test(c)) {
      if (token.length > 0) {
        isTokenValid(token.join(''),expr);
        tokens.push(token.join(''))
        token = []
      }
      if (!/\s/.test(c)) {
        tokens.push(c)
      }
    } else {
      token.push(c)
    }
  }
  if (token.length > 0) {
    isTokenValid(token.join(''),expr);
    tokens.push(token.join(''))
  }
  return tokens
}

function isTokenValid(token: string, expr: string): void {
  if (!token.match(VALID_TOKEN)) {
    throw new Error(
      `Tag expression "${expr}" could not be parsed because of syntax error: Please adhere to the Gherkin tag naming convention, using tags like "@tag1" and avoiding more than one "@" in the tag name.`
    );
  }
}

function isUnary(token: string) {
  return 'not' === token
}

function isBinary(token: string) {
  return 'or' === token || 'and' === token
}

function isOp(token: string) {
  return ASSOC[token] !== undefined
}

function peek(stack: string[]) {
  return stack[stack.length - 1]
}

function pop<T>(stack: T[]): T {
  if (stack.length === 0) {
    throw new Error('empty stack')
  }
  return stack.pop() as T
}

function pushExpr(token: string, stack: Node[]) {
  if (token === 'and') {
    const rightAndExpr = pop(stack)
    stack.push(new And(pop(stack), rightAndExpr))
  } else if (token === 'or') {
    const rightOrExpr = pop(stack)
    stack.push(new Or(pop(stack), rightOrExpr))
  } else if (token === 'not') {
    stack.push(new Not(pop(stack)))
  } else {
    stack.push(new Literal(token))
  }
}

interface Node {
  evaluate(variables: string[]): boolean
}

class Literal implements Node {
  constructor(private readonly value: string) {}

  public evaluate(variables: string[]) {
    return variables.indexOf(this.value) !== -1
  }

  public toString() {
    return this.value
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\s/g, '\\ ')
  }
}

class Or implements Node {
  constructor(private readonly leftExpr: Node, private readonly rightExpr: Node) {}

  public evaluate(variables: string[]) {
    return this.leftExpr.evaluate(variables) || this.rightExpr.evaluate(variables)
  }

  public toString() {
    return '( ' + this.leftExpr.toString() + ' or ' + this.rightExpr.toString() + ' )'
  }
}

class And implements Node {
  constructor(private readonly leftExpr: Node, private readonly rightExpr: Node) {}

  public evaluate(variables: string[]) {
    return this.leftExpr.evaluate(variables) && this.rightExpr.evaluate(variables)
  }

  public toString() {
    return '( ' + this.leftExpr.toString() + ' and ' + this.rightExpr.toString() + ' )'
  }
}

class Not implements Node {
  constructor(private readonly expr: Node) {}

  public evaluate(variables: string[]) {
    return !this.expr.evaluate(variables)
  }

  public toString() {
    if (this.expr instanceof And || this.expr instanceof Or) {
      // -- HINT: Binary Operators already have already '( ... )'.
      return 'not ' + this.expr.toString()
    }
    // -- OTHERWISE:
    return 'not ( ' + this.expr.toString() + ' )'
  }
}

class True implements Node {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public evaluate(variables: string[]) {
    return true
  }

  public toString() {
    return 'true'
  }
}
