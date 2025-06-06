import { Page } from "@browserbasehq/stagehand";

// Define the structure for automation actions
interface ActionDefinition {
  keyword: string;
  description: string;
  parameters: string[];
}

// Define all available actions based on your JSON data
const availableActions: ActionDefinition[] = [
  { keyword: "goto", description: "Navigates to a specific URL", parameters: ["url"] },
  { keyword: "click", description: "Clicks an element matching the selector", parameters: ["selector"] },
  { keyword: "type", description: "Types text into an input field", parameters: ["selector", "text"] },
  { keyword: "waitForSelector", description: "Waits for an element to appear", parameters: ["selector"] },
  { keyword: "screenshot", description: "Takes a screenshot of the page", parameters: ["path"] },
  { keyword: "extractHTML", description: "Extracts HTML content from an element", parameters: ["selector"] },
  { keyword: "extractText", description: "Extracts text content from an element", parameters: ["selector"] },
  { keyword: "wait", description: "Waits for a specific time", parameters: ["milliseconds"] },
  { keyword: "scrollIntoView", description: "Scrolls to an element", parameters: ["selector"] },
  { keyword: "evaluate", description: "Runs custom JavaScript", parameters: ["script"] },
  { keyword: "selectOption", description: "Selects an option from a dropdown", parameters: ["selector", "value"] },
  { keyword: "check", description: "Checks a checkbox", parameters: ["selector"] },
  { keyword: "uncheck", description: "Unchecks a checkbox", parameters: ["selector"] },
  { keyword: "hover", description: "Hovers over an element", parameters: ["selector"] },
  { keyword: "pressKey", description: "Presses a keyboard key", parameters: ["key"] },
  { keyword: "uploadFile", description: "Uploads a file", parameters: ["selector", "filePath"] },
  { keyword: "waitForNavigation", description: "Waits for page navigation to complete", parameters: [] },
  { keyword: "getCookies", description: "Gets browser cookies", parameters: [] },
  { keyword: "setCookies", description: "Sets browser cookies", parameters: ["cookies"] },
  { keyword: "dragAndDrop", description: "Drags and drops elements", parameters: ["sourceSelector", "targetSelector"] },
  // New commands
  { keyword: "inspectPage", description: "Shows common selectors on the current page", parameters: [] },
  { keyword: "smartClick", description: "Clicks an element using smart selection", parameters: ["description"] },
  { keyword: "findElement", description: "Find elements matching a text or description", parameters: ["text"] }
];

