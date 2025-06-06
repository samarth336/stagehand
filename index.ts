import { Stagehand, Page, BrowserContext } from "@browserbasehq/stagehand";
import StagehandConfig from "./stagehand.config.js";
import chalk from "chalk";
import boxen from "boxen";
import { AutomationParser } from "./automationParser.js";
import * as readline from 'readline';

/**
 * Creates a readline interface for user input
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompts the user for input
 * @param rl The readline interface
 * @param question The question to ask
 * @returns A promise that resolves with the user's answer
 */
function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * 🤘 Welcome to Stagehand! Thanks so much for trying us out!
 * 🛠️ CONFIGURATION: stagehand.config.ts will help you configure Stagehand
 *
 * 📝 Check out our docs for more fun use cases, like building agents
 * https://docs.stagehand.dev/
 *
 * 💬 If you have any feedback, reach out to us on Slack!
 * https://stagehand.dev/slack
 *
 * 📚 You might also benefit from the docs for Zod, Browserbase, and Playwright:
 * - https://zod.dev/
 * - https://docs.browserbase.com/
 * - https://playwright.dev/docs/intro
 */
async function main({
  page,
  context,
  stagehand,
}: {
  page: Page; // Playwright Page with act, extract, and observe methods
  context: BrowserContext; // Playwright BrowserContext
  stagehand: Stagehand; // Stagehand instance
}) {
  // Set a longer timeout for navigation
  page.setDefaultNavigationTimeout(60000); // 60 seconds timeout
  
  // Also set a longer timeout for waitForSelector
  page.setDefaultTimeout(60000); // 60 seconds timeout for all waiting operations
  
  // Create an instance of our automation parser
  let automationParser = new AutomationParser(page);
  
  // Create readline interface for user input
  let rl = createInterface();
  
  console.log(chalk.blue("=== Stagehand Browser Automation System ==="));
  console.log(chalk.yellow("Enter 'exit' or 'quit' to end the program\n"));
  
  // Display available commands
  console.log(chalk.green("Available commands:"));
  console.log("- goto [url] - Navigate to a specific URL");
  console.log("- click [selector] - Click an element matching the selector");
  console.log("- type [selector], [text] - Type text into an input field");
  console.log("- waitForSelector [selector] - Wait for an element to appear");
  console.log("- screenshot [path] - Take a screenshot of the page");
  console.log("- extractHTML [selector] - Extract HTML content from an element");
  console.log("- extractText [selector] - Extract text content from an element");
  console.log("- wait [milliseconds] - Wait for a specific time");
  console.log("- scrollIntoView [selector] - Scroll to an element");
  console.log("- evaluate [script] - Run custom JavaScript");
  console.log("- selectOption [selector], [value] - Select an option from a dropdown");
  console.log("- check [selector] - Check a checkbox");
  console.log("- uncheck [selector] - Uncheck a checkbox");
  console.log("- hover [selector] - Hover over an element");
  console.log("- pressKey [key] - Press a keyboard key");
  console.log("- uploadFile [selector], [filePath] - Upload a file");
  console.log("- waitForNavigation - Wait for page navigation to complete");
  console.log("- getCookies - Get browser cookies");
  console.log("- setCookies [cookies] - Set browser cookies");
  console.log("- dragAndDrop [sourceSelector], [targetSelector] - Drag and drop elements\n");
  
  // Display helpful tips
  console.log(chalk.blue("\n✨ Smart Automation Tips:"));
  console.log("- Use 'inspectPage' to find available elements on the current page");
  console.log("- For Google search: 'smartClick search', then 'type input[type=\"text\"], your search term'");
  console.log("- Use 'findElement search' to find elements containing the word 'search'");
  console.log("- Google search example: 'goto google.com', 'findElement search', 'type [found selector], your query', 'pressKey Enter'\n");
  
  // Interactive loop for user input
  let running = true;
  let browserClosed = false;
  
  // Add event listener for browser disconnection
  context.on('close', () => {
    browserClosed = true;
    console.log(chalk.red("\n⚠️ Browser connection closed unexpectedly"));
  });
  
  while (running) {
    try {
      // Check if browser is still open
      if (browserClosed) {
        console.log(chalk.yellow("Attempting to reconnect browser..."));
        
        // Try to reinitialize Stagehand and get a new page and context
        try {
          await stagehand.init();
          page = stagehand.page;
          context = stagehand.context;
          
          // Create new automation parser with the new page
          automationParser = new AutomationParser(page);
          browserClosed = false;
          
          console.log(chalk.green("✓ Browser reconnected successfully"));
        } catch (error) {
          console.error(chalk.red("Failed to reconnect browser:"), error);
          running = false;
          break;
        }
      }
      
      const instruction = await askQuestion(rl, chalk.blue("Enter instruction: "));
      
      // Check if user wants to exit
      if (instruction.toLowerCase() === 'exit' || instruction.toLowerCase() === 'quit') {
        running = false;
        console.log(chalk.yellow("Exiting program..."));
        break;
      }
      
      // Process the instruction
      try {
        const result = await automationParser.processInstruction(instruction);
        console.log(chalk.green("✓ Success:"), typeof result === 'string' ? 
          (result.length > 150 ? result.substring(0, 150) + "..." : result) : 
          "Action completed successfully");
      } catch (error) {
        if (error instanceof Error && error.message.includes("Target page, context or browser has been closed")) {
          browserClosed = true;
          console.log(chalk.red("⚠️ Browser has been closed. Will attempt to reconnect on next command."));
        } else {
          console.error(chalk.red("✗ Error:"), error instanceof Error ? error.message : String(error));
        }
      }
      
      console.log(); // Empty line for better readability
    } catch (error) {
      console.error(chalk.red("Unexpected error:"), error);
      if (error instanceof Error && error.message.includes("readline was closed")) {
        console.log(chalk.yellow("Readline interface was closed, creating a new one..."));
        rl = createInterface();
      }
    }
  }
  
  // Close the readline interface
  try {
    rl.close();
  } catch (error) {
    // Ignore errors when closing readline
  }
}

/**
 * This is the main function that runs when you do npm run start
 *
 * YOU PROBABLY DON'T NEED TO MODIFY ANYTHING BELOW THIS POINT!
 *
 */
async function run() {
  let stagehand: Stagehand | null = null;
  
  try {
    stagehand = new Stagehand({
      ...StagehandConfig,
    });
    await stagehand.init();

    if (StagehandConfig.env === "BROWSERBASE" && stagehand.browserbaseSessionID) {
      console.log(
        boxen(
          `View this session live in your browser: \n${chalk.blue(
            `https://browserbase.com/sessions/${stagehand.browserbaseSessionID}`,
          )}`,
          {
            title: "Browserbase",
            padding: 1,
            margin: 3,
          },
        ),
      );
    }

    const page = stagehand.page;
    const context = stagehand.context;
    await main({
      page,
      context,
      stagehand,
    });
  } catch (error) {
    console.error(chalk.red("Fatal error:"), error);
  } finally {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch (error) {
        console.error(chalk.red("Error while closing Stagehand:"), error);
      }
    }
    
    console.log(`\n🤘 Thanks for using Stagehand! Reach out on Slack with feedback: ${chalk.blue("https://stagehand.dev/slack")}\n`);
    process.exit(0); // Ensure clean exit
  }
}

// Handle unexpected errors
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

run();
