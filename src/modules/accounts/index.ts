import { logger as accountLogger } from '@/utils/logger'; // Use different name
import { PlayerAccount, ObjectID } from '@/core/types';
import { DatabaseManager as AccountDBManager } from '@/modules/database'; // Use different name
import { randomUUID } from 'crypto'; // Node built-in crypto for generating IDs
// import bcrypt from 'bcryptjs'; // For password hashing - npm install bcryptjs @types/bcryptjs

export class AccountManager {
    public static initialize() {
        accountLogger.info('Account Manager initialized.');
    }

    public static async findAdminAccount(): Promise<PlayerAccount | null> {
        try {
            // Query CouchDB using the 'by_role' view for the 'admin' role
            const result = await AccountDBManager.getAccountsDB().view('accounts', 'by_role', {
                key: 'admin',
                limit: 1, // We only need to know if at least one exists
                include_docs: true
            });
            if (result.rows.length > 0 && result.rows[0].doc) {
                return result.rows[0].doc as PlayerAccount;
            }
            return null; // No admin found
        } catch (error: any) {
            if (error.statusCode === 404 || error.description?.includes("missing_named_view") || (error.error === 'not_found' && error.reason === 'missing_named_view')) {
                accountLogger.warn(`View 'accounts/by_role' not found. Cannot check for admin account.`);
                // Consider this non-fatal for startup, but log it.
            } else {
                accountLogger.error(`Error finding admin account:`, error);
            }
            return null; // Treat errors as "admin not found" for safety
        }
    }
        

    public static async createAccount(
            data: Omit<PlayerAccount, '_id' | '_rev'| 'id' | 'hashedPassword' | 'createdAt' | 'characterIds' | 'roles'> & { passwordPlainText: string },
            initialRoles?: string[] // Optional roles parameter
        ): Promise<PlayerAccount | null> {

            const { loginId, email, realName, passwordPlainText } = data;
        
        // Check if loginId or email already exists
        const existingByLogin = await this.findAccountByLoginId(loginId);
        if (existingByLogin) {
            accountLogger.warn(`Account creation failed: Login ID "${loginId}" already exists.`);
            // Optionally throw an error or return a specific status
            return null;
        }
        // TODO: Add similar check for email if it should be unique.

        // const hashedPassword = await bcrypt.hash(passwordPlainText, 10); // Use bcrypt in production
        const hashedPasswordPlaceholder = `hashed_${passwordPlainText}`; // Placeholder
        
        const accountId = randomUUID(); // Generate a unique ID for the account

        const newAccount: PlayerAccount = {
            _id: accountId, // Use UUID for _id in CouchDB
            id: accountId,  // Also use for our logical id field
            loginId,
            email,
            realName: realName || '', // Ensure realName is at least an empty string
            hashedPassword: hashedPasswordPlaceholder,
            characterIds: [],
            roles: initialRoles || ['player'], // Use provided roles or default to player
            createdAt: new Date().toISOString(), // Use ISO string for dates
        };
        try {
            const response = await AccountDBManager.getAccountsDB().insert(newAccount);
            if (!response.ok) {
                // More detailed error from CouchDB response
                throw new Error(`CouchDB insert error for account <span class="math-inline">\{loginId\}\: ID\=</span>{response.id}, Rev=${response.rev}`); // Error/Reason might not be present
            }
            newAccount._rev = response.rev; // Store revision after successful insert
            accountLogger.info(`Account created: ${loginId} (ID: ${newAccount.id})`);
            return newAccount;
        } catch (error: any) { // Catch potential errors during insert
            const errorDetails = error.message || JSON.stringify(error);
            accountLogger.error(`Error creating account ${loginId}: ${errorDetails}`);
            // Rethrow or return null based on desired error handling
            return null;
        }
    }

