#!/usr/bin/env node
/**
 * Usage examples:
 *   node burst-builder.js --projectUrl "https://builder.io/app/projects/8987b47c30d54d449a78149d09072b7f/zenith-landing" --tabs 5
 *   node burst-builder.js --tabs 5 --headless
 *
 * What it does:
 *  1) Opens https://builder.io/projects (dashboard) so your session/cookies load.
 *  2) Opens the specific project in N tabs.
 *  3) When each tab signals "loaded", it triggers your “prompt” action across all tabs.
 *
 * Assumptions:
 *  - You’re already signed in to Builder in Chrome. This script starts a persistent context
 *    so you can reuse the same session between runs (see USER_DATA_DIR).
 *  - If the “Prompt” action isn’t a button literally named “Prompt”, set a custom selector via
 *    --promptSelector ".your-button[data-action='prompt']"
 */

const { chromium } = require('playwright');
const minimist = require('minimist');
const crypto = require('crypto');


const args = minimist(process.argv.slice(2), {
  string: ['projectUrl', 'promptSelector', 'userDataDir', 'space'],
  boolean: ['headless', 'createBranches'],
  default: {
    tabs: 5,
    headless: false,
    projectUrl: 'https://builder.io/app/projects/54a6f2593dcf44f98778a5543b209e5d',
    promptSelector: '', // optional override
    userDataDir: './.playwright-user',
    createBranches: false,
    space: 'auto' // auto, ilc, tlf
  }
});

