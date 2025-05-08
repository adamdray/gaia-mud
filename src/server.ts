import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import { ConfigManager } from '@/config';
import { logger } from '@/utils/logger';
import { initializeWebSocketServer } from '@/modules/communication/webSocketServer';
import { initializeTelnetServer } from '@/modules/communication/telnetServer';
import { DatabaseManager } from '@/modules/database';
import { WorldManager } from '@/modules/world';
import { GEngine } from '@/modules/gLanguage';
import { AccountManager } from '@/modules/accounts';
import { SecurityManager } from '@/modules/security';
import { InputParser } from '@/modules/inputParser';
import { InputBinder } from '@/modules/inputBinder';
import { GameEngine } from '@/modules/gameEngine';
import { GameObject } from './core/types'; // GameObject might be needed for context

async function serverStartup() { // Renamed main to serverStartup
    logger.info('Starting GAIA MUD Server...');

    // 1. Initialize Configuration
    await ConfigManager.loadInitialConfig(); // Load from YAML or env

    // Initialize Database early as other initializations might depend on it
    await DatabaseManager.initialize();

    await ConfigManager.loadGameConfig();   // Load #config object from DB

    // 2. Initialize Core Game Systems
    await WorldManager.initialize();    // Load core objects, etc.
    await GEngine.initialize();         // Load G stdlib, etc.
    await AccountManager.initialize();
    await SecurityManager.initialize();
    InputParser.initialize();
    InputBinder.initialize();
    GameEngine.initialize(); // Game loop can be started by a command later


    // 3. Start Communication Interfaces
    const webSocketPort = ConfigManager.getInitialSetting('port');
    initializeWebSocketServer(webSocketPort);

    const telnetPort = ConfigManager.getInitialSetting('telnetPort');
    initializeTelnetServer(telnetPort);

    // 4. Execute #object.startup
    const startupObjectId = ConfigManager.get<string>('core.startupObjectId', '#object'); // Ensure type for get
    const startupObject = await WorldManager.getObjectById(startupObjectId);
    if (startupObject) {
        logger.info(`Executing startup sequence on object: ${startupObject.id}`);
        try {
            // Provide a basic context for startup
            const startupContext = { executor: startupObject, actor: startupObject };
            await GEngine.executeAttribute(startupObject, 'startup', [], startupContext);
            logger.info('Startup sequence completed.');
        } catch (error) {
            logger.error(`Error during #object.startup on "${startupObjectId}":`, error);
        }
    } else {
        logger.warn(`Startup object "${startupObjectId}" not found. Skipping #object.startup execution.`);
    }

    logger.info(`GAIA MUD Server is running. Web client on port ${webSocketPort}, Telnet on port ${telnetPort}.`);
}

serverStartup().catch(error => {
    logger.error('Fatal error during server startup:', error);
    process.exit(1);
});
