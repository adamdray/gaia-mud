import { logger } from '@/utils/logger';
import { GameObject, GValue, GContext, GCommand, Attribute } from '@/core/types';
import { GLexer } from './lexer';
import { GParser } from './parser';
import { GInterpreter } from './interpreter';
import { GStandardLibrary } from './gStdLib';
import fs from 'fs/promises';
import path from 'path'; // Added path import
import { WorldManager } from '@/modules/world';


export class GEngine {
    public static initialize() {
        GStandardLibrary.load(); // Load built-in G functions
        logger.info('G Language Engine initialized.');
    }

    public static parse(gCode: string): GCommand[] { // Ensure return is GCommand[]
        const tokens = GLexer.tokenize(gCode);
        const ast = GParser.parse(tokens); // GParser.parse should return GCommand[]
        return Array.isArray(ast) ? ast : [ast]; // Ensure it's always an array of commands
    }

    public static async evaluate(
        gCodeOrAst: string | GCommand[], // Can be a string of G code or pre-parsed AST
        context: GContext,
        initialArgs?: GValue[] // Added initialArgs for direct G code evaluation with args
    ): Promise<GValue> {
        let ast: GCommand[];
        if (typeof gCodeOrAst === 'string') {
            ast = this.parse(gCodeOrAst);
        } else {
            ast = gCodeOrAst; // Already an array of commands
        }
        return GInterpreter.execute(ast, context, initialArgs); // Pass initialArgs to interpreter
    }

    public static async executeAttribute(
        obj: GameObject,
        attributeName: string,
        args: GValue[], // Args passed to the G function/script being called
        baseContext: Partial<GContext> // Base context like actor, executor will be obj
    ): Promise<GValue> {
        const attributeData = obj.attributes[attributeName];
        let gCode: string | null = null;

        // Check direct attribute first
        if (attributeData !== undefined) {
            if (typeof attributeData === 'object' && attributeData !== null && 'value' in attributeData && typeof (attributeData as Attribute).value === 'string') {
                gCode = (attributeData as Attribute).value;
            } else if (typeof attributeData === 'string') {
                gCode = attributeData;
            }
        }

        // If not found or not a string on direct attribute, try inheritance
        if (gCode === null) {
            const inheritedGCode = await WorldManager.getAttributeValue(obj.id, attributeName);
            if (typeof inheritedGCode === 'string') {
                gCode = inheritedGCode;
            } else if (inheritedGCode !== undefined) { // Inherited but not a string
                 throw new Error(`Inherited attribute "${attributeName}" on object "${obj.id}" is not executable G code (not a string). Value: ${JSON.stringify(inheritedGCode)}`);
            } else { // Not found directly or via inheritance
                 throw new Error(`Attribute "${attributeName}" on object "${obj.id}" (nor its parents) is not executable G code or not found.`);
            }
        }
        // Final check if gCode is a string after potential inheritance
        if (typeof gCode !== 'string') {
             throw new Error(`Attribute "${attributeName}" on object "${obj.id}" resolved to non-string G code. Value: ${JSON.stringify(gCode)}`);
        }


        // Augment context with the attribute call details
        const executionContext: GContext = {
            executor: obj, // The object whose code is being run
            actor: baseContext.actor || obj, // If no specific actor provided, executor is actor
            thisObject: obj, // For @#object.somefunction, 'thisObject' is #object
            ...baseContext, // Spread other context parts
        };

        logger.debug(`Executing G attribute "${attributeName}" on object "${obj.id}" with args: ${JSON.stringify(args)}`);
        const ast = this.parse(gCode); // Parse the G code string into AST

        // Pass G function arguments to the interpreter for the script being executed
        return GInterpreter.execute(ast, executionContext, args);
    }

    // Method to load G modules from .g files
    public static async loadGModule(filePath: string, targetObjectId: string): Promise<void> {
        try {
            logger.info(`Loading G module from ${filePath} onto object ${targetObjectId}`);
            const gCode = await fs.readFile(filePath, 'utf-8');
            let targetObject = await WorldManager.getObjectById(targetObjectId);

            if (!targetObject) {
                // Optionally create the object if it doesn't exist, as per spec
                logger.warn(`Target object ${targetObjectId} for G module not found. Creating it.`);
                targetObject = await WorldManager.saveObject({ // saveObject needs a structure matching GameObject
                    id: targetObjectId,
                    _id: targetObjectId, // CouchDB compatibility
                    name: targetObjectId, // Default name
                    parentIds: [WorldManager.BASE_OBJECT_ID], // Default parent
                    attributes: {},
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                } as GameObject); // Cast needed if saveObject expects full object
            }
            
            // Use filename (sans .g extension) as the attribute name to store the G code
            const attributeName = path.basename(filePath, '.g');

            targetObject.attributes[attributeName] = gCode; // Store the raw G code string
            await WorldManager.saveObject(targetObject); // Persist the change
            logger.info(`G module from ${filePath} loaded into attribute "${attributeName}" of object ${targetObjectId}`);
        } catch (error) {
            logger.error(`Failed to load G module from ${filePath} for ${targetObjectId}:`, error);
        }
    }
}
