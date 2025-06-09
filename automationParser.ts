import { Page, BrowserContext } from "@browserbasehq/stagehand";

// Interface for the function that handles a specific browser action
interface ActionHandler {
  (page: Page, params: string[]): Promise<any>;
}

// Interface for defining a registered action
interface RegisteredAction {
  keywords: string[]; // e.g., ["go", "to"] or ["click"]
  handler: ActionHandler;
  paramUsage: string; // e.g. "<url>" or "<selector> <text>"
  minParams?: number; // Minimum number of parameters after keywords
  opensNewPage?: boolean; // Hint that this action might open a new page
}

export class AutomationParser {
  private page: Page;
  private context: BrowserContext; // Store context to listen for new pages
  private registeredActions: Map<string, RegisteredAction>;

  constructor(page: Page, context: BrowserContext) {
    this.page = page;
    this.context = context;
    this.registeredActions = new Map();
    this.registerCoreActions();

    // Listen for new pages and update our page reference
    this.context.on('page', async (newPage) => {
      console.log('New page/tab opened. Switching context to the new page.');
      // It's important to wait for the new page to load to some extent
      // await newPage.waitForLoadState('domcontentloaded'); // Or 'load' or 'networkidle'
      this.page = newPage as Page; 
      // Ensure the new page also has default timeouts set if necessary, 
      // though Stagehand's Page object might handle this.
      // newPage.setDefaultNavigationTimeout(60000);
      // newPage.setDefaultTimeout(60000);
    });
  }

  private registerCoreActions() {
    // Go To: go to <url>
    this.registeredActions.set("goto", {
      keywords: ["go", "to"],
      minParams: 1,
      paramUsage: "<url>",
      handler: async (page, params) => {
        let url = params[0];
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        return page.goto(url);
      }
    });

    // Click: click <selector>
    this.registeredActions.set("click", {
      keywords: ["click"],
      minParams: 1,
      paramUsage: "<selector>",
      opensNewPage: true, // Add this hint
      handler: async (page, params) => {
        const selector = params[0];
        const selectors = this.generateSmartSelectors(selector);
        const validSelector = await this.trySelectors(selectors);
        if (validSelector) {
          console.log(`Clicking element with selector: ${validSelector}`);
          // Playwright's click action itself doesn't return the new page directly
          // The 'page' event on the context will handle new page creation.
          return page.click(validSelector);
        }
        throw new Error(`Could not find element to click matching: ${selector}`);
      }
    });

    // Type: type <selector> <text>
    this.registeredActions.set("type", {
      keywords: ["type"],
      minParams: 2,
      paramUsage: "<selector> <text>",
      handler: async (page, params) => {
        const selector = params[0];
        const textToType = params[1];
        const selectors = this.generateSmartSelectors(selector);
        const validSelector = await this.trySelectors(selectors);
        if (validSelector) {
          console.log(`Typing "${textToType}" into element with selector: ${validSelector}`);
          // Wait for the element to be visible
          await page.waitForSelector(validSelector, { state: 'visible' });
          // Clear the input first
          await page.fill(validSelector, '');
          // Type the text
          await page.type(validSelector, textToType);
          // Press Enter after typing
          await page.keyboard.press('Enter');
          return true;
        }
        throw new Error(`Could not find element to type into matching: ${selector}`);
      }
    });

    // Wait: wait <seconds>
    this.registeredActions.set("wait", {
      keywords: ["wait"],
      minParams: 1,
      paramUsage: "<seconds>",
      handler: async (page, params) => {
        const seconds = parseFloat(params[0]);
        if (isNaN(seconds) || seconds < 0) {
          throw new Error(`Invalid wait duration: ${params[0]} seconds. Must be a non-negative number.`);
        }
        console.log(`Waiting for ${seconds} seconds...`);
        return page.waitForTimeout(seconds * 1000);
      }
    });

    // Screenshot: screenshot <filename>
    this.registeredActions.set("screenshot", {
      keywords: ["screenshot"],
      minParams: 1,
      paramUsage: "<filename>",
      handler: async (page, params) => {
        const filename = params[0];
        const path = (filename.endsWith(".png") || filename.endsWith(".jpg") || filename.endsWith(".jpeg"))
          ? filename
          : `${filename}.png`;
        console.log(`Taking screenshot and saving to: ${path}`);
        return page.screenshot({ path });
      }
    });

    // Extract Text: extract <selector>
    this.registeredActions.set("extract", {
      keywords: ["extract"],
      minParams: 1,
      paramUsage: "<selector>",
      handler: async (page, params) => {
        const selector = params[0];
        const selectors = this.generateSmartSelectors(selector);
        const validSelector = await this.trySelectors(selectors);
        if (validSelector) {
          const text = await page.$eval(validSelector, el => el.textContent);
          console.log(`Extracted text from ${validSelector}: "${text ? text.trim() : ''}"`);
          return text ? text.trim() : '';
        }
        throw new Error(`Could not find element to extract text from matching: ${selector}`);
      }
    });

    // Find Element: find element <selector>
    this.registeredActions.set("findelement", {
      keywords: ["find", "element"],
      minParams: 1,
      paramUsage: "<selector>",
      handler: async (page, params) => {
        const selector = params[0];
        const selectors = this.generateSmartSelectors(selector);
        const validSelector = await this.trySelectors(selectors);
        if (validSelector) {
          console.log(`Found element with selector: ${validSelector}`);
          // Wait for the element to be visible and clickable
          await page.waitForSelector(validSelector, { state: 'visible' });
          // Click the element to focus it
          await page.click(validSelector);
          return true;
        }
        throw new Error(`Could not find element matching: ${selector}`);
      }
    });

    // Press Key: pressKey <key>
    this.registeredActions.set("presskey", {
      keywords: ["pressKey"],
      minParams: 1,
      paramUsage: "<key>",
      handler: async (page, params) => {
        const key = params[0];
        console.log(`Pressing key: ${key}`);
        return page.keyboard.press(key);
      }
    });

    // Extract HTML: extractHTML <selector>
    this.registeredActions.set("extracthtml", {
      keywords: ["extractHTML"],
      minParams: 1,
      paramUsage: "<selector>",
      handler: async (page, params) => {
        const selector = params[0];
        const selectors = this.generateSmartSelectors(selector);
        const validSelector = await this.trySelectors(selectors);
        if (validSelector) {
          console.log(`Extracting HTML from ${validSelector}`);
          // Wait for the element to be visible
          await page.waitForSelector(validSelector, { state: 'visible' });
          // Get the HTML content
          const html = await page.$eval(validSelector, el => el.innerHTML);
          console.log(`Successfully extracted HTML content`);
          return html;
        }
        throw new Error(`Could not find element to extract HTML from matching: ${selector}`);
      }
    });
  }

