import { GValue, GContext, GameObject } from '@/core/types';
import { logger } from '@/utils/logger';
import { WorldManager } from '../world';
import { GEngine } from '.'; // For GEngine.evaluate if a function needs to run G code strings

// GFunction signature: takes an array of evaluated arguments and the current GContext.
// It can be async if it needs to perform async operations (like DB access).
type GFunction = (args: GValue[], context: GContext) => Promise<GValue> | GValue;

export class GStandardLibrary {
    private static functions: Record<string, GFunction> = {};

    public static load() {
        // Core log function
        this.register('log', (args: GValue[], context: GContext) => {
            const messageParts = args.map(arg => String(arg)); // Convert all args to string
            logger.info(`[G LOG from ${context.executor.id}]: ${messageParts.join(' ')}`);
            return null; // Log usually doesn't return a value
        });

        // Basic Arithmetic
        this.register('+', (args: GValue[]) => {
            return args.reduce((sum, val) => (sum as number) + (Number(val) || 0), 0);
        });
        this.register('-', (args: GValue[]) => {
            if (args.length === 0) return 0;
            if (args.length === 1) return -(Number(args[0]) || 0);
            return args.slice(1).reduce((diff, val) => (diff as number) - (Number(val) || 0), Number(args[0]) || 0);
        });
        // Add *, / etc.

        // String concatenation
        this.register('concat', (args: GValue[]) => {
            return args.map(String).join('');
        });

        // List creation / manipulation (G lists are often represented as strings)
        // This 'list' function can just return its arguments, effectively creating a list structure if G supports it,
        // or it can format them into G's string list representation.
        // For now, let's assume it helps in constructing what might be a GList type if G had richer internal types.
        this.register('list', (args: GValue[]) => {
            return args; // Returns an array, which is GList type
        });

        this.register('listlength', (args: GValue[]) => {
            const listArg = args[0];
            if (Array.isArray(listArg)) { // If it's already a GList (array)
                return listArg.length;
            }
            if (typeof listArg === 'string') {
                // Attempt to parse G's string list format if defined.
                // This is a placeholder for robust G string-list parsing.
                // Example: "[1 2 3]" or "1,2,3"
                // For now, very naive: split by space or comma.
                const elements = listArg.replace(/[\[\]]/g, '').trim().split(/[\s,]+/);
                return elements.filter(e => e).length; // Count non-empty elements
            }
            return 0;
        });
        
        // Object attribute access
        this.register('get_attr', async (args: GValue[], context: GContext) => {
            const objRef = args[0] as string; // Expecting #objId or variable name resolving to #objId
            const attrName = args[1] as string;
            if (!objRef || !attrName) return null;

            let targetObj: GameObject | null = null;
            if (objRef.startsWith('#')) {
                targetObj = await WorldManager.getObjectById(objRef);
            } else if (objRef === '@this' && context.thisObject) {
                targetObj = context.thisObject;
            } else if (objRef === '@actor' && context.actor) {
                targetObj = context.actor;
            } else if (objRef === '@executor' && context.executor) {
                targetObj = context.executor;
            }
            // Add variable resolution for objRef if G supports it

            if (!targetObj) {
                logger.warn(`[G get_attr] Object not found or resolved: ${objRef}`);
                return null;
            }
            return WorldManager.getAttributeValue(targetObj.id, attrName);
        });

        this.register('set_attr', async (args: GValue[], context: GContext) => {
            const objRef = args[0] as string;
            const attrName = args[1] as string;
            const value = args[2]; // The GValue to set

            let targetObj = null;
             if (objRef.startsWith('#')) {
                targetObj = await WorldManager.getObjectById(objRef);
            } else if (objRef === '@this' && context.thisObject) {
                targetObj = context.thisObject;
            } // etc. for @actor, @executor

            if (!targetObj) {
                logger.warn(`[G set_attr] Object not found: ${objRef}`);
                return false; // Indicate failure
            }
            if (typeof attrName !== 'string') {
                 logger.warn(`[G set_attr] Attribute name must be a string.`);
                 return false;
            }

            targetObj.attributes[attrName] = value; // Direct set for now
            await WorldManager.saveObject(targetObj); // Persist change
            return true; // Indicate success
        });
        
        // Control Flow: if
        // [if condition then_branch else_branch?]
        // Branches are expected to be G code strings or pre-parsed command lists
        this.register('if', async (args: GValue[], context: GContext) => {
            const condition = args[0]; // Evaluated by interpreter before calling 'if'
            const thenBranch = args[1];
            const elseBranch = args.length > 2 ? args[2] : null;

            let branchToExecute: GValue | null = null;
            if (!!condition) { // G truthiness: non-empty string, non-zero number, true, non-null object/list
                branchToExecute = thenBranch;
            } else {
                branchToExecute = elseBranch;
            }

            if (branchToExecute) {
                if (typeof branchToExecute === 'string') { // G code string
                    return GEngine.evaluate(branchToExecute, context);
                } else if (typeof branchToExecute === 'object' && branchToExecute !== null && 'func' in branchToExecute) { // Pre-parsed GCommand
                     return GEngine.evaluate([branchToExecute as any], context); // Wrap in array for GEngine.evaluate
                } else if (Array.isArray(branchToExecute)) { // Array of GCommands
                     return GEngine.evaluate(branchToExecute as any[], context);
                }
                return branchToExecute; // If it's already a simple GValue
            }
            return null; // No branch executed or empty branch
        });
        
        // Simple 'equals'
        this.register('equals', (args: GValue[]) => {
            if (args.length < 2) return false;
            // Simple string comparison for now, G might have more complex equality
            return String(args[0]) === String(args[1]);
        });

        // Send message to an object
        // [send target_obj_ref message_string_or_code]
        this.register('send', async (args: GValue[], context: GContext) => {
            const targetRef = args[0] as string;
            const messageContent = args[1];

            let targetObj: GameObject | null = null;
            if (targetRef.startsWith('#')) {
                targetObj = await WorldManager.getObjectById(targetRef);
            } // Resolve @actor, @this etc.

            if (!targetObj) {
                logger.warn(`[G send] Target object not found: ${targetRef}`);
                return null;
            }

            let messageToSend: GValue;
            if (typeof messageContent === 'string' && messageContent.startsWith('@')) {
                // Execute G code stored in an attribute of the *sending context's executor* or *thisObject*
                // e.g. [send #player @dynamic_message_attr]
                const attrName = messageContent.substring(1);
                messageToSend = await GEngine.executeAttribute(context.executor, attrName, [], context);
            } else if (typeof messageContent === 'string') {
                messageToSend = messageContent; // Literal string
            } else {
                messageToSend = messageContent; // Already evaluated GValue
            }
            
            // Call the target object's message handler (e.g., 'on_message' attribute)
            // The message handler itself is G code.
            try {
                return await GEngine.executeAttribute(targetObj, 'on_message', [messageToSend], { actor: context.actor, executor: targetObj });
            } catch (e: any) {
                logger.warn(`[G send] Object ${targetObj.id} has no 'on_message' handler or it failed: ${e.message}`);
                // Fallback: send directly to player connection if target is a player?
                // Or just log it.
            }
            return null;
        });


        logger.info("G Standard Library loaded.");
    }

    public static register(name: string, func: GFunction) {
        this.functions[name.toLowerCase()] = func;
    }

    public static getFunction(name: string): GFunction | undefined {
        return this.functions[name.toLowerCase()];
    }
}
