import {Plugin, SettingsTypes} from "@highlite/plugin-api";
import { PanelManager } from "@highlite/plugin-api";
import IronModeCss from "../resources/css/ironmode.css";

// Import regular iron helm icons
import IMHelm from "../resources/images/IMHelm.png";
import HCIMHelm from "../resources/images/HCIMHelm.png"; //TODO
import UIMHelm from "../resources/images/UIMHelm.png"; //TODO
import HCUIMHelm from "../resources/images/HCUIMHelm.png"; //TODO

// Import group iron helm icons
import GIMHelm from "../resources/images/GIMHelm.png";
import HCGIMHelm from "../resources/images/HCGIMHelm.png"; //TODO
import UGIMHelm from "../resources/images/UGIMHelm.png"; //TODO
import HCUGIMHelm from "../resources/images/HCUGIMHelm.png"; //TODO

export default class IronMode extends Plugin {
    panelManager: PanelManager = new PanelManager();
    pluginName = "Iron Mode";
    author: string = "Zora";
    private chatObserver: MutationObserver | null = null;
    private contextMenuObserver: MutationObserver | null = null;
    private playerStatusCache: Map<string, { status: string; timestamp: number }> = new Map(); // Cache for username -> {status, timestamp}
    private updateInterval: number | null = null;
    private readonly CACHE_TTL = 15 * 60 * 1000; // 15 minutes in milliseconds
    private updateButtonCooldownTimeout: number | null = null;

