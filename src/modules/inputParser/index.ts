import compromise from 'compromise';
import { logger } from '@/utils/logger';
import { InputBinder } from '@/modules/inputBinder';
import { GCommand } from '@/core/types';

// Define a basic session structure that parser and binder can use
// This will evolve as session management is built out.
export interface CommandContextSession {
    send: (message: string) => void; // Function to send output back to the client
    sourceType: 'websocket' | 'telnet';
    // Potentially add:
    // accountId?: string;
    // characterId?: string;
    // isAuthenticated?: boolean;
    // currentRoomId?: string;
}


export class InputParser {
    public static initialize() {
        logger.info('Input Parser initialized.');
        // Load custom nouns, verbs, etc. if needed for compromise
        // Example:
        // const lexicon = { 'mycustomverb': 'Verb' };
        // compromise.plugin({ words: lexicon });
    }

    public static parse(rawInput: string, session: CommandContextSession): void {
        // logger.debug(`Parsing input from ${session.id || 'unknown player'} (${session.sourceType}): "${rawInput}"`);
        logger.debug(`Parsing input from ${session.sourceType} ("${rawInput}")`);


        // 1. Pre-processing (lowercase, trim, etc.)
        //    Spec says MUD2-like, which often preserves case for proper nouns.
        //    For now, keeping it simple with lowercase. This can be refined.
        const cleanedInput = rawInput.trim(); // Trim, but don't lowercase yet
        if (!cleanedInput) return; // Ignore empty input

        // 2. Use Compromise NLP for initial breakdown (optional, can be replaced/augmented)
        //    The spec mentions Compromise, then applying Bartle's ideas.
        //    A very simple approach for now: split by space.
        //    A real MUD2 parser is much more complex (dictionaries, grammar rules, disambiguation).
        const terms = cleanedInput.split(/\s+/);

        if (terms.length === 0) {
            session.send("Huh?"); // Or some other default for empty input after trim
            return;
        }

        // Simplistic parsing: first word is verb, rest are arguments.
        // This does NOT follow Bartle's design yet.
        const verb = terms[0].toLowerCase(); // Verbs are often case-insensitive
        const args = terms.slice(1); // Arguments might be case-sensitive

        const parsedCommand: GCommand = {
            func: verb, // This will be mapped to cmd_verb or directly used by G
            args: args, // Pass remaining terms as string arguments
            raw: cleanedInput,
        };
        logger.debug('Parsed command structure:', parsedCommand);

        // 4. Pass to InputBinder
        InputBinder.bindAndExecute(parsedCommand, session);
    }

    // Methods for dynamic addition of grammar via G (placeholders)
    public static addVerb(verb: string, synonyms: string[] = []): void {
        // This would modify the parser's internal dictionary or rules.
        // If using Compromise heavily, this would interact with its lexicon.
        const lexicon: Record<string, string> = {};
        lexicon[verb.toLowerCase()] = 'Verb'; // Add to compromise's lexicon
        synonyms.forEach(s => lexicon[s.toLowerCase()] = 'Verb');
        compromise.plugin({ words: lexicon });
        logger.info(`Added verb to parser: ${verb} (Synonyms: ${synonyms.join(', ')})`);
    }
    public static addNoun(noun: string, properties: any = {}): void {
        const lexicon: Record<string, string> = {};
        lexicon[noun.toLowerCase()] = 'Noun'; // Add to compromise's lexicon
        // properties could be used to add more tags if compromise supports it easily
        compromise.plugin({ words: lexicon });
        logger.info(`Added noun to parser: ${noun}`);
    }
}
