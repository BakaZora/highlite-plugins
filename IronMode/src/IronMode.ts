import {Plugin, SettingsTypes} from "@highlite/plugin-api";
import { PanelManager } from "@highlite/plugin-api";
import ExampleHTML from "../resources/html/html.html";
import ExampleCSS from "../resources/css/base.css";
import ExampleImage from "../resources/images/icon.png";
import ExampleSound from "../resources/sounds/sample.mp3";

export default class IronMode extends Plugin {
    panelManager: PanelManager = new PanelManager();
    pluginName = "Iron Mode";
    author: string = "Zora";

    constructor() {
        super()
        this.settings.alertMessage = {
            text: 'Alert!',
            type: SettingsTypes.text,
            value: 'If you enable "Show Helm icons in chat", your username and iron settings will be sent to and stored in a remote database.',
            disabled: false,
            hidden: false,
            callback: () => {},
        };

        this.settings.disclaimerMessage = {
            text: 'Disclaimer!',
            type: SettingsTypes.text,
            value: 'This plugin relies on player trust! It\'s entirely possible to get around restrictions even when using this plugin.',
            disabled: false,
            hidden: false,
            callback: () => {
                // Debug method to display UUID
                if (this.settings.disclaimerMessage.value == 'UUID') {
                    this.settings.uuid.hidden = false;
                } else {
                    this.settings.uuid.hidden = true;  
                }
            },
        };

        this.settings.sendRecieveData = {
            text: 'Show Helms in Chat',
            type: SettingsTypes.checkbox,
            value: false,
            callback: () => {},
        };

        this.settings.isIron = {
            text: 'I am an Iron',
            type: SettingsTypes.checkbox,
            value: false,
            callback: () => {
                this.handleViewIronSettings(this.settings.isIron.value as boolean);
            },
            onLoaded: () => {
                this.handleViewIronSettings(this.settings.isIron.value as boolean);
            },
        };

        this.settings.isUltimate = {
            text: 'I am Ultimate',
            type: SettingsTypes.checkbox,
            value: false,
            hidden: true, // Initially hidden until isIron is true
            callback: () => {},
        };

        this.settings.isHardcore = {
            text: 'I am Hardcore',
            type: SettingsTypes.checkbox,
            value: false,
            hidden: true, // Initially hidden until isIron is true
            disabled: false, // Will be set dynamically based on if death is stored
            callback: () => {},
        };

        this.settings.groupNames = {
            text: 'Group Mates',
            type: SettingsTypes.text,
            value: '',
            hidden: true, // Initially hidden until isIron is true
            callback: () => {},
        };

        this.settings.updateButton = {
            text: 'Update Status',
            type: SettingsTypes.button,
            value: 'Update',
            hidden: true, // Initially hidden until isIron is true
            callback: () => {},
        };

        this.settings.uuid = {
            text: 'UUID', // Hidden setting
            type: SettingsTypes.text,
            value: '',
            callback: () => {},
            hidden: true, // Always hidden from UI
            onLoaded: () => {
                this.ensureUUID(); // Validate UUID exists on load, else generate one
            }
        };

        this.settings.hasDied = {
            text: 'Hardcore Death Status', // Hidden setting
            type: SettingsTypes.checkbox,
            value: false,
            callback: () => {},
            hidden: true, // Always hidden from UI
        };
    };

    private handleViewIronSettings(isIron: boolean): void {
        if (isIron) {
            this.settings.isUltimate.hidden = false;
            this.settings.isHardcore.hidden = false;
            this.settings.groupNames.hidden = false;
            this.settings.updateButton.hidden = false;
        } else {
            this.settings.isUltimate.hidden = true;
            this.settings.isHardcore.hidden = true;
            this.settings.groupNames.hidden = true;
            this.settings.updateButton.hidden = true;
        }
    }

    // Generate a simple UUID v4
    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Ensure the user has a UUID, generate one if they don't
    private ensureUUID(): void {
        if (!this.settings.uuid.value || this.settings.uuid.value === '') {
            const newUUID = this.generateUUID();
            this.settings.uuid.value = newUUID;
        }
    }

    init(): void {
    }
    
    start(): void {
        this.log("IronMode started");
    }

    stop(): void {
        this.log("IronMode stopped");
    }
}

/*
TODO:
POST to database function, called every 5 minutes while showing helms is true.
- Also called on death (after updating settings).
- Called with manual button too that puts it in 5 min cooldown
- Send all settings to the database, including uuid as key
- ENSURE DATA IS CLEANSED IN LAMBDA
- ENSURE THERES A CHARACTER LIMIT ON STRINGS (Make it long so people can have massive groups of players, maybe like 1000 characters?)

GET from database function, called every 5 minutes while show helms is true (could this just be a return from the POST?)
- Get call to database, returns a list of usernames and their iron status (IM, HCIM, UIM, HCUIM, GIM, HCCGIM, UGIM, HCUGIM)
  - This will be determined by the settings of the user and calculated inside the GET function on the lambda, so if they are an iron, it will return their status
- Different helmet icon and colour per iron status:
  - regular irons = full helm // group irons = med helm
  - iron = iron // hardcore = pig iron // ultimate = silver // hcuim = palladium
- Store list locally for user
- Insert helmet next to username in chat for player if show helms is true

Track if a player has died and set the hasDied setting to true, as well as disabling it

Remove trade for all players (except group mates) if isIron is true

Remove bank options for players if isUltimate is true
*/
