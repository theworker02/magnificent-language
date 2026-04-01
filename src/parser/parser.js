const AST = require("./ast");
const { TokenType } = require("../lexer/token");
const { MglParseError } = require("../utils/errors");

class Parser {
  constructor(tokens, options = {}) {
    this.tokens = tokens;
    this.current = 0;
    this.filePath = options.filePath || null;
    this.sourceText = options.sourceText || null;
  }

  parse() {
    const body = [];
    this.skipSeparators();

    while (!this.isAtEnd()) {
      body.push(this.declaration());
      this.skipSeparators();
    }

    return AST.program(body);
  }

  declaration() {
    if (this.match(TokenType.LET)) {
      return this.variableDeclaration();
    }

    if (this.match(TokenType.FUNC)) {
      return this.finishFunctionDeclaration("function");
    }

    if (this.match(TokenType.CLASS)) {
      return this.classDeclaration();
    }

    if (this.match(TokenType.IMPORT)) {
      return this.importDeclaration();
    }

    return this.statement();
  }

  importDeclaration() {
    const source = this.consume(TokenType.STRING, "Expected module path string after 'import'.");
    return AST.importStatement(source);
  }

  variableDeclaration() {
    const name = this.consume(TokenType.IDENTIFIER, "Expected variable name after 'let'.");
    let initializer = AST.literal(null);

    if (this.match(TokenType.EQUAL)) {
      initializer = this.expression();
    }

    return AST.variableDeclaration(name, initializer);
  }

  finishFunctionDeclaration(kind) {
    const name = this.consume(TokenType.IDENTIFIER, `Expected ${kind} name.`);
    this.consume(TokenType.LEFT_PAREN, `Expected '(' after ${kind} name.`);

    const params = [];
    if (!this.check(TokenType.RIGHT_PAREN)) {
      do {
        params.push(this.consume(TokenType.IDENTIFIER, "Expected parameter name."));
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RIGHT_PAREN, "Expected ')' after parameter list.");
    const body = this.blockAfterHeader(`Expected '{' before ${kind} body.`);
    return AST.functionDeclaration(name, params, body);
  }

  classDeclaration() {
    const name = this.consume(TokenType.IDENTIFIER, "Expected class name.");
    this.consume(TokenType.LEFT_BRACE, "Expected '{' before class body.");
    const methods = [];

    this.skipSeparators();
    while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
      this.consume(TokenType.FUNC, "Expected 'func' before a class method.");
      methods.push(this.finishFunctionDeclaration("method"));
      this.skipSeparators();
    }

    this.consume(TokenType.RIGHT_BRACE, "Expected '}' after class body.");
    return AST.classDeclaration(name, methods);
  }

  statement() {
    if (this.match(TokenType.IF)) {
      return this.ifStatement();
    }

    if (this.match(TokenType.LOOP)) {
      return this.loopStatement();
    }

    if (this.match(TokenType.RETURN)) {
      return this.returnStatement();
    }

    if (this.match(TokenType.LEFT_BRACE)) {
      return this.finishBlockStatement();
    }

    return this.expressionStatement();
  }

  ifStatement() {
    const condition = this.expression();
    const thenBranch = this.blockAfterHeader("Expected '{' after if condition.");
    let elseBranch = null;

    this.skipSeparators();
    if (this.match(TokenType.ELSE)) {
      this.skipSeparators();
      if (this.match(TokenType.IF)) {
        elseBranch = this.ifStatement();
      } else {
        elseBranch = this.blockAfterHeader("Expected '{' after 'else'.");
      }
    }

    return AST.ifStatement(condition, thenBranch, elseBranch);
  }

  loopStatement() {
    const iterator = this.consume(TokenType.IDENTIFIER, "Expected loop variable name.");
    this.consume(TokenType.FROM, "Expected 'from' in loop statement.");
    const start = this.expression();
    this.consume(TokenType.TO, "Expected 'to' in loop statement.");
    const end = this.expression();
    let step = null;

    if (this.match(TokenType.STEP)) {
      step = this.expression();
    }

    const body = this.blockAfterHeader("Expected '{' after loop header.");
    return AST.loopStatement(iterator, start, end, step, body);
  }

  returnStatement() {
    const keyword = this.previous();
    let value = null;

    if (!this.checkAny(TokenType.NEWLINE, TokenType.SEMICOLON, TokenType.RIGHT_BRACE, TokenType.EOF)) {
      value = this.expression();
    }

    return AST.returnStatement(keyword, value);
  }

  expressionStatement() {
    return AST.expressionStatement(this.expression());
  }

  blockAfterHeader(message) {
    this.consume(TokenType.LEFT_BRACE, message);
    return this.finishBlockStatement();
  }

  finishBlockStatement() {
    const statements = [];
    this.skipSeparators();

    while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
      statements.push(this.declaration());
      this.skipSeparators();
    }

