/**
 * Complete Telegram Bot integration service
 * Handles both storage and messaging functionality
 */

// Storage-related interfaces and types
interface TelegramCredentials {
  botToken: string;
  chatId: string;
}

// Client-related interfaces
interface ChecklistItem {
  name: string;
  quantity: string;
  unit: string;
}

interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

interface SendMessageParams {
  chat_id: string;
  text: string;
  reply_markup?: InlineKeyboardMarkup;
}

const STORAGE_KEY = 'telegram_credentials';

/**
 * Secure storage utility for Telegram bot credentials
 * 
 * SECURITY NOTE: Browser localStorage is not completely secure. 
 * Bot tokens stored here can be accessed by:
 * - Browser extensions
 * - XSS attacks
 * - Anyone with physical access to the device
 * 
 * Only use this for personal/trusted environments.
 */
export class TelegramStorage {
  /**
   * Save Telegram credentials to localStorage
   */
  static saveCredentials(credentials: TelegramCredentials): void {
    try {
      // Simple encryption using btoa (base64) - provides minimal obfuscation
      // For better security, consider using crypto-js or similar
      const encoded = btoa(JSON.stringify(credentials));
      localStorage.setItem(STORAGE_KEY, encoded);
    } catch (error) {
      console.error('Failed to save Telegram credentials:', error);
      throw new Error('Failed to save credentials');
    }
  }

  /**
   * Load Telegram credentials from localStorage
   */
  static loadCredentials(): TelegramCredentials | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const decoded = atob(stored);
      const credentials = JSON.parse(decoded) as TelegramCredentials;
      
      // Validate the structure
      if (!credentials.botToken || !credentials.chatId) {
        this.clearCredentials();
        return null;
      }

      return credentials;
    } catch (error) {
      console.error('Failed to load Telegram credentials:', error);
      this.clearCredentials();
      return null;
    }
  }

  /**
   * Check if credentials are stored
   */
  static hasCredentials(): boolean {
    return this.loadCredentials() !== null;
  }

  /**
   * Clear stored credentials
   */
  static clearCredentials(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Validate that credentials are properly formatted
   */
  static validateCredentials(credentials: Partial<TelegramCredentials>): boolean {
    if (!credentials.botToken || !credentials.chatId) {
      return false;
    }

    // Basic bot token validation (should start with a number and contain colon)
    const botTokenPattern = /^\d+:[A-Za-z0-9_-]+$/;
    if (!botTokenPattern.test(credentials.botToken)) {
      return false;
    }

    // Chat ID should be a number (can be negative for groups)
    const chatId = credentials.chatId.toString();
    if (!/^-?\d+$/.test(chatId)) {
      return false;
    }

    return true;
  }
}

/**
 * Client-side Telegram Bot API interface
 * Sends messages directly to Telegram using their HTTP API
 */
export class TelegramClient {
  private static readonly TELEGRAM_API_URL = 'https://api.telegram.org/bot';
  private static readonly CHECK_CHAR = '✅';
  private static readonly UNCHECK_CHAR = '⬜';
  private static isPolling = false;
  private static pollingOffset = 0;

  /**
   * Send a checklist to Telegram with interactive buttons
   */
  static async sendChecklist(checklistItems: ChecklistItem[], title: string = 'Grocery List'): Promise<void> {
    const credentials = TelegramStorage.loadCredentials();
    if (!credentials) {
      throw new Error('Telegram credentials not configured. Please set up bot token and chat ID in settings.');
    }

    // Convert checklist items to formatted strings
    const todos = checklistItems.map(item => 
      `${item.name}: ${item.quantity} ${item.unit}`
    );

    // Create inline keyboard with toggle buttons
    const keyboard: InlineKeyboardButton[][] = todos.map((todo, index) => [
      {
        text: `${this.UNCHECK_CHAR} ${todo}`,
        callback_data: `toggle__${index}`
      }
    ]);

    const message: SendMessageParams = {
      chat_id: credentials.chatId,
      text: title,
      reply_markup: {
        inline_keyboard: keyboard
      }
    };

    await this.sendMessage(credentials.botToken, message);
  }

  /**
   * Send a simple text message to Telegram
   */
  static async sendTextMessage(text: string): Promise<void> {
    const credentials = TelegramStorage.loadCredentials();
    if (!credentials) {
      throw new Error('Telegram credentials not configured. Please set up bot token and chat ID in settings.');
    }

    const message: SendMessageParams = {
      chat_id: credentials.chatId,
      text: text
    };

    await this.sendMessage(credentials.botToken, message);
  }

  /**
   * Test the Telegram connection with current credentials
   */
  static async testConnection(): Promise<boolean> {
    try {
      const credentials = TelegramStorage.loadCredentials();
      if (!credentials) {
        return false;
      }

      // Test by getting bot info
      await this.getBotInfo(credentials.botToken);
      return true;
    } catch (error) {
      console.error('Telegram connection test failed:', error);
      return false;
    }
  }