// Class to parse and execute instructions
export class AutomationParser {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Parse a natural language instruction and extract action and parameters
   */
  private parseInstruction(instruction: string): { action: string; params: string[] } | null {
    // Normalize instruction
    const normalizedInstruction = instruction.trim();
    
    // Try to match the instruction with available actions
    for (const action of availableActions) {
      if (normalizedInstruction.toLowerCase().startsWith(action.keyword.toLowerCase())) {
        // Extract parameters based on the action's expected parameters
        const paramPart = normalizedInstruction.substring(action.keyword.length).trim();
        
        // Improved parameter parsing
        if (!paramPart && action.parameters.length === 0) {
          // Action with no parameters
          return {
            action: action.keyword,
            params: []
          };
        }
        
        // Handle actions with multiple parameters
        if (action.parameters.length > 1) {
          // Split by commas, but handle cases where commas might be within quoted strings
          const params = this.splitByCommaOutsideQuotes(paramPart);
          return {
            action: action.keyword,
            params: params.map(p => p.trim())
          };
        } else {
          // For actions with a single parameter, use the entire remaining string
          return {
            action: action.keyword,
            params: [paramPart]
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Split a string by commas, but keep text within quotes together
   */
  private splitByCommaOutsideQuotes(input: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      
      // Handle quotes
      if ((char === '"' || char === "'") && (i === 0 || input[i-1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
        }
      }
      
      // Split on comma only if not in quotes
      if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last part
    if (current) {
      result.push(current);
    }
    
    return result;
  }

  /**
   * Generate a list of smart selectors to try for an element
   */
  private generateSmartSelectors(selector: string): string[] {
    // Remove any quotes that might be present
    const cleanSelector = selector.replace(/['"`]/g, '').trim();
    
    // Generate variations of the selector
    return [
      selector, // Original selector
      `input[placeholder*="${cleanSelector}"]`, // Placeholder contains text
      `input[aria-label*="${cleanSelector}"]`, // Aria label contains text
      `input[name*="${cleanSelector}"]`, // Name attribute contains text
      `input[id*="${cleanSelector}"]`, // ID contains text 
      `textarea[placeholder*="${cleanSelector}"]`, // For textareas
      `button:has-text("${cleanSelector}")`, // Button with text
      `a:has-text("${cleanSelector}")`, // Link with text
      `text="${cleanSelector}"`, // Text content
      `*:has-text("${cleanSelector}")`, // Any element with text
      `[placeholder*="${cleanSelector}"]`, // Any element with placeholder
      `.${cleanSelector}`, // Class
      `#${cleanSelector}`, // ID
      `[data-test="${cleanSelector}"]`, // Common test attributes
      `[data-testid="${cleanSelector}"]`,
      `[data-cy="${cleanSelector}"]`,
      `[data-qa="${cleanSelector}"]`
    ];
  }

  /**
   * Try multiple selectors and return the first one that matches
   */
  private async trySelectors(selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
      try {
        // Short timeout to quickly check if selector exists
        const element = await this.page.waitForSelector(selector, { timeout: 2000 });
        if (element) {
          return selector;
        }
      } catch (error) {
        // Selector not found, try next one
      }
    }
    return null;
  }

  /**
   * Execute a parsed instruction
   */
  private async executeAction(action: string, params: string[]): Promise<any> {
    try {
      switch (action) {
        case "goto":
          // First check if URL has http:// or https://
          let url = params[0].trim();
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
          }
          return await this.page.goto(url);
        
        case "click": {
          // Try smart selectors for click
          const selectors = this.generateSmartSelectors(params[0]);
          const validSelector = await this.trySelectors(selectors);
          
          if (validSelector) {
            console.log(`Found matching element with selector: ${validSelector}`);
            return await this.page.click(validSelector);
          } else {
            throw new Error(`Could not find element matching: ${params[0]}`);
          }
        }
        
        case "type": {
          const selectors = this.generateSmartSelectors(params[0]);
          const validSelector = await this.trySelectors(selectors);
          
          if (validSelector) {
            console.log(`Found matching input with selector: ${validSelector}`);
            // First click on the element to focus it
            await this.page.click(validSelector);
            // Then fill it
            return await this.page.fill(validSelector, params[1]);
          } else {
            throw new Error(`Could not find input matching: ${params[0]}`);
          }
        }
        
        case "waitForSelector": {
          const selectors = this.generateSmartSelectors(params[0]);
          const validSelector = await this.trySelectors(selectors);
          
          if (validSelector) {
            console.log(`Found matching element with selector: ${validSelector}`);
            return await this.page.waitForSelector(validSelector);
          } else {
            throw new Error(`Could not find element matching: ${params[0]}`);
          }
        }
        
        case "screenshot":
          if (params[0] === "fullPage") {
            return await this.page.screenshot({ fullPage: true, path: `screenshot-${Date.now()}.png` });
          } else {
            return await this.page.screenshot({ path: params[0] });
          }
        
        case "extractHTML": {
          const selectors = this.generateSmartSelectors(params[0]);
          const validSelector = await this.trySelectors(selectors);
          
          if (validSelector) {
            return await this.page.$eval(validSelector, el => el.outerHTML);
          } else {
            throw new Error(`Could not find element matching: ${params[0]}`);
          }
        }
        
        case "extractText": {
          const selectors = this.generateSmartSelectors(params[0]);
          const validSelector = await this.trySelectors(selectors);
          
          if (validSelector) {
            return await this.page.$eval(validSelector, el => el.textContent || '');
          } else {
            throw new Error(`Could not find element matching: ${params[0]}`);
          }
        }
        
        case "wait":
          return await this.page.waitForTimeout(parseInt(params[0]));
        
        case "scrollIntoView": {
          const selectors = this.generateSmartSelectors(params[0]);
          const validSelector = await this.trySelectors(selectors);
          
          if (validSelector) {
            return await this.page.evaluate((selector) => {
              const element = document.querySelector(selector);
              if (element) element.scrollIntoView();
            }, validSelector);
          } else {
            throw new Error(`Could not find element matching: ${params[0]}`);
          }
        }
        
        case "evaluate":
          return await this.page.evaluate(params[0]);
        
        case "selectOption": {
          const selectors = this.generateSmartSelectors(params[0]);
          const validSelector = await this.trySelectors(selectors);
          
          if (validSelector) {
            return await this.page.selectOption(validSelector, params[1]);
          } else {
            throw new Error(`Could not find select element matching: ${params[0]}`);
          }
        }
        
        case "check": {
          const selectors = this.generateSmartSelectors(params[0]);
          const validSelector = await this.trySelectors(selectors);
          
          if (validSelector) {
            return await this.page.check(validSelector);
          } else {
            throw new Error(`Could not find checkbox matching: ${params[0]}`);
          }
        }
        
        case "uncheck": {
          const selectors = this.generateSmartSelectors(params[0]);
          const validSelector = await this.trySelectors(selectors);
          
          if (validSelector) {
            return await this.page.uncheck(validSelector);
          } else {
            throw new Error(`Could not find checkbox matching: ${params[0]}`);
          }
        }
        
        case "hover": {
          const selectors = this.generateSmartSelectors(params[0]);
          const validSelector = await this.trySelectors(selectors);
          
          if (validSelector) {
            return await this.page.hover(validSelector);
          } else {
            throw new Error(`Could not find element matching: ${params[0]}`);
          }
        }
        
        case "pressKey":
          return await this.page.press('body', params[0]);
        
        case "uploadFile": {
          const selectors = this.generateSmartSelectors(params[0]);
          const validSelector = await this.trySelectors(selectors);
          
          if (validSelector) {
            return await this.page.setInputFiles(validSelector, params[1]);
          } else {
            throw new Error(`Could not find file input matching: ${params[0]}`);
          }
        }
        
        case "waitForNavigation":
          return await this.page.waitForNavigation();
        
        case "getCookies":
          const context = this.page.context();
          return await context.cookies();
        
        case "setCookies":
          const cookieContext = this.page.context();
          return await cookieContext.addCookies(JSON.parse(params[0]));
        
        case "dragAndDrop": {
          const sourceSelectors = this.generateSmartSelectors(params[0]);
          const targetSelectors = this.generateSmartSelectors(params[1]);
          
          const validSourceSelector = await this.trySelectors(sourceSelectors);
          const validTargetSelector = await this.trySelectors(targetSelectors);
          
          if (validSourceSelector && validTargetSelector) {
            const sourceElement = await this.page.$(validSourceSelector);
            const targetElement = await this.page.$(validTargetSelector);
            
            if (sourceElement && targetElement) {
              const sourceBound = await sourceElement.boundingBox();
              const targetBound = await targetElement.boundingBox();
              
              if (sourceBound && targetBound) {
                await this.page.mouse.move(
                  sourceBound.x + sourceBound.width / 2,
                  sourceBound.y + sourceBound.height / 2
                );
                await this.page.mouse.down();
                await this.page.mouse.move(
                  targetBound.x + targetBound.width / 2,
                  targetBound.y + targetBound.height / 2
                );
                await this.page.mouse.up();
              }
            }
          } else {
            throw new Error(`Could not find elements for drag and drop`);
          }
          return;
        }
        
        case "inspectPage": {
          // Find common interactive elements on the page
          const result = await this.page.evaluate(() => {
            const elements: {type: string, selector: string, text?: string}[] = [];
            
            // Find search inputs
            document.querySelectorAll('input[type="search"], input[placeholder*="search" i], input[name*="search" i], input[id*="search" i]').forEach((el) => {
              const input = el as HTMLInputElement;
              elements.push({
                type: 'Search input',
                selector: getUniqueSelector(input),
                text: input.placeholder || input.name || input.id
              });
            });
            
            // Find text inputs
            document.querySelectorAll('input[type="text"]:not([hidden])').forEach((el) => {
              const input = el as HTMLInputElement;
              elements.push({
                type: 'Text input',
                selector: getUniqueSelector(input),
                text: input.placeholder || input.name || input.id
              });
            });
            
            // Find buttons
            document.querySelectorAll('button:not([hidden]), [role="button"]:not([hidden])').forEach((el) => {
              elements.push({
                type: 'Button',
                selector: getUniqueSelector(el),
                text: (el as HTMLElement).innerText.trim().substring(0, 30)
              });
            });
            
            // Find links
            document.querySelectorAll('a:not([hidden])').forEach((el) => {
              if ((el as HTMLElement).innerText.trim()) {
                elements.push({
                  type: 'Link',
                  selector: getUniqueSelector(el),
                  text: (el as HTMLElement).innerText.trim().substring(0, 30)
                });
              }
            });
            
            // Helper function to get a unique selector for an element
            function getUniqueSelector(el: Element): string {
              // Try ID
              if (el.id) return `#${el.id}`;
              
              // Try name attribute
              if (el instanceof HTMLInputElement && el.name) return `input[name="${el.name}"]`;
              
              // Try data attributes
              for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-qa']) {
                const value = el.getAttribute(attr);
                if (value) return `[${attr}="${value}"]`;
              }
              
              // Try classes with tagname
              if (el.classList.length > 0) {
                return `${el.tagName.toLowerCase()}.${Array.from(el.classList).join('.')}`;
              }
              
              // Fallback: get a path
              let path = '';
              let current = el;
              while (current && current !== document.body) {
                let selector = current.tagName.toLowerCase();
                if (current.id) {
                  selector += `#${current.id}`;
                  path = selector + (path ? ' > ' + path : '');
                  break;
                } else {
                  const parent = current.parentElement;
                  if (!parent) break;
                  
                  const siblings = Array.from(parent.children).filter(s => s.tagName === current.tagName);
                  if (siblings.length > 1) {
                    const index = siblings.indexOf(current as Element);
                    selector += `:nth-child(${index + 1})`;
                  }
                }
                path = selector + (path ? ' > ' + path : '');
                current = current.parentElement!;
              }
              
              return path;
            }
            
            return elements.slice(0, 15); // Limit to 15 elements to avoid overwhelming
          });
          
          return result;
        }
        
        case "findElement": {
          const textToFind = params[0].toLowerCase();
          const results = await this.page.evaluate((searchText) => {
            const matches: { element: string, text: string, selector: string }[] = [];
            
            // Function to get visible text
            function getVisibleText(element: Element): string {
              return (element as HTMLElement).innerText || element.textContent || '';
            }
            
            // Function to check if element is visible
            function isVisible(element: Element): boolean {
              const style = window.getComputedStyle(element);
              return style.display !== 'none' && 
                     style.visibility !== 'hidden' && 
                     Number(style.opacity) > 0 &&
                     (element as HTMLElement).offsetWidth > 0 &&
                     (element as HTMLElement).offsetHeight > 0;
            }
            
            // Function to create a selector
            function getSelector(el: Element): string {
              if (el.id) return `#${el.id}`;
              
              if (el instanceof HTMLInputElement && el.name) {
                return `input[name="${el.name}"]`;
              }
              
              if (el.hasAttribute('data-testid')) {
                return `[data-testid="${el.getAttribute('data-testid')}"]`;
              }
              
              // Get a simple path
              let path = el.tagName.toLowerCase();
              if (el.classList.length > 0) {
                path += `.${Array.from(el.classList).join('.')}`;
              }
              return path;
            }
            
            // Find elements that contain the search text
            document.querySelectorAll('*').forEach((element) => {
              if (!isVisible(element)) return;
              
              const text = getVisibleText(element).trim().toLowerCase();
              const placeholder = element.getAttribute('placeholder')?.toLowerCase();
              const ariaLabel = element.getAttribute('aria-label')?.toLowerCase();
              const name = element.getAttribute('name')?.toLowerCase();
              const title = element.getAttribute('title')?.toLowerCase();
              
              if ((text && text.includes(searchText)) || 
                  (placeholder && placeholder.includes(searchText)) ||
                  (ariaLabel && ariaLabel.includes(searchText)) ||
                  (name && name.includes(searchText)) ||
                  (title && title.includes(searchText))) {
                
                matches.push({
                  element: element.tagName.toLowerCase(),
                  text: text || placeholder || ariaLabel || name || title || '',
                  selector: getSelector(element)
                });
              }
            });
            
            return matches.slice(0, 10); // Return top 10 matches
          }, textToFind);
          
          return results;
        }
        
        case "smartClick": {
          const description = params[0].toLowerCase();
          
          // First try to find the element
          const results = await this.executeAction("findElement", [description]);
          
          if (results && results.length > 0) {
            // Click the first matching element
            const selector = results[0].selector;
            console.log(`Smart clicking element: ${selector} with text: ${results[0].text}`);
            return await this.page.click(selector);
          } else {
            throw new Error(`Could not find any element matching description: ${description}`);
          }
        }
        
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Process a natural language instruction
   */
  public async processInstruction(instruction: string): Promise<any> {
    const parsedInstruction = this.parseInstruction(instruction);
    
    if (!parsedInstruction) {
      throw new Error(`Could not parse instruction: ${instruction}`);
    }
    
    console.log(`Executing action: ${parsedInstruction.action} with params: ${parsedInstruction.params.join(', ')}`);
    
    return await this.executeAction(parsedInstruction.action, parsedInstruction.params);
  }

  /**
   * Process multiple instructions in sequence
   */
  public async processInstructions(instructions: string[]): Promise<any[]> {
    const results = [];
    
    for (const instruction of instructions) {
      try {
        const result = await this.processInstruction(instruction);
        results.push({ instruction, result, success: true });
      } catch (error) {
        results.push({ 
          instruction, 
          error: error instanceof Error ? error.message : String(error),
          success: false 
        });
      }
    }
    
    return results;
  }
}