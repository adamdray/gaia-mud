import nano, { DocumentScope, ServerScope, DocumentGetResponse } from 'nano'; // Ensure DocumentGetResponse is imported
import { logger } from '@/utils/logger';
import { ConfigManager } from '@/config';
import { GameObject, PlayerAccount } from '@/core/types';

export class DatabaseManager {
    private static instance: ServerScope;
    // Use specific types for DocumentScope after initialization
    private static _worldDb: DocumentScope<unknown>; // Use unknown before casting
    private static _accountsDb: DocumentScope<unknown>; // Use unknown before casting

    public static async initialize(): Promise<void> {
        const dbUrl = ConfigManager.getInitialSetting('dbConnectionString');
        const worldDbName = ConfigManager.getInitialSetting('worldDbName');
        const accountsDbName = ConfigManager.getInitialSetting('accountsDbName');

        if (!dbUrl || !worldDbName || !accountsDbName) {
            throw new Error('Database configuration is missing (URL, world DB name, or accounts DB name).');
        }

        logger.info(`Connecting to CouchDB instance at ${new URL(dbUrl).hostname}`); // Avoid logging password
        this.instance = nano(dbUrl);

        // Initialize databases
        this._worldDb = await this.setupDatabase(worldDbName);
        this._accountsDb = await this.setupDatabase(accountsDbName);

        // Setup design documents/views if they don't exist
        await this.setupAccountsViews();
        // await this.setupWorldViews(); // TODO: Define views for world DB if needed

        logger.info('Database Manager initialized.');
    }

    private static async setupDatabase(dbName: string): Promise<DocumentScope<unknown>> {
        try {
            await this.instance.db.get(dbName); // Check if DB exists
            logger.info(`Found database: ${dbName}`);
        } catch (error: any) {
            // Nano errors for missing DB often have statusCode 404 or name 'not_found'
            if (error.statusCode === 404 || error.name === 'not_found' || (error.reason && error.reason.includes("missing")) ) {
                logger.warn(`Database "${dbName}" not found. Attempting to create.`);
                await this.instance.db.create(dbName);
                logger.info(`Database "${dbName}" created.`);
            } else {
                logger.error(`Error accessing database ${dbName}:`, error);
                throw error; // Rethrow if it's not a "not found" error
            }
        }        return this.instance.use(dbName); // Return the scoped DB object
    }

    private static async setupAccountsViews(): Promise<void> {
        const designDocName = '_design/accounts'; // Standard CouchDB design doc naming
        const views = {
            views: {
                by_loginId: { // View to find accounts by their loginId
                    map: "function (doc) { if (doc.loginId && doc.id) { emit(doc.loginId, null); } }"
                    // 'null' as value means we don't need a specific value, just the doc (via include_docs=true)
                },
                // Add other views as needed, e.g., by_email
                // by_email: {
                //   map: "function (doc) { if (doc.email && doc.id) { emit(doc.email, null); } }"
                // }
            }
            // language: "javascript" // Default, can be explicit
        };

        try {
            // Try to get the design document
            await (this.getAccountsDB() as DocumentScope<any>).get(designDocName); // Cast to any for get
            // logger.debug(`Design document ${designDocName} already exists in accounts DB.`);
            // TODO: Optionally check if views need update, though this is complex for simple setup.
       
            // Change the catch block inside setupAccountsViews (around line 67):
        } catch (error: any) {
            if (error.statusCode === 404 || error.name === 'not_found') {
                logger.info(`Design document ${designDocName} not found in accounts DB. Creating...`);
                // Insert the design document. Nano's typings for insert can be tricky with design docs.
                await (this.getAccountsDB() as DocumentScope<any>).insert(views as any, designDocName);
                logger.info(`Design document ${designDocName} created in accounts DB.`);
            } else {
                logger.error(`Error checking/creating design document ${designDocName} in accounts DB:`, error);
            }
        }
    }


    public static getWorldDB(): DocumentScope<GameObject> {
        if (!this._worldDb) throw new Error('World DB not initialized or setup failed.');
        return this._worldDb as DocumentScope<GameObject>; // Cast to specific type
    }

    public static getAccountsDB(): DocumentScope<PlayerAccount> {
        if (!this._accountsDb) throw new Error('Accounts DB not initialized or setup failed.');
        return this._accountsDb as DocumentScope<PlayerAccount>; // Cast to specific type
    }
}

