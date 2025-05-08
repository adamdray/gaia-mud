import { GValue, GContext, GCommand, GameObject } from '@/core/types';
import { GStandardLibrary } from './gStdLib';
import { WorldManager } from '@/modules/world';
import { logger as interpreterLogger } from '@/utils/logger'; // Use different name
import { GEngine } from '.'; // For recursive calls like GEngine.evaluate or GEngine.executeAttribute

export class GInterpreter {
    private static readonly MAX_CALL_DEPTH = 100; // To prevent stack overflow from recursion

    // Executes a list of GCommands (an AST from the parser)
    public static async execute(
        astNodes: GCommand[], // Always an array of commands, even if script is one line
        context: GContext,
        initialArgs?: GValue[] // Arguments for the top-level script/function call
    ): Promise<GValue> {
        // Manage call depth for recursion
        const callDepth = ((context as any)._callDepth || 0) + 1;
        if (callDepth > this.MAX_CALL_DEPTH) {
            throw new Error("G execution: Max call depth exceeded. Possible infinite recursion.");
        }

        // Create a new context for this execution scope, inheriting or cloning parts of parent context
        const currentContext: GContext & { _callDepth: number } = {
            ...context,
            // localVariables: { ...(context.localVariables || {}) }, // If G has lexical scoping for variables
            _callDepth: callDepth,
        };
        
        // The 'initialArgs' are primarily for the first command if the AST represents a script
        // that was called with arguments (e.g., from executeAttribute).
        // Subsequent commands in the AST use their own parsed arguments.

        let lastResult: GValue = null;
        for (let i = 0; i < astNodes.length; i++) {
            const command = astNodes[i];
            // If this is the first command of a script that was called with `initialArgs`,
            // those `initialArgs` are the evaluated arguments for *this specific command*.
            // Otherwise, the command's own `command.args` need to be evaluated.
            const argsForThisCommand = (i === 0 && initialArgs) ? initialArgs : await this.evaluateCommandArguments(command.args, currentContext);
            lastResult = await this.executeSingleCommand(command, currentContext, argsForThisCommand);
            
            // TODO: Implement control flow. For example, if G has a `[return <value>]` command,
            // it should stop execution of the current list of commands and return `lastResult`.
            // if (command.func.toLowerCase() === 'return' || (lastResult instanceof GControlFlow && lastResult.type === 'return')) {
            //    return lastResult instanceof GControlFlow ? lastResult.value : lastResult;
            // }
        }
        return lastResult;
    }
    
    // Helper to evaluate arguments of a GCommand before calling its function
    private static async evaluateCommandArguments(rawArgs: GValue[], context: GContext): Promise<GValue[]> {
        const evaluatedArgs: GValue[] = [];
        for (const arg of rawArgs) {
            // If an argument is itself a GCommand (nested expression), execute it to get its value.
            if (typeof arg === 'object' && arg !== null && 'func' in arg && 'args' in arg) {
                const nestedCommand = arg as GCommand;
                const nestedArgs = await this.evaluateCommandArguments(nestedCommand.args, context);
                evaluatedArgs.push(await this.executeSingleCommand(nestedCommand, context, nestedArgs));
            } else { // Argument is a literal GValue (string, number, bool, null, #objref, or symbol)
                evaluatedArgs.push(await this.resolveValue(arg, context)); // Resolve if it's a variable symbol
            }
        }
        return evaluatedArgs;
    }


    // Executes a single GCommand
    private static async executeSingleCommand(
        command: GCommand,
        context: GContext,
        evaluatedArgs: GValue[] // Arguments for THIS command, already evaluated
    ): Promise<GValue> {
        const { func: funcNameOrRef } = command;

        // 1. Standard G function from GStandardLibrary
        const stdLibFunc = GStandardLibrary.getFunction(funcNameOrRef as string);
        if (stdLibFunc) {
            return stdLibFunc(evaluatedArgs, context); // Pass the already evaluated args
        }

        // 2. Execute G code on an object attribute
        //    Syntax: [#object.attribute arg1 arg2] or [#object arg1 arg2] (runs 'run' attribute)
        if (typeof funcNameOrRef === 'string' && funcNameOrRef.startsWith('#')) {
            const parts = funcNameOrRef.split('.');
            const targetObjId = parts[0]; // e.g., "#myObject"
            const attrName = parts.length > 1 ? parts[1] : 'run'; // Default to 'run'

            const targetObj = await WorldManager.resolveGObjectRef(targetObjId, context);
            if (!targetObj) throw new Error(`Interpreter: Object not found for G execution: ${targetObjId}`);

            // Call GEngine.executeAttribute, which handles fetching/parsing G code from the attribute.
            // The 'evaluatedArgs' become the 'initialArgs' for the script in that attribute.
            return GEngine.executeAttribute(targetObj, attrName, evaluatedArgs, context);
        }
        
        // 3. Execute code stored in a G variable or execute 'run' attribute of an object reference
        //    Syntax: [@variable_name arg1 arg2] or [@#object_ref arg1 arg2]
        if (typeof funcNameOrRef === 'string' && funcNameOrRef.startsWith('@') && funcNameOrRef.length > 1) {
            const varOrObjRef = funcNameOrRef.substring(1); // Remove '@'

            if (varOrObjRef.startsWith('#')) { // It's an @#object_ref, execute its 'run' attribute
                 const targetObj = await WorldManager.resolveGObjectRef(varOrObjRef, context);
                 if (!targetObj) throw new Error(`Interpreter: Object not found for @ execution: ${varOrObjRef}`);
                 return GEngine.executeAttribute(targetObj, 'run', evaluatedArgs, context);
            } else { // It's a @variable_name reference
                // const gCodeToRun = context.localVariables?.[varOrObjRef]; // If G has local variables
                const gCodeToRun = await this.resolveValue(varOrObjRef, context); // Try to resolve as variable or symbol

                if (typeof gCodeToRun === 'string') {
                    // The variable holds a string of G code. Parse and execute it.
                    // The 'evaluatedArgs' become the 'initialArgs' for this dynamically executed code.
                    const ast = GEngine.parse(gCodeToRun);
                    return GEngine.execute(ast, context, evaluatedArgs);
                } else {
                    throw new Error(`Interpreter: Variable "${varOrObjRef}" does not contain executable G code string.`);
                }
            }
        }

        // 4. If funcNameOrRef is a GCommand itself (e.g. result of a G function that returns a command)
        if (typeof funcNameOrRef === 'object' && funcNameOrRef !== null && 'func' in funcNameOrRef) {
            // The 'evaluatedArgs' of the outer command become the 'initialArgs' for this inner command.
            const innerCommand = funcNameOrRef as GCommand;
            const innerCmdArgs = await this.evaluateCommandArguments(innerCommand.args, context);
            return this.executeSingleCommand(innerCommand, context, innerCmdArgs);
        }


        throw new Error(`Interpreter: G Function, command type, or resolvable entity not found: ${String(funcNameOrRef)}`);
    }

    // Resolves a GValue that might be a variable name (Symbol) or a literal.
    private static async resolveValue(val: GValue, context: GContext): Promise<GValue> {
        // if (typeof val === 'string' && context.localVariables && val in context.localVariables) {
        //     return context.localVariables[val]; // Resolve G variable from local scope
        // }
        // Special symbol resolution like @this, @actor, @executor
        if (typeof val === 'string') {
            if (val === '@this') return context.thisObject || null;
            if (val === '@actor') return context.actor || null;
            if (val === '@executor') return context.executor || null;
            // Add more special symbols if G needs them.
        }
        // If not a variable or special symbol, it's a literal or already resolved object.
        return val;
    }
}
