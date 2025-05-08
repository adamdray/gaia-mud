# GAIA MUD Server Specification

## Original Specification

Write a multiplayer game server, similar to TinyMUSH or LP MUD, satisfying these requirements:

1.  It is written entirely in Node.js (back end) and React (for the front end web-based client), with TypeScript.

2.  It is broken into separate modules for scalability and maintainability, to handle, at least:
    * the communication between player and server, via a web-based client (using WebSockets) AND via a telnet client (secure connection to server on port 8888)
    * **(Revised)** parsing player input according to different modes (User, Admin, Game)
    * binding parsed commands to game object actions or system functions
    * the database that stores the game's "world," including places, characters, and things; with appropriate layers of abstraction to separate storage implementation concerns from the game data formats
    * an in-game, "softcode" language, called G (lexer/parser, interpreter/execution engine, standard library functions)
    * a game-logic physics engine (but very little of the game physics will be hardcoded -- most will be in G)
    * a security model that handles player access to the server, player access to characters, and player roles and privileges for access to game features

3.  Follow MUD/MUSH conventions for how the world is represented with objects:
    * Each object has a unique object id (type: string) (can be a game-assigned GUID or a human-created string identifier like "#object").
    * The game prevents object id collisions automatically at assignment.
    * Game objects are primarily defined and modified by developers through external text files (e.g., YAML, Relaxed JSON, or specific `.g` files for G code modules). The engine loads these files, parses them, and maps their content to game objects.
    * Each object is stored in a fast-read data store (assume CouchDB), with strict JSON text. The engine handles the conversion from the human-editable file formats to JSON for database storage. Developers do not directly modify the database.
    * Every game object inherits from "#object".
    * Each object has zero or more attributes.
    * Multiple inheritance of objects and their attributes: no distinction between an object and a type and a function; resolve "diamond" issues with left-right precedence and breadth-first searches.
    * IS-A inheritance is based on object-level inheritance.
    * HAS-A inheritance is based on attribute-level inheritance.
    * Objects are cached in memory for performance; cache is written back to disk at regular intervals (or when a threshold of change is reached).

