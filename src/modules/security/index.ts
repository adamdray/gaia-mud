import { logger as securityLogger } from '@/utils/logger'; // Use different name
import { PlayerAccount, GameObject, PlayerCharacter } from '@/core/types';
// import { PlayerSession } from '@/core/sessions'; // Assuming session holds PlayerAccount info

export class SecurityManager {
    public static initialize() {
        securityLogger.info('Security Manager initialized.');
    }

    // Check if a player (via account or character) has permission to perform an action
    public static canPerformAction(
        actor: PlayerAccount | PlayerCharacter | null, // Actor can be null if action is pre-authentication
        action: string, // e.g., "edit_object", "shutdown_server", "run_privileged_g", "connect_account"
        target?: GameObject | string // Optional target of the action (object ID or object itself)
    ): boolean {
        // Actions allowed without authentication
        if (!actor) {
            if (action === 'connect_account' || action === 'create_account' || action === 'view_public_info') {
                return true;
            }
            securityLogger.warn(`Security check: Denied action '${action}' for unauthenticated actor.`);
            return false;
        }

        // Extract roles. PlayerAccount has roles, PlayerCharacter might inherit or have its own.
        // For now, assume roles are primarily on PlayerAccount.
        const roles = 'roles' in actor ? actor.roles : [];

        // Admin override for most actions
        if (roles.includes('admin')) {
            // Admins might still be restricted from self-destructive actions unless explicitly allowed
            // if (action === 'delete_own_admin_account') return false; // Example restriction
            return true;
        }

        // Role-based permissions
        switch (action) {
            case 'edit_object':
                if (roles.includes('builder')) {
                    if (target && typeof target !== 'string') { // Target is GameObject
                        // PlayerCharacter (which extends GameObject) has an 'id'
                        // PlayerAccount has an 'id'
                        // We need to check if the actor *is* the character that owns the object
                        const characterId = 'accountId' in actor ? actor.id : null; // actor is PlayerCharacter
                        if ((target as GameObject).ownerId === characterId || !(target as GameObject).ownerId) { // Owns or unowned
                            return true;
                        }
                    } else if (target && typeof target === 'string') {
                        // Need to fetch the object to check ownerId - this might be better handled by the caller
                        // For now, assume if it's just an ID, builder needs more specific checks.
                        securityLogger.debug(`Security: edit_object on ID ${target} by builder requires fetched object.`);
                    }
                }
                break;
            case 'shutdown_server':
            case 'reload_g_module_critical':
                return false; // Only admin (handled by admin override)
            
            case 'connect_character': // Assuming actor is PlayerAccount here
                if ('characterIds' in actor && typeof target === 'string') { // target is characterId
                    return actor.characterIds.includes(target);
                }
                return false;

            case 'run_privileged_g':
                return roles.includes('wizard') || roles.includes('admin');

            // Add more actions and role checks
            // default:
            //     securityLogger.warn(`Security check: Unknown action '${action}' for actor ${actor.id}. Denying.`);
            //     return false;
        }

        securityLogger.debug(`Security check: Actor ${actor.id} action '${action}'. Roles: ${roles.join(',')}. Result: false (default deny for this action/role combo)`);
        return false; // Default to deny if no specific rule matched
    }

    // Check access to G attributes (e.g., can player execute/read/write this G code)
    public static checkGAttributeAccess(
        actor: PlayerAccount | PlayerCharacter | null,
        obj: GameObject, // The object whose attribute is being accessed
        attributeName: string,
        accessType: 'read' | 'execute' | 'write'
    ): boolean {
        if (!actor) { // Unauthenticated access to G attributes
            if (accessType === 'read' || accessType === 'execute') {
                // Allow read/execute for specific public attributes or on specific objects
                // if (obj.id === '#public_info' && attributeName === 'description') return true;
                return false; // Default deny for unauthenticated G access
            }
            return false;
        }

        const roles = 'roles' in actor ? actor.roles : [];
        if (roles.includes('admin')) return true; // Admin can do anything with G attributes

        // Example: only owner or builder can write attributes
        if (accessType === 'write') {
            const characterId = 'accountId' in actor ? actor.id : null; // If actor is a PlayerCharacter
            if (obj.ownerId === characterId || roles.includes('builder')) {
                return true;
            }
            securityLogger.debug(`G Attribute Write Denied: Actor ${actor.id}, Obj ${obj.id}, Attr ${attributeName}`);
            return false;
        }
        
        // Example: execution might be restricted for sensitive attributes (e.g., prefixed with `_`)
        if (accessType === 'execute' && attributeName.startsWith('_')) { // Convention for "private" attributes
            if (roles.includes('wizard') || (obj.ownerId && 'accountId' in actor && obj.ownerId === actor.id)) { // Wizard or owner
                return true;
            }
            securityLogger.debug(`G Attribute Execute Denied (private): Actor ${actor.id}, Obj ${obj.id}, Attr ${attributeName}`);
            return false;
        }

        // Default: read is generally allowed. Execute depends on object/attribute flags (not yet in spec for flags).
        // For now, allow read and execute if not explicitly denied above.
        return true;
    }
}
