export type ObjectID = string; // e.g., "#some_id", "uuid-string"

export interface Attribute {
    // Define structure if attributes have metadata, or just use `any` for value
    value: any;
    // lastModified?: Date;
    // permissions?: string; // Example: for G attribute security
}

export interface GameObject {
    _id: ObjectID; // CouchDB uses _id
    _rev?: string;  // CouchDB uses _rev for document versioning
    id: ObjectID;   // Keep our own logical ID consistent if needed, or just use _id
    name?: string;
    description?: string;
    parentIds: ObjectID[]; // For multiple inheritance
    attributes: Record<string, Attribute | string | number | boolean | GValue | null >; // G code is stored in attributes
    locationId?: ObjectID;
    contentIds?: ObjectID[];
    ownerId?: ObjectID;
    createdAt: string; // ISO Date string
    updatedAt: string; // ISO Date string
}

export interface PlayerCharacter extends GameObject {
    accountId: string; // Link to the player account
}

export interface PlayerAccount {
    _id: string; // CouchDB uses _id (can be UUID)
    _rev?: string; // CouchDB uses _rev
    id: string;    // Keep our own logical ID consistent
    loginId: string;
    email: string;
    hashedPassword?: string;
    realName?: string;
    characterIds: ObjectID[];
    roles: string[];
    createdAt: string; // ISO Date string
    lastLoginAt?: string; // ISO Date string
}

// G Language specific types
export type GValue = string | number | boolean | GList | GMap | GameObject | null;
export type GList = GValue[];
export interface GMap { [key: string]: GValue; }

export interface GCommand {
    func: string;
    args: GValue[];
    raw?: string; // Original text of the command part
}

export interface GContext {
    executor: GameObject;
    actor: GameObject;
    thisObject?: GameObject;
    // currentCommand?: GCommand; // The command being executed
    // localVariables?: Record<string, GValue>;
    // depth?: number; // For recursion control
}