  /**
   * Parses a single instruction line.
   * Returns an object with actionKey and params, or an error object.
   */
  private parseInstruction(instructionLine: string): { actionKey: string; params: string[] } | { error: string } {
    const trimmedLine = instructionLine.trim();
    if (!trimmedLine) return { error: "Empty instruction line." };

    // Special handling for pressKey command
    if (trimmedLine.toLowerCase().startsWith('presskey')) {
      const key = trimmedLine.split(/\s+/).slice(1).join(' ');
      return { actionKey: 'presskey', params: [key] };
    }

    // Special handling for extractHTML command
    if (trimmedLine.toLowerCase().startsWith('extracthtml')) {
      const selector = trimmedLine.split(/\s+/).slice(1).join(' ');
      return { actionKey: 'extracthtml', params: [selector] };
    }

    const parts = trimmedLine.split(/\s+/);
    const commandParts: string[] = [];

    for (const [actionKey, actionDef] of this.registeredActions.entries()) {
      if (parts.length < actionDef.keywords.length) continue;

      let match = true;
      for (let i = 0; i < actionDef.keywords.length; i++) {
        if (parts[i].toLowerCase() !== actionDef.keywords[i]) {
          match = false;
          break;
        }
      }

      if (match) {
        const paramArgs = parts.slice(actionDef.keywords.length);

        if (actionDef.minParams !== undefined && paramArgs.length < actionDef.minParams) {
          return { error: `Instruction '${trimmedLine}' - insufficient parameters for '${actionDef.keywords.join(" ")}'. Expected: ${actionDef.paramUsage}` };
        }

        // Handle multi-word parameters and special cases
        if (actionKey === "type") {
          // Handle type command with comma-separated selector and text
          const fullParam = paramArgs.join(" ");
          const [selector, ...textParts] = fullParam.split(",").map(s => s.trim());
          const text = textParts.join(",").trim();
          return { actionKey, params: [selector, text] };
        } else if ((actionKey === "goto" || actionKey === "click" || actionKey === "screenshot" || actionKey === "extract" || actionKey === "findelement") && paramArgs.length > 0) {
          return { actionKey, params: [paramArgs.join(" ")] };
        }
        
        return { actionKey, params: paramArgs };
      }
    }
    return { error: `Unknown instruction: ${trimmedLine}` };
  }

