import nano, { DocumentScope, ServerScope, DocumentGetResponse } from 'nano';
import { logger } from '@/utils/logger';
import { ConfigManager } from '@/config';
import { GameObject, PlayerAccount } from '@/core/types';

export class DatabaseManager {
    private static instance: ServerScope;
    private static worldDb: DocumentScope<unknown>; // Use unknown initially
    private static accountsDb: DocumentScope<unknown>; // Use unknown initially

    public static async initialize(): Promise<void> {
        const dbUrl = ConfigManager.getInitialSetting('dbConnectionString');
        const worldDbName = ConfigManager.getInitialSetting('worldDbName');
        const accountsDbName = ConfigManager.getInitialSetting('accountsDbName');

        if (!dbUrl || !worldDbName || !accountsDbName) {
            throw new Error('Database configuration is missing.');
        }

        logger.info(`Connecting to CouchDB at ${dbUrl}`);
        this.instance = nano(dbUrl);

        try {
            await this.instance.db.get(worldDbName);
            logger.info(`Found world database: ${worldDbName}`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(`World database "${worldDbName}" not found. Attempting to create.`);
                await this.instance.db.create(worldDbName);
                logger.info(`World database "${worldDbName}" created.`);
                // Initialize views/indexes here if needed for GameObject
            } else {
                logger.error(`Error accessing world database ${worldDbName}:`, error);
                throw error;
            }
        }
        this.worldDb = this.instance.use(worldDbName);

        try {
            await this.instance.db.get(accountsDbName);
            logger.info(`Found accounts database: ${accountsDbName}`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(`Accounts database "${accountsDbName}" not found. Attempting to create.`);
                await this.instance.db.create(accountsDbName);
                logger.info(`Accounts database "${accountsDbName}" created.`);
                 // Initialize views/indexes here if needed for PlayerAccount (e.g., by loginId)
            } else {
                logger.error(`Error accessing accounts database ${accountsDbName}:`, error);
                throw error;
            }
        }
        this.accountsDb = this.instance.use(accountsDbName);

        logger.info('Database Manager initialized.');
    }

    public static getWorldDB(): DocumentScope<GameObject> {
        if (!this.worldDb) throw new Error('World DB not initialized.');
        return this.worldDb as DocumentScope<GameObject>;
    }

    public static getAccountsDB(): DocumentScope<PlayerAccount> {
        if (!this.accountsDb) throw new Error('Accounts DB not initialized.');
        return this.accountsDb as DocumentScope<PlayerAccount>;
    }
}