    constructor() {
        super()
        this.settings.alertMessage = {
            text: 'Notice!',
            type: SettingsTypes.warning,
            value: 'If you enable "Show Helm icons in chat" and "I am an Iron", your username and iron settings are stored for chat functionality.',
            disabled: false,
            hidden: false,
            callback: () => {},
        };

        this.settings.disclaimerMessage = {
            text: 'Disclaimer!',
            type: SettingsTypes.info,
            value: 'This plugin relies on player trust! It\'s entirely possible to get around restrictions even when using this plugin.',
            disabled: false,
            hidden: false,
            callback: () => {},
        };

        this.settings.sendRecieveData = {
            text: 'Show Helms in Chat',
            type: SettingsTypes.checkbox,
            value: false,
            callback: () => {
                if (this.settings.sendRecieveData.value) {
                    this.startPeriodicUpdates();
                } else {
                    this.stopPeriodicUpdates();
                }
            },
            onLoaded: () => {
                if (this.settings.sendRecieveData.value) {
                    this.startPeriodicUpdates();
                }
            }, 
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
            type: SettingsTypes.textarea,
            value: '',
            hidden: true, // Initially hidden until isIron is true
            callback: () => {},
        };

        this.settings.updateButton = {
            text: 'Update Status',
            type: SettingsTypes.button,
            value: 'Update',
            hidden: true, // Initially hidden until isIron is true
            callback: () => {
                this.log("Manual update triggered");
                this.updatePlayerStatusData(); // POST user data to database
                this.playerStatusCache.clear(); // Clear cache
                
                // Disable button and start cooldown
                this.settings.updateButton.disabled = true;
                this.settings.updateButton.value = 'Please wait 5 minutes';
                
                this.updateButtonCooldownTimeout = setTimeout(() => {
                    this.settings.updateButton.disabled = false;
                    this.settings.updateButton.value = 'Update';
                    this.updateButtonCooldownTimeout = null;
                }, 60 * 1000); // 1 minute
            },
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
        this.injectStyles();
        this.initializeChatObserver();
        this.initializeContextMenuObserver();
        
        // Start the periodic update cycle if helm display is enabled
        if (this.settings.sendRecieveData.value) {
            this.startPeriodicUpdates();
        }
    }

    stop(): void {
        this.log("IronMode stopped");
        this.disconnectChatObserver();
        this.disconnectContextMenuObserver();
        this.removeStyles();
        this.stopPeriodicUpdates();
        
        // Clear button cooldown if active
        if (this.updateButtonCooldownTimeout) {
            clearTimeout(this.updateButtonCooldownTimeout);
            this.updateButtonCooldownTimeout = null;
            this.settings.updateButton.disabled = false;
            this.settings.updateButton.value = 'Update';
        }
    }

    // Start periodic updates for player status data
    private startPeriodicUpdates(): void {
        if (this.playerStatusCache.size === 0) {
            this.log("No player status data available, fetching initial data...");
            this.updatePlayerStatusData();
        }
        
        // Set up periodic updates every 5 minutes
        if (!this.updateInterval) {
            this.updateInterval = setInterval(() => {
                if (this.settings.sendRecieveData.value) {
                    this.updatePlayerStatusData();
                }
            }, 5 * 60 * 1000); // 5 minutes
        }
    }

    // Stop periodic updates
    private stopPeriodicUpdates(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    // Remove injected styles
    private removeStyles(): void {
        const existingStyles = document.querySelectorAll('style[data-iron-mode-plugin]');
        existingStyles.forEach(style => style.remove());
    }

    // Inject CSS styles for helm icons
    private injectStyles(): void {
        // Remove existing styles first to avoid duplicates
        this.removeStyles();
        
        const styleElement = document.createElement('style');
        styleElement.setAttribute('data-iron-mode-plugin', 'true');
        styleElement.textContent = IronModeCss;

        document.head.appendChild(styleElement);
    }

    // Initialize the chat message observer
    private initializeChatObserver(): void {
        // Find the chat container
        const chatContainer = document.querySelector('#hs-public-message-list');
        
        if (!chatContainer) {
            this.log("Chat container (#hs-public-message-list) not found, retrying in 2 seconds...");
            setTimeout(() => this.initializeChatObserver(), 2000);
            return;
        }

        this.log("Chat container found, setting up observer");

        // Create a MutationObserver to watch for new chat messages
        this.chatObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (this.settings.sendRecieveData.value) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as Element;
                            
                            // Check if this is a chat message container
                            if (element.classList.contains('hs-chat-message-container')) {
                                this.processChatMessage(element);
                            }
                            
                            // Also check for chat messages that might be added within added nodes
                            const chatMessages = element.querySelectorAll('.hs-chat-message-container');
                            chatMessages.forEach(msg => this.processChatMessage(msg));
                        }
                    });
                }
            });
        });

        // Start observing the chat container for child additions
        this.chatObserver.observe(chatContainer, {
            childList: true,
            subtree: true
        });
        
        // Also process any existing chat messages that might already be in the DOM
        const existingMessages = chatContainer.querySelectorAll('.hs-chat-message-container');
        this.log(`Found ${existingMessages.length} existing chat messages to process`);
        existingMessages.forEach(msg => this.processChatMessage(msg));
    }

    // Disconnect the chat observer
    private disconnectChatObserver(): void {
        if (this.chatObserver) {
            this.chatObserver.disconnect();
            this.chatObserver = null;
        }
    }

    // Initialize the context menu observer
    private initializeContextMenuObserver(): void {
        // Find the screen mask container
        const screenMask = document.querySelector('#hs-screen-mask');
        
        if (!screenMask) {
            this.log("Screen mask (#hs-screen-mask) not found, retrying in 2 seconds...");
            setTimeout(() => this.initializeContextMenuObserver(), 2000);
            return;
        }

        this.log("Screen mask found, setting up context menu observer");

        // Create a MutationObserver to watch for context menu additions
        this.contextMenuObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (this.settings.isIron.value) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as Element;
                            
                            // Check if this is a context menu wrapper
                            if (element.id === 'hs-context-menu-wrapper') {
                                
                                this.settings.isIron ?? this.log(`Removing "Trade With" options from non-group members in context menu`);
                                this.processContextMenu(element);
                            }
                            
                            // Also check for context menus that might be added within added nodes
                            const contextMenus = element.querySelectorAll('#hs-context-menu-wrapper');
                            contextMenus.forEach(menu => this.processContextMenu(menu));
                        }
                    });
                }
            });
        });

        // Start observing the screen mask for child additions
        this.contextMenuObserver.observe(screenMask, {
            childList: true,
            subtree: true
        });
    }

    // Disconnect the context menu observer
    private disconnectContextMenuObserver(): void {
        if (this.contextMenuObserver) {
            this.contextMenuObserver.disconnect();
            this.contextMenuObserver = null;
        }
    }

    // Process context menu and remove trade options for iron players
    private processContextMenu(contextMenuElement: Element): void {
        try {
            // Find all context menu items
            const menuItems = contextMenuElement.querySelectorAll('.hs-context-menu__item');
            
            menuItems.forEach((item) => {
                // Find the action name span within this item
                const actionNameSpan = item.querySelector('.hs-context-menu__item__action-name');
                
                if (actionNameSpan && actionNameSpan.textContent?.trim() === 'Trade With') {
                    // Get the username for logging purposes
                    const usernameSpan = item.querySelector('.hs-context-menu__item__entity-name');
                    const username = usernameSpan?.textContent?.trim() || 'Unknown';
                    
                    // Check if this is a group member before hiding
                    if (this.settings.groupNames.value && this.settings.groupNames.value.toString().toLowerCase().includes(username.toLowerCase())) {
                        this.log(`Trade option for ${username} is a group member, keeping.`);
                        return;
                    }
                    
                    this.log(`Hiding "Trade With" option for ${username} from context menu`);
                    // Hide the element instead of removing it to avoid DOM cleanup issues
                    (item as HTMLElement).style.display = 'none';
                    // Also disable pointer events to make it completely non-interactive
                    (item as HTMLElement).style.pointerEvents = 'none';
                    // Mark it as hidden by our plugin for potential cleanup later
                    item.setAttribute('data-iron-mode-hidden', 'true');
                }
            });

        } catch (error) {
            this.log(`Error processing context menu: ${error}`);
        }
    }

    // Process a new chat message and inject helm icon if needed
    private processChatMessage(messageElement: Element): void {
        try {
            // Check if this message hasn't been processed already
            if (messageElement.hasAttribute('data-iron-mode-processed')) {
                return;
            }

            // Mark as processed to avoid duplicate processing
            messageElement.setAttribute('data-iron-mode-processed', 'true');

            // Check if this is a trade message first
            const tradeMessageSpan = messageElement.querySelector('.hs-text--magenta');
            if (tradeMessageSpan && this.settings.isIron.value) {
                const messageText = tradeMessageSpan.textContent?.trim();
                if (messageText && messageText.includes('wants to trade with you')) {
                    // Extract username from the trade message
                    const username = messageText.replace(' wants to trade with you', '').trim();
                    this.handleTradeMessage(messageElement, username);
                    return; // Early return after handling trade message
                }
            }

            // Find the username span (the one with pre-text class that contains the username)
            const usernameSpan = messageElement.querySelector('.hs-chat-menu__pre-text');
            
            if (!usernameSpan) {
                return;
            }

            // Extract username (remove the colon at the end)
            const usernameText = usernameSpan.textContent?.replace(':', '').trim();
            
            if (!usernameText) {
                return;
            }

            // Get the iron status for this user
            this.getIronStatusForUser(usernameText).then(ironStatus => {
                if (ironStatus) {
                    this.log(`Adding ${ironStatus} helmet icon to ${usernameText}'s message.`);
                    this.injectHelmIcon(usernameSpan, ironStatus);
                }
            });

        } catch (error) {
            this.log(`Error processing chat message: ${error}`);
        }
    }

    // Handle trade messages for iron players
    private handleTradeMessage(messageElement: Element, username: string): void {
        try {
            // If the trader is a group member, return early
            if (this.settings.groupNames.value && this.settings.groupNames.value.toString().toLowerCase().includes(username.toLowerCase())) {
                this.log(`Trade request from ${username} is a group member, allowing.`);
                return;
            }

            this.log(`Trade request intercepted from ${username}, blocking for iron player`);
            
            // Find the chat container to inject the new message
            const chatContainer = document.querySelector('#hs-public-message-list');
            
            if (!chatContainer) {
                this.log("Chat container not found when trying to inject blocked trade message");
                return;
            }

            // Remove the original trade message
            messageElement.remove();

            // Create the replacement message
            const newMessageElement = document.createElement('li');
            const messageContainer = document.createElement('div');
            messageContainer.className = 'hs-chat-message-container';
            
            const messageSpan = document.createElement('span');
            messageSpan.className = 'hs-text--red hs-chat-menu__message-text-container';
            messageSpan.textContent = `${username} attempted to trade you, but you stand alone.`;
            
            messageContainer.appendChild(messageSpan);
            newMessageElement.appendChild(messageContainer);
            
            // Add to bottom of chat
            chatContainer.appendChild(newMessageElement);
            
        } catch (error) {
            this.log(`Error handling trade message: ${error}`);
        }
    }

    // Get iron status for a user from stored player data
    private async getIronStatusForUser(username: string): Promise<string | null> {
        const normalizedUsername = username.toLowerCase();
        const now = Date.now();
        
        // Check cache first
        const cachedEntry = this.playerStatusCache.get(normalizedUsername);
        if (cachedEntry) {
            if ((now - cachedEntry.timestamp) < this.CACHE_TTL) {
                return cachedEntry.status;
            } else {
                // Remove expired entry
                this.playerStatusCache.delete(normalizedUsername);
            }
        }
        
        try {
            const url = `https://highl1te-hardcore-api.bgscrew.com/IronStatus?username=${encodeURIComponent(normalizedUsername)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            const data = await response.text();
            const status = data || null;

            // Cache the result
            if (status) {
                this.playerStatusCache.set(normalizedUsername, { status, timestamp: now });
            }
            return status;
        } catch (error) {
            return null;
        }
    }


    private async updatePlayerStatusData(): Promise<void> {
        this.log("Updating player status data...");
        // Get players name from hook
        const normalizedUsername = this.gameHooks.EntityManager.Instance.MainPlayer._name.toLowerCase();

        try {
            // Collect player settings data
            const playerSettings = {
                username: normalizedUsername,
                uuid: this.settings.uuid.value,
                isIron: this.settings.isIron.value,
                isHardcore: this.settings.isHardcore.value,
                isUltimate: this.settings.isUltimate.value,
                groupMates: this.settings.groupNames.value ? [this.settings.groupNames.value] : [],
            };

            // Parse playerSettings into a json to send to server
            const playerSettingsJson = JSON.stringify(playerSettings);

            // POST to database
            await fetch('http://highl1te-hardcore-api.bgscrew.com/IronStatus', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: playerSettingsJson
            });

        } catch (error) {
            this.log(`Error fetching player status data: ${error}`);
        }
    }

    // Inject the appropriate helm icon before the username
    private injectHelmIcon(usernameSpan: Element, ironStatus: string): void {
        // Check if icon already exists
        if (usernameSpan.querySelector('.iron-mode-helm-icon')) {
            return;
        }

        // Create the helm icon element
        const helmIcon = document.createElement('img');
        helmIcon.className = 'iron-mode-helm-icon';
        helmIcon.style.width = '16px';
        helmIcon.style.height = '16px';
        helmIcon.style.verticalAlign = 'middle';
        helmIcon.style.display = 'inline-block';
        
        // Set the appropriate icon and color based on iron status
        const iconInfo = this.getHelmIconInfo(ironStatus);
        helmIcon.src = iconInfo.src;
        helmIcon.alt = `${ironStatus} helm`;
        helmIcon.title = `${iconInfo.description}`;

        // Insert the icon at the beginning of the username span
        usernameSpan.insertBefore(helmIcon, usernameSpan.firstChild);
    }

    // Get helm icon information based on iron status
    private getHelmIconInfo(ironStatus: string): { src: string; color?: string; description: string } {

        switch (ironStatus) {
            case 'IM': // Regular Iron
                return {
                    src: IMHelm,
                    description: 'Ironman'
                };
            
            case 'HCIM': // Hardcore Iron
                return {
                    src: HCIMHelm,
                    description: 'Hardcore Ironman'
                };
            
            case 'UIM': // Ultimate Iron
                return {
                    src: UIMHelm,
                    description: 'Ultimate Ironman'
                };
            
            case 'HCUIM': // Hardcore Ultimate Iron
                return {
                    src: HCUIMHelm,
                    description: 'Hardcore Ultimate Ironman'
                };
            
            case 'GIM': // Group Iron
                return {
                    src: GIMHelm,
                    description: 'Group Ironman'
                };
            
            case 'HCGIM': // Hardcore Group Iron
                return {
                    src: HCGIMHelm,
                    description: 'Hardcore Group Ironman'
                };
            
            case 'UGIM': // Ultimate Group Iron
                return {
                    src: UGIMHelm,
                    description: 'Ultimate Group Ironman'
                };
            
            case 'HCUGIM': // Hardcore Ultimate Group Iron
                return {
                    src: HCUGIMHelm,
                    description: 'Hardcore Ultimate Group Ironman'
                };
            
            default:
                return {
                    src: IMHelm, // Default to regular iron helm
                    description: 'Unknown Iron Status'
                };
        }
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
