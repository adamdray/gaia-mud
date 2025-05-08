export type ObjectID = string; // e.g., "#some_id", "uuid-string"

export interface Attribute {
    value: any; // Can be any GValue, including G code string, number, list, etc.
    // lastModified?: Date;
    // permissions?: string; // Example: for G attribute security
}

export interface GameObject {
    _id: ObjectID; // CouchDB uses _id, typically the same as our logical 'id'
    _rev?: string;  // CouchDB uses _rev for document versioning
    id: ObjectID;   // Logical ID, ensure this is consistent with _id
    name?: string;
    description?: string;
    parentIds: ObjectID[]; // For multiple inheritance
    attributes: Record<string, Attribute | string | number | boolean | GValue | null >; // G code is stored in attributes
    locationId?: ObjectID;
    contentIds?: ObjectID[];
    ownerId?: ObjectID; // Could be a player character ID or another game object ID
    createdAt: string; // ISO Date string for DB compatibility
    updatedAt: string; // ISO Date string
}

export interface PlayerCharacter extends GameObject {
    accountId: string; // Link to the player account
    // Character-specific attributes
}

export interface PlayerAccount {
    _id: string; // CouchDB uses _id (can be UUID)
    _rev?: string; // CouchDB uses _rev
    id: string;    // Logical ID, ensure this is consistent with _id
    loginId: string; // Username for login
    email: string;
    hashedPassword?: string; // Securely hashed password
    realName?: string;
    characterIds: ObjectID[];
    roles: string[]; // e.g., ['player', 'builder', 'admin']
    createdAt: string; // ISO Date string
    lastLoginAt?: string; // ISO Date string
}

// G Language specific types
export type GValue = string | number | boolean | GList | GMap | GameObject | GCommand | null; // GCommand can be a value (for deferred execution or data)
export type GList = GValue[]; // Represented as a standard JavaScript array at runtime
export interface GMap { [key: string]: GValue; } // Represented as a standard JS object

export interface GCommand { // Represents a parsed G expression like [func arg1 arg2]
    func: string;      // The function name or operator
    args: GValue[];    // Evaluated arguments
    raw?: string;       // Optional: original text of this command part for debugging
}

export interface GContext {
    executor: GameObject;      // The object whose code is being run (e.g. the object with the attribute)
    actor: GameObject;         // The object that initiated the action (e.g., player character typing a command)
    thisObject?: GameObject;   // The object context for the current command (e.g. #a in #a.b, often same as executor)
    // currentCommand?: GCommand; // The GCommand structure being executed
    // localVariables?: Record<string, GValue>; // For G-level variables, if implemented
    // depth?: number; // For recursion control in interpreter
}