4.  **(Revised) Player Input Parsing and Handling:**
    * Player input is handled by attempting to match the input against a stack of parsers determined by the user's current state (roles, embodied status).
    * **Parser Modes:**
        * **User Mode:** Simple keyword/command matching (e.g., `WHO`, `QUIT`, `COMMANDS`). Primarily for out-of-character (OOC) actions, account management, basic system interaction. Case-insensitive matching for keywords.
        * **Admin Mode:** Simple prefix/keyword matching, typically starting with `/` (e.g., `/create`, `/password`, `/shutdown`). For administrative actions. Case-insensitive matching for keywords after the prefix.
        * **Game Mode:** Complex NLP-based parser (MUD2-like, using Compromise NLP + Bartle's ideas) for in-character (IC) game actions (e.g., `look`, `get sword`, `attack goblin`). Case sensitivity might apply depending on the action/noun.
    * **Parser Stacks (Order matters - first match wins):**
        * **Unembodied User:** `[User]`
        * **Embodied User:** `[User, Game]` (Allows OOC commands even when playing a character)
        * **Unembodied Admin:** `[Admin, User]`
        * **Embodied Admin:** `[Admin, User, Game]`
    * **Implementation:**
        * The main `InputParser` module receives raw input and the user's session state (containing roles, character ID if embodied).
        * It determines the appropriate parser stack based on the state.
        * It iterates through the parsers in the stack:
            * The `Admin` parser checks for the `/` prefix. If matched, it identifies the admin command and arguments.
            * The `User` parser checks for known OOC keywords. If matched, it identifies the user command and arguments.
            * The `Game` parser uses Compromise/Bartle logic. If it successfully parses a game action, it identifies the verb, objects, etc.
        * The first parser in the stack to successfully recognize and parse the input "wins".
        * The parser returns a structured command object indicating the matched command, its arguments, and the mode it belongs to (User, Admin, or Game).
    * **Extensibility:** Each parser mode should allow dynamic addition of commands/keywords via G code or configuration.

5.  G should be a very expressive language that functional, OO, and multiply-inherited (tightly bound with the game objects)
    * G code units are stored on objects, within attributes (probably one function/method per attribute).
    * LISP or Smalltalk isn't a bad starting place for the syntax, but let's use square brackets instead of parentheses.
    * G handles lists, sets, arrays, hashes, and similar data types primarily as strings with specific "syntactical dressing." Coercion to a structured type (like a list) is typically explicit, often performed by functions operating on these strings. For example, a string `"[1 2 3]"` can be treated as a list by a function like `[listlength "[1 2 3]"]` which would return `"3"`. However, if the string itself is an element in a list, its string nature is preserved: `[listlength ["[1 2 3]"]]` would return `"1"`.
    * G is loosely typed and is happy to treat anything as a string, and convert any string just in time (often explicitly via functions) to whatever type it expects.
    * Executing `@#someobjectid(params...)` returns a value after executing G code from the object's "run" attribute.
    * Executing `@#someobjectid.somefunctionname(params...)` returns a value after executing G code stored in the object's "somefunctionname" attribute.
    * G code is multi-threaded (conceptually, using async/promises for non-blocking operations) but operates within Node.js's single-threaded event loop model for its core execution.
    * The game executes `@#object.startup` after the engine is fully ready.
    * Most of the game physics is softcoded.
    * G supports external modules in text files (e.g., `.g` files), which are assigned to virtual objects, something like: `[load command-look.g, #command-look]`. These can be manually reloaded while the server is running (not hot reloads).
    * G prefers functions to operators, in the `[function param, param, param]` syntax, which is equivalent to `[function, param, param, param]` (as the `[]` denotes an ordered list).
    * **G Debugging:**
        * G will include a `print`-like function (e.g., `[log message]` or `[debug message]`) to output information to server logs or a developer console.
        * The server will have robust logging capabilities, configurable to trace G execution paths and variable states if needed.
        * Error reporting from G execution will be detailed, indicating the failing token/expression and a descriptive reason for the failure.
        * A step-through or trace debugger for G is considered out of scope for the Minimum Viable Product (MVP) but may be considered for future enhancements.

6.  G has some special unary operators and syntax:
    * `#` refers to an object id, which might have a namespace (e.g., `#game:a99df109`, `#core:object`).
    * `@` refers to the execution of something:
        * `@#object` runs the G code in the "run" attribute of `#object`.
        * `@variable_name` executes the G code stored in the G variable `variable_name`.
    * `.` is the attribute operator, so `#a.b` returns the value of the attribute "b" on object `#a`.
    * `"` sends a message (or game output) to any object.
        * `#a"You don't see anything"` sends the literal string "You don't see anything" to object `#a`.
        * `#a"@message"` executes the G code in the "message" attribute of object `#a` and sends the result. This allows for dynamic and complex message objects (e.g., containing text, formatting hints, message type).
    * `[]` denotes a list. Elements are delimited by spaces and/or commas. Extraneous spaces and commas are generally ignored, and consecutive commas do not create null or undefined elements but are effectively skipped. For example:
        * `[a b c]` is equivalent to `[a, b, c]`, `[ a, b,  c ]`, `[,a, b, c,]`, and `[a,,b,,,,c]` (which would result in a three-element list: `a`, `b`, `c`).
        * An empty string `""` is a valid list element and distinct from a skipped element. Thus, `[a,b,c]` is not equivalent to `[a,b,"",c]`. The language aims to avoid implicit null values in lists created this way.
        * Strings containing spaces or commas intended as single list elements would typically require quoting or a different G mechanism for their definition.
    * `:` has two uses:
        * 1) A separator for key:value pairs within G data structures (e.g., if G supports map-like string representations).
        * 2) Separator between an object id namespace and the object id (e.g. `#game:living_room` vs `#my_area:living_room`).

7.  A player's account (user) is stored in a separate place than the world database.
    * Store the user's email address, login id, login password (hashed securely), and real name following industry best practices for user security and PII.
    * Each user has zero or more game characters that they can connect to.
    * A user can connect to a game object ("enter the game" as a character, becoming "embodied") and start receiving that object's messages, which could be formatted in plain text or HTML or some other format.
    * **(Revised)** User state includes roles (e.g., 'player', 'admin', 'builder') and embodied status (whether connected to a character object).
    * Privileged users might be able to connect to (i.e., monitor messages from) any game object, perhaps many at a time. This typically means receiving text sent to the object's message-handling attribute/function (inherited from `#object`).
    * User account management will be done through the web UI - for now, just list, create, delete, and "play" (select/connect to) accounts/characters.
    * Telnet access connects the person to a welcome screen of text, then requires them to type `connect user password` (and fill in their `username` and `password`) to connect. Then they can use an in-game command like `connect character <character_name>` to start playing.
    * Before a user connects to a character (or if not connected to any character, i.e., "unembodied"), they are associated with a temporary, session-specific "user" object that inherits from a base `#user` type. This object allows them to utilize certain pre-character-connection in-game commands and is discarded upon disconnection.

8.  Server maintenance
    * Most server settings are stored as in-game attributes on an object called `#config`.
    * Settings required to get the server up and running (e.g., database connection strings, initial port numbers) are stored in a secure YAML text file within the game's deployment directory or via environment variables.
    * A robust logging system that can be altered on-the-fly, allowing logging of just about any game activity, even pre-filtered before logging (like "log all of this one player's activities and commands").
    * The code needs robust unit tests and integration tests for its inner workings.
    * The code needs robust unit tests and integration tests for the G language (parser, interpreter, standard library).
---