    public static async findAccountByLoginId(loginId: string): Promise<PlayerAccount | null> {
        try {
            // Query CouchDB using the 'by_loginId' view.
            // The view emits `loginId` as key. We want the document associated with it.
            const result = await AccountDBManager.getAccountsDB().view('accounts', 'by_loginId', {
                key: loginId,
                include_docs: true // Crucial to get the full document
            });
            if (result.rows.length > 0) {
                // Ensure the doc has the correct type structure
                const accountDoc = result.rows[0].doc as PlayerAccount;
                if (accountDoc && accountDoc.id && accountDoc.loginId) { // Basic check
                    return accountDoc;
                }
                accountLogger.warn(`Document found for loginId ${loginId} but is not a valid PlayerAccount.`);
                return null;
            }
            return null; // No account found with that loginId
        } catch (error: any) {
            // Handle cases where the view or design document might be missing
            if (error.statusCode === 404 || error.description?.includes("missing_named_view") || (error.error === 'not_found' && error.reason === 'missing_named_view')) {
                accountLogger.warn(`View 'accounts/by_loginId' not found or DB/design doc missing. Cannot find account by loginId. Error: ${error.description || error.message || error.reason}`);
            } else {
                accountLogger.error(`Error finding account by loginId ${loginId}:`, error);
            }
            return null;
        }
    }

    public static async verifyPassword(account: PlayerAccount, passwordPlainText: string): Promise<boolean> {
        if (!account.hashedPassword) return false;
        // return bcrypt.compare(passwordPlainText, account.hashedPassword); // Use bcrypt in production
        return account.hashedPassword === `hashed_${passwordPlainText}`; // Placeholder comparison
    }

    // Add a character's ObjectID to an account's list of characters
    public static async addCharacterToAccount(accountId: string, characterId: ObjectID): Promise<boolean> {
        try {
            const account = await AccountDBManager.getAccountsDB().get(accountId) as PlayerAccount; // Fetch by _id
            if (!account) {
                accountLogger.warn(`Cannot add character: Account ${accountId} not found.`);
                return false;
            }
            if (!account.characterIds.includes(characterId)) {
                account.characterIds.push(characterId);
                account.lastLoginAt = new Date().toISOString(); // Also update lastLoginAt if adding char implies activity
                const response = await AccountDBManager.getAccountsDB().insert(account); // This updates the existing doc due to _id and _rev
                return response.ok;
            }
            return true; // Character already associated
        } catch (error: any) {
            const errorDetails = error.message || JSON.stringify(error);
            accountLogger.error(`Error adding character ${characterId} to account ${accountId}: ${errorDetails}`);
            return false;
        }
    }

    public static async ensureAdminExists(): Promise<void> {
            const existingAdmin = await this.findAdminAccount();
            if (existingAdmin) {
                accountLogger.info(`Admin account found: ${existingAdmin.loginId} (ID: ${existingAdmin.id})`);
                return;
            }
        
            accountLogger.warn('No admin account found. Attempting to create default admin...');
        
            const adminUser = process.env.DEFAULT_ADMIN_USER || 'admin';
            const adminPass = process.env.DEFAULT_ADMIN_PASS;
            const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || `${adminUser}@example.com`;
        
            if (!adminPass) {
                accountLogger.error('CRITICAL: DEFAULT_ADMIN_PASS environment variable not set. Cannot create default admin.');
                // Consider throwing an error here or exiting if an admin is mandatory
                return;
            }
            if (adminPass === 'changeme') {
                 accountLogger.warn('WARNING: Default admin password is still "changeme". Please change DEFAULT_ADMIN_PASS in your .env file!');
            }
        
            const adminAccount = await this.createAccount(
                {
                    loginId: adminUser,
                    email: adminEmail,
                    realName: 'Default Admin',
                    passwordPlainText: adminPass,
                },
                ['admin', 'player'] // Assign both admin and player roles
            );
        
            if (adminAccount) {
                accountLogger.info(`Successfully created default admin account: ${adminUser}`);
            } else {
                accountLogger.error(`Failed to create default admin account ${adminUser}. Check previous errors.`);
                // Consider throwing an error here depending on requirements
            }
        }
        

    // TODO: Add methods for:
    // - findAccountById(id: string)
    // - updateAccount(account: PlayerAccount)
    // - deleteAccount(id: string)
    // - removeCharacterFromAccount(accountId: string, characterId: ObjectID)
}
