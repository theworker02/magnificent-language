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
    if (this.matchSoftKeyword("export")) {
      return this.exportDeclaration();
    }

    if (this.matchSoftKeyword("test")) {
      return this.testDeclaration();
    }

    if (this.isMetadataDeclarationStart("intent")) {
      this.advance();
      return this.intentDeclaration();
    }

    if (this.isMetadataDeclarationStart("learn")) {
      this.advance();
      return this.learnDeclaration();
    }

    if (this.matchSoftKeyword("task")) {
      return this.taskDeclaration();
    }

    if (this.matchSoftKeyword("server")) {
      return this.serverDeclaration();
    }

    if (this.isTypeDeclarationStart()) {
      this.advance();
      return this.typeDeclaration();
    }

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

  exportDeclaration() {
    if (this.match(TokenType.LET)) {
      return AST.exportDeclaration(this.variableDeclaration());
    }

    if (this.matchSoftKeyword("test")) {
      return AST.exportDeclaration(this.testDeclaration());
    }

    if (this.matchSoftKeyword("task")) {
      return AST.exportDeclaration(this.taskDeclaration());
    }

    if (this.isTypeDeclarationStart()) {
      this.advance();
      return AST.exportDeclaration(this.typeDeclaration());
    }

    if (this.match(TokenType.FUNC)) {
      return AST.exportDeclaration(this.finishFunctionDeclaration("function"));
    }

    if (this.match(TokenType.CLASS)) {
      return AST.exportDeclaration(this.classDeclaration());
    }

    throw this.error(this.peek(), "Expected 'let', 'type', 'func', 'task', 'test', or 'class' after 'export'.");
  }

  testDeclaration() {
    const name = this.consume(TokenType.STRING, "Expected a test name string after 'test'.");
    const body = this.blockAfterHeader("Expected '{' before test body.");
    return AST.testDeclaration(name, body);
  }

  intentDeclaration() {
    this.consume(TokenType.LEFT_BRACE, "Expected '{' before intent declaration.");
    return AST.intentDeclaration(this.objectEntries("intent declaration"));
  }

  learnDeclaration() {
    this.consume(TokenType.LEFT_BRACE, "Expected '{' before learn declaration.");
    return AST.learnDeclaration(this.objectEntries("learn declaration"));
  }

  taskDeclaration() {
    const name = this.consume(TokenType.IDENTIFIER, "Expected task name.");
    const body = this.blockAfterHeader("Expected '{' before task body.");
    return AST.taskDeclaration(name, body);
  }

  serverDeclaration() {
    this.consume(TokenType.LEFT_BRACE, "Expected '{' before server body.");
    const routes = [];
    const middleware = [];

    this.skipSeparators();
    while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
      if (this.matchSoftKeyword("route")) {
        routes.push(this.routeDeclaration());
      } else if (this.matchSoftKeyword("middleware")) {
        middleware.push(this.middlewareDeclaration());
      } else {
        throw this.error(this.peek(), "Expected 'route' or 'middleware' inside server block.");
      }

      this.skipSeparators();
    }

    this.consume(TokenType.RIGHT_BRACE, "Expected '}' after server body.");
    return AST.serverDeclaration(routes, middleware);
  }

  routeDeclaration() {
    const pathValue = this.consume(TokenType.STRING, "Expected route path string.");
    let method = null;

    if (this.matchSoftKeyword("method")) {
      method = this.consume(TokenType.STRING, "Expected HTTP method string after 'method'.");
    }

    const body = this.blockAfterHeader("Expected '{' before route body.");
    return AST.routeDeclaration(pathValue, method, body);
  }

  middlewareDeclaration() {
    const body = this.blockAfterHeader("Expected '{' before middleware body.");
    return AST.middlewareDeclaration(body);
  }

  importDeclaration() {
    let importKind = "mgl";

    if (this.matchSoftKeyword("rust")) {
      importKind = "rust";
    }

    const source = this.consume(TokenType.STRING, "Expected module path string after 'import'.");
    let alias = null;

    if (this.matchSoftKeyword("as")) {
      alias = this.consume(TokenType.IDENTIFIER, "Expected module alias after 'as'.");
    }

    return AST.importStatement(source, alias, importKind);
  }

  typeDeclaration() {
    const name = this.consume(TokenType.IDENTIFIER, "Expected type name.");
    this.consume(TokenType.LEFT_BRACE, "Expected '{' before type body.");
    const fields = [];

    this.skipSeparators();
    while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
      const fieldName = this.consume(TokenType.IDENTIFIER, "Expected field name.");
      this.consume(TokenType.COLON, "Expected ':' after field name.");
      const typeAnnotation = this.typeReference();
      fields.push(AST.typeField(fieldName, typeAnnotation));
      this.skipSeparators();
    }

    this.consume(TokenType.RIGHT_BRACE, "Expected '}' after type body.");
    return AST.typeDeclaration(name, fields);
  }

  variableDeclaration() {
    const name = this.consume(TokenType.IDENTIFIER, "Expected variable name after 'let'.");
    const typeAnnotation = this.parseOptionalTypeAnnotation();
    let initializer = AST.literal(null);

    if (this.match(TokenType.EQUAL)) {
      initializer = this.expression();
    }

    return AST.variableDeclaration(name, initializer, typeAnnotation);
  }

  finishFunctionDeclaration(kind) {
    const name = this.consume(TokenType.IDENTIFIER, `Expected ${kind} name.`);
    this.consume(TokenType.LEFT_PAREN, `Expected '(' after ${kind} name.`);

    const params = [];
    if (!this.check(TokenType.RIGHT_PAREN)) {
      do {
        params.push(this.parameter());
      } while (this.match(TokenType.COMMA));
    }

    this.consume(TokenType.RIGHT_PAREN, "Expected ')' after parameter list.");
    const returnType = this.parseOptionalTypeAnnotation();
    const isAsync = this.matchSoftKeyword("async");
    const body = this.blockAfterHeader(`Expected '{' before ${kind} body.`);
    return AST.functionDeclaration(name, params, body, returnType, isAsync);
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
    if (this.matchSoftKeyword("inspect")) {
      return this.memoryCommandStatement("inspect");
    }

    if (this.matchSoftKeyword("memory")) {
      return this.memoryCommandStatement("memory");
    }

    if (this.matchSoftKeyword("whyalive")) {
      return this.memoryCommandStatement("whyalive");
    }

    if (this.matchSoftKeyword("optimize")) {
      return this.memoryCommandStatement("optimize");
    }

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

  memoryCommandStatement(command) {
    const keyword = this.previous();
    const expression = this.expression();
    return AST.memoryCommandStatement(keyword, expression, command);
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
    if (this.check(TokenType.LEFT_BRACE)) {
      const keyword = this.previous();
      const body = this.blockAfterHeader("Expected '{' after loop.");
      return AST.loopForeverStatement(body, keyword);
    }

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

  parameter() {
    const name = this.consume(TokenType.IDENTIFIER, "Expected parameter name.");
    const typeAnnotation = this.parseOptionalTypeAnnotation();
    return AST.parameter(name, typeAnnotation);
  }

  parseOptionalTypeAnnotation() {
    if (!this.match(TokenType.COLON)) {
      return null;
    }

    return this.typeReference();
  }

  typeReference() {
    const name = this.consumeTypeName("Expected a type name.");

    if (name.lexeme === "array" && this.match(TokenType.LESS)) {
      const elementType = this.typeReference();
      this.consume(TokenType.GREATER, "Expected '>' after array element type.");
      return AST.arrayType(name, elementType);
    }

    return AST.namedType(name);
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

      if (
        expression.type === "Identifier"
        || expression.type === "GetExpression"
        || expression.type === "IndexExpression"
      ) {
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
    if (this.matchSoftKeyword("await")) {
      return AST.awaitExpression(this.previous(), this.unary());
    }

    if (this.matchSoftKeyword("track")) {
      return AST.trackExpression(this.previous(), this.unary());
    }

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
      } else if (this.isTypeInitializerStart(expression)) {
        this.advance();
        expression = this.finishTypeInitializer(expression);
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

  finishTypeInitializer(typeName) {
    const fields = this.objectEntries("type initializer");
    const brace = this.previous();
    return AST.typeInitializerExpression(typeName.name, fields, brace);
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

    if (this.match(TokenType.LEFT_BRACE)) {
      return this.objectLiteral();
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

  objectLiteral() {
    const properties = this.objectEntries("object literal");
    const brace = this.previous();
    return AST.objectExpression(properties, brace);
  }

  objectEntries(kind) {
    const properties = [];

    this.skipSeparators();
    while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
      const key = this.consume(TokenType.IDENTIFIER, `Expected property name in ${kind}.`);
      this.consume(TokenType.COLON, `Expected ':' after property name in ${kind}.`);
      const value = this.expression();
      properties.push(AST.objectProperty(key, value));

      if (this.match(TokenType.COMMA)) {
        this.skipSeparators();
        continue;
      }

      this.skipSeparators();
    }

    this.consume(TokenType.RIGHT_BRACE, `Expected '}' after ${kind}.`);
    return properties;
  }

  skipSeparators() {
    while (this.match(TokenType.NEWLINE, TokenType.SEMICOLON)) {
      continue;
    }
  }

  matchSoftKeyword(keyword) {
    if (this.checkSoftKeyword(keyword)) {
      this.advance();
      return true;
    }

    return false;
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

  isTypeDeclarationStart() {
    return this.checkSoftKeyword("type")
      && this.checkOffset(1, TokenType.IDENTIFIER)
      && this.checkOffset(2, TokenType.LEFT_BRACE);
  }

  isMetadataDeclarationStart(keyword) {
    return this.checkSoftKeyword(keyword)
      && this.checkOffset(1, TokenType.LEFT_BRACE);
  }

  isTypeInitializerStart(expression) {
    const firstContentOffset = this.nextContentOffset(1);
    const secondContentOffset = this.nextContentOffset(firstContentOffset + 1);

    return expression.type === "Identifier"
      && this.check(TokenType.LEFT_BRACE)
      && (
        this.checkOffset(firstContentOffset, TokenType.RIGHT_BRACE)
        || (
          this.checkOffset(firstContentOffset, TokenType.IDENTIFIER)
          && this.checkOffset(secondContentOffset, TokenType.COLON)
        )
      );
  }

  nextContentOffset(startOffset) {
    let offset = startOffset;

    while (this.checkOffset(offset, TokenType.NEWLINE) || this.checkOffset(offset, TokenType.SEMICOLON)) {
      offset += 1;
    }

    return offset;
  }

  consume(type, message) {
    if (this.check(type)) {
      return this.advance();
    }

    throw this.error(this.peek(), message);
  }

  consumeTypeName(message) {
    if (this.check(TokenType.IDENTIFIER) || this.check(TokenType.NULL)) {
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

  checkSoftKeyword(keyword) {
    return this.check(TokenType.IDENTIFIER) && this.peek().lexeme === keyword;
  }

  checkOffset(offset, type) {
    const token = this.peekOffset(offset);
    if (!token) {
      return false;
    }

    if (token.type === TokenType.EOF) {
      return type === TokenType.EOF;
    }

    return token.type === type;
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

  peekOffset(offset) {
    return this.tokens[this.current + offset] || null;
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