const TABS = Math.max(1, Math.min(Number(args.tabs) || 5, 55)); // Increased limit to 55 for large-scale testing
const PROJECT_URL = args.projectUrl?.replace(/^["']|["']$/g, ''); // Remove surrounding quotes
const PROMPT_SELECTOR_OVERRIDE = args.promptSelector?.trim();
const USER_DATA_DIR = args.userDataDir;
const HEADLESS = Boolean(args.headless);
const CREATE_BRANCHES = process.env.CREATE_BRANCHES === 'true' || args.createBranches || false;
const SPACE = args.space?.toLowerCase();

// Validate the project URL
if (!PROJECT_URL || !PROJECT_URL.startsWith('http')) {
  console.error('Error: Invalid project URL. Please provide a valid Builder.io project URL.');
  console.error('Example: https://builder.io/app/projects/YOUR_PROJECT_ID/PROJECT_NAME');
  process.exit(1);
}

console.log(`Project URL: ${PROJECT_URL}`);
console.log(`Tabs: ${TABS}`);
console.log(`Create Branches: ${CREATE_BRANCHES}`);
console.log(`Headless: ${HEADLESS}`);
console.log(`Space: ${SPACE}`);

// Extract and display project information for debugging
const urlParts = PROJECT_URL.split('/');
const projectId = urlParts[urlParts.length - 2];
const projectName = urlParts[urlParts.length - 1];
console.log(`Project ID: ${projectId}`);
console.log(`Project Name: ${projectName}`);

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

// Function to create a new branch URL and navigate to it
const createBranchUrl = (baseUrl, tabIndex) => {
  // Generate a unique branch name
  const branchName = `loadtest-tab-${tabIndex + 1}-${Date.now()}`;
  
  // Remove any existing branch from the URL and add the new branch
  const urlParts = baseUrl.split('/');
  const projectId = urlParts[urlParts.length - 2]; // Get project ID
  const baseProjectUrl = urlParts.slice(0, -1).join('/'); // Remove last segment
  
  // Create the branch URL
  const branchUrl = `${baseProjectUrl}/${branchName}`;
  
  console.log(`[tab ${tabIndex+1}] Generated branch URL: ${branchUrl}`);
  return { branchUrl, branchName };
};

// Function to create a new branch using Builder's API/UI
const createBranch = async (page, tabIndex, baseUrl) => {
  try {
    console.log(`[tab ${tabIndex+1}] Creating new branch...`);
    
    // First, try to navigate to the branch URL directly
    // Builder might auto-create the branch if it doesn't exist
    const { branchUrl, branchName } = createBranchUrl(baseUrl, tabIndex);
    
    try {
      await page.goto(branchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log(`[tab ${tabIndex+1}] Successfully navigated to branch: ${branchName}`);
      return { success: true, branchName, branchUrl };
    } catch (error) {
      console.log(`[tab ${tabIndex+1}] Direct branch navigation failed, trying UI approach: ${error.message}`);
    }
    
    // If direct navigation fails, try the UI approach
    // Look for branch creation button/icon
    const branchSelectors = [
      'button[aria-label*="branch"]',
      'button[title*="branch"]',
      '[data-testid*="branch"]',
      '[data-qa*="branch"]',
      'button:has-text("Branch")',
      'button:has-text("Create branch")',
      'button:has-text("New branch")',
      // Look for dropdown or menu that might contain branch options
      'button[aria-haspopup="true"]',
      'button[aria-expanded]',
      // Look for plus icon or add button
      'button[aria-label*="Add"]',
      'button[title*="Add"]',
      'button:has(svg)',
      // Generic branch-related selectors
      '[class*="branch"]',
      '[class*="Branch"]'
    ];
    
    let branchButton = null;
    let usedSelector = '';
    
    for (const selector of branchSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible()) {
          branchButton = element;
          usedSelector = selector;
          console.log(`[tab ${tabIndex+1}] Found branch button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (branchButton) {
      // Click the branch button
      await branchButton.click();
      await page.waitForTimeout(1000);
      
      // Look for "Create new branch" or similar option
      const createBranchSelectors = [
        'button:has-text("Create new branch")',
        'button:has-text("New branch")',
        'button:has-text("Create branch")',
        '[data-testid*="create-branch"]',
        '[data-qa*="create-branch"]',
        'button[aria-label*="create"]',
        'button[title*="create"]'
      ];
      
      let createButton = null;
      for (const selector of createBranchSelectors) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible()) {
            createButton = element;
            console.log(`[tab ${tabIndex+1}] Found create branch button: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue
        }
      }
      
      if (createButton) {
        await createButton.click();
        await page.waitForTimeout(1000);
        
        // Look for branch name input field
        const nameInputSelectors = [
          'input[placeholder*="branch"]',
          'input[placeholder*="name"]',
          'input[type="text"]',
          'input:not([type="hidden"])',
          '[contenteditable="true"]'
        ];
        
        let nameInput = null;
        for (const selector of nameInputSelectors) {
          try {
            const element = await page.locator(selector).first();
            if (await element.isVisible()) {
              nameInput = element;
              console.log(`[tab ${tabIndex+1}] Found name input: ${selector}`);
              break;
            }
          } catch (e) {
            // Continue
          }
        }
        
        if (nameInput) {
          // Clear and type branch name
          await nameInput.fill('');
          await nameInput.type(branchName, { delay: 100 });
          await page.waitForTimeout(500);
          
          // Look for create/confirm button
          const confirmSelectors = [
            'button:has-text("Create")',
            'button:has-text("Confirm")',
            'button:has-text("Save")',
            'button[type="submit"]',
            '[data-testid*="confirm"]',
            '[data-qa*="confirm"]'
          ];
          
          let confirmButton = null;
          for (const selector of confirmSelectors) {
            try {
              const element = await page.locator(selector).first();
              if (await element.isVisible()) {
                confirmButton = element;
                break;
              }
            } catch (e) {
              // Continue
            }
          }
          
          if (confirmButton) {
            await confirmButton.click();
            await page.waitForTimeout(2000);
            console.log(`[tab ${tabIndex+1}] Successfully created branch via UI: ${branchName}`);
            return { success: true, branchName, branchUrl };
          } else {
            // Try pressing Enter as fallback
            await nameInput.press('Enter');
            await page.waitForTimeout(2000);
            console.log(`[tab ${tabIndex+1}] Created branch via Enter key: ${branchName}`);
            return { success: true, branchName, branchUrl };
          }
        }
      }
    }
    
    console.log(`[tab ${tabIndex+1}] Could not find branch creation interface`);
    return { success: false, branchName: null, branchUrl: null };
    
  } catch (error) {
    console.log(`[tab ${tabIndex+1}] Error creating branch: ${error.message}`);
    return { success: false, branchName: null, branchUrl: null };
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

  // 1) Open dashboard to ensure session is "warmed" and navigate to correct space
  const dash = await browser.newPage();
  
  // Navigate to the correct space based on user preference or project URL
  if (SPACE === 'ilc' || (SPACE === 'auto' && PROJECT_URL.includes('27584ede79c245538e7204704ba66afe'))) {
    console.log('Navigating to ILC space...');
    try {
      await dash.goto('https://builder.io/app/projects/27584ede79c245538e7204704ba66afe', { waitUntil: 'load', timeout: 120_000 });
      console.log('Successfully navigated to ILC space');
    } catch (error) {
      console.log('ILC space navigation failed, falling back to general dashboard:', error.message);
      await dash.goto('https://builder.io/projects', { waitUntil: 'load', timeout: 120_000 });
    }
  } else if (SPACE === 'tlf' || (SPACE === 'auto' && PROJECT_URL.includes('550d0ae46a844dae867aa46ee33c7048'))) {
    console.log('Navigating to TLF space...');
    try {
      await dash.goto('https://builder.io/app/projects/550d0ae46a844dae867aa46ee33c7048', { waitUntil: 'load', timeout: 120_000 });
      console.log('Successfully navigated to TLF space');
    } catch (error) {
      console.log('TLF space navigation failed, falling back to general dashboard:', error.message);
      await dash.goto('https://builder.io/projects', { waitUntil: 'load', timeout: 120_000 });
    }
  } else {
    console.log('Navigating to general Builder.io dashboard...');
    await dash.goto('https://builder.io/projects', { waitUntil: 'load', timeout: 120_000 });
  }
  
  // Don't block forever if SSO login shows—give the user a moment to complete it.
  // If not authenticated, the next steps will fail with helpful errors.

  // 2) Open N tabs of the specific project with batching for large-scale operations
  const pages = [];
  const branchUrls = [];
  const BATCH_SIZE = Math.min(10, TABS); // Process tabs in batches of 10 to prevent overwhelming
  
  console.log(`Opening ${TABS} tabs in batches of ${BATCH_SIZE}...`);
  
  for (let batchStart = 0; batchStart < TABS; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, TABS);
    const batchNumber = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(TABS / BATCH_SIZE);
    
    console.log(`\n=== Processing Batch ${batchNumber}/${totalBatches} (tabs ${batchStart + 1}-${batchEnd}) ===`);
    
    // Process this batch
    for (let i = batchStart; i < batchEnd; i++) {
      const p = await browser.newPage();
      
      if (CREATE_BRANCHES) {
        // Create a unique branch URL for this tab
        const { branchUrl, branchName } = createBranchUrl(PROJECT_URL, i);
        branchUrls.push({ branchUrl, branchName });
        
        // Navigate directly to the branch URL
        try {
          await p.goto(branchUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
          console.log(`[tab ${i+1}/${TABS}] Navigated to branch: ${branchName}`);
        } catch (error) {
          console.log(`[tab ${i+1}/${TABS}] Branch navigation failed, falling back to main: ${error.message}`);
          // Fallback to main project URL
          const cacheBust = (PROJECT_URL.includes('?') ? '&' : '?') + `loadtest=${crypto.randomUUID()}&i=${i+1}`;
          try {
            await p.goto(PROJECT_URL + cacheBust, { waitUntil: 'domcontentloaded', timeout: 120_000 });
            console.log(`[tab ${i+1}/${TABS}] Successfully navigated to main project`);
          } catch (mainError) {
            console.error(`[tab ${i+1}/${TABS}] CRITICAL: Failed to navigate to main project: ${mainError.message}`);
            console.error(`[tab ${i+1}/${TABS}] This suggests the project URL is invalid or you don't have access to it.`);
            console.error(`[tab ${i+1}/${TABS}] Please verify the project URL and your permissions.`);
            throw mainError;
          }
        }
      } else {
        // Use main project URL with cache busting
        const cacheBust = (PROJECT_URL.includes('?') ? '&' : '?') + `loadtest=${crypto.randomUUID()}&i=${i+1}`;
        try {
          await p.goto(PROJECT_URL + cacheBust, { waitUntil: 'domcontentloaded', timeout: 120_000 });
          console.log(`[tab ${i+1}/${TABS}] Successfully navigated to main project`);
        } catch (error) {
          console.error(`[tab ${i+1}/${TABS}] CRITICAL: Failed to navigate to project: ${error.message}`);
          console.error(`[tab ${i+1}/${TABS}] This suggests the project URL is invalid or you don't have access to it.`);
          console.error(`[tab ${i+1}/${TABS}] Please verify the project URL and your permissions.`);
          throw error;
        }
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

  // 3) Wait for each tab to be "ready"
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

  // 4) Trigger "prompt" across all tabs
  const triggerOnPage = async (p, idx) => {
    console.log(`[tab ${idx+1}] Starting prompt injection...`);
    
    // Wait a bit more for the interface to fully load
    await p.waitForTimeout(5000);
    
    // First, try to find and fill the prompt input field
    try {
      console.log(`[tab ${idx+1}] Looking for prompt input field...`);
      
      // Try multiple selectors with better specificity - prioritize the actual prompt input
      const selectors = [
        // Target the ProseMirror contenteditable div first (the actual prompt input)
        'div[contenteditable="true"][role="textbox"]',
        'div.tiptap.ProseMirror',
        'div[class*="ProseMirror"]',
        // Then try the editor-empty-node class
        '.editor-empty-node.editor-empty',
        // Then try placeholder-based selectors
        'input[placeholder*="Ask"]',
        'textarea[placeholder*="Ask"]',
        'input[placeholder*="Fusion"]',
        'textarea[placeholder*="Fusion"]',
        '[placeholder*="Ask"]',
        '[placeholder*="Fusion"]',
        // Fallback to data attributes
        '[data-testid*="prompt"]',
        '[data-qa*="prompt"]',
        '[data-testid*="input"]',
        '[data-qa*="input"]',
        // Generic fallbacks last
        'input[type="text"]',
        'textarea',
        'input'
      ];
      
      let promptInput = null;
      let usedSelector = '';
      
      for (const selector of selectors) {
        try {
          const element = await p.locator(selector).first();
          if (await element.isVisible()) {
            promptInput = element;
            usedSelector = selector;
            console.log(`[tab ${idx+1}] Found input field with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      if (promptInput) {
        // Wait for element to be fully interactive
        await promptInput.waitFor({ state: 'visible', timeout: 10000 });
        
        // Additional verification - make sure this is the right input field
        try {
          const placeholder = await promptInput.getAttribute('placeholder');
          const className = await promptInput.getAttribute('class');
          console.log(`[tab ${idx+1}] Found input - placeholder: "${placeholder}", class: "${className}"`);
          
          // If this looks like a branch name input, skip it
          if (placeholder && (placeholder.includes('branch') || placeholder.includes('Branch'))) {
            console.log(`[tab ${idx+1}] Skipping branch name input, looking for prompt input...`);
            return false; // This will trigger the fallback logic
          }
        } catch (e) {
          console.log(`[tab ${idx+1}] Could not inspect input attributes: ${e.message}`);
        }
        
        // Handle contenteditable divs differently than regular inputs
        if (usedSelector.includes('contenteditable') || usedSelector.includes('ProseMirror')) {
          console.log(`[tab ${idx+1}] Detected contenteditable div, using click + type approach`);
          
          // Click to focus the contenteditable div
          await promptInput.click();
          await p.waitForTimeout(500);
          
          // Type the text directly into the contenteditable div
          await promptInput.type(PROMPT_TEXT, { delay: 150 });
          
          // Wait a moment for the text to be fully typed
          await p.waitForTimeout(1000);
          
          // For contenteditable divs, we might need to trigger the submit differently
          // Try pressing Enter first
          await promptInput.press('Enter');
          
          // If Enter doesn't work, try clicking a submit button
          await p.waitForTimeout(1000);
          try {
            const submitButton = await p.locator('button[type="submit"], [role="button"]:has-text("Send"), [data-testid*="submit"], [data-qa*="submit"]').first();
            if (await submitButton.isVisible()) {
              await submitButton.click();
              console.log(`[tab ${idx+1}] Clicked submit button after typing`);
            }
          } catch (e) {
            console.log(`[tab ${idx+1}] No submit button found, relying on Enter key`);
          }
        } else {
          // Handle regular input fields as before
          await promptInput.fill('');
          await promptInput.type(PROMPT_TEXT, { delay: 150 });
          
          // Wait a moment for the text to be fully typed
          await p.waitForTimeout(1000);
          
          // Try to submit by pressing Enter
          await promptInput.press('Enter');
        }
        
        console.log(`[tab ${idx+1}] Successfully submitted prompt: "${PROMPT_TEXT}" using selector: ${usedSelector}`);
        return true;
      } else {
        console.log(`[tab ${idx+1}] No input field found with any selector`);
        
        // Debug: Let's see what elements are actually on the page
        try {
          const allInputs = await p.locator('input, textarea').all();
          console.log(`[tab ${idx+1}] Found ${allInputs.length} input/textarea elements`);
          
          for (let i = 0; i < Math.min(allInputs.length, 5); i++) {
            try {
              const placeholder = await allInputs[i].getAttribute('placeholder');
              const type = await allInputs[i].getAttribute('type');
              const visible = await allInputs[i].isVisible();
              console.log(`[tab ${idx+1}] Input ${i}: type=${type}, placeholder="${placeholder}", visible=${visible}`);
            } catch (e) {
              console.log(`[tab ${idx+1}] Could not inspect input ${i}: ${e.message}`);
            }
          }
        } catch (e) {
          console.log(`[tab ${idx+1}] Could not inspect inputs: ${e.message}`);
        }
      }
    } catch (error) {
      console.log(`[tab ${idx+1}] Error finding prompt input field: ${error.message}`);
    }

    // If user provided a selector override, use that first (fallback to original behavior)
    if (PROMPT_SELECTOR_OVERRIDE) {
      try {
        const ok = await p.$(PROMPT_SELECTOR_OVERRIDE);
        if (ok && await ok.isVisible()) {
          await ok.click({ timeout: 15_000 });
          console.log(`[tab ${idx+1}] Prompt via override selector.`);
          return true;
        }
      } catch (e) {
        console.log(`[tab ${idx+1}] Override selector failed: ${e.message}`);
      }
    }

    // Try heuristics
    // a) role=button name=/prompt/i
    try {
      const btn = await p.getByRole('button', { name: /prompt/i }).first();
      if (await btn.isVisible()) {
        await btn.click({ timeout: 15_000 });
        console.log(`[tab ${idx+1}] Prompt via role=button name=/prompt/i`);
        return true;
      }
    } catch {}

    // b) any element with visible text “Prompt”
    try {
      const textBtn = await p.getByText(/^\s*prompt\s*$/i, { exact: false }).first();
      if (await textBtn.isVisible()) {
        await textBtn.click({ timeout: 15_000 });
        console.log(`[tab ${idx+1}] Prompt via text=Prompt`);
        return true;
      }
    } catch {}

    // c) data-testid/data-qa
    try {
      const cssBtn = await p.locator('[data-testid="prompt"], [data-qa="prompt"]').first();
      if (await cssBtn.isVisible()) {
        await cssBtn.click({ timeout: 15_000 });
        console.log(`[tab ${idx+1}] Prompt via data-testid/data-qa`);
        return true;
      }
    } catch {}

    // d) Fallback: try a keyboard shortcut if your app supports one (uncomment & set)
    // await p.keyboard.press('Control+Shift+P');

    console.warn(`[tab ${idx+1}] Could not find a “prompt” control. Consider --promptSelector ".my-selector"`);
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
