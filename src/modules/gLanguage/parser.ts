import { Token, TokenType as TT } from './lexer'; // Renamed TokenType to TT for brevity
import { GCommand, GValue } from '@/core/types';
import { logger as parserLogger } from '@/utils/logger'; // Use a different name

export class GParser {
    private static tokens: Token[] = [];
    private static cursor = 0;

    public static parse(tokens: Token[]): GCommand[] { // Should return GCommand[]
        // Filter out tokens that the parser should ignore (like whitespace, comments if lexer includes them)
        this.tokens = tokens.filter(t => t.type !== TT.Whitespace && t.type !== TT.Comment);
        this.cursor = 0;
        const commands: GCommand[] = [];

        while (!this.isAtEnd()) {
            // G scripts are lists of commands. Each command starts with '['.
            if (this.check(TT.LBracket)) {
                commands.push(this.parseExpression()); // An expression is typically a G command/list
            } else {
                const token = this.advance(); // Consume unexpected token
                parserLogger.warn(`Parser: Unexpected top-level token: ${token.type} '${token.value}' at line ${token.line}, column ${token.column}. Expected '['. Skipping.`);
                // Depending on G syntax, bare symbols or literals at top level might be errors or implicit prints/evaluations.
                // For now, strict: only lists of commands.
            }
        }
        return commands;
    }

    // An expression in G is typically a list `[...]` which evaluates to a GValue.
    // This list can be a function call or data.
    private static parseExpression(): GCommand { // Returns a GCommand structure
        const startToken = this.consume(TT.LBracket, "Expect '[' to start an expression.");
        let rawExpressionText = '['; // For debugging and `GCommand.raw`

        if (this.check(TT.RBracket)) { // Handle empty list `[]`
            rawExpressionText += this.consume(TT.RBracket, "Expect ']' to end an empty list.").value;
            // Represent empty list as a call to 'list' function or a special GValue type if G has one.
            // For now, using a convention:
            return { func: "list", args: [], raw: rawExpressionText };
        }

        // The first element of the list is crucial.
        // Spec: "[function param, param, param] syntax, which is equivalent to [function, param, param, param]"
        // This implies the first element is treated as the function/operator.
        const headElement = this.parseArgument(); // Parse the first element
        rawExpressionText += `${this.tokens[this.cursor-1]?.value || ''}`; // Add raw value of head

        let funcName: string;
        const args: GValue[] = [];

        // Determine if `headElement` is the function name or the first argument of an implicit list.
        // Per spec, "G prefers functions to operators, in the [function param, param, param] syntax"
        // This suggests the first element is the function.
        if (typeof headElement === 'string' && 
            (this.tokens[this.cursor-1]?.type === TT.Symbol ||
             this.tokens[this.cursor-1]?.type === TT.Operator ||
             this.tokens[this.cursor-1]?.type === TT.ObjectRef)) {
            funcName = headElement;
        } else {
            // If the head is not a symbol/operator/objref (e.g., it's a number or string literal),
            // it implies an implicit list. We'll use "list" as the function.
            // This aligns with LISP-like (data is code) if `list` is a function.
            // Or, G could have stricter rules. For now, assume this behavior.
            // parserLogger.warn(`Parser: First element in list is not a typical function identifier: ${JSON.stringify(headElement)}. Assuming implicit list or data.`);
            // This interpretation needs to be robust based on G's design.
            // Forcing first element to be symbol/op/ref for a function call:
             if (this.tokens[this.cursor-1]?.type !== TT.Symbol &&
                 this.tokens[this.cursor-1]?.type !== TT.Operator &&
                 this.tokens[this.cursor-1]?.type !== TT.ObjectRef) {
                 // This is data, not a function call. Treat as implicit list.
                 funcName = "list"; // Implicit function for data lists
                 args.push(headElement); // The "head" is the first argument
             } else {
                funcName = headElement as string; // It was a symbol/op/ref
             }
        }


        // Parse subsequent arguments
        while (!this.check(TT.RBracket) && !this.isAtEnd()) {
            if (this.check(TT.Comma)) { // Consume optional commas between arguments
                rawExpressionText += this.advance().value;
            }
            if (this.check(TT.RBracket)) break; // Handle trailing comma before ']'

            const argTokenForRaw = this.peek(); // For raw text
            args.push(this.parseArgument());
            rawExpressionText += ` ${argTokenForRaw.value}`; // Approximate raw text, improve if needed
        }

        rawExpressionText += this.consume(TT.RBracket, "Expect ']' to end an expression.").value;
        return { func: funcName, args, raw: rawExpressionText };
    }

    // An argument can be a primary literal value or another nested expression `[...]`.
    private static parseArgument(): GValue {
        if (this.check(TT.LBracket)) {
            return this.parseExpression(); // Nested command/list evaluates to a GValue (which is GCommand here)
        }
        return this.parsePrimary(); // Literal value
    }

    // Parses primary literal values.
    private static parsePrimary(): GValue {
        const token = this.advance();
        switch (token.type) {
            case TT.String:
                return token.value;
            case TT.Number:
                // Preserve number type (integer or float)
                return Number.isInteger(parseFloat(token.value)) && !token.value.includes('.')
                    ? parseInt(token.value, 10)
                    : parseFloat(token.value);
            case TT.ObjectRef: // e.g. #object123 or #core:player
                return token.value; // Stored as string, resolved by interpreter
            case TT.Symbol: // Could be true, false, nil, or a variable name
                if (token.value.toLowerCase() === 'true') return true;
                if (token.value.toLowerCase() === 'false') return false;
                if (token.value.toLowerCase() === 'nil' || token.value.toLowerCase() === 'null') return null;
                return token.value; // As a string symbol, interpreter resolves if it's a var
            case TT.Operator: // Operators like @ or . if they can be primary values (unlikely for G)
                // Typically operators are part of function names or handled by interpreter logic.
                // If an operator is found here, it might be an error or specific G syntax.
                parserLogger.warn(`Parser: Operator '${token.value}' found as primary. Treating as symbol.`);
                return token.value; // Treat as a symbol for now
            default:
                parserLogger.error(`Parser: Unexpected token type for primary value: ${token.type} '${token.value}' at line ${token.line}, col ${token.column}`);
                throw new Error(`Parser: Unexpected token in expression: ${token.type} '${token.value}' at line ${token.line}, col ${token.column}`);
        }
    }

    // Helper methods for parser state
    private static consume(type: TT, message: string): Token {
        if (this.check(type)) return this.advance();
        const prev = this.peekPrevious();
        const current = this.peek(); // Token that failed the check
        throw new Error(`Parser: ${message} Found ${current.type} '${current.value}' (line ${current.line}, col ${current.column}) after '${prev?.value || 'start of expression'}'.`);
    }

    private static advance(): Token {
        if (!this.isAtEnd()) this.cursor++;
        return this.peekPrevious()!; // Return the consumed token
    }

    private static check(type: TT): boolean {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }

    private static isAtEnd(): boolean {
        return this.peek().type === TT.EOF;
    }

    private static peek(): Token {
        return this.tokens[this.cursor];
    }

    private static peekPrevious(): Token | null {
        return this.cursor > 0 ? this.tokens[this.cursor - 1] : null;
    }
}
