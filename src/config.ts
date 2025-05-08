import fs from 'fs/promises';
import path from 'path';
// import YAML from 'yaml'; // npm install yaml
import { logger } from '@/utils/logger';
import { DatabaseManager } from '@/modules/database';
import { GameObject } from '@/core/types';

interface ServerSettings {
    port: number;
    telnetPort: number;
    dbConnectionString: string;
    worldDbName: string;
    accountsDbName: string;
    logLevel: string;
    // Add other initial settings
}

interface GameConfig {
    [key: string]: any; // Attributes from #config object
}

export class ConfigManager {
    private static initialSettings: ServerSettings | null = null;
    private static gameConfig: GameConfig = {}; // In-game #config object

    public static async loadInitialConfig(filePath: string = 'server_config.yaml'): Promise<void> {
        try {
            // const fullPath = path.resolve(process.cwd(), filePath);
            // logger.info(`Loading initial server configuration from: ${fullPath}`);
            // const fileContents = await fs.readFile(fullPath, 'utf8');
            // this.initialSettings = YAML.parse(fileContents); // If using YAML file
            // For now, using environment variables and defaults:
            this.initialSettings = {
                port: parseInt(process.env.PORT || '4000', 10),
                telnetPort: parseInt(process.env.TELNET_PORT || '8888', 10),
                dbConnectionString: process.env.COUCHDB_URL || 'http://admin:password@localhost:5984',
                worldDbName: process.env.COUCHDB_WORLD_DB || 'gaia_world',
                accountsDbName: process.env.COUCHDB_ACCOUNTS_DB || 'gaia_accounts',
                logLevel: process.env.LOG_LEVEL || 'debug',
            };
             // Override logger level if available from config
            if (this.initialSettings.logLevel && (process.env.LOG_LEVEL !== this.initialSettings.logLevel)) {
                 process.env.LOG_LEVEL = this.initialSettings.logLevel; // Make it available to logger
                 logger.info(`Log level set to: ${this.initialSettings.logLevel} from initial config.`);
            }
            logger.info('Initial server configuration loaded (from env/defaults).');
        } catch (error) {
            logger.error(`Failed to load initial server configuration:`, error);
            throw new Error(`Failed to load initial server configuration.`);
        }
    }

    public static async loadGameConfig(configObjectId: string = '#config'): Promise<void> {
        logger.info(`Loading game configuration from object: ${configObjectId}`);
        try {
            // Type assertion needed as DocumentScope<unknown>.get returns Promise<DocumentGetResponse<unknown>>
            const configObjectDoc = await DatabaseManager.getWorldDB().get(configObjectId);
            const configObject = configObjectDoc as unknown as GameObject; // Assert to GameObject

            if (configObject && configObject.attributes) {
                this.gameConfig = { ...configObject.attributes }; // Assuming attributes is Record<string, any>
                logger.info('Game configuration loaded successfully from database.');
            } else {
                logger.warn(`Game configuration object "${configObjectId}" not found or has no attributes.`);
                this.gameConfig = {}; // Default to empty if not found
            }
            } catch (error: any) {
                // Check for CouchDB's 404 error structure
                if (error.statusCode === 404 || error.name === 'not_found' || (error.reason && error.reason.includes("missing")) ) {
                    logger.warn(`Game configuration object "${configObjectId}" not found in DB. Using empty config.`);
                    this.gameConfig = {};
                } else {
                    logger.error(`Failed to load game configuration from object "${configObjectId}":`, error);
                    // Decide if this is a fatal error or if the server can run with defaults
                }
            }
    }

    public static getInitialSetting<K extends keyof ServerSettings>(key: K): ServerSettings[K] {
        if (!this.initialSettings) {
            // Attempt to load if not already loaded, or throw if critical path
            // For simplicity, assume loadInitialConfig is called at startup.
            throw new Error("Initial settings not loaded. Call loadInitialConfig first.");
        }
        return this.initialSettings[key];
    }

    public static get<T = any>(key: string, defaultValue?: T): T {
        const keys = key.split('.');
        let current: any = this.gameConfig;
        for (const k of keys) {
            if (current && typeof current === 'object' && k in current) {
                current = current[k];
            } else {
                return defaultValue as T; // Return default if path not found
            }
        }
        // If current is found, return it; otherwise, return defaultValue
        const value = current as T ?? defaultValue as T;
        return value;
    }

    public static getAllGameConfig(): GameConfig {
        return { ...this.gameConfig };
    }
}
