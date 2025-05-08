import { logger } from "@/utils/logger";

export enum TokenType {
    LBracket = 'LBracket',     // [
    RBracket = 'RBracket',     // ]
    Symbol = 'Symbol',         // function names, variable names
    String = 'String',         // "hello world"
    Number = 'Number',         // 123, 3.14
    ObjectRef = 'ObjectRef',   // #object_id or #namespace:id
    Operator = 'Operator',     // . (dot for attribute access), @ (execution)
    Comma = 'Comma',           // , (optional separator in lists)
    Whitespace = 'Whitespace', // spaces, tabs, newlines (often ignored)
    Comment = 'Comment',       // G-style comments (e.g., // or ;;)
    EOF = 'EOF',
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
        let column = 1;

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
            let char = gCode[cursor];

            if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
                // Skip whitespace for now, parser can handle list separation
                consumeChar();
                continue;
            }

            if (char === '/' && gCode[cursor + 1] === '/') { // Line comment
                const startColumn = column;
                while (cursor < gCode.length && gCode[cursor] !== '\n') {
                    consumeChar();
                }
                // Optionally add comment tokens: tokens.push({ type: TokenType.Comment, value: comment, line, column: startColumn });
                continue; // Skip comment content
            }

            if (char === '[') {
                tokens.push({ type: TokenType.LBracket, value: char, line, column });
                consumeChar();
                continue;
            }
            if (char === ']') {
                tokens.push({ type: TokenType.RBracket, value: char, line, column });
                consumeChar();
                continue;
            }
            if (char === ',') {
                // Optional comma, parser can decide if it's significant or just like whitespace
                tokens.push({ type: TokenType.Comma, value: char, line, column });
                consumeChar();
                continue;
            }
            if (char === '@' || char === '.') {
                tokens.push({ type: TokenType.Operator, value: char, line, column });
                consumeChar();
                continue;
            }

            if (char === '"') { // String literal
                let str = '';
                const startColumn = column;
                consumeChar(); // consume opening quote
                while (cursor < gCode.length && gCode[cursor] !== '"') {
                    if (gCode[cursor] === '\\') { // Handle escape sequences
                        consumeChar(); // consume backslash
                        if (cursor < gCode.length) str += consumeChar(); // consume escaped char
                    } else {
                        str += consumeChar();
                    }
                }
                if (cursor < gCode.length && gCode[cursor] === '"') {
                    consumeChar(); // consume closing quote
                } else {
                    logger.error(`Unterminated string literal at line ${line}, column ${startColumn}`);
                    // Potentially throw error or add an error token
                }
                tokens.push({ type: TokenType.String, value: str, line, column: startColumn });
                continue;
            }

            if (char === '#') { // Object Reference
                let ref = char;
                const startColumn = column;
                consumeChar();
                // Object IDs can contain letters, numbers, underscores, hyphens, colons (for namespace)
                while (cursor < gCode.length && /[a-zA-Z0-9_:\-]/.test(gCode[cursor])) {
                    ref += consumeChar();
                }
                tokens.push({ type: TokenType.ObjectRef, value: ref, line, column: startColumn });
                continue;
            }

            // Numbers (simple integer and float for now)
            if (/[0-9]/.test(char)) {
                let numStr = '';
                const startColumn = column;
                while (cursor < gCode.length && (/[0-9]/.test(gCode[cursor]) || (gCode[cursor] === '.' && !numStr.includes('.')))) {
                    numStr += consumeChar();
                }
                tokens.push({ type: TokenType.Number, value: numStr, line, column: startColumn });
                continue;
            }

            // Symbols (function names, variables)
            // G symbols can be quite flexible, avoid G special chars like [, ], ", #, @, .
            // Allow alphanumeric, underscore, hyphen, etc.
            if (/[a-zA-Z_][a-zA-Z0-9_\-!?<>=%^&*+\/]*/.test(char)) { // Basic symbol regex, adjust as per G syntax rules
                let symbol = '';
                const startColumn = column;
                while (cursor < gCode.length && !/[\s\[\],\"#@.]/.test(gCode[cursor])) {
                    symbol += consumeChar();
                }
                // Check if it's a known keyword or just a symbol
                tokens.push({ type: TokenType.Symbol, value: symbol, line, column: startColumn });
                continue;
            }

            logger.error(`Unexpected character: '${char}' at line ${line}, column ${column}`);
            consumeChar(); // Skip unknown char to prevent infinite loop
        }

        tokens.push({ type: TokenType.EOF, value: 'EOF', line, column });
        return tokens;
    }
}
