import { logger } from '@/utils/logger';
import { GameObject, PlayerCharacter, GContext, GCommand } from '@/core/types';
import { WorldManager } from '../world';
import { GEngine } from '../gLanguage';
// import { PlayerSession } from '@/core/sessions';

export class InputBinder {
    public static initialize() {
        logger.info('Input Binder initialized.');
    }

    public static async bindAndExecute(parsedCommand: GCommand, session: any /* PlayerSession */): Promise<void> {
        // const actor = await WorldManager.getObjectById(session.characterId) as PlayerCharacter;
        // if (!actor) {
        //     logger.warn(`Actor not found for session: ${session.characterId}`);
        //     // session.send("You don't seem to be in the world.");
        //     return;
        // }
        const actor: GameObject = { id: "player1", _id: "player1", name: "Test Player", parentIds: [], attributes: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; // Placeholder

        const verb = parsedCommand.func;
        if (!verb) {
            // session.send("What do you want to do?");
            logger.warn("No verb in parsed command.");
            return;
        }

        // 1. Find the command object/attribute.
        //    This involves checking the actor, their location, global commands, etc.
        //    This uses the inheritance model. E.g., look for an attribute named `cmd_${verb}`.
        let commandHandlerObject: GameObject | null = null;
        let commandAttributeName: string | null = null;

        const commandAttrName = `cmd_${verb.toLowerCase()}`;

        // Search order (simplified for now):
        // - Actor's own attributes
        commandHandlerObject = actor; // Check self first
        if (await WorldManager.getAttributeValue(actor.id, commandAttrName)) {
            commandAttributeName = commandAttrName;
        } else {
            // - Actor's location attributes (if location exists)
            // if (actor.locationId) {
            //     const location = await WorldManager.getObjectById(actor.locationId);
            //     if (location && await WorldManager.getAttributeValue(location.id, commandAttrName)) {
            //         commandHandlerObject = location;
            //         commandAttributeName = commandAttrName;
            //     }
            // }
            // - Global command objects (TODO: define how these are identified)
        }


        logger.debug(`Binding command: "${verb}" for actor: ${actor.id}. Attempting attribute: ${commandAttributeName}`);

        if (commandHandlerObject && commandAttributeName) {
            const gContext: GContext = {
                executor: commandHandlerObject,
                actor: actor,
                // currentCommand: parsedCommand,
            };
            try {
                const result = await GEngine.executeAttribute(
                    commandHandlerObject,
                    commandAttributeName,
                    parsedCommand.args, // Pass all args from GCommand
                    gContext
                );
                logger.debug(`Command "${verb}" executed. Result: ${result}`);
                // session.send(result as string); // Or format result appropriately
            } catch (error) {
                logger.error(`Error executing command "${verb}" for actor ${actor.id}:`, error);
                // session.send("Something went wrong trying to do that.");
            }
        } else {
            logger.debug(`No command handler found for verb: ${verb}`);
            // session.send(`I don't understand how to "${verb}".`);
        }
    }
}
