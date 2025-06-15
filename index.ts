import { Stagehand, Page, BrowserContext } from "@browserbasehq/stagehand";
import StagehandConfig from "./stagehand.config.js";
import chalk from "chalk";
import boxen from "boxen";
import { AutomationParser } from "./automationParser.js";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a custom console logger that writes to both console and file
class ConsoleLogger {
  private outputBuffer: string[] = [];
  private outputFile: string;

  constructor(outputFile: string = 'automation_output.txt') {
    this.outputFile = path.join(__dirname, outputFile);
  }

  private async writeToFile(message: string) {
    try {
      await fs.appendFile(this.outputFile, message + '\n');
    } catch (error) {
      console.error(chalk.red("Error writing to output file:"), error);
    }
  }

  log(...args: any[]) {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    console.log(...args);
    this.outputBuffer.push(message);
    this.writeToFile(message);
  }

  error(...args: any[]) {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    console.error(...args);
    this.outputBuffer.push(`ERROR: ${message}`);
    this.writeToFile(`ERROR: ${message}`);
  }

  info(...args: any[]) {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    console.info(...args);
    this.outputBuffer.push(`INFO: ${message}`);
    this.writeToFile(`INFO: ${message}`);
  }

  getOutput() {
    return this.outputBuffer.join('\n');
  }
}

// Create a global logger instance
const logger = new ConsoleLogger();

async function main({ page, context, stagehand }: {
  page: Page; // Playwright Page with act, extract, and observe methods
  context: BrowserContext; // Playwright BrowserContext
  stagehand: Stagehand; // Stagehand instance
}) {
  // Set a longer timeout for navigation
  page.setDefaultNavigationTimeout(60000); // 60 seconds timeout
  
  // Also set a longer timeout for waitForSelector
  page.setDefaultTimeout(60000); // 60 seconds timeout for all waiting operations
  
  const automationParser = new AutomationParser(page, context); // Pass context here
  let instructions: string[] = [];

  try {
    const instructionsFilePath = 'instructions.txt';
    logger.info(`Attempting to read instructions from: ${process.cwd()}\\${instructionsFilePath}`);
    const instructionsFileContent = await fs.readFile(instructionsFilePath, 'utf-8');
    instructions = instructionsFileContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#')); // Ignore empty lines and comments
  } catch (error) {
    const e = error as Error;
    logger.error("Error reading instructions.txt:", e.message);
    logger.info(`Please ensure 'instructions.txt' exists in the project root (c:\\Users\\Samarth Patil\\Desktop\\stagehand\\my-app).`);
    // Exit if instructions file cannot be read, as it's the only input method now.
    return; 
  }

  if (instructions.length === 0) {
    logger.info("No instructions found in instructions.txt or the file could not be read.");
    logger.info("Example instructions.txt content:");
    logger.info("# This is a comment");
    logger.info("go to example.com");
    logger.info("screenshot example_homepage");
  } else {
    logger.info(`Found ${instructions.length} instructions. Executing...`);
  }
  
  const results = await automationParser.processInstructions(instructions);

  // Create a formatted output string
  let outputString = "\n=== Automation Execution Summary ===\n";
  for (const result of results) {
    if (result.success) {
      outputString += `✅ SUCCESS: ${result.instruction}\n`;
      if (result.result !== undefined && result.result !== null) {
        if (typeof result.result === 'string' || typeof result.result === 'number' || typeof result.result === 'boolean' || Array.isArray(result.result) || (typeof result.result === 'object' && Object.keys(result.result).length > 0) ) {
          // If this is the HTML content from extractHTML command
          if (result.instruction.toLowerCase().startsWith('extracthtml')) {
            const outputPath = path.join(__dirname, 'wikipedia_content.html');
            await fs.writeFile(outputPath, result.result);
            outputString += `   HTML content saved to: ${outputPath}\n`;
          } else {
            outputString += `   Output: ${JSON.stringify(result.result)}\n`;
          }
        }
      }
    } else {
      outputString += `❌ FAILED:  ${result.instruction}\n`;
      outputString += `   Error: ${result.error}\n`;
    }
  }
  outputString += "=== End of Summary ===\n";

  logger.info(outputString);

  if (StagehandConfig.env === "LOCAL") {
    logger.info("\nAutomation complete. Browser will close in 10 seconds if running locally...");
    await page.waitForTimeout(10000);
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
      logger.info(
        boxen(
          `View this session live in your browser: \n${chalk.blue(
            `https://browserbase.com/sessions/${stagehand.browserbaseSessionID}`,
          )}`,
          {
            title: "Browserbase",
            padding: 1,
            margin: 1, // Reduced margin
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
    const e = error as Error;
    logger.error("Fatal error in run function:", e);
  } finally {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch (error) {
        const e = error as Error;
        logger.error("Error while closing Stagehand:", e);
      }
    }
    
    logger.info(`\n🤘 Thanks for using Stagehand! Reach out on Slack with feedback: ${chalk.blue("https://stagehand.dev/slack")}\n`);
    // process.exit(0); // Consider if exit is always needed or if script should end naturally
  }
}

run();

// Handle unexpected errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// The error logging in the summary part seems fine and should not stop execution for all instructions.
