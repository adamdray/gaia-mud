import { logger } from '@/utils/logger';
import { PlayerAccount, ObjectID } from '@/core/types';
import { DatabaseManager } from '../database';
import { randomUUID } from 'crypto'; // Node built-in crypto
// import bcrypt from 'bcryptjs'; // For password hashing - npm install bcryptjs @types/bcryptjs

export class AccountManager {
    public static initialize() {
        logger.info('Account Manager initialized.');
    }

    public static async createAccount(data: Omit<PlayerAccount, '_id' | '_rev'| 'id' | 'hashedPassword' | 'createdAt' | 'characterIds' | 'roles'> & { passwordPlainText: string }): Promise<PlayerAccount | null> {
        const { loginId, email, realName, passwordPlainText } = data;
        
        // TODO: Check if loginId or email already exists (requires a view in CouchDB)
        // const existingByLogin = await this.findAccountByLoginId(loginId);
        // if (existingByLogin) {
        //     logger.warn(`Account creation failed: Login ID "${loginId}" already exists.`);
        //     return null;
        // }

        // const hashedPassword = await bcrypt.hash(passwordPlainText, 10);
        const accountId = randomUUID();
        const newAccount: PlayerAccount = {
            _id: accountId, // Use UUID for _id
            id: accountId,  // Also for logical id
            loginId,
            email,
            realName,
            hashedPassword: `hashed_${passwordPlainText}`, // Replace with actual bcrypt hash
            characterIds: [],
            roles: ['player'], // Default role
            createdAt: new Date().toISOString(),
        };
        try {
            const response = await DatabaseManager.getAccountsDB().insert(newAccount);
            if (!response.ok) {
                 throw new Error(`CouchDB insert error: ${response.id} - ${response.error} - ${response.reason}`);
            }
            newAccount._rev = response.rev; // Store revision
            logger.info(`Account created: ${loginId} (ID: ${newAccount.id})`);
            return newAccount;
        } catch (error) {
            logger.error(`Error creating account ${loginId}:`, error);
            return null;
        }
    }

    public static async findAccountByLoginId(loginId: string): Promise<PlayerAccount | null> {
        try {
            // Query CouchDB for the account by loginId.
            // This requires a view in your accounts database, e.g., a view named 'by_loginId'
            // in a design document, e.g., '_design/accounts'.
            // Map function: function(doc) { if(doc.loginId) { emit(doc.loginId, null); } }
            const result = await DatabaseManager.getAccountsDB().view('accounts', 'by_loginId', {
                key: loginId,
                include_docs: true
            });
            if (result.rows.length > 0) {
                return result.rows[0].doc as PlayerAccount;
            }
            return null;
        } catch (error: any) {
            if (error.statusCode === 404 || error.description?.includes("missing_named_view")) {
                logger.warn(`View 'accounts/by_loginId' not found or DB/design doc missing. Cannot find account by loginId. Error: ${error.description || error.message}`);
            } else {
                logger.error(`Error finding account by loginId ${loginId}:`, error);
            }
            return null;
        }
    }

    public static async verifyPassword(account: PlayerAccount, passwordPlainText: string): Promise<boolean> {
        if (!account.hashedPassword) return false;
        // return bcrypt.compare(passwordPlainText, account.hashedPassword);
        return account.hashedPassword === `hashed_${passwordPlainText}`; // Placeholder, use bcrypt
    }

    public static async addCharacterToAccount(accountId: string, characterId: ObjectID): Promise<boolean> {
        try {
            const account = await DatabaseManager.getAccountsDB().get(accountId) as PlayerAccount;
            if (!account) return false;
            if (!account.characterIds.includes(characterId)) {
                account.characterIds.push(characterId);
                const response = await DatabaseManager.getAccountsDB().insert(account);
                return response.ok;
            }
            return true; // Already has character
        } catch (error) {
            logger.error(`Error adding character ${characterId} to account ${accountId}:`, error);
            return false;
        }
    }
}
