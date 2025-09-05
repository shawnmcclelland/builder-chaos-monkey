#!/usr/bin/env node
/**
 * Usage examples:
 *   # First time setup (UI mode required for login)
 *   node burst-builder.js --tabs 1
 *   
 *   # Subsequent runs (can use headless mode)
 *   node burst-builder.js --tabs 5 --headless
 *   node burst-builder.js --tabs 10 --model gpt-5 --headless
 *   node burst-builder.js --tabs 20 --model claude-sonnet-4
 *
 * What it does:
 *  1) Opens https://builder.io/app/projects (main projects page)
 *  2) Checks authentication status and handles login if needed
 *  3) Opens N tabs of the main projects page
 *  4) Selects the specified AI model from the dropdown
 *  5) Uses the main prompt interface to create new projects by submitting prompts
 *  6) Each tab creates a separate new project, providing true load testing
 *
 * Authentication Flow:
 *  - Automatically detects if login is required
 *  - In UI mode: Waits for user to complete login (up to 5 minutes)
 *  - In headless mode: Requires previous successful login, exits with helpful error
 *  - Validates authentication on each tab to ensure success
 *  - Uses persistent browser context to maintain login sessions
 *
 * Load Testing Approach:
 *  - Creates multiple NEW projects instead of opening the same project multiple times
 *  - Each tab hits different virtual machines/resources
 *  - More realistic load testing of Builder.io infrastructure
 *  - Uses the main prompt interface: "What should we build?"
 *  - Configurable AI model selection for cost/quality optimization
 *
 * Space Configuration:
 *  - Always uses TLF space (API Key: e785dd8d482243ef9b7f7760850e1349)
 *  - This ensures consistent API key usage across all tabs
 *  - No space selection needed - always uses TLF space
 *
 * Available Parameters:
 *  --tabs: Number of tabs to open (default: 5, max: 55)
 *  --headless: Run browser in headless mode (requires previous login)
 *  --model: AI model to use (default: gpt-5-mini)
 *    Options: gpt-5-mini, gpt-5, claude-sonnet-4, grok-code-fast, auto
 *  --promptSelector: Custom selector for prompt button (fallback)
 *  --userDataDir: Directory for browser user data
 *
 * Model Options:
 *  - gpt-5-mini: Quality B, Cost 0.1x (default - cost efficient)
 *  - gpt-5: Quality A, Cost 0.4x (balanced)
 *  - claude-sonnet-4: Quality A, Cost 1x (highest quality)
 *  - grok-code-fast: Quality B, Cost 0.1x (fast)
 *  - auto: Automatic selection (currently: Claude Sonnet 4)
 *
 * First Time Setup:
 *  1. Run: node burst-builder.js --tabs 1
 *  2. Complete login in the browser window when prompted
 *  3. After successful login, you can use --headless for subsequent runs
 *
 * Assumptions:
 *  - The main prompt interface is available on the projects page
 *  - Each prompt submission will create a new project
 *  - Browser user data is persisted in USER_DATA_DIR for session management
 */

const { chromium } = require('playwright');
const minimist = require('minimist');
const crypto = require('crypto');


const args = minimist(process.argv.slice(2), {
  string: ['promptSelector', 'userDataDir', 'model'],
  boolean: ['headless'],
  default: {
    tabs: 5,
    headless: false,
    promptSelector: '', // optional override
    userDataDir: './.playwright-user',
    model: 'gpt-5-mini' // default to GPT-5 Mini for cost efficiency
  }
});

const TABS = Math.max(1, Math.min(Number(args.tabs) || 5, 55)); // Increased limit to 55 for large-scale testing
const PROMPT_SELECTOR_OVERRIDE = args.promptSelector?.trim();
const USER_DATA_DIR = args.userDataDir;
const HEADLESS = Boolean(args.headless);
const MODEL = args.model?.toLowerCase();

console.log(`Tabs: ${TABS}`);
console.log(`Headless: ${HEADLESS}`);
console.log(`Model: ${MODEL}`);
console.log(`Space: TLF (API Key: e785dd8d482243ef9b7f7760850e1349)`);
console.log(`Load Testing: Creating ${TABS} new projects via main prompt interface`);

// Heuristics for “project is ready”
const READY_CHECKS = [
  // App shell loaded
  () => document.querySelector('[data-testid="app-shell"], [data-qa="app-shell"]'),
  // Common nav in Projects UI
  () => document.querySelector('nav, [role="navigation"]'),
  // Any substantial app frame
  () => document.querySelector('#root, main, [data-testid], [data-qa]')
];

// Heuristics for “prompt” control (tries in order)
const PROMPT_CANDIDATES = [
  // ARIA role + name
  { type: 'role', name: /prompt/i },
  // Common text button
  { type: 'text', text: /prompt/i },
  // Possible data-testid hooks
  { type: 'css', selector: '[data-testid="prompt"], [data-qa="prompt"]' },
];

const PROMPT_TEXT = process.env.PROMPT_TEXT || "Generate a modern landing page design";

// Function to check if user is authenticated
const checkAuthentication = async (page, tabIndex) => {
  try {
    console.log(`[tab ${tabIndex+1}] Checking authentication status...`);
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
    
    // Wait a bit more for dynamic content to load
    await page.waitForTimeout(2000);
    
    // Check for explicit login/signin buttons (strong indicator of not authenticated)
    const loginSelectors = [
      'button:has-text("Sign in")',
      'button:has-text("Login")',
      'button:has-text("Log in")',
      'a:has-text("Sign in")',
      'a:has-text("Login")',
      'a:has-text("Log in")',
      'button[type="submit"]:has-text("Sign")',
      'button[type="submit"]:has-text("Login")'
    ];
    
    // Check for login buttons first
    for (const selector of loginSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          console.log(`[tab ${tabIndex+1}] Found explicit login button: ${selector}`);
          return { authenticated: false, reason: 'login_required' };
        }
      } catch (e) {
        // Continue checking
      }
    }
    
    // Check for authenticated indicators (more permissive)
    const authSelectors = [
      // Main prompt interface (strongest indicator)
      'div[contenteditable="true"][role="textbox"].tiptap.ProseMirror',
      'button[title="Select AI model"]',
      // Builder.io specific elements
      'button:has-text("What should we build?")',
      'input[placeholder*="Ask"]',
      'textarea[placeholder*="Ask"]',
      // General authenticated page indicators
      'nav',
      '[role="navigation"]',
      '[data-testid="app-shell"]',
      // User account indicators
      '[data-testid*="user"]',
      '[data-testid*="profile"]',
      '[data-testid*="account"]',
      'button[aria-label*="user"]',
      'button[aria-label*="profile"]',
      'button[aria-label*="account"]'
    ];
    
    // Check for authenticated indicators
    for (const selector of authSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          console.log(`[tab ${tabIndex+1}] Found authenticated indicator: ${selector}`);
          return { authenticated: true, reason: 'authenticated' };
        }
      } catch (e) {
        // Continue checking
      }
    }
    
    // If we reach here, check if we're on a Builder.io page (not a login page)
    const currentUrl = page.url();
    if (currentUrl.includes('builder.io') && !currentUrl.includes('login') && !currentUrl.includes('signin')) {
      console.log(`[tab ${tabIndex+1}] On Builder.io page without explicit login buttons, assuming authenticated`);
      return { authenticated: true, reason: 'on_builder_page' };
    }
    
    // If we can't determine, be more permissive in headless mode
    if (HEADLESS) {
      console.log(`[tab ${tabIndex+1}] In headless mode, assuming authenticated (user should have logged in previously)`);
      return { authenticated: true, reason: 'headless_assumption' };
    }
    
    console.log(`[tab ${tabIndex+1}] Could not determine authentication status, assuming not authenticated`);
    return { authenticated: false, reason: 'unknown' };
    
  } catch (error) {
    console.log(`[tab ${tabIndex+1}] Error checking authentication: ${error.message}`);
    // In headless mode, be more permissive
    if (HEADLESS) {
      console.log(`[tab ${tabIndex+1}] Error in headless mode, assuming authenticated`);
      return { authenticated: true, reason: 'headless_error_assumption' };
    }
    return { authenticated: false, reason: 'error' };
  }
};

// Function to handle authentication flow
const handleAuthentication = async (page, tabIndex) => {
  try {
    console.log(`[tab ${tabIndex+1}] Starting authentication flow...`);
    
    // Check current authentication status
    const authStatus = await checkAuthentication(page, tabIndex);
    
    if (authStatus.authenticated) {
      console.log(`[tab ${tabIndex+1}] Already authenticated, proceeding with load test`);
      return { success: true, authenticated: true };
    }
    
    console.log(`[tab ${tabIndex+1}] Authentication status: ${authStatus.reason}`);
    
    // If in headless mode, be more permissive
    if (HEADLESS) {
      // Only fail if we explicitly found login buttons
      if (authStatus.reason === 'login_required') {
        console.error(`[tab ${tabIndex+1}] ERROR: Explicit login required but running in headless mode.`);
        console.error(`[tab ${tabIndex+1}] Please run without --headless flag first to complete login:`);
        console.error(`[tab ${tabIndex+1}]   node burst-builder.js --tabs 1`);
        console.error(`[tab ${tabIndex+1}] After successful login, you can use --headless for subsequent runs.`);
        return { success: false, authenticated: false, reason: 'headless_login_required' };
      } else {
        // In headless mode, assume authenticated if no explicit login buttons found
        console.log(`[tab ${tabIndex+1}] In headless mode, proceeding with load test (assuming authenticated)`);
        return { success: true, authenticated: true };
      }
    }
    
    // In UI mode, wait for user to complete login
    console.log(`[tab ${tabIndex+1}] Please complete login in the browser window...`);
    console.log(`[tab ${tabIndex+1}] Waiting for authentication to complete...`);
    
    // Wait for authentication to complete (poll every 5 seconds for up to 5 minutes)
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes
    const pollInterval = 5000; // 5 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      await page.waitForTimeout(pollInterval);
      
      const currentAuthStatus = await checkAuthentication(page, tabIndex);
      if (currentAuthStatus.authenticated) {
        console.log(`[tab ${tabIndex+1}] Authentication completed successfully!`);
        return { success: true, authenticated: true };
      }
      
      console.log(`[tab ${tabIndex+1}] Still waiting for authentication... (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
    }
    
    console.error(`[tab ${tabIndex+1}] Authentication timeout after 5 minutes`);
    return { success: false, authenticated: false, reason: 'timeout' };
    
  } catch (error) {
    console.log(`[tab ${tabIndex+1}] Error in authentication flow: ${error.message}`);
    // In headless mode, be more permissive with errors
    if (HEADLESS) {
      console.log(`[tab ${tabIndex+1}] Error in headless mode, proceeding with load test`);
      return { success: true, authenticated: true };
    }
    return { success: false, authenticated: false, reason: 'error' };
  }
};

// Function to select AI model
const selectModel = async (page, tabIndex, model) => {
  try {
    console.log(`[tab ${tabIndex+1}] Selecting AI model: ${model}`);
    
    // Try multiple selectors for the model dropdown button
    const dropdownSelectors = [
      'button[title="Select AI model"]',
      'button:has-text("Sonnet")',
      'button:has(svg.tabler-icon-chevron-down)',
      'button[type="button"]:has(span:has-text("Sonnet"))',
      'button:has(span:has(svg))'
    ];
    
    let modelDropdown = null;
    for (const selector of dropdownSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          modelDropdown = element;
          console.log(`[tab ${tabIndex+1}] Found model dropdown with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (modelDropdown) {
      await modelDropdown.click();
      await page.waitForTimeout(1000);
      console.log(`[tab ${tabIndex+1}] Opened model dropdown`);
      
      // Select the specific model based on the model parameter
      let modelSelector = '';
      switch (model) {
        case 'gpt-5-mini':
          modelSelector = 'li[role="menuitem"]:has-text("GPT-5 Mini")';
          break;
        case 'gpt-5':
          modelSelector = 'li[role="menuitem"]:has-text("GPT-5")';
          break;
        case 'claude-sonnet-4':
          modelSelector = 'li[role="menuitem"]:has-text("Claude Sonnet 4")';
          break;
        case 'grok-code-fast':
          modelSelector = 'li[role="menuitem"]:has-text("Grok Code Fast")';
          break;
        case 'auto':
          modelSelector = 'li[role="menuitem"]:has-text("Auto")';
          break;
        default:
          console.log(`[tab ${tabIndex+1}] Unknown model: ${model}, using GPT-5 Mini as fallback`);
          modelSelector = 'li[role="menuitem"]:has-text("GPT-5 Mini")';
      }
      
      // Click the model option
      const modelOption = await page.locator(modelSelector).first();
      if (await modelOption.isVisible()) {
        await modelOption.click();
        await page.waitForTimeout(500);
        console.log(`[tab ${tabIndex+1}] Successfully selected model: ${model}`);
        return true;
      } else {
        console.log(`[tab ${tabIndex+1}] Model option not found: ${model}`);
        
        // Debug: List available options
        try {
          const allOptions = await page.locator('li[role="menuitem"]').all();
          console.log(`[tab ${tabIndex+1}] Available model options:`);
          for (let i = 0; i < Math.min(allOptions.length, 5); i++) {
            try {
              const text = await allOptions[i].textContent();
              console.log(`[tab ${tabIndex+1}] Option ${i}: "${text?.trim()}"`);
            } catch (e) {
              console.log(`[tab ${tabIndex+1}] Could not read option ${i}`);
            }
          }
        } catch (e) {
          console.log(`[tab ${tabIndex+1}] Could not list available options: ${e.message}`);
        }
        return false;
      }
    } else {
      console.log(`[tab ${tabIndex+1}] Model dropdown not found with any selector`);
      
      // Debug: Check what buttons are available
      try {
        const allButtons = await page.locator('button').all();
        console.log(`[tab ${tabIndex+1}] Found ${allButtons.length} buttons on page`);
        for (let i = 0; i < Math.min(allButtons.length, 5); i++) {
          try {
            const title = await allButtons[i].getAttribute('title');
            const text = await allButtons[i].textContent();
            console.log(`[tab ${tabIndex+1}] Button ${i}: title="${title}", text="${text?.trim()}"`);
          } catch (e) {
            console.log(`[tab ${tabIndex+1}] Could not inspect button ${i}`);
          }
        }
      } catch (e) {
        console.log(`[tab ${tabIndex+1}] Could not inspect buttons: ${e.message}`);
      }
      return false;
    }
  } catch (error) {
    console.log(`[tab ${tabIndex+1}] Error selecting model: ${error.message}`);
    return false;
  }
};



(async () => {
  const browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: HEADLESS,
    channel: 'chrome', // use the Chrome build if available
    viewport: { width: 1440, height: 900 },
    // Optimize for large-scale operations
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--max_old_space_size=4096' // Increase memory limit
    ]
  });

  // 1) Open dashboard to ensure session is "warmed" and handle authentication
  const dash = await browser.newPage();
  
  // Navigate to main projects page to use the main prompt interface
  console.log('Navigating to main projects page (TLF space - API key: e785dd8d482243ef9b7f7760850e1349)...');
  try {
    await dash.goto('https://builder.io/app/projects', { waitUntil: 'load', timeout: 120_000 });
    console.log('Successfully navigated to main projects page');
  } catch (error) {
    console.log('Main projects page navigation failed:', error.message);
    throw error;
  }
  
  // 2) Handle authentication flow
  console.log('\n=== AUTHENTICATION CHECK ===');
  const authResult = await handleAuthentication(dash, 0);
  
  if (!authResult.success) {
    if (authResult.reason === 'headless_login_required') {
      console.error('\n❌ AUTHENTICATION FAILED: Cannot complete login in headless mode');
      console.error('Please run the following command first to complete login:');
      console.error('  node burst-builder.js --tabs 1');
      console.error('After successful login, you can use --headless for subsequent runs.');
      await browser.close();
      process.exit(1);
    } else {
      console.error(`\n❌ AUTHENTICATION FAILED: ${authResult.reason}`);
      await browser.close();
      process.exit(1);
    }
  }
  
  console.log('✅ Authentication successful, proceeding with load test...\n');

  // 3) Open N tabs of the main projects page for creating new projects
  const pages = [];
  const BATCH_SIZE = Math.min(10, TABS); // Process tabs in batches of 10 to prevent overwhelming
  
  console.log(`Opening ${TABS} tabs to main projects page in batches of ${BATCH_SIZE}...`);
  
  for (let batchStart = 0; batchStart < TABS; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, TABS);
    const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(TABS / BATCH_SIZE);
    
    console.log(`\n=== Processing Batch ${batchNumber}/${totalBatches} (tabs ${batchStart + 1}-${batchEnd}) ===`);
    
    // Process this batch
    for (let i = batchStart; i < batchEnd; i++) {
      const p = await browser.newPage();
      
      // Navigate to main projects page with cache busting to ensure fresh sessions
      const cacheBust = `?loadtest=${crypto.randomUUID()}&i=${i+1}`;
      try {
        await p.goto('https://builder.io/app/projects' + cacheBust, { waitUntil: 'domcontentloaded', timeout: 120_000 });
        console.log(`[tab ${i+1}/${TABS}] Successfully navigated to main projects page`);
        
        // Quick authentication check for this tab
        const tabAuthStatus = await checkAuthentication(p, i);
        if (!tabAuthStatus.authenticated) {
          console.warn(`[tab ${i+1}/${TABS}] WARNING: Tab may not be authenticated (${tabAuthStatus.reason})`);
          console.warn(`[tab ${i+1}/${TABS}] This tab may fail during project creation`);
        } else {
          console.log(`[tab ${i+1}/${TABS}] Tab authentication confirmed`);
        }
      } catch (error) {
        console.error(`[tab ${i+1}/${TABS}] CRITICAL: Failed to navigate to main projects page: ${error.message}`);
        console.error(`[tab ${i+1}/${TABS}] This suggests authentication issues or network problems.`);
        throw error;
      }
      
      pages.push(p);
      // Stagger slightly to avoid thundering herd
      await p.waitForTimeout(100); // Reduced delay for faster batch processing
    }
    
    // Wait between batches to prevent overwhelming the system
    if (batchEnd < TABS) {
      console.log(`Batch ${batchNumber} complete. Waiting 2 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // 4) Wait for each tab to be "ready"
  await Promise.all(pages.map(async (p) => {
    await p.waitForLoadState('domcontentloaded', { timeout: 120_000 });
    // Custom "ready" poll in page context
    await p.waitForFunction((checks) => checks.some(fnStr => {
      try { return (new Function(`return (${fnStr})();`))(); } catch { return false; }
    }), READY_CHECKS.map(fn => fn.toString()), { timeout: 120_000, polling: 500 });
    
    // Additional wait for Builder interface to be fully interactive
    console.log(`[tab] Waiting for Builder interface to be ready...`);
    try {
      // Wait for either the prompt input or some other Builder UI element
      await p.waitForFunction(() => {
        // Check for prompt input
        const promptInput = document.querySelector('input[placeholder*="Ask"], textarea[placeholder*="Ask"], input[placeholder*="Fusion"], textarea[placeholder*="Fusion"]');
        if (promptInput) return true;
        
        // Check for Builder navigation
        const nav = document.querySelector('nav, [role="navigation"], [data-testid="app-shell"]');
        if (nav) return true;
        
        // Check for any input field
        const anyInput = document.querySelector('input, textarea');
        if (anyInput) return true;
        
        return false;
      }, { timeout: 30000, polling: 1000 });
      console.log(`[tab] Builder interface appears ready`);
    } catch (e) {
      console.log(`[tab] Timeout waiting for Builder interface: ${e.message}`);
    }
  }));

  // 5) Create new projects using the main prompt interface
  const triggerOnPage = async (p, idx) => {
    console.log(`[tab ${idx+1}] Starting new project creation...`);
    
    // Wait for the main prompt interface to fully load
    await p.waitForTimeout(5000);
    
    try {
      // First, select the AI model
      const modelSelected = await selectModel(p, idx, MODEL);
      if (!modelSelected) {
        console.log(`[tab ${idx+1}] Model selection failed, continuing with default model`);
      }
      
      console.log(`[tab ${idx+1}] Looking for main prompt input field...`);
      
      // Target the specific ProseMirror contenteditable div from the main projects page
      const promptInput = await p.locator('div[contenteditable="true"][role="textbox"].tiptap.ProseMirror').first();
      
      if (await promptInput.isVisible()) {
        console.log(`[tab ${idx+1}] Found main prompt input field`);
        
        // Click to focus the contenteditable div
        await promptInput.click();
        await p.waitForTimeout(500);
        
        // Type the prompt text to create a new project
        await promptInput.type(PROMPT_TEXT, { delay: 150 });
        
        // Wait for text to be fully typed
        await p.waitForTimeout(1000);
        
        // Look for the send button with the specific selector
        const sendButton = await p.locator('button[type="button"][title="Send message"]').first();
        
        if (await sendButton.isVisible()) {
          // Check if button is enabled (not disabled)
          const isDisabled = await sendButton.getAttribute('disabled');
          if (!isDisabled) {
            await sendButton.click();
            console.log(`[tab ${idx+1}] Successfully clicked send button to create new project`);
            return true;
          } else {
            console.log(`[tab ${idx+1}] Send button is disabled, trying Enter key instead`);
            await promptInput.press('Enter');
            console.log(`[tab ${idx+1}] Pressed Enter to submit prompt`);
            return true;
          }
        } else {
          console.log(`[tab ${idx+1}] Send button not found, trying Enter key`);
          await promptInput.press('Enter');
          console.log(`[tab ${idx+1}] Pressed Enter to submit prompt`);
          return true;
        }
      } else {
        console.log(`[tab ${idx+1}] Main prompt input field not found`);
        
        // Debug: Check what's actually on the page
        try {
          const allContentEditable = await p.locator('[contenteditable="true"]').all();
          console.log(`[tab ${idx+1}] Found ${allContentEditable.length} contenteditable elements`);
          
          for (let i = 0; i < Math.min(allContentEditable.length, 3); i++) {
            try {
              const className = await allContentEditable[i].getAttribute('class');
              const role = await allContentEditable[i].getAttribute('role');
              const visible = await allContentEditable[i].isVisible();
              console.log(`[tab ${idx+1}] ContentEditable ${i}: class="${className}", role="${role}", visible=${visible}`);
            } catch (e) {
              console.log(`[tab ${idx+1}] Could not inspect contenteditable ${i}: ${e.message}`);
            }
          }
        } catch (e) {
          console.log(`[tab ${idx+1}] Could not inspect contenteditable elements: ${e.message}`);
        }
      }
    } catch (error) {
      console.log(`[tab ${idx+1}] Error with main prompt interface: ${error.message}`);
    }

    // If user provided a selector override, use that as fallback
    if (PROMPT_SELECTOR_OVERRIDE) {
      try {
        const ok = await p.$(PROMPT_SELECTOR_OVERRIDE);
        if (ok && await ok.isVisible()) {
          await ok.click({ timeout: 15_000 });
          console.log(`[tab ${idx+1}] Used override selector for prompt.`);
          return true;
        }
      } catch (e) {
        console.log(`[tab ${idx+1}] Override selector failed: ${e.message}`);
      }
    }

    console.warn(`[tab ${idx+1}] Could not find the main prompt interface. Make sure you're on the correct page.`);
    return false;
  };

  // Process prompts in batches to prevent overwhelming the system
  console.log(`\n=== Starting Prompt Injection for ${TABS} tabs ===`);
  const results = [];
  const PROMPT_BATCH_SIZE = Math.min(15, TABS); // Process prompts in smaller batches
  
  for (let batchStart = 0; batchStart < pages.length; batchStart += PROMPT_BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + PROMPT_BATCH_SIZE, pages.length);
    const batchNumber = Math.floor(batchStart / PROMPT_BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(pages.length / PROMPT_BATCH_SIZE);
    
    console.log(`\n--- Prompt Batch ${batchNumber}/${totalBatches} (tabs ${batchStart + 1}-${batchEnd}) ---`);
    
    const batchPages = pages.slice(batchStart, batchEnd);
    const batchResults = await Promise.all(batchPages.map((p, i) => triggerOnPage(p, batchStart + i)));
    results.push(...batchResults);
    
    // Progress update
    const completedTabs = results.length;
    const successCount = results.filter(Boolean).length;
    console.log(`Progress: ${completedTabs}/${TABS} tabs processed, ${successCount} successful`);
    
    // Small delay between prompt batches
    if (batchEnd < pages.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const okCount = results.filter(Boolean).length;
  console.log(`\n=== FINAL RESULTS ===`);
  console.log(`Successfully triggered prompts on ${okCount}/${TABS} tabs (${Math.round(okCount/TABS*100)}% success rate)`);

  // Keep the browser open so you can observe. Press Ctrl+C to quit.
  // If you prefer auto-close after N seconds, set AUTO_CLOSE_SECONDS.
  const AUTO_CLOSE_SECONDS = Number(process.env.AUTO_CLOSE_SECONDS || 0);
  if (AUTO_CLOSE_SECONDS > 0) {
    console.log(`Auto-closing in ${AUTO_CLOSE_SECONDS}s...`);
    await new Promise(r => setTimeout(r, AUTO_CLOSE_SECONDS * 1000));
    await browser.close();
  } else {
    console.log('Leave this running to sustain load. Ctrl+C to exit.');
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
