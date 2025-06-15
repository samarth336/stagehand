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
    this.registerAuthActions(); // Add authentication actions

    // Listen for new pages and update our page reference
    this.context.on('page', async (newPage) => {
      console.log('New page/tab opened. Switching context to the new page.');
      this.page = newPage as Page; 
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

  // New method to register authentication-related actions
  private registerAuthActions() {
    // Login action with multiple keywords
    this.registeredActions.set("login", {
      keywords: ["login", "sign in", "signin", "log in"],
      minParams: 2,
      paramUsage: "<username> <password> [selector-prefix]",
      handler: async (page, params) => {
        const username = params[0];
        const password = params[1];
        const selectorPrefix = params.length > 2 ? params[2] : "";
        
        console.log(`Attempting to login with username: ${username}`);
        
        // Step 1: Check if we're already on a login page
        const isLoginFormPresent = await this.isLoginFormPresent(page);
        
        // Step 2: If not, try to find and click a login link
        if (!isLoginFormPresent) {
          console.log("Login form not detected on current page. Looking for login link...");
          
          const navigatedToLoginPage = await this.detectAndNavigateToLoginPage(page);
          
          if (!navigatedToLoginPage) {
            // Step 3: If no login link, try direct navigation based on common URL patterns
            const urlWithoutParams = page.url().split('?')[0];
            const baseUrl = urlWithoutParams.endsWith('/') ? urlWithoutParams.slice(0, -1) : urlWithoutParams;
            
            console.log("No login link found, trying common login URLs...");
            
            // Common login URL patterns
            const loginPaths = ['/login', '/signin', '/auth/login', '/user/login', '/account/login'];
            
            for (const loginPath of loginPaths) {
              try {
                console.log(`Trying direct navigation to ${baseUrl}${loginPath}`);
                await page.goto(`${baseUrl}${loginPath}`);
                
                // Check if we found a login form
                if (await this.isLoginFormPresent(page)) {
                  console.log(`Successfully found login form at ${page.url()}`);
                  break;
                }
              } catch (e) {
                console.log(`Failed to navigate to ${baseUrl}${loginPath}: ${e}`);
              }
            }
          }
        } else {
          console.log("Login form already present on current page.");
        }
        
        // Step 4: Handle the login process
        return this.handleAuthentication(page, username, password, "login", selectorPrefix);
      }
    });

    // Sign Up / Registration action
    this.registeredActions.set("signup", {
      keywords: ["signup", "sign up", "register", "create account"],
      minParams: 2,
      paramUsage: "<email> <password> [username] [country]",
      handler: async (page, params) => {
        const email = params[0];
        const password = params[1];
        const username = params.length > 2 ? params[2] : email.split('@')[0];
        const country = params.length > 3 ? params[3] : "India";
        
        console.log(`Attempting to sign up with email: ${email}, username: ${username}, country: ${country}`);
        
        if (page.url().includes('github.com')) {
          console.log("Navigating to GitHub signup page...");
          await page.goto('https://github.com/signup');
          await page.waitForLoadState('networkidle');

          // Wait for the signup form
          console.log("Waiting for signup form...");
          await page.waitForSelector('form[action*="signup"]', { state: 'visible', timeout: 30000 });

          // Fill Email
          console.log("Filling email...");
          await page.waitForSelector('input#email', { state: 'visible', timeout: 10000 });
          await page.fill('input#email', email);

          // Fill Password
          console.log("Filling password...");
          await page.waitForSelector('input#password', { state: 'visible', timeout: 10000 });
          await page.fill('input#password', password);

          // Fill Username
          console.log("Filling username...");
          await page.waitForSelector('input#login', { state: 'visible', timeout: 10000 });
          await page.fill('input#login', username);

          // Select Country
          console.log("Selecting country...");
          await page.waitForSelector('select#country', { state: 'visible', timeout: 10000 });
          await page.selectOption('select#country', { label: country });

          // Email preferences (optional, check if exists)
          const emailPrefSelector = 'input[name="opt_in"]';
          const emailPrefExists = await page.$(emailPrefSelector);
          if (emailPrefExists) {
            console.log("Setting email preferences checkbox...");
            const checked = await page.isChecked(emailPrefSelector);
            if (!checked) {
              await page.click(emailPrefSelector);
            }
          }

          // Click Continue
          console.log("Clicking Continue button...");
          await page.waitForSelector('button[type="submit"]', { state: 'visible', timeout: 10000 });
          await page.click('button[type="submit"]');

          // Wait for navigation or next step
          try {
            await page.waitForNavigation({ timeout: 20000 });
            console.log("Signup form submitted and navigation occurred.");
          } catch (e) {
            console.log("No navigation after signup form submission, may be on next step.");
          }

          return true;
        }
        // fallback for other sites
        return this.handleAuthentication(page, email, password, "signup", "", username, email);
      }
    });

    // Auto-detect authentication type
    this.registeredActions.set("authenticate", {
      keywords: ["authenticate", "auth"],
      minParams: 2,
      paramUsage: "<username> <password> [fullname]",
      handler: async (page, params) => {
        const username = params[0];
        const password = params[1];
        const fullname = params.length > 2 ? params[2] : username;
        
        console.log(`Auto-detecting authentication type for username: ${username}`);
        const authType = await this.detectAuthenticationType(page);
        return this.handleAuthentication(page, username, password, authType, "", fullname);
      }
    });
  }

  // Helper method to detect authentication type
  private async detectAuthenticationType(page: Page): Promise<string> {
    console.log("Analyzing page to detect authentication type...");
    
    // Look for signup-specific keywords
    const signupKeywords = ["sign up", "register", "create account", "join now", "get started"];
    const loginKeywords = ["sign in", "login", "log in", "member login", "sign on"];
    
    // Get page text content
    const pageContent = await page.evaluate(() => document.body.textContent?.toLowerCase() || "");
    
    // Check for presence of form elements
    const hasNameField = await page.$('input[name*="name" i]:not([type="email"]):not([type="password"])').then(Boolean);
    const hasConfirmPasswordField = await page.$('input[name*="confirm" i][type="password"]').then(Boolean);
    
    // Count matches for signup vs login keywords
    let signupMatches = 0;
    let loginMatches = 0;
    
    for (const keyword of signupKeywords) {
      if (pageContent.includes(keyword.toLowerCase())) signupMatches++;
    }
    
    for (const keyword of loginKeywords) {
      if (pageContent.includes(keyword.toLowerCase())) loginMatches++;
    }
    
    console.log(`Auth detection results: signup indicators=${signupMatches + (hasNameField ? 1 : 0) + (hasConfirmPasswordField ? 1 : 0)}, login indicators=${loginMatches}`);
    
    // Determine auth type based on indicators
    if ((signupMatches > loginMatches) || hasNameField || hasConfirmPasswordField) {
      console.log("Detected signup/registration form");
      return "signup";
    } else {
      console.log("Detected login/signin form");
      return "login";
    }
  }

  // Main method to handle authentication
  private async handleAuthentication(
    page: Page, 
    username: string, 
    password: string, 
    authType: string,
    selectorPrefix: string = "",
    fullname: string = "",
    email: string = ""
  ): Promise<boolean> {
    console.log(`Handling ${authType} with username: ${username}`);
    
    try {
      // Site-specific handling based on URL
      const url = page.url().toLowerCase();
      
      // GitHub specific handling
      if (url.includes('github.com')) {
        console.log("Using GitHub-specific authentication flow");
        
        try {
          // Wait for GitHub's login form fields
          await page.waitForSelector('input#login_field', { state: 'visible', timeout: 5000 });
          await page.waitForSelector('input#password', { state: 'visible', timeout: 5000 });
          await page.waitForSelector('input[type="submit"][name="commit"]', { state: 'visible', timeout: 5000 });
          
          // Fill in credentials and submit
          await page.fill('input#login_field', username);
          await page.fill('input#password', password);
          await page.click('input[type="submit"][name="commit"]');
          
          // Wait for navigation after login
          await page.waitForNavigation({ timeout: 10000 }).catch(() => {
            console.log("No navigation occurred after GitHub login submission");
          });
          
          return true;
        } catch (githubError) {
          console.error(`GitHub-specific login failed: ${githubError}`);
          throw new Error(`GitHub login failed: ${githubError}`);
        }
      }
      
      // Google specific handling
      if (url.includes('google.com') || url.includes('accounts.google')) {
        console.log("Using Google-specific authentication flow");
        
        try {
          // Google login is a multi-step process
          // Step 1: Email/Username
          await page.waitForSelector('input[type="email"]', { state: 'visible', timeout: 5000 });
          await page.fill('input[type="email"]', username);
          
          // Find and click next button
          const nextButton = await this.trySelectors([
            'button:has-text("Next")', 
            'div[id="identifierNext"]', 
            'input[type="submit"]'
          ]);
          
          if (!nextButton) {
            throw new Error("Could not find Next button on Google login page");
          }
          
          await page.click(nextButton);
          
          // Wait for password field to appear (with a longer timeout)
          await page.waitForTimeout(2000); // Google often has animations
          await page.waitForSelector('input[type="password"]', { state: 'visible', timeout: 10000 });
          
          // Step 2: Password
          await page.fill('input[type="password"]', password);
          
          // Find and click the password submit button
          const passwordNextButton = await this.trySelectors([
            'button:has-text("Next")', 
            'div[id="passwordNext"]', 
            'input[type="submit"]'
          ]);
          
          if (!passwordNextButton) {
            throw new Error("Could not find submit button after entering password");
          }
          
          await page.click(passwordNextButton);
          
          // Wait for navigation
          await page.waitForNavigation({ timeout: 15000 }).catch(() => {
            console.log("No navigation occurred after Google login submission");
          });
          
          return true;
        } catch (googleError) {
          console.error(`Google-specific login failed: ${googleError}`);
          // Fall through to generic method as backup
        }
      }
      
      // Generic handling for other sites
      console.log("Using generic authentication flow");
      
      // Find and fill username field
      const usernameSelectors = this.generateAuthFieldSelectors('username', selectorPrefix);
      const usernameSelector = await this.trySelectors(usernameSelectors);
      
      if (!usernameSelector) {
        throw new Error("Could not find username/email field");
      }
      
      console.log(`Found username field with selector: ${usernameSelector}`);
      await page.waitForSelector(usernameSelector, { state: 'visible', timeout: 5000 });
      await page.fill(usernameSelector, username);
      
      // Handle full name field for signup
      if (authType === "signup" && fullname) {
        const nameSelectors = this.generateAuthFieldSelectors('name', selectorPrefix);
        const nameSelector = await this.trySelectors(nameSelectors);
        
        if (nameSelector) {
          console.log(`Found name field with selector: ${nameSelector}`);
          await page.waitForSelector(nameSelector, { state: 'visible' });
          await page.fill(nameSelector, fullname);
        }
      }
      
      // Find and fill password field
      const passwordSelectors = this.generateAuthFieldSelectors('password', selectorPrefix);
      const passwordSelector = await this.trySelectors(passwordSelectors);
      
      if (!passwordSelector) {
        throw new Error("Could not find password field");
      }
      
      console.log(`Found password field with selector: ${passwordSelector}`);
      await page.waitForSelector(passwordSelector, { state: 'visible' });
      await page.fill(passwordSelector, password);
      
      // Handle confirm password field for signup
      if (authType === "signup") {
        const confirmPasswordSelectors = this.generateAuthFieldSelectors('confirm-password', selectorPrefix);
        const confirmPasswordSelector = await this.trySelectors(confirmPasswordSelectors);
        
        if (confirmPasswordSelector) {
          console.log(`Found confirm password field with selector: ${confirmPasswordSelector}`);
          await page.waitForSelector(confirmPasswordSelector, { state: 'visible' });
          await page.fill(confirmPasswordSelector, password);
        }
      }
      
      // Find and click the submit button
      const buttonSelectors = this.generateAuthButtonSelectors(authType, selectorPrefix);
      const buttonSelector = await this.trySelectors(buttonSelectors);
      
      if (!buttonSelector) {
        throw new Error(`Could not find ${authType} button`);
      }
      
      console.log(`Found ${authType} button with selector: ${buttonSelector}`);
      await page.waitForSelector(buttonSelector, { state: 'visible' });
      await page.click(buttonSelector);
      
      // Wait for navigation or page change
      try {
        await page.waitForNavigation({ timeout: 8000 }).catch(() => {
          console.log("No navigation occurred after form submission");
        });
      } catch (e) {
        console.log("Navigation timeout - assuming form was submitted");
      }
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Authentication error: ${errorMessage}`);
      throw new Error(`Failed to ${authType}: ${errorMessage}`);
    }
  }

  // Improved selectors for authentication fields
  private generateAuthFieldSelectors(fieldType: string, selectorPrefix: string = ""): string[] {
    const selectors: string[] = [];
    const prefix = selectorPrefix ? `${selectorPrefix} ` : "";
    
    switch (fieldType) {
      case 'username':
        selectors.push(
          // Site-specific selectors
          `${prefix}input[id="login_field"]`, // GitHub
          `${prefix}input[name="login"]`, // GitHub
          `${prefix}input[id="username"]`,
          `${prefix}input[id="email"]`,
          
          // Type-based selectors (most reliable)
          `${prefix}input[type="email"]:not([aria-hidden="true"]):not([hidden])`,
          
          // Name-based selectors
          `${prefix}input[name="email"]:not([type="hidden"]):not([type="checkbox"])`,
          `${prefix}input[name="username"]:not([type="hidden"]):not([type="checkbox"])`,
          `${prefix}input[name="user"]:not([type="hidden"]):not([type="checkbox"])`,
          `${prefix}input[name*="mail" i]:not([type="hidden"]):not([type="checkbox"])`,
          `${prefix}input[name*="user" i]:not([type="hidden"]):not([type="checkbox"])`,
          `${prefix}input[name*="login" i]:not([type="hidden"]):not([type="checkbox"])`,
          
          // ID-based selectors with better filtering
          `${prefix}input[id*="email" i]:not([type="hidden"]):not([type="checkbox"]):not([id*="confirm" i]):not([id*="keep" i]):not([id*="remember" i]):not([id*="include" i])`,
          `${prefix}input[id*="user" i]:not([type="hidden"]):not([type="checkbox"])`,
          `${prefix}input[id*="login" i]:not([type="hidden"]):not([type="checkbox"])`,
          
          // Placeholder-based selectors
          `${prefix}input[placeholder*="email" i]:not([type="hidden"])`,
          `${prefix}input[placeholder*="username" i]:not([type="hidden"])`,
          `${prefix}input[placeholder*="user" i]:not([type="hidden"])`,
          
          // Label-based selectors
          `${prefix}input[aria-label*="email" i]:not([type="checkbox"])`,
          `${prefix}input[aria-label*="username" i]:not([type="checkbox"])`,
          `${prefix}input[aria-label*="user" i]:not([type="checkbox"])`,
          
          // Class-based selectors
          `${prefix}input.username`,
          `${prefix}input.email`,
          `${prefix}input.login`,
          
          // Fallback to common patterns
          `${prefix}input.form-control:not([type="password"]):not([type="checkbox"]):not([type="hidden"])`
        );
        break;
        
      case 'password':
        selectors.push(
          // Site-specific selectors
          `${prefix}input[id="password"]`, // Common on many sites
          
          // Type-based selectors (most reliable)
          `${prefix}input[type="password"]`,
          
          // Other attribute selectors
          `${prefix}input[name="password"]`,
          `${prefix}input[name*="password" i]`,
          `${prefix}input[id*="password" i]:not([id*="confirm" i]):not([id*="verify" i])`,
          `${prefix}input[placeholder*="password" i]:not([placeholder*="confirm" i])`,
          `${prefix}input[aria-label*="password" i]:not([aria-label*="confirm" i])`,
          `${prefix}input.password`
        );
        break;
        
      case 'confirm-password':
        selectors.push(
          `${prefix}input[type="password"][name*="confirm" i]`,
          `${prefix}input[type="password"][id*="confirm" i]`,
          `${prefix}input[type="password"][placeholder*="confirm" i]`,
          `${prefix}input[type="password"][aria-label*="confirm" i]`,
          `${prefix}input[type="password"][name*="verify" i]`,
          `${prefix}input[type="password"][id*="verify" i]`,
          `${prefix}input[type="password"][name*="retype" i]`,
          `${prefix}input[type="password"][id*="retype" i]`,
          `${prefix}input[type="password"]:nth-of-type(2)`
        );
        break;
        
      case 'name':
        selectors.push(
          `${prefix}input[name*="fullname" i]`,
          `${prefix}input[name*="full_name" i]`,
          `${prefix}input[name="name"]`,
          `${prefix}input[id*="fullname" i]`,
          `${prefix}input[id*="full_name" i]`,
          `${prefix}input[id="name"]`,
          `${prefix}input[name*="first" i][name*="name" i]`,
          `${prefix}input[id*="first" i][id*="name" i]`,
          `${prefix}input[placeholder*="name" i]:not([placeholder*="user" i]):not([placeholder*="email" i])`
        );
        break;
    }
    
    return selectors;
  }

  // Generate selectors for authentication buttons
  private generateAuthButtonSelectors(authType: string, selectorPrefix: string = ""): string[] {
    const selectors: string[] = [];
    const prefix = selectorPrefix ? `${selectorPrefix} ` : "";
    
    if (authType === "login" || authType === "signin") {
      selectors.push(
        `${prefix}button[type="submit"]`,
        `${prefix}input[type="submit"]`,
        `${prefix}button[id*="login" i]`,
        `${prefix}button[id*="signin" i]`,
        `${prefix}button[class*="login" i]`,
        `${prefix}button[class*="signin" i]`,
        `${prefix}button:has-text("Log In")`,
        `${prefix}button:has-text("Sign In")`,
        `${prefix}button:has-text("Login")`,
        `${prefix}button:has-text("Signin")`,
        `${prefix}input[value*="Log In" i]`,
        `${prefix}input[value*="Sign In" i]`,
        `${prefix}input[value*="Login" i]`,
        `${prefix}a[href*="login" i]`,
        `${prefix}a[href*="signin" i]`,
        `${prefix}a:has-text("Log In")`,
        `${prefix}a:has-text("Sign In")`,
        `${prefix}.login-button`,
        `${prefix}.signin-button`,
        `${prefix}form[id*="login" i] button`,
        `${prefix}form[id*="signin" i] button`,
        `${prefix}form[class*="login" i] button`,
        `${prefix}form[class*="signin" i] button`
      );
    } else { // signup/register
      selectors.push(
        `${prefix}button[type="submit"]`,
        `${prefix}input[type="submit"]`,
        `${prefix}button[id*="signup" i]`,
        `${prefix}button[id*="register" i]`,
        `${prefix}button[id*="create" i]`,
        `${prefix}button[class*="signup" i]`,
        `${prefix}button[class*="register" i]`,
        `${prefix}button:has-text("Sign Up")`,
        `${prefix}button:has-text("Register")`,
        `${prefix}button:has-text("Create Account")`,
        `${prefix}button:has-text("Join")`,
        `${prefix}input[value*="Sign Up" i]`,
        `${prefix}input[value*="Register" i]`,
        `${prefix}input[value*="Create" i]`,
        `${prefix}a[href*="signup" i]`,
        `${prefix}a[href*="register" i]`,
        `${prefix}a:has-text("Sign Up")`,
        `${prefix}a:has-text("Register")`,
        `${prefix}.signup-button`,
        `${prefix}.register-button`,
        `${prefix}form[id*="signup" i] button`,
        `${prefix}form[id*="register" i] button`,
        `${prefix}form[class*="signup" i] button`,
        `${prefix}form[class*="register" i] button`
      );
    }
    
    return selectors;
  }

  /**
   * Parses a single instruction line.
   * Returns an object with actionKey and params, or an error object.
   */
  private parseInstruction(instructionLine: string): { actionKey: string; params: string[] } | { error: string } {
    const trimmedLine = instructionLine.trim();
    if (!trimmedLine) return { error: "Empty instruction line." };

    // Handle comment lines starting with "For" (treat as comments)
    if (trimmedLine.toLowerCase().startsWith('for ')) {
      console.log(`Treating line as a comment: "${trimmedLine}"`);
      return { actionKey: "skip", params: [] };
    }

    // Special handling for "go to" command
    if (trimmedLine.toLowerCase().startsWith('go to ')) {
      const url = trimmedLine.substring(6).trim();
      return { actionKey: "goto", params: [url] };
    }

    // Special handling for "sign in" command
    if (trimmedLine.toLowerCase().startsWith('sign in ')) {
      const parts = trimmedLine.split(/\s+/);
      if (parts.length < 4) {
        return { error: `Insufficient parameters for sign in. Expected: sign in <username> <password> [selector-prefix]` };
      }
      return { actionKey: "login", params: parts.slice(2) };
    }

    // Special handling for "sign up" command
    if (trimmedLine.toLowerCase().startsWith('sign up ')) {
      const parts = trimmedLine.split(/\s+/);
      if (parts.length < 4) {
        return { error: `Insufficient parameters for sign up. Expected: sign up <email> <password> [username] [country]` };
      }
      return { actionKey: "signup", params: parts.slice(2) };
    }

    // Rest of the parsing logic
    const parts = trimmedLine.split(/\s+/);
    const actionKey = parts[0].toLowerCase();
    const params = parts.slice(1);

    // Check if the action is registered
    const registeredAction = this.registeredActions.get(actionKey);
    if (!registeredAction) {
      return { error: `Unknown action key: ${actionKey}.` };
    }

    // Validate minimum parameters
    if (registeredAction.minParams && params.length < registeredAction.minParams) {
      return { error: `Insufficient parameters for ${actionKey}. Expected: ${registeredAction.paramUsage}` };
    }

    return { actionKey, params };
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
      try {
        const parsed = this.parseInstruction(instruction);
        
        // Skip comments and empty lines
        if (!('error' in parsed) && parsed.actionKey === 'skip') {
          console.log(`Skipping comment line: "${instruction}"`);
          results.push({ 
            instruction, 
            result: "Skipped comment line", 
            success: true 
          });
          continue;
        }

        // Ensure we're on the most current page
        const currentPages = this.context.pages();
        if (currentPages.length > 0 && this.page !== currentPages[currentPages.length - 1]) {
          this.page = currentPages[currentPages.length - 1] as Page;
        }

        const result = await this.processInstruction(instruction);
        results.push({ instruction, result, success: true });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error executing instruction "${instruction}" on page ${this.page.url()}:`, errorMessage);
        results.push({ instruction, error: errorMessage, success: false });
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

  // Enhanced trySelectors method that properly checks visibility
  private async trySelectors(selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
      try {
        // First check if the selector exists in the DOM
        const element = await this.page.$(selector);
        if (!element) continue;
        
        // Then check if it's visible by examining offsetParent (more reliable than isVisible)
        // This catches elements that are in the DOM but hidden via CSS
        const isVisible = await element.evaluate(el => {
          // Check if element is visible in viewport
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          
          // Check if element has offsetParent (not hidden by display:none)
          if (el instanceof HTMLElement) {
            if (!el.offsetParent && el.offsetParent !== document.body) return false;
          } else {
            // For SVGElement or others, fallback to bounding rect check only
            return rect.width !== 0 && rect.height !== 0;
          }
          
          // Check computed style
          const style = window.getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
          
          return true;
        }).catch(() => false);
        
        if (isVisible) {
          return selector;
        } else {
          console.log(`Selector ${selector} found but element is not visible.`);
        }
      } catch (error) {
        // Continue to next selector
      }
    }
    return null;
  }

  // Add this new method to detect and navigate to login page
  private async detectAndNavigateToLoginPage(page: Page): Promise<boolean> {
    console.log("Analyzing page to find login/signup links...");
    
    // Site-specific handling for common websites
    const url = page.url().toLowerCase();
    
    // GitHub specific handling
    if (url.includes('github.com')) {
      console.log("Detected GitHub - using specific navigation pattern");
      try {
        // GitHub has a "Sign in" link in the header or a "Sign in" button
        // Try the button first (newer UI)
        const signInButton = await page.$('a.HeaderMenu-link[href="/login"]');
        if (signInButton && await signInButton.isVisible()) {
          console.log("Found GitHub sign-in header link");
          await signInButton.click();
          await page.waitForNavigation({ timeout: 5000 }).catch(() => {});
          return true;
        }
        
        // Try the older UI "Sign in" link
        const altSignIn = await page.$('a:has-text("Sign in")');
        if (altSignIn && await altSignIn.isVisible()) {
          console.log("Found GitHub sign-in text link");
          await altSignIn.click();
          await page.waitForNavigation({ timeout: 5000 }).catch(() => {});
          return true;
        }
        
        // Direct navigation if links aren't found
        console.log("No GitHub login links found, navigating directly to /login");
        await page.goto('https://github.com/login');
        return true;
      } catch (error) {
        console.error("Error navigating to GitHub login:", error);
      }
    }
    
    // Common selectors for login/signin links - ordered by specificity
    const loginLinkSelectors = [
      // Primary navigation links
      'header a[href*="login" i]',
      'header a[href*="signin" i]',
      'nav a[href*="login" i]',
      'nav a[href*="signin" i]',
      
      // Text-based selectors with context
      '.header a:has-text("Sign in")',
      '.nav a:has-text("Sign in")',
      '.menu a:has-text("Sign in")',
      'header a:has-text("Log in")',
      'nav a:has-text("Log in")',
      
      // Button selectors
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Login")',
      'button.login',
      'button.signin',
      
      // General link selectors
      'a.login-link',
      'a.signin-link',
      'a#login-link',
      'a#signin-link',
      
      // Less specific text selectors
      'a:has-text("Sign in")',
      'a:has-text("Log in")',
      'a:has-text("Login")',
      
      // href based selectors
      'a[href*="login"]',
      'a[href*="signin"]',
      'a[href*="auth"]',
      
      // Fallbacks with icons or labels
      'a[aria-label*="login" i]',
      'a[aria-label*="sign in" i]',
      'a[title*="login" i]',
      'a[title*="sign in" i]'
    ];
    
    try {
      // Try each selector in order
      for (const selector of loginLinkSelectors) {
        const elements = await page.$$(selector);
        
        // Try each matching element
        for (const element of elements) {
          if (await element.isVisible()) {
            console.log(`Found login link with selector: ${selector}`);
            
            // Check if it's likely to be a login link by examining text or attributes
            const elementText = await element.textContent() || '';
            const href = await element.getAttribute('href') || '';
            const ariaLabel = await element.getAttribute('aria-label') || '';
            const title = await element.getAttribute('title') || '';
            
            // Skip elements that are likely to be signup links
            const signupKeywords = ['sign up', 'register', 'create account', 'join'];
            const textToCheck = (elementText + ' ' + href + ' ' + ariaLabel + ' ' + title).toLowerCase();
            if (signupKeywords.some(keyword => textToCheck.includes(keyword))) {
              console.log(`Skipping element that appears to be a signup link: "${elementText.trim()}"`);
              continue;
            }
            
            // Click the element to navigate to login page
            await element.click();
            
            // Wait for navigation to complete
            try {
              await page.waitForNavigation({ timeout: 5000 }).catch(() => {
                console.log("No navigation occurred after clicking login link");
              });
            } catch (e) {
              console.log("Navigation timeout - checking if login form appeared");
            }
            
            // Verify we're on a login page now
            if (await this.isLoginFormPresent(page)) {
              console.log("Successfully navigated to login page");
              return true;
            }
            
            console.log("Clicked element did not lead to login form, trying next element");
          }
        }
      }
      
      console.log("Could not find a suitable login link on the page");
      return false;
    } catch (error) {
      console.error("Error while detecting login link:", error);
      return false;
    }
  }

  // Helper method to check if login form is present on page
  private async isLoginFormPresent(page: Page): Promise<boolean> {
    try {
      // Check for common login form selectors
      const loginFormSelectors = [
        'form[action*="login"]',
        'form[action*="signin"]',
        'form[action*="auth"]',
        'form:has(input[type="password"])',
        'form:has(input[name*="password" i])',
        'form:has(input[name*="login" i])',
        'form:has(input[name*="user" i])'
      ];

      for (const selector of loginFormSelectors) {
        const form = await page.$(selector);
        if (form) {
          // Check if the form is visible
          const isVisible = await page.evaluate((el) => {
            if (el instanceof HTMLElement) {
              return el.offsetParent !== null;
            }
            return false;
          }, form);

          if (isVisible) {
            // Additional checks to confirm it's likely a login form
            const hasPasswordField = selector.includes('password') || 
              await page.$eval('input[type="password"]', el => {
                if (el instanceof HTMLElement) {
                  return el.offsetParent !== null;
                }
                return false;
              }).catch(() => false);
              
            const hasSubmitButton = await page.$eval('button[type="submit"], input[type="submit"]', 
              el => {
                if (el instanceof HTMLElement) {
                  return el.offsetParent !== null;
                }
                return false;
              }).catch(() => false);
              
            if (hasPasswordField && hasSubmitButton) {
              console.log(`Found login form with selector: ${selector}`);
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking for login form:', error);
      return false;
    }
  }
}