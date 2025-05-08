import { GValue, GContext, GCommand, GameObject } from '@/core/types';
import { GStandardLibrary } from './gStdLib';
import { WorldManager } from '../world';
import { logger } from '@/utils/logger';
import { GEngine } from '.'; // For recursive calls or parsing string results

export class GInterpreter {
    private static readonly MAX_DEPTH = 100; // Recursion / call depth limit

    public static async execute(
        astNodes: GCommand[], // Always an array of commands
        context: GContext,
        initialArgs?: GValue[] // Arguments for the top-level script/function, if any
    ): Promise<GValue> {
        let currentDepth = (context as any).depth || 0;
        if (currentDepth > this.MAX_DEPTH) {
            throw new Error("G execution depth limit exceeded. Possible infinite recursion.");
        }

        const newContext = {
            ...context,
            // localVariables: { ...(context.localVariables || {}) }, // Clone local vars for this scope
            depth: currentDepth + 1
        };

        // If initialArgs are provided, make them available (e.g. arg0, arg1...)
        // This is a simple way; a more robust system would use named parameters or a dedicated args object.
        if (initialArgs) {
            // newContext.localVariables = newContext.localVariables || {};
            // initialArgs.forEach((arg, index) => {
            //     newContext.localVariables![`arg${index}`] = arg;
            // });
            // For now, stdlib functions will receive these directly.
        }


        let lastResult: GValue = null;
        for (const command of astNodes) {
            lastResult = await this.executeSingleCommand(command, newContext, initialArgs);
            // Handle control flow if G supports it (e.g., if a command returns a special "stop" signal)
        }
        return lastResult;
    }

    private static async executeSingleCommand(
        command: GCommand,
        context: GContext,
        initialArgs?: GValue[] // Pass along to stdlib if they are for the main call
    ): Promise<GValue> {
        const { func: funcNameOrRef, args: rawArgs } = command;

        // Evaluate arguments first. Each argument could be a literal or a nested command.
        const evaluatedArgs: GValue[] = [];
        for (const arg of rawArgs) {
            if (typeof arg === 'object' && arg !== null && 'func' in arg && 'args' in arg) { // It's a GCommand
                evaluatedArgs.push(await this.executeSingleCommand(arg as GCommand, context));
            } else { // It's already a GValue (literal from parser)
                evaluatedArgs.push(await this.resolveValue(arg, context));
            }
        }
        
        // Handle special operators if they are parsed as functions (e.g., funcNameOrRef could be '@' or '.')
        // Or, these are handled by specific G functions.

        // Case 1: Standard G function from GStandardLibrary
        const stdLibFunc = GStandardLibrary.getFunction(funcNameOrRef as string);
        if (stdLibFunc) {
            // If these are the initial args for the script, pass them. Otherwise, pass evaluatedArgs.
            // This logic depends on how script arguments vs internal command arguments are handled.
            // Let's assume stdLibFuncs get the evaluatedArgs of *their own* command.
            // If the stdLibFunc is the *entry point* of a script being called with initialArgs,
            // GEngine.executeAttribute should have set up the context or args appropriately.
            // For now, stdlib functions will primarily use `evaluatedArgs`.
            // If `initialArgs` are present and this is the top-level call, they might be passed differently.
            // This part is tricky. Let's assume `initialArgs` are for the *very first* command if it's a script entry.
            // For simplicity, G functions in stdlib will take `evaluatedArgs` and the `context`.
            // If a G script is called like an attribute, `initialArgs` are the parameters to that script.
            return stdLibFunc(evaluatedArgs, context);
        }

        // Case 2: Execute G code on an object attribute (e.g., funcName is like '#obj.attr' or an object itself for its 'run' attr)
        // This logic is more for when a G command *calls another* object's method.
        // The primary execution of an attribute is handled by GEngine.executeAttribute.
        // However, G code itself might do: [@some_obj.some_method arg1 arg2]

        if ((funcNameOrRef as string).startsWith('#')) { // e.g. [#obj.method arg] or [#obj arg] (runs 'run' attr)
            const parts = (funcNameOrRef as string).split('.');
            const targetObjId = parts[0];
            const attrName = parts.length > 1 ? parts[1] : 'run'; // Default to 'run' attribute

            const targetObj = await WorldManager.getObjectById(targetObjId);
            if (!targetObj) throw new Error(`Object not found for G execution: ${targetObjId}`);

            // Recursively call GEngine to execute the attribute on the target object
            // The 'evaluatedArgs' here are the arguments for the *target* attribute call.
            return GEngine.executeAttribute(targetObj, attrName, evaluatedArgs, context);
        }
        
        // Case 3: Execute code stored in a G variable (e.g. funcName is '@var_name')
        if ((funcNameOrRef as string).startsWith('@') && (funcNameOrRef as string).length > 1) {
            const varName = (funcNameOrRef as string).substring(1);
            // const gCodeToRun = context.localVariables?.[varName]; // Assuming variables hold G code strings
            const gCodeToRun = await this.resolveValue(varName, context); // Resolve variable that might hold G code string

            if (typeof gCodeToRun === 'string') {
                // Parse and execute this code. The 'evaluatedArgs' are arguments for this dynamic code.
                const ast = GEngine.parse(gCodeToRun);
                return this.execute(ast, context, evaluatedArgs);
            } else {
                throw new Error(`Variable "${varName}" does not contain executable G code.`);
            }
        }


        // If not a known function or special form, it might be an error or a symbol to be returned.
        // For now, assume an error if it's not resolved.
        throw new Error(`G Function or command type not found/resolvable: ${String(funcNameOrRef)}`);
    }

    // Resolve a GValue that might be a variable name or a literal
    private static async resolveValue(val: GValue, context: GContext): Promise<GValue> {
        // if (typeof val === 'string' && context.localVariables && val in context.localVariables) {
        //     return context.localVariables[val];
        // }
        // Add object attribute access here if G supports bare symbols for attributes of 'thisObject'
        // e.g. [print health] -> print context.thisObject.attributes.health
        return val; // It's a literal or already resolved
    }
}
