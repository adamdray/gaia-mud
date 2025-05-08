import compromise from 'compromise';
import { logger } from '@/utils/logger';
// import { PlayerSession } from '@/core/sessions'; // Define PlayerSession type
import { InputBinder } from '../inputBinder';
import { GCommand } from '@/core/types';

export class InputParser {
    public static initialize() {
        logger.info('Input Parser initialized.');
        // Load custom nouns, verbs, etc. if needed for compromise
        // Example:
        // const lexicon = { 'mycustomverb': 'Verb' };
        // compromise.plugin({ words: lexicon });
    }

    public static parse(rawInput: string, session: any /* PlayerSession */): void {
        // logger.debug(`Parsing input from ${session.id || 'unknown player'} (${session.sourceType}): "${rawInput}"`);
        logger.debug(`Parsing input: "${rawInput}"`);


        // 1. Pre-processing (lowercase, trim, etc.)
        const cleanedInput = rawInput.toLowerCase().trim();
        if (!cleanedInput) return; // Ignore empty input

        // 2. Use Compromise NLP for initial breakdown
        const doc = compromise(cleanedInput);

        // 3. Apply Bartle-like parsing logic (this will be complex)
        //    - Identify verb, direct object, indirect object, prepositions
        //    - Handle synonyms, disambiguation
        //    - This is where you'd implement the MUD2-style parsing rules.

        const verbs = doc.verbs().out('array');
        const nouns = doc.nouns().out('array');
        // This is a very basic extraction, needs significant improvement
        const verb = verbs.length > 0 ? verbs[0] : '';
        const directObject = nouns.length > 0 ? nouns[0] : ''; // Highly simplistic

        const parsedCommand: GCommand = {
            func: verb, // Or map to a command prefix like 'cmd_' + verb
            args: [directObject].filter(arg => arg), // Filter out empty args
            raw: cleanedInput,
        };
        logger.debug('Parsed command structure:', parsedCommand);

        // 4. Pass to InputBinder
        InputBinder.bindAndExecute(parsedCommand, session);
    }

    // Methods for dynamic addition of grammar via G
    public static addVerb(verb: string, synonyms: string[] = []): void {
        const lexicon: Record<string, string> = {};
        lexicon[verb.toLowerCase()] = 'Verb';
        synonyms.forEach(s => lexicon[s.toLowerCase()] = 'Verb');
        compromise.plugin({ words: lexicon });
        logger.info(`Added verb to parser: ${verb} (Synonyms: ${synonyms.join(', ')})`);
    }
    public static addNoun(noun: string, properties: any = {}): void {
        const lexicon: Record<string, string> = {};
        lexicon[noun.toLowerCase()] = 'Noun';
        // properties could be used to add more tags if compromise supports it easily
        compromise.plugin({ words: lexicon });
        logger.info(`Added noun to parser: ${noun}`);
    }
}