  /**
   * Get bot information to validate the token
   */
  private static async getBotInfo(botToken: string): Promise<any> {
    const response = await fetch(`${this.TELEGRAM_API_URL}${botToken}/getMe`);
    
    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description}`);
    }

    return data.result;
  }

  /**
   * Send a message to Telegram using the Bot API
   */
  private static async sendMessage(botToken: string, message: SendMessageParams): Promise<void> {
    const url = `${this.TELEGRAM_API_URL}${botToken}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Telegram API error response:', errorText);
      throw new Error(`Failed to send message to Telegram: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description}`);
    }
  }

  /**
   * Validate that we can reach Telegram's API (basic connectivity test)
   */
  static async validateApiAccess(): Promise<boolean> {
    try {
      // Make a simple request to Telegram's API without a token to check connectivity
      const response = await fetch(`${this.TELEGRAM_API_URL}invalid/getMe`);
      // We expect this to fail, but if it fails with 404 (not found), the API is reachable
      return response.status === 404;
    } catch (error) {
      console.error('Cannot reach Telegram API:', error);
      return false;
    }
  }

  /**
   * Start polling for Telegram updates to handle button clicks
   * This enables interactive checklist functionality
   */
  static startInteractiveMode(): void {
    if (this.isPolling) {
      console.log('Interactive mode already running');
      return;
    }

    const credentials = TelegramStorage.loadCredentials();
    if (!credentials) {
      console.error('Cannot start interactive mode: No credentials configured');
      return;
    }

    this.isPolling = true;
    this.pollForUpdates(credentials.botToken);
    console.log('🤖 Telegram interactive mode started - buttons will now work!');
  }

  /**
   * Stop polling for updates
   */
  static stopInteractiveMode(): void {
    this.isPolling = false;
    console.log('🤖 Telegram interactive mode stopped');
  }

  /**
   * Check if interactive mode is running
   */
  static isInteractiveModeRunning(): boolean {
    return this.isPolling;
  }

  /**
   * Poll for updates from Telegram (for button clicks)
   */
  private static async pollForUpdates(botToken: string): Promise<void> {
    while (this.isPolling) {
      try {
        const response = await fetch(`${this.TELEGRAM_API_URL}${botToken}/getUpdates?offset=${this.pollingOffset}&timeout=30`);
        
        if (!response.ok) {
          console.error('Failed to poll updates:', response.statusText);
          await this.sleep(5000); // Wait 5 seconds before retry
          continue;
        }

        const data = await response.json();
        if (!data.ok) {
          console.error('Telegram API error:', data.description);
          await this.sleep(5000);
          continue;
        }

        // Process updates
        for (const update of data.result) {
          this.pollingOffset = update.update_id + 1;
          
          if (update.callback_query) {
            await this.handleButtonClick(botToken, update.callback_query);
          }
        }

        // Small delay to prevent excessive API calls
        await this.sleep(100);
      } catch (error) {
        console.error('Error in polling loop:', error);
        await this.sleep(5000);
      }
    }
  }

  /**
   * Handle button click callbacks (toggle checklist items)
   */
  private static async handleButtonClick(botToken: string, callbackQuery: any): Promise<void> {
    try {
      // Answer the callback query
      await fetch(`${this.TELEGRAM_API_URL}${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQuery.id })
      });

      const message = callbackQuery.message;
      if (!message.reply_markup) {
        console.log('No reply markup found for message');
        return;
      }

      // Rebuild keyboard with toggled state
      const newKeyboard: InlineKeyboardButton[][] = [];
      
      for (let i = 0; i < message.reply_markup.inline_keyboard.length; i++) {
        const oldButton = message.reply_markup.inline_keyboard[i][0];
        let btnText = oldButton.text.replace(`${this.UNCHECK_CHAR} `, '').replace(`${this.CHECK_CHAR} `, '');
        
        // Check if this is the button that was clicked
        let checked = oldButton.text.startsWith(this.CHECK_CHAR);
        if (callbackQuery.data === `toggle__${i}`) {
          checked = !checked; // Toggle the clicked button
        }

        const newText = `${checked ? this.CHECK_CHAR : this.UNCHECK_CHAR} ${btnText}`;
        newKeyboard.push([{
          text: newText,
          callback_data: `toggle__${i}`
        }]);
      }

      // Update the message with new keyboard
      await fetch(`${this.TELEGRAM_API_URL}${botToken}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: message.chat.id,
          message_id: message.message_id,
          text: message.text,
          reply_markup: {
            inline_keyboard: newKeyboard
          }
        })
      });

      console.log('✅ Button click handled - checklist updated!');
    } catch (error) {
      console.error('Error handling button click:', error);
    }
  }

  /**
   * Sleep utility for polling delays
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export types for external use
export type { TelegramCredentials, ChecklistItem };
