import { Token, TokenType } from './lexer';
import { GCommand, GValue } from '@/core/types';
import { logger } from '@/utils/logger';

export class GParser {
    private static tokens: Token[] = [];
    private static cursor = 0;

    public static parse(tokens: Token[]): GCommand[] {
        this.tokens = tokens.filter(t => t.type !== TokenType.Whitespace && t.type !== TokenType.Comment); // Ignore whitespace/comments
        this.cursor = 0;
        const commands: GCommand[] = [];

        while (!this.isAtEnd()) {
            if (this.check(TokenType.LBracket)) {
                commands.push(this.parseCommand());
            } else {
                // Allow top-level symbols/literals if G syntax permits them as standalone expressions
                // For now, assume G scripts are primarily lists of commands.
                // If a non-command token is found at top level, it might be an error or part of a different syntax.
                const token = this.advance();
                logger.warn(`Unexpected top-level token: ${token.type} '${token.value}' at line ${token.line}. Skipping.`);
                // Or, if G supports bare expressions:
                // commands.push({ type: 'ExpressionStatement', expression: this.parsePrimary() });
            }
        }
        return commands;
    }

    private static parseCommand(): GCommand {
        this.consume(TokenType.LBracket, "Expect '[' to start a command.");
        
        if (this.check(TokenType.RBracket)) { // Empty list `[]`
            this.consume(TokenType.RBracket, "Expect ']' to end an empty list.");
            return { func: "list", args: [], raw: "[]" }; // Represent empty list as a call to 'list' or similar
        }

        const firstToken = this.advance();
        let funcName: string;
        let rawFuncName = firstToken.value;

        // Determine if the first element is the function name or an argument to an implicit 'list'
        // For now, assume first symbol is function name.
        if (firstToken.type === TokenType.Symbol || firstToken.type === TokenType.Operator) { // Operators like @ or . can be functions
            funcName = firstToken.value;
        } else if (firstToken.type === TokenType.ObjectRef) {
             funcName = firstToken.value; // e.g. [#obj attr]
        }
        else {
            // If it's not a symbol, it could be an implicit list or an error
            // For now, we'll treat it as the function name to align with [func param param]
            // This part needs careful design based on G's exact syntax rules.
            // If G allows [@#obj.attr arg], then @ needs to be handled.
            // If G allows [#obj.attr arg], then #obj.attr is the func.
            funcName = this.tokenToGValue(firstToken) as string; // Coerce, potentially risky
            // throw new Error(`Command must start with a function name (Symbol). Found ${firstToken.type} at line ${firstToken.line}`);
        }


        const args: GValue[] = [];
        while (!this.check(TokenType.RBracket) && !this.isAtEnd()) {
            args.push(this.parseArgument());
            if (this.check(TokenType.Comma)) { // Consume optional commas
                this.advance();
            }
        }

        this.consume(TokenType.RBracket, "Expect ']' to end a command.");
        return { func: funcName, args, raw: rawFuncName }; // raw might need better construction
    }

    private static parseArgument(): GValue {
        if (this.check(TokenType.LBracket)) {
            // Nested command, which evaluates to a GValue
            return this.parseCommand() as unknown as GValue; // A command itself can be an argument
        }
        return this.parsePrimary();
    }

    private static parsePrimary(): GValue {
        const token = this.advance();
        return this.tokenToGValue(token);
    }

    private static tokenToGValue(token: Token): GValue {
        switch (token.type) {
            case TokenType.String:
                return token.value;
            case TokenType.Number:
                return parseFloat(token.value); // Or handle BigInt if G supports arbitrary precision
            case TokenType.ObjectRef:
                return token.value; // Keep as string, interpreter resolves it
            case TokenType.Symbol:
                // Could be a variable reference or a literal symbol if G supports that
                // For now, treat as string literal symbol
                if (token.value.toLowerCase() === 'true') return true;
                if (token.value.toLowerCase() === 'false') return false;
                if (token.value.toLowerCase() === 'null' || token.value.toLowerCase() === 'nil') return null;
                return token.value; // As a string symbol
            // Operators like @ or . might be part of complex expressions or function names
            // e.g. [@ #obj.method arg] -> func: '@', args: [#obj.method, arg]
            // or   [#obj.method arg] -> func: '#obj.method', args: [arg]
            // This needs more sophisticated parsing for expressions if G is not purely s-expression like.
            case TokenType.Operator:
                 return token.value; // Treat operator as a symbol/string for now
            default:
                logger.error(`Unexpected token type for GValue: ${token.type} '${token.value}' at line ${token.line}`);
                throw new Error(`Unexpected token in expression: ${token.type} '${token.value}' at line ${token.line}`);
        }
    }

    private static consume(type: TokenType, message: string): Token {
        if (this.check(type)) return this.advance();
        const prev = this.peekPrevious();
        throw new Error(`${message} Found ${this.peek().type} '${this.peek().value}' after '${prev?.value}' at line ${this.peek().line}.`);
    }

    private static advance(): Token {
        if (!this.isAtEnd()) this.cursor++;
        return this.peekPrevious()!;
    }

    private static check(type: TokenType): boolean {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }

    private static isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    private static peek(): Token {
        return this.tokens[this.cursor];
    }

    private static peekPrevious(): Token | null {
        return this.cursor > 0 ? this.tokens[this.cursor - 1] : null;
    }
}