    this.consume(TokenType.RIGHT_BRACE, "Expected '}' after block.");
    return AST.blockStatement(statements);
  }

  expression() {
    return this.assignment();
  }

  assignment() {
    const expression = this.or();

    if (this.match(TokenType.EQUAL)) {
      const operator = this.previous();
      const value = this.assignment();

      if (expression.type === "Identifier" || expression.type === "GetExpression") {
        return AST.assignmentExpression(expression, value, operator);
      }

      throw this.error(operator, "Invalid assignment target.");
    }

    return expression;
  }

  or() {
    let expression = this.and();

    while (this.match(TokenType.OR)) {
      const operator = this.previous();
      const right = this.and();
      expression = AST.logicalExpression(expression, operator, right);
    }

    return expression;
  }

  and() {
    let expression = this.equality();

    while (this.match(TokenType.AND)) {
      const operator = this.previous();
      const right = this.equality();
      expression = AST.logicalExpression(expression, operator, right);
    }

    return expression;
  }

  equality() {
    let expression = this.comparison();

    while (this.match(TokenType.BANG_EQUAL, TokenType.EQUAL_EQUAL)) {
      const operator = this.previous();
      const right = this.comparison();
      expression = AST.binaryExpression(expression, operator, right);
    }

    return expression;
  }

  comparison() {
    let expression = this.term();

    while (
      this.match(
        TokenType.GREATER,
        TokenType.GREATER_EQUAL,
        TokenType.LESS,
        TokenType.LESS_EQUAL,
      )
    ) {
      const operator = this.previous();
      const right = this.term();
      expression = AST.binaryExpression(expression, operator, right);
    }

    return expression;
  }

  term() {
    let expression = this.factor();

    while (this.match(TokenType.MINUS, TokenType.PLUS)) {
      const operator = this.previous();
      const right = this.factor();
      expression = AST.binaryExpression(expression, operator, right);
    }

    return expression;
  }

  factor() {
    let expression = this.unary();

    while (this.match(TokenType.SLASH, TokenType.STAR, TokenType.PERCENT)) {
      const operator = this.previous();
      const right = this.unary();
      expression = AST.binaryExpression(expression, operator, right);
    }

    return expression;
  }

  unary() {
    if (this.match(TokenType.BANG, TokenType.MINUS)) {
      const operator = this.previous();
      const right = this.unary();
      return AST.unaryExpression(operator, right);
    }

    return this.call();
  }

  call() {
    let expression = this.primary();

    while (true) {
      if (this.match(TokenType.LEFT_PAREN)) {
        expression = this.finishCall(expression);
      } else if (this.match(TokenType.LEFT_BRACKET)) {
        expression = this.finishIndex(expression);
      } else if (this.match(TokenType.DOT)) {
        const name = this.consume(TokenType.IDENTIFIER, "Expected property name after '.'.");
        expression = AST.getExpression(expression, name);
      } else {
        break;
      }
    }

    return expression;
  }

  finishCall(callee) {
    const args = [];

    if (!this.check(TokenType.RIGHT_PAREN)) {
      do {
        args.push(this.expression());
      } while (this.match(TokenType.COMMA));
    }

    const paren = this.consume(TokenType.RIGHT_PAREN, "Expected ')' after arguments.");
    return AST.callExpression(callee, paren, args);
  }

  finishIndex(object) {
    const index = this.expression();
    const bracket = this.consume(TokenType.RIGHT_BRACKET, "Expected ']' after index expression.");
    return AST.indexExpression(object, index, bracket);
  }

  primary() {
    if (this.match(TokenType.FALSE)) {
      return AST.literal(false);
    }

    if (this.match(TokenType.TRUE)) {
      return AST.literal(true);
    }

    if (this.match(TokenType.NULL)) {
      return AST.literal(null);
    }

    if (this.match(TokenType.NUMBER, TokenType.STRING)) {
      return AST.literal(this.previous().literal);
    }

    if (this.match(TokenType.LEFT_BRACKET)) {
      return this.arrayLiteral();
    }

    if (this.match(TokenType.IDENTIFIER, TokenType.SELF)) {
      return AST.identifier(this.previous());
    }

    if (this.match(TokenType.LEFT_PAREN)) {
      const expression = this.expression();
      this.consume(TokenType.RIGHT_PAREN, "Expected ')' after expression.");
      return AST.grouping(expression);
    }

    throw this.error(this.peek(), `Unexpected token '${this.peek().lexeme || this.peek().type}'.`);
  }

  arrayLiteral() {
    const elements = [];

    if (!this.check(TokenType.RIGHT_BRACKET)) {
      do {
        elements.push(this.expression());
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RIGHT_BRACKET, "Expected ']' after array literal.");
    return AST.arrayExpression(elements);
  }

  skipSeparators() {
    while (this.match(TokenType.NEWLINE, TokenType.SEMICOLON)) {
      continue;
    }
  }

  match(...types) {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }

    return false;
  }

  consume(type, message) {
    if (this.check(type)) {
      return this.advance();
    }

    throw this.error(this.peek(), message);
  }

  check(type) {
    if (this.isAtEnd()) {
      return type === TokenType.EOF;
    }

    return this.peek().type === type;
  }

  checkAny(...types) {
    return types.some((type) => this.check(type));
  }

  advance() {
    if (!this.isAtEnd()) {
      this.current += 1;
    }

    return this.previous();
  }

  isAtEnd() {
    return this.peek().type === TokenType.EOF;
  }

  peek() {
    return this.tokens[this.current];
  }

  previous() {
    return this.tokens[this.current - 1];
  }

  error(token, message) {
    return new MglParseError(message, {
      filePath: this.filePath,
      line: token.line,
      column: token.column,
      sourceText: this.sourceText,
    });
  }
}

module.exports = {
  Parser,
};
