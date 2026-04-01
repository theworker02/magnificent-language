const { KEYWORDS, TokenType, createToken } = require("./token");
const { MglLexError } = require("../utils/errors");

class Lexer {
  constructor(source, options = {}) {
    this.source = source;
    this.filePath = options.filePath || null;
    this.tokens = [];
    this.start = 0;
    this.current = 0;
    this.line = 1;
    this.column = 1;
    this.tokenLine = 1;
    this.tokenColumn = 1;
  }

  tokenize() {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.tokenLine = this.line;
      this.tokenColumn = this.column;
      this.scanToken();
    }

    this.tokens.push(createToken(TokenType.EOF, "", null, this.line, this.column, this.filePath));
    return this.tokens;
  }

  scanToken() {
    const char = this.advance();

    switch (char) {
      case "(":
        this.addToken(TokenType.LEFT_PAREN);
        break;
      case ")":
        this.addToken(TokenType.RIGHT_PAREN);
        break;
      case "{":
        this.addToken(TokenType.LEFT_BRACE);
        break;
      case "}":
        this.addToken(TokenType.RIGHT_BRACE);
        break;
      case "[":
        this.addToken(TokenType.LEFT_BRACKET);
        break;
      case "]":
        this.addToken(TokenType.RIGHT_BRACKET);
        break;
      case ",":
        this.addToken(TokenType.COMMA);
        break;
      case ".":
        this.addToken(TokenType.DOT);
        break;
      case "-":
        this.addToken(TokenType.MINUS);
        break;
      case "+":
        this.addToken(TokenType.PLUS);
        break;
      case ";":
        this.addToken(TokenType.SEMICOLON);
        break;
      case "*":
        this.addToken(TokenType.STAR);
        break;
      case "%":
        this.addToken(TokenType.PERCENT);
        break;
      case "!":
        this.addToken(this.match("=") ? TokenType.BANG_EQUAL : TokenType.BANG);
        break;
      case "=":
        this.addToken(this.match("=") ? TokenType.EQUAL_EQUAL : TokenType.EQUAL);
        break;
      case "<":
        this.addToken(this.match("=") ? TokenType.LESS_EQUAL : TokenType.LESS);
        break;
      case ">":
        this.addToken(this.match("=") ? TokenType.GREATER_EQUAL : TokenType.GREATER);
        break;
      case "/":
        if (this.match("/")) {
          while (this.peek() !== "\n" && !this.isAtEnd()) {
            this.advance();
          }
        } else {
          this.addToken(TokenType.SLASH);
        }
        break;
      case " ":
      case "\r":
      case "\t":
        break;
      case "\n":
        this.addToken(TokenType.NEWLINE);
        break;
      case "\"":
      case "'":
        this.readString(char);
        break;
      default:
        if (this.isDigit(char)) {
          this.readNumber();
          return;
        }

        if (this.isIdentifierStart(char)) {
          this.readIdentifier();
          return;
        }

        throw new MglLexError(`Unexpected character '${char}'.`, {
          filePath: this.filePath,
          line: this.tokenLine,
          column: this.tokenColumn,
          sourceText: this.source,
        });
    }
  }

  readString(quote) {
    let value = "";

    while (!this.isAtEnd()) {
      const char = this.advance();

      if (char === quote) {
        this.addToken(TokenType.STRING, value);
        return;
      }

      if (char === "\\") {
        if (this.isAtEnd()) {
          break;
        }

        const escaped = this.advance();
        value += this.translateEscape(escaped);
        continue;
      }

      value += char;
    }

    throw new MglLexError("Unterminated string literal.", {
      filePath: this.filePath,
      line: this.tokenLine,
      column: this.tokenColumn,
      sourceText: this.source,
    });
  }

  readNumber() {
    while (this.isDigit(this.peek())) {
      this.advance();
    }

    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      this.advance();

      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    const lexeme = this.source.slice(this.start, this.current);
    this.addToken(TokenType.NUMBER, Number(lexeme));
  }

  readIdentifier() {
    while (this.isIdentifierPart(this.peek())) {
      this.advance();
    }

    const lexeme = this.source.slice(this.start, this.current);
    const type = KEYWORDS[lexeme] || TokenType.IDENTIFIER;
    this.addToken(type);
  }

  translateEscape(char) {
    switch (char) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "\"":
        return "\"";
      case "'":
        return "'";
      case "\\":
        return "\\";
      default:
        return char;
    }
  }

  addToken(type, literal = null) {
    const lexeme = this.source.slice(this.start, this.current);
    this.tokens.push(createToken(type, lexeme, literal, this.tokenLine, this.tokenColumn, this.filePath));
  }

  advance() {
    const char = this.source[this.current];
    this.current += 1;

    if (char === "\n") {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }

    return char;
  }

  match(expected) {
    if (this.isAtEnd()) {
      return false;
    }

    if (this.source[this.current] !== expected) {
      return false;
    }

    this.advance();
    return true;
  }

  peek() {
    if (this.isAtEnd()) {
      return "\0";
    }

    return this.source[this.current];
  }

  peekNext() {
    if (this.current + 1 >= this.source.length) {
      return "\0";
    }

    return this.source[this.current + 1];
  }

  isAtEnd() {
    return this.current >= this.source.length;
  }

  isDigit(char) {
    return char >= "0" && char <= "9";
  }

  isIdentifierStart(char) {
    return /[A-Za-z_]/.test(char);
  }

  isIdentifierPart(char) {
    return /[A-Za-z0-9_]/.test(char);
  }
}

module.exports = {
  Lexer,
};
