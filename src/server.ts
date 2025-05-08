import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import { ConfigManager } from './config';
import { logger } from './utils/logger';
import { initializeWebSocketServer } from './modules/communication/webSocketServer';
import { initializeTelnetServer } from './modules/communication/telnetServer';
import { DatabaseManager } from './modules/database';
import { WorldManager } from './modules/world';
import { GEngine } from './modules/gLanguage';
import { AccountManager } from './modules/accounts';
import { SecurityManager } from './modules/security';
import { InputParser } from './modules/inputParser';
import { InputBinder } from './modules/inputBinder';
import { GameEngine } from './modules/gameEngine';

async function main() {
    logger.info('Starting GAIA MUD Server...');

    // 1. Initialize Configuration
    await ConfigManager.loadInitialConfig(); // Load from YAML
    await ConfigManager.loadGameConfig();   // Load #config object from DB

    // 2. Initialize Database
    await DatabaseManager.initialize();

    // 3. Initialize Core Game Systems
    await WorldManager.initialize();    // Load core objects, etc.
    await GEngine.initialize();         // Load G stdlib, etc.
    await AccountManager.initialize();
    await SecurityManager.initialize();
    InputParser.initialize();
    InputBinder.initialize();
    GameEngine.initialize();


    // 4. Start Communication Interfaces
    const webSocketPort = parseInt(process.env.PORT || '4000', 10);
    initializeWebSocketServer(webSocketPort);

    const telnetPort = parseInt(process.env.TELNET_PORT || '8888', 10);
    initializeTelnetServer(telnetPort);

    // 5. Execute #object.startup
    const startupObject = await WorldManager.getObjectById(ConfigManager.get('core.startupObjectId') || '#object');
    if (startupObject) {
        logger.info(`Executing startup sequence on object: ${startupObject.id}`);
        try {
            await GEngine.executeAttribute(startupObject, 'startup', [], { executor: startupObject, actor: startupObject /* more context needed */ });
            logger.info('Startup sequence completed.');
        } catch (error) {
            logger.error('Error during startup sequence:', error);
        }
    } else {
        logger.warn('Startup object not found. Skipping #object.startup execution.');
    }

    logger.info(`GAIA MUD Server is running. Web client on port ${webSocketPort}, Telnet on port ${telnetPort}.`);
}

main().catch(error => {
    logger.error('Fatal error during server startup:', error);
    process.exit(1);
});