  private async executeAction(actionKey: string, params: string[]): Promise<any> {
    const actionDef = this.registeredActions.get(actionKey);
    if (!actionDef) {
      // This case should ideally be caught by parseInstruction
      throw new Error(`Unknown action key: ${actionKey}.`);
    }
    return actionDef.handler(this.page, params);
  }

  public async processInstruction(instruction: string): Promise<any> {
    const parsed = this.parseInstruction(instruction);

    if ('error' in parsed) {
      console.error(`Parse Error: ${parsed.error} (Instruction: "${instruction}")`);
      throw new Error(`Parse Error: ${parsed.error}`);
    }
    
    console.log(`Executing: ${instruction} on page: ${this.page.url()}`);
    const actionDef = this.registeredActions.get(parsed.actionKey);

    // Execute the action
    const result = await this.executeAction(parsed.actionKey, parsed.params);

    // If an action might open a new page, Playwright's context 'page' event should handle it.
    // We can add a small delay to allow the 'page' event to fire and update this.page
    // if an action is known to open new tabs.
    if (actionDef?.opensNewPage) {
        // Check if there are multiple pages in the context
        const pages = this.context.pages();
        if (pages.length > 0 && pages[pages.length - 1] !== this.page) {
            console.log(`Action '${parsed.actionKey}' may have opened a new tab. Verifying page context.`);
            // A more robust way is to rely on the 'page' event, but as a fallback:
            const newPageCandidate = pages[pages.length - 1];
            // A simple check, or you could try to bring it to front and see if URL changes
            // For now, the 'page' event listener is the primary mechanism.
            // If this.page wasn't updated by the event yet, we might force it here, but it's tricky.
            // await newPageCandidate.waitForLoadState('domcontentloaded').catch(() => {}); // ensure it's somewhat ready
            // this.page = newPageCandidate;
            // console.log('Switched to most recent page in context.');
        }
        await this.page.waitForTimeout(500); // Small delay for events to settle
    }

    return result;
  }

  public async processInstructions(instructions: string[]): Promise<any[]> {
    const results = [];
    for (const instruction of instructions) {
      if (!instruction || instruction.startsWith("#")) { // Skip empty lines or comments
        continue;
      }
      try {
        // Ensure 'this.page' is the most current page before processing instruction
        // This is particularly important if a previous instruction opened a new tab.
        const currentPages = this.context.pages();
        if (currentPages.length > 0 && this.page !== currentPages[currentPages.length -1]) {
            // This check might be redundant if the 'page' event listener is working perfectly
            // but can serve as a safeguard.
            // console.log("Context has multiple pages. Ensuring parser is on the latest page.");
            // this.page = currentPages[currentPages.length - 1];
        }
        const result = await this.processInstruction(instruction);
        results.push({ instruction, result, success: true });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Log which page URL the error occurred on for better debugging
        let pageUrl = 'unknown';
        try {
          pageUrl = this.page.url();
        } catch (e) { /* page might be closed */ }
        console.error(`Error executing instruction "${instruction}" on page ${pageUrl}: ${errorMessage}`);
        results.push({
          instruction,
          error: errorMessage,
          success: false
        });
      }
    }
    return results;
  }

  // --- Helper methods for smart selectors (can be kept from original) ---
  private generateSmartSelectors(selector: string): string[] {
    const cleanSelector = selector.replace(/['"`]/g, '').trim();
    return [
      selector, // Original selector
      `input[placeholder*="${cleanSelector}"]`, `textarea[placeholder*="${cleanSelector}"]`, `[placeholder*="${cleanSelector}"]`,
      `input[aria-label*="${cleanSelector}"]`, `[aria-label*="${cleanSelector}"]`,
      `input[name*="${cleanSelector}"]`, `[name*="${cleanSelector}"]`,
      `input[id*="${cleanSelector}"]`, `[id*="${cleanSelector}"]`, `#${cleanSelector}`,
      `button:has-text("${cleanSelector}")`, `a:has-text("${cleanSelector}")`,
      `text="${cleanSelector}"`, `*:has-text("${cleanSelector}")`,
      `.${cleanSelector}`, // Class
      `[data-testid="${cleanSelector}"]`, `[data-test="${cleanSelector}"]`,
      `[data-cy="${cleanSelector}"]`, `[data-qa="${cleanSelector}"]`
    ];
  }

  private async trySelectors(selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
      try {
        const element = await this.page.waitForSelector(selector, { timeout: 1000, state: "attached" }); // Quick check
        if (element) {
          // Check for visibility if possible, though waitForSelector with 'visible' state can be slow for trying many.
          // For now, 'attached' is a good first pass. The action itself (click, type) will fail if not interactable.
          return selector;
        }
      } catch (error) {
        // Selector not found or not attached, try next one
      }
    }
    return null;
  }
}