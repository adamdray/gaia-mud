import { logger } from '@/utils/logger';
import { GameObject, GValue, GContext, GCommand, Attribute } from '@/core/types';
import { GLexer } from './lexer';
import { GParser } from './parser';
import { GInterpreter } from './interpreter';
import { GStandardLibrary } from './gStdLib';
import fs from 'fs/promises';
import { WorldManager } from '../world';


export class GEngine {
    public static initialize() {
        GStandardLibrary.load(); // Load built-in G functions
        logger.info('G Language Engine initialized.');
    }

    public static parse(gCode: string): GCommand[] {
        const tokens = GLexer.tokenize(gCode);
        const ast = GParser.parse(tokens);
        return Array.isArray(ast) ? ast : [ast]; // Ensure it's always an array of commands
    }

    public static async evaluate(
        gCodeOrAst: string | GCommand[],
        context: GContext
    ): Promise<GValue> {
        let ast: GCommand[];
        if (typeof gCodeOrAst === 'string') {
            ast = this.parse(gCodeOrAst);
        } else {
            ast = gCodeOrAst;
        }
        return GInterpreter.execute(ast, context);
    }

    public static async executeAttribute(
        obj: GameObject,
        attributeName: string,
        args: GValue[], // Args passed to the G function/script
        baseContext: Partial<GContext> // Base context like actor
    ): Promise<GValue> {
        const attribute = obj.attributes[attributeName];
        let gCode: string | null = null;

        if (attribute && typeof attribute === 'object' && 'value' in attribute) {
            gCode = (attribute as Attribute).value as string;
        } else if (typeof attribute === 'string') {
            gCode = attribute;
        }


        if (typeof gCode !== 'string') {
            throw new Error(`Attribute "${attributeName}" on object "${obj.id}" is not executable G code or not found.`);
        }

        // Augment context with the attribute call details
        const executionContext: GContext = {
            executor: obj, // The object whose code is being run
            actor: baseContext.actor || obj, // If no specific actor, executor is actor
            thisObject: obj, // For @#object.somefunction, 'thisObject' is #object
            // localVariables: { 'arg0': args[0], 'arg1': args[1], ... }, // Pass args
            ...baseContext, // Spread other context parts
        };
        
        // Make args available in G's local scope (example: arg0, arg1...)
        // This might be handled within GInterpreter or by setting them in context.localVariables
        // For now, GInterpreter might need to be aware of how to access these 'args'

        logger.debug(`Executing G attribute "${attributeName}" on object "${obj.id}" with args: ${JSON.stringify(args)}`);
        const ast = this.parse(gCode);

        // Pass G function arguments to the interpreter
        return GInterpreter.execute(ast, executionContext, args);
    }

    // Method to load G modules from .g files
    public static async loadGModule(filePath: string, targetObjectId: string): Promise<void> {
        try {
            logger.info(`Loading G module from ${filePath} onto object ${targetObjectId}`);
            const gCode = await fs.readFile(filePath, 'utf-8');
            const targetObject = await WorldManager.getObjectById(targetObjectId);
            if (!targetObject) {
                logger.error(`Cannot load G module: Target object ${targetObjectId} not found.`);
                return;
            }
            // Store the raw G code in a conventional attribute, e.g., 'g_module_code' or 'run'
            // Or, if the .g file represents a set of functions, parse it and store them.
            // For simplicity, let's assume it's stored in an attribute named after the file (minus extension)
            // or a generic 'run' or 'g_code' attribute.
            // This example sets it to an attribute, perhaps 'module_code'.
            // The actual execution would then be `@targetObjectId.module_code` or similar.
            const attributeName = filePath.split('/').pop()?.replace('.g', '') || 'loaded_g_module';

            targetObject.attributes[attributeName] = gCode; // Store as string
            await WorldManager.saveObject(targetObject);
            logger.info(`G module from ${filePath} loaded into attribute "${attributeName}" of object ${targetObjectId}`);
        } catch (error) {
            logger.error(`Failed to load G module from ${filePath}:`, error);
        }
    }
}
