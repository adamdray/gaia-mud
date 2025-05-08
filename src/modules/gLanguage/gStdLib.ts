import { GValue, GContext, GameObject, GCommand as GCommandType } from '@/core/types'; // Renamed GCommand to GCommandType
import { logger as stdLibLogger } from '@/utils/logger'; // Use different name
import { WorldManager as StdLibWorldManager } from '@/modules/world'; // Use different name
import { GEngine as StdLibGEngine } from '.'; // Use different name to avoid conflict

// GStdLibFunction signature: takes an array of *already evaluated* arguments and the current GContext.
type GStdLibFunction = (args: GValue[], context: GContext) => Promise<GValue> | GValue;

export class GStandardLibrary {
    private static functions: Record<string, GStdLibFunction> = {};

    public static load() {
        // Core log function
        this.register('log', (args: GValue[], context: GContext) => {
            const messageParts = args.map(arg => {
                if (typeof arg === 'object' && arg !== null) {
                    // Basic serialization for objects/arrays, could be more sophisticated
                    if ('id' in arg) return `#${(arg as GameObject).id}`; // For GameObjects
                    return JSON.stringify(arg);
                }
                return String(arg);
            });
            stdLibLogger.info(`[G LOG on ${context.executor?.id || 'unknown'}]${context.actor && context.actor.id !== context.executor?.id ? ` (by ${context.actor.id})` : ''}: ${messageParts.join(' ')}`);
            return null; // Log usually doesn't return a significant value
        });

        // Basic Arithmetic
        this.register('+', (args: GValue[]) => args.reduce((sum, val) => (Number(sum) || 0) + (Number(val) || 0), 0));
        this.register('-', (args: GValue[]) => {
            if (args.length === 0) return 0;
            if (args.length === 1) return -(Number(args[0]) || 0); // Unary minus
            return args.slice(1).reduce((diff, val) => (Number(diff) || 0) - (Number(val) || 0), Number(args[0]) || 0);
        });
        this.register('*', (args: GValue[]) => args.reduce((prod, val) => (Number(prod) || 0) * (Number(val) || 0), args.length > 0 ? 1: 0)); // Multiply, ensure identity is 1
        this.register('/', (args: GValue[]) => {
            if (args.length < 2) return null; // Needs at least two args
            const divisor = Number(args[1]) || 0;
            if (divisor === 0) {
                stdLibLogger.warn("[G /] Division by zero.");
                return null; // Or throw G error
            }
            return (Number(args[0]) || 0) / divisor;
        });


        // String manipulation
        this.register('concat', (args: GValue[]) => args.map(String).join(''));
        // Add: strlen, substr, etc.

        // List creation / manipulation
        // G lists are represented as JS arrays at runtime.
        this.register('list', (args: GValue[]) => { // `[list item1 item2]` simply returns a GList (array)
            return args;
        });

        this.register('listlength', (args: GValue[]) => {
            const listArg = args[0];
            if (Array.isArray(listArg)) { // If it's already a GList (array from [list ...])
                return listArg.length;
            }
            // G spec: "[1 2 3]" is a string. [listlength "[1 2 3]"] ==> "3"
            // This implies parsing a string representation of a list.
            if (typeof listArg === 'string') {
                // This needs to be robust and match G's string-list syntax.
                // Example: "val1 val2,val3" or "[val1 val2]"
                // For now, very naive: split by space or comma, filter empty.
                const elements = listArg.replace(/[\[\]]/g, '').trim().split(/[\s,]+/).filter(e => e.length > 0);
                return elements.length;
            }
            return 0; // Not a list or recognized string list
        });
        // Add: nth_element, set_nth, append, etc.
        
        // Object attribute access
        this.register('get_attr', async (args: GValue[], context: GContext) => {
            if (args.length < 2) { stdLibLogger.warn("[G get_attr] Needs object reference and attribute name."); return null; }
            const objRefOrObject = args[0]; // Can be #objId string, or a GameObject itself
            const attrName = String(args[1]);
            
            let targetObj: GameObject | null = null;
            if (typeof objRefOrObject === 'string') {
                targetObj = await StdLibWorldManager.resolveGObjectRef(objRefOrObject, context);
            } else if (typeof objRefOrObject === 'object' && objRefOrObject !== null && 'id' in objRefOrObject) {
                targetObj = objRefOrObject as GameObject; // Already a GameObject
            }

            if (!targetObj) {
                stdLibLogger.warn(`[G get_attr] Object not found or resolved: ${JSON.stringify(objRefOrObject)}`);
                return null;
            }
            return StdLibWorldManager.getAttributeValue(targetObj.id, attrName);
        });

        this.register('set_attr', async (args: GValue[], context: GContext) => {
            if (args.length < 3) { stdLibLogger.warn("[G set_attr] Needs object, attribute name, and value."); return false; }
            const objRefOrObject = args[0];
            const attrName = String(args[1]);
            const valueToSet = args[2]; // The GValue to set

            let targetObj: GameObject | null = null;
            if (typeof objRefOrObject === 'string') {
                targetObj = await StdLibWorldManager.resolveGObjectRef(objRefOrObject, context);
            } else if (typeof objRefOrObject === 'object' && objRefOrObject !== null && 'id' in objRefOrObject) {
                targetObj = objRefOrObject as GameObject;
            }

            if (!targetObj) {
                stdLibLogger.warn(`[G set_attr] Object not found: ${JSON.stringify(objRefOrObject)} for attribute ${attrName}`);
                return false; // Indicate failure
            }
            
            targetObj.attributes[attrName] = valueToSet; // Direct set for now. Assumes attributes is mutable.
            await StdLibWorldManager.saveObject(targetObj); // Persist change
            return true; // Indicate success
        });
        
        // Control Flow: if
        // [if condition_value then_branch_code else_branch_code?]
        // Branches are expected to be G code strings or pre-parsed GCommand(s)
        this.register('if', async (args: GValue[], context: GContext) => {
            if (args.length < 2) { stdLibLogger.warn("[G if] Needs condition and then-branch."); return null; }
            // Arg 0 (condition) is already evaluated by the interpreter before calling 'if'
            const conditionResult = args[0];
            const thenBranch = args[1]; // This is a GValue, could be string of G code, or a GCommand list
            const elseBranch = args.length > 2 ? args[2] : null;

            // G Truthiness: false, 0, null, "" (empty string) are falsey. Everything else is truthy.
            const isTruthy = !(conditionResult === false || conditionResult === 0 || conditionResult === null || conditionResult === "");

            let branchToExecute: GValue | null = null;
            if (isTruthy) {
                branchToExecute = thenBranch;
            } else {
                branchToExecute = elseBranch;
            }

            if (branchToExecute !== null) {
                // If the branch is a string, assume it's G code to evaluate.
                // If the branch is a GCommand (already parsed list), evaluate that.
                if (typeof branchToExecute === 'string') {
                    return StdLibGEngine.evaluate(branchToExecute, context); // Evaluate the G code string
                } else if (typeof branchToExecute === 'object' && branchToExecute !== null && 'func' in branchToExecute) { // Single GCommand
                     return StdLibGEngine.evaluate([branchToExecute as GCommandType], context);
                } else if (Array.isArray(branchToExecute) && branchToExecute.every(item => typeof item === 'object' && item !== null && 'func' in item)) { // Array of GCommands
                     return StdLibGEngine.evaluate(branchToExecute as GCommandType[], context);
                }
                // If the branch evaluated to a non-executable literal (e.g. [if true 10 20]), return that literal.
                return branchToExecute;
            }
            return null; // No branch executed or empty branch
        });
        
        // Comparison
        this.register('equals', (args: GValue[]) => { // [equals val1 val2]
            if (args.length < 2) return false;
            // Simple strict equality for primitives. G might need more complex equality rules.
            return args[0] === args[1];
        });
        this.register('not', (args:GValue[]) => { // [not value]
            if(args.length === 0) return true; // [not] with no arg is true (not falsey)
            const condition = args[0];
            // G Truthiness for not: inverse of standard truthiness
            return (condition === false || condition === 0 || condition === null || condition === "");
        });
        // Add: >, <, >=, <= etc.

        // Messaging
        // [send target_obj_ref message_content]
        // message_content can be a string, or G code string starting with @ to be evaluated
        this.register('send', async (args: GValue[], context: GContext) => {
            if (args.length < 2) { stdLibLogger.warn("[G send] Needs target object and message content."); return null; }
            const targetRefOrObject = args[0];
            const messageContentSource = args[1]; // This is the source of the message, could be literal or G code ref

            let targetObj: GameObject | null = null;
            if (typeof targetRefOrObject === 'string') {
                targetObj = await StdLibWorldManager.resolveGObjectRef(targetRefOrObject, context);
            } else if (typeof targetRefOrObject === 'object' && targetRefOrObject !== null && 'id' in targetRefOrObject) {
                targetObj = targetRefOrObject as GameObject;
            }

            if (!targetObj) {
                stdLibLogger.warn(`[G send] Target object not found: ${JSON.stringify(targetRefOrObject)}`);
                return null;
            }

            let messageToSend: GValue;
            // If messageContentSource is a G code string starting with @ (e.g. "@message_attr" or "@#obj.attr"),
            // evaluate it in the *current* context to get the actual message.
            if (typeof messageContentSource === 'string' && messageContentSource.startsWith('@')) {
                const refToExecute = messageContentSource.substring(1); // e.g., "message_attr" or "#obj.attr"
                if (refToExecute.startsWith('#')) { // @#object.attr or @#object (runs 'run')
                     const parts = refToExecute.split('.');
                     const objIdForMsg = parts[0];
                     const attrForMsg = parts.length > 1 ? parts[1] : 'run';
                     const msgSourceObj = await StdLibWorldManager.resolveGObjectRef(objIdForMsg, context);
                     if (msgSourceObj) {
                        // Execute in the context of the *message source object* but with original actor
                        messageToSend = await StdLibGEngine.executeAttribute(msgSourceObj, attrForMsg, [], {actor: context.actor, executor: msgSourceObj});
                     } else {
                        messageToSend = `Error: Could not find object ${objIdForMsg} for dynamic message content.`;
                        stdLibLogger.warn(messageToSend);
                     }
                } else { // @attribute_on_executor or @variable
                    // Try attribute on current executor first
                    const attrVal = await StdLibWorldManager.getAttributeValue(context.executor.id, refToExecute);
                    if (typeof attrVal === 'string') { // If it's G code string stored in attribute
                         messageToSend = await StdLibGEngine.evaluate(attrVal, context); // Evaluate in current context
                    } else if (attrVal !== undefined) { // If it's a direct value in attribute
                        messageToSend = attrVal;
                    } else {
                        // Fallback to local variable if G has them, or error
                        // messageToSend = context.localVariables?.[refToExecute]; // If G had local vars
                        // if (messageToSend === undefined) {
                        messageToSend = `Error: Attribute or variable ${refToExecute} not found for dynamic message content.`;
                        stdLibLogger.warn(messageToSend);
                        // }
                    }
                }
            } else {
                messageToSend = messageContentSource; // Literal message (already evaluated by interpreter if it was a nested command)
            }
            
            // Call the target object's message handler (e.g., 'on_message' attribute)
            // The 'on_message' attribute itself is G code.
            // It should typically expect arguments like [on_message sender_obj message_data]
            try {
                // The context for on_message: executor is targetObj, actor is original actor.
                return await StdLibGEngine.executeAttribute(targetObj, 'on_message', [context.actor, messageToSend], { actor: context.actor, executor: targetObj });
            } catch (e: any) {
                stdLibLogger.warn(`[G send] Object ${targetObj.id} has no 'on_message' handler or it failed: ${e.message}`);
                // Fallback behavior: if target is a player with a direct connection, send to their client?
                // This depends on how player connections are represented and accessible.
                // For now, just log.
            }
            return null;
        });

        // Utility to get an object reference
        this.register('get_object', async (args: GValue[], context: GContext) => {
            if (args.length === 0 || typeof args[0] !== 'string') {
                stdLibLogger.warn("[G get_object] Needs an object ID string.");
                return null;
            }
            return StdLibWorldManager.resolveGObjectRef(args[0], context); // Returns GameObject or null
        });


        stdLibLogger.info("G Standard Library loaded with core functions.");
    }

    public static register(name: string, func: GStdLibFunction) {
        // G function names are often case-insensitive in MUDs
        this.functions[name.toLowerCase()] = func;
    }

    public static getFunction(name: string): GStdLibFunction | undefined {
        return this.functions[name.toLowerCase()];
    }
}
