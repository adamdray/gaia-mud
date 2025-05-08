import { logger as lexerLogger } from '@/utils/logger'; // Use a different name to avoid conflict if logger is also defined here

export enum TokenType {
    LBracket = 'LBracket',     // [
    RBracket = 'RBracket',     // ]
    Symbol = 'Symbol',         // function names, variable names, keywords like true/false/nil
    String = 'String',         // "hello world"
    Number = 'Number',         // 123, 3.14, -5
    ObjectRef = 'ObjectRef',   // #object_id or #namespace:id
    Operator = 'Operator',     // . (dot for attribute access), @ (execution prefix)
    Comma = 'Comma',           // , (optional separator in lists)
    Whitespace = 'Whitespace', // spaces, tabs, newlines (typically ignored by parser)
    Comment = 'Comment',       // G-style comments (e.g., // or ;;)
    EOF = 'EOF',               // End Of File/Input
}

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    column: number;
}

export class GLexer {
    public static tokenize(gCode: string): Token[] {
        const tokens: Token[] = [];
        let cursor = 0;
        let line = 1;
        let column = 1; // 1-based column for reporting

        const consumeChar = () => {
            if (gCode[cursor] === '\n') {
                line++;
                column = 1;
            } else {
                column++;
            }
            return gCode[cursor++];
        };

        while (cursor < gCode.length) {
            const charStartColumn = column; // Capture column at start of token
            let char = gCode[cursor];

            // 1. Whitespace (ignored by adding to tokens, parser will skip)
            if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
                // Optionally add Whitespace tokens if parser needs them, or just skip
                // tokens.push({ type: TokenType.Whitespace, value: char, line, column: charStartColumn });
                consumeChar();
                continue;
            }

            // 2. Comments (e.g., // to end of line)
            if (char === '/' && gCode[cursor + 1] === '/') {
                let commentValue = '//';
                consumeChar(); consumeChar(); // consume '//'
                while (cursor < gCode.length && gCode[cursor] !== '\n') {
                    commentValue += consumeChar();
                }
                // Optionally add Comment tokens:
                // tokens.push({ type: TokenType.Comment, value: commentValue, line, column: charStartColumn });
                // If not adding, the loop will consume the newline or EOF will be hit.
                continue; // Skip comment content for now
            }

            // 3. Single character tokens
            if (char === '[') {
                tokens.push({ type: TokenType.LBracket, value: char, line, column: charStartColumn });
                consumeChar();
                continue;
            }
            if (char === ']') {
                tokens.push({ type: TokenType.RBracket, value: char, line, column: charStartColumn });
                consumeChar();
                continue;
            }
            if (char === ',') {
                tokens.push({ type: TokenType.Comma, value: char, line, column: charStartColumn });
                consumeChar();
                continue;
            }
            // Operators like . and @
            if (char === '@' || char === '.') {
                tokens.push({ type: TokenType.Operator, value: char, line, column: charStartColumn });
                consumeChar();
                continue;
            }

            // 4. String literals (e.g., "hello\"world\nnew")
            if (char === '"') {
                let str = '';
                const startLine = line; // String might span lines
                consumeChar(); // consume opening quote
                while (cursor < gCode.length && gCode[cursor] !== '"') {
                    if (gCode[cursor] === '\\') { // Handle escape sequences
                        consumeChar(); // consume backslash
                        if (cursor < gCode.length) {
                            const escaped = gCode[cursor];
                            if (escaped === 'n') str += '\n';
                            else if (escaped === 't') str += '\t';
                            else if (escaped === '"') str += '"';
                            else if (escaped === '\\') str += '\\';
                            else str += escaped; // Treat other escapes literally for now (e.g., \r, \b if needed)
                            consumeChar();
                        }
                    } else {
                        str += consumeChar();
                    }
                }
                if (cursor < gCode.length && gCode[cursor] === '"') {
                    consumeChar(); // consume closing quote
                } else {
                    lexerLogger.error(`Unterminated string literal starting at line ${startLine}, column ${charStartColumn}`);
                    // Potentially throw error or add an error token
                }
                tokens.push({ type: TokenType.String, value: str, line: startLine, column: charStartColumn });
                continue;
            }

            // 5. Object References (e.g., #object_id, #namespace:id)
            if (char === '#') {
                let ref = char;
                consumeChar();
                // Object IDs can contain letters, numbers, underscores, hyphens, colons (for namespace)
                while (cursor < gCode.length && /[a-zA-Z0-9_:\-]/.test(gCode[cursor])) {
                    ref += consumeChar();
                }
                tokens.push({ type: TokenType.ObjectRef, value: ref, line, column: charStartColumn });
                continue;
            }

            // 6. Numbers (integer and float, including negative)
            // Handles: 123, 3.14, -5, -0.5. Does not handle scientific notation yet.
            if (/[0-9]/.test(char) || (char === '-' && gCode[cursor + 1] && /[0-9]/.test(gCode[cursor + 1]))) {
                let numStr = '';
                if (char === '-') { // Handle negative numbers
                    numStr += consumeChar();
                }
                // Consume digits before decimal
                while (cursor < gCode.length && /[0-9]/.test(gCode[cursor])) {
                    numStr += consumeChar();
                }
                // Consume decimal and digits after
                if (cursor < gCode.length && gCode[cursor] === '.' && gCode[cursor+1] && /[0-9]/.test(gCode[cursor+1])) {
                    numStr += consumeChar(); // consume '.'
                    while (cursor < gCode.length && /[0-9]/.test(gCode[cursor])) {
                        numStr += consumeChar();
                    }
                }
                tokens.push({ type: TokenType.Number, value: numStr, line, column: charStartColumn });
                continue;
            }

            // 7. Symbols (function names, variable names, keywords like true/false/nil)
            // G symbols can be quite flexible. Avoid G special chars like [, ], ", #, @, . and whitespace.
            // Allows alphanumeric, underscore, hyphen, and other typical programming language operator chars if not single tokens.
            // Example: `is-empty?`, `+`, `my_var`
            // This regex is a starting point. Needs to be aligned with G's exact symbol rules.
            // It should not match if it starts with a digit (handled by Number).
            const symbolRegex = /^[a-zA-Z_+\-*\/%<>=!?^&][a-zA-Z0-9_+\-*\/%<>=!?^&:]*/; // More restrictive start
            const remainingSlice = gCode.substring(cursor);
            const symbolMatch = remainingSlice.match(symbolRegex);

            // Ensure it doesn't accidentally match parts of other tokens (e.g. if an operator was missed)
            if (symbolMatch && (char !== '@' && char !== '.' && char !== '#')) { // Redundant check if operators are handled above
                const symbol = symbolMatch[0];
                // Check if it's a keyword (true, false, nil) - parser can also do this
                // For lexer, just identify as symbol.
                tokens.push({ type: TokenType.Symbol, value: symbol, line, column: charStartColumn });
                cursor += symbol.length;
                column += symbol.length; // This column update is approximate if symbol spans lines (not typical for G symbols)
                continue;
            }


            // If no token matched
            lexerLogger.error(`Unexpected character: '${char}' (ASCII: ${char.charCodeAt(0)}) at line ${line}, column ${charStartColumn}`);
            consumeChar(); // Skip unknown char to prevent infinite loop, or throw error
        }

        tokens.push({ type: TokenType.EOF, value: 'EOF', line, column });
        return tokens;
    }
}
