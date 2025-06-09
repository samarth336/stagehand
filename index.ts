import { Stagehand, Page, BrowserContext } from "@browserbasehq/stagehand";
import StagehandConfig from "./stagehand.config.js";
import chalk from "chalk";
import boxen from "boxen";
import { AutomationParser } from "./automationParser.js";
import fs from 'fs/promises';

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
    console.log(chalk.blue(`Attempting to read instructions from: ${process.cwd()}\\${instructionsFilePath}`));
    const instructionsFileContent = await fs.readFile(instructionsFilePath, 'utf-8');
    instructions = instructionsFileContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#')); // Ignore empty lines and comments
  } catch (error) {
    const e = error as Error;
    console.error(chalk.red("Error reading instructions.txt:"), e.message);
    console.log(chalk.yellow(`Please ensure 'instructions.txt' exists in the project root (c:\\Users\\Samarth Patil\\Desktop\\stagehand\\my-app).`));
    // Exit if instructions file cannot be read, as it's the only input method now.
    return; 
  }

  if (instructions.length === 0) {
    console.log(chalk.yellow("No instructions found in instructions.txt or the file could not be read."));
    console.log(chalk.blue("Example instructions.txt content:"));
    console.log(chalk.blue("# This is a comment"));
    console.log(chalk.blue("go to example.com"));
    console.log(chalk.blue("screenshot example_homepage"));
  } else {
    console.log(chalk.green(`Found ${instructions.length} instructions. Executing...`));
  }
  
  const results = await automationParser.processInstructions(instructions);

  console.log(chalk.bold("\n--- Automation Execution Summary ---"));
  results.forEach(result => {
    if (result.success) {
      process.stdout.write(chalk.green(`✅ SUCCESS: ${result.instruction}\n`));
      if (result.result !== undefined && result.result !== null) {
        if (typeof result.result === 'string' || typeof result.result === 'number' || typeof result.result === 'boolean' || Array.isArray(result.result) || (typeof result.result === 'object' && Object.keys(result.result).length > 0) ) {
             process.stdout.write(chalk.cyan(`   Output: ${JSON.stringify(result.result)}\n`));
        }
      }
    } else {
      process.stdout.write(chalk.red(`❌ FAILED:  ${result.instruction}\n`));
      process.stdout.write(chalk.red(`   Error: ${result.error}\n`));
    }
  });
  console.log(chalk.bold("--- End of Summary ---"));

  // Removed interactive loop and related console logs and browser reconnection logic.

  if (StagehandConfig.env === "LOCAL") {
    console.log(chalk.magenta("\nAutomation complete. Browser will close in 10 seconds if running locally..."));
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
      console.log(
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
    console.error(chalk.red("Fatal error in run function:"), e);
  } finally {
    if (stagehand) {
      try {
        await stagehand.close();
      } catch (error) {
        const e = error as Error;
        console.error(chalk.red("Error while closing Stagehand:"), e);
      }
    }
    
    console.log(`\n🤘 Thanks for using Stagehand! Reach out on Slack with feedback: ${chalk.blue("https://stagehand.dev/slack")}\n`);
    // process.exit(0); // Consider if exit is always needed or if script should end naturally
  }
}

run();

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
// The error logging in the summary part seems fine and should not stop execution for all instructions.
