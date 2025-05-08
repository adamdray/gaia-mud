import fs from 'fs/promises';
import path from 'path';
// import YAML from 'yaml'; // Or your preferred YAML/JSON5 parser - npm install yaml
import { logger } from './utils/logger';
import { DatabaseManager } from './modules/database'; // Assuming DB manager can fetch objects
import { GameObject } from './core/types';

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
            const fullPath = path.resolve(process.cwd(), filePath);
            logger.info(`Loading initial server configuration from: ${fullPath}`);
            // const fileContents = await fs.readFile(fullPath, 'utf8');
            // this.initialSettings = YAML.parse(fileContents);
            // For now, using environment variables and defaults:
            this.initialSettings = {
                port: parseInt(process.env.PORT || '4000', 10),
                telnetPort: parseInt(process.env.TELNET_PORT || '8888', 10),
                dbConnectionString: process.env.COUCHDB_URL || 'http://admin:password@localhost:5984',
                worldDbName: process.env.COUCHDB_WORLD_DB || 'gaia_world',
                accountsDbName: process.env.COUCHDB_ACCOUNTS_DB || 'gaia_accounts',
                logLevel: process.env.LOG_LEVEL || 'debug',
            };
            logger.info('Initial server configuration loaded (from env/defaults).');
        } catch (error) {
            logger.error(`Failed to load initial configuration from ${filePath}:`, error);
            throw new Error(`Failed to load initial configuration: ${filePath}`);
        }
    }

    public static async loadGameConfig(configObjectId: string = '#config'): Promise<void> {
        logger.info(`Loading game configuration from object: ${configObjectId}`);
        try {
            const configObjectDoc = await DatabaseManager.getWorldDB().get(configObjectId);
            const configObject = configObjectDoc as unknown as GameObject; // Added type assertion

            if (configObject && configObject.attributes) {
                this.gameConfig = { ...configObject.attributes };
                logger.info('Game configuration loaded successfully from database.');
            } else {
                logger.warn(`Game configuration object "${configObjectId}" not found or has no attributes.`);
                this.gameConfig = {}; // Default to empty if not found
            }
        } catch (error: any) {
            if (error.statusCode === 404) {
                 logger.warn(`Game configuration object "${configObjectId}" not found. Using empty config.`);
                 this.gameConfig = {};
            } else {
                logger.error(`Failed to load game configuration from object "${configObjectId}":`, error);
            }
        }
    }

    public static getInitialSetting<K extends keyof ServerSettings>(key: K): ServerSettings[K] {
        if (!this.initialSettings) {
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
                return defaultValue as T;
            }
        }
        return current as T ?? defaultValue as T;
    }

    public static getAllGameConfig(): GameConfig {
        return { ...this.gameConfig };
    }
}
