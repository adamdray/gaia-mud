import { logger } from '@/utils/logger';
import { GameObject, PlayerCharacter, GContext, GCommand } from '@/core/types';
import { WorldManager } from '@/modules/world';
import { GEngine } from '@/modules/gLanguage';
import { CommandContextSession } from '@/modules/inputParser'; // For session type
import { AccountManager } from '@/modules/accounts'; 

export class InputBinder {
    public static initialize() {
        logger.info('Input Binder initialized.');
    }

    public static async bindAndExecute(parsedCommand: GCommand, session: CommandContextSession): Promise<void> {

        const verb = parsedCommand.func; // Already lowercased by parser if needed
        if (!verb) {
            session.send("What do you want to do?"); // Should not happen if parser ensures func
            return;
        }

        if (verb === 'connect') {
            if (parsedCommand.args.length < 2) {
                session.send("Usage: connect <username> <password>");
                return;
            }
            const loginId = parsedCommand.args[0] as string;
            const password = parsedCommand.args[1] as string;

            logger.info(`Attempting login for user: ${loginId}`);
            const account = await AccountManager.findAccountByLoginId(loginId);

            if (!account) {
                logger.warn(`Login failed: Account not found for ${loginId}`);
                session.send("Login failed: Invalid username or password.");
                return;
            }

            const passwordVerified = await AccountManager.verifyPassword(account, password);
            if (!passwordVerified) {
                logger.warn(`Login failed: Incorrect password for ${loginId}`);
                session.send("Login failed: Invalid username or password.");
                return;
            }

            // TODO: Update session state here!
            // session.accountId = account.id;
            // session.isAuthenticated = true;
            logger.info(`Login successful for user: ${loginId} (Account ID: ${account.id})`);
            session.send(`Welcome, ${account.loginId}!`);
            // Optionally list characters or prompt for character connection
            if (account.characterIds && account.characterIds.length > 0) {
                session.send(`Your characters: ${account.characterIds.join(', ')}`);
                session.send(`Use 'connect character <name>' to play.`);
            } else {
                session.send("You have no characters yet. Use 'create character <name>' to make one."); // Assuming a create char command exists later
            }
            return; // Handled connect command, stop further processing
        }


        // TODO: Authenticate session and get actor (PlayerCharacter) object.
        // This is a critical piece for a real MUD.
        // For now, using a placeholder actor.
        // This needs to be replaced with real session/actor management.
        // Example: const actor = await PlayerSessionManager.getActorForSession(session.id);
        // if (!actor) {
        //     session.send("You are not currently embodied. Please connect to a character.");
        //     return;
        // }

        // Placeholder: Assume a default actor object for now if no session/character management
        // This actor should ideally be fetched based on session authentication.
        let actor = await WorldManager.getObjectById("#player_prototype"); // Example default actor
        if (!actor) { // If even placeholder isn't there, create a temporary, minimal one
            logger.warn("Default actor #player_prototype not found. Using a temporary in-memory actor.");
            actor = { _id: "temp_actor", id: "temp_actor", name: "Temporary Actor", parentIds: ["#object"], attributes: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        }

        let commandHandlerObject: GameObject | null = null;
        let commandAttributeName: string | null = null;
        const cmdAttrName = `cmd_${verb}`; // Convention: cmd_look, cmd_get

        // Search Order for command attribute:
        // 1. On the actor itself
        if (await WorldManager.getAttributeValue(actor.id, cmdAttrName) !== undefined) {
            commandHandlerObject = actor;
            commandAttributeName = cmdAttrName;
        }
        // 2. On the actor's location (if applicable and actor has locationId)
        else if (actor.locationId) {
            const location = await WorldManager.getObjectById(actor.locationId);
            if (location && await WorldManager.getAttributeValue(location.id, cmdAttrName) !== undefined) {
                commandHandlerObject = location;
                commandAttributeName = cmdAttrName;
            }
        }
        // 3. Global command objects (TODO: define how these are found, e.g., a #global_commands object or specific search path)
        // Example:
        // else {
        //    const globalCommandsObj = await WorldManager.getObjectById("#global_commands");
        //    if (globalCommandsObj && await WorldManager.getAttributeValue(globalCommandsObj.id, cmdAttrName) !== undefined) {
        //        commandHandlerObject = globalCommandsObj;
        //        commandAttributeName = cmdAttrName;
        //    }
        // }


        logger.debug(`Binding command: "${verb}" for actor: ${actor.id}. Trying attribute: "${commandAttributeName}" on object: ${commandHandlerObject?.id}`);

        if (commandHandlerObject && commandAttributeName) {
            const gContext: GContext = {
                executor: commandHandlerObject, // The object whose G code is being run
                actor: actor,                   // The player/character initiating the command
                thisObject: commandHandlerObject, // Often the same as executor for commands
                // currentCommand: parsedCommand, // Could be useful for G code to inspect its invocation
            };
            try {
                const result = await GEngine.executeAttribute(
                    commandHandlerObject,
                    commandAttributeName,
                    parsedCommand.args, // Pass the original arguments from the command
                    gContext
                );
                // G commands should ideally use `[send @actor "message"]` for output.
                // If a G command returns a string directly, we can send it as a fallback/debug.
                if (typeof result === 'string' && result.trim() !== "") {
                    session.send(result);
                } else if (result !== null && result !== undefined) { // Log non-string, non-null results for debugging
                    logger.debug(`Command "${verb}" executed with non-string/non-null result: ${JSON.stringify(result)}`);
                }
            } catch (error: any) {
                logger.error(`Error executing G command "${verb}" for actor ${actor.id} on ${commandHandlerObject.id}.${commandAttributeName}:`, error);
                session.send(error.message || "Something went wrong trying to do that.");
            }
        } else {
            logger.debug(`No command handler found for verb: ${verb}`);
            session.send(`I don't understand how to "${verb}".`);
        }
    }
}
