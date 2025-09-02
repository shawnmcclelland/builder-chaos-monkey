# Burst Builder - Multi-Tab Builder.io Load Testing Tool

A Node.js automation script that opens multiple tabs of a Builder.io project and triggers AI content generation across all tabs simultaneously. Perfect for load testing, parallel content generation, and stress testing Builder's AI capabilities.

## 🚀 What It Does

1. **Opens Builder.io dashboard** to warm up your SSO session
2. **Launches multiple tabs** of a specific Builder project
3. **Injects prompts** into the AI chat interface across all tabs
4. **Triggers parallel AI generation** for load testing and content creation
5. **Maintains persistent sessions** between script runs

## 🛠️ Prerequisites

- **Node.js** (v18 or higher) - **Required for Playwright compatibility**
- **Chrome browser** installed
- **Builder.io account** with SSO authentication
- **Access to a Builder project**

## 📦 Installation

1. **Clone or download** the script to your project directory
2. **Install dependencies:**
   ```bash
   npm install playwright minimist
   ```
3. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```

## 🔧 Configuration

### Environment Variables

- **`PROMPT_TEXT`** - Custom prompt to send to Builder's AI (default: "Generate a modern landing page design")
- **`CREATE_BRANCHES`** - Create a new branch for each tab (set to 'true' to enable)
- **`AUTO_CLOSE_SECONDS`** - Auto-close browser after N seconds (optional)

### Command Line Arguments

- **`--projectUrl`** - URL of your Builder.io project
- **`--tabs`** - Number of tabs to open (default: 5, max: 55)
- **`--headless`** - Run in headless mode (no visible browser)
- **`--createBranches`** - Create a new branch for each tab (default: false)
- **`--space`** - Force specific Builder.io space: `ilc`, `tlf`, or `auto` (default: auto)
- **`--promptSelector`** - Custom CSS selector for prompt input (fallback)
- **`--userDataDir`** - Custom directory for browser user data (default: `./.playwright-user`)

## 🚀 Usage

### Basic Usage

```bash
# Use default project URL and settings
node burst-builder.js

# Specify a custom project URL
node burst-builder.js --projectUrl "https://builder.io/app/projects/YOUR_PROJECT_ID/PROJECT_NAME"

# Open 8 tabs instead of default 5
node burst-builder.js --tabs 8 --projectUrl "YOUR_PROJECT_URL"

# Large-scale testing with 55 tabs
node burst-builder.js --tabs 55 --headless --projectUrl "YOUR_PROJECT_URL"

# Force ILC space (if you have access to both ILC and TLF)
node burst-builder.js --space ilc --projectUrl "YOUR_ILC_PROJECT_URL"

# Force TLF space
node burst-builder.js --space tlf --projectUrl "YOUR_TLF_PROJECT_URL"
```

### Custom Prompts

```bash
# Set custom prompt via environment variable
PROMPT_TEXT="Create a modern SaaS landing page with hero section, features, and pricing table" node burst-builder.js --projectUrl "YOUR_URL"

# Or modify the default in the script
const PROMPT_TEXT = process.env.PROMPT_TEXT || "Your custom prompt here";
```

### Headless Mode

```bash
# Run without visible browser (good for servers)
node burst-builder.js --headless --projectUrl "YOUR_URL"
```

### Branch Creation

```bash
# Create a new branch for each tab
node burst-builder.js --createBranches --projectUrl "YOUR_URL"

# Or use environment variable
CREATE_BRANCHES=true node burst-builder.js --projectUrl "YOUR_URL"
```

### Large-Scale Testing (55 Tabs)

```bash
# Large-scale load testing with 55 tabs
node burst-builder.js --tabs 55 --headless --projectUrl "YOUR_URL"

# With branch creation for isolation
node burst-builder.js --tabs 55 --headless --createBranches --projectUrl "YOUR_URL"

# Custom prompt for large-scale testing
PROMPT_TEXT="Generate a comprehensive landing page with hero, features, testimonials, and pricing" node burst-builder.js --tabs 55 --headless --projectUrl "YOUR_URL"
```

### Auto-Close

```bash
# Auto-close after 30 seconds
AUTO_CLOSE_SECONDS=30 node burst-builder.js --projectUrl "YOUR_URL"
```

## 🔐 SSO Authentication

The script is designed to work seamlessly with Builder.io's SSO authentication:

### **First Run (Authentication Required)**
1. Run the script
2. You'll be redirected to your SSO provider
3. Complete the authentication flow
4. Your session is cached for future runs

### **Subsequent Runs (Session Reused)**
- Your SSO session is automatically reused
- No re-authentication needed
- Sessions persist between script runs

### **Session Management**
- Sessions are stored in `./.playwright-user` directory
- Delete this directory to clear cached sessions
- Useful if your SSO session expires

## 🎯 How It Works

### **1. Session Initialization**
- Opens Builder.io dashboard to warm up SSO session
- Ensures authentication cookies are loaded

### **2. Multi-Tab Launch**
- Creates specified number of Chrome tabs
- Each tab loads the same Builder project
- Adds cache-busting parameters to avoid conflicts

### **3. Branch Creation (Optional)**
- Creates a unique branch for each tab if `--createBranches` is enabled
- Generates branch names like `loadtest-tab-1-1234567890`
- Uses Builder's URL-based branching pattern: `/project-id/branch-name`
- Navigates directly to branch URLs (e.g., `/main` → `/loadtest-tab-1-1234567890`)
- Isolates content generation to separate branches
- Prevents conflicts between parallel AI generations

### **4. Interface Detection**
- Waits for Builder's ProseMirror editor to load
- Identifies the "Ask Fusion..." prompt input field
- Handles both contenteditable divs and traditional inputs

### **5. Prompt Injection**
- Clicks to focus the prompt input
- Types your specified prompt text
- Submits via Enter key or submit button
- Triggers AI content generation

### **6. Load Testing**
- All tabs generate content simultaneously
- Perfect for testing Builder's AI performance
- Monitor response times and success rates

## 🔍 Troubleshooting

### **Prompt Not Being Injected**

1. **Check console output** for detailed debugging information
2. **Verify project URL** is correct and accessible
3. **Ensure you're authenticated** to Builder.io
4. **Try custom selector:**
   ```bash
   node burst-builder.js --promptSelector "div[contenteditable='true']" --projectUrl "YOUR_URL"
   ```

### **Authentication Issues**

1. **Clear session cache:**
   ```bash
   rm -rf ./.playwright-user
   ```
2. **Verify SSO access** in your browser
3. **Check session timeout** settings

### **Wrong Input Field Targeted**

The script automatically detects and skips branch name inputs. If it's still targeting the wrong field:

1. **Check console logs** for input field details
2. **Use custom selector** to target specific elements
3. **Verify the page has fully loaded** before interaction

### **Node.js Version Issues**

1. **Check Node.js version** - Run `node --version` (must be v18 or higher)
2. **Update Node.js** - Use `nvm use 18` or `nvm use 20` if using NVM
3. **Playwright compatibility** - Playwright requires Node.js 18+ for proper operation
4. **Version switching** - If using NVM: `nvm use 18.20.8` or `nvm use 20.19.3`

### **Project Not Found / Access Issues**

1. **Verify project URL** - Ensure the project exists in your Builder space
2. **Check permissions** - Make sure you have access to the project in the TLF space
3. **Compare spaces** - ILC vs TLF spaces may have different project IDs
4. **Manual verification** - Try accessing the project URL directly in your browser
5. **SSO authentication** - Ensure you're logged into the correct Builder space
6. **Interface loading** - If navigation succeeds but interface detection fails, the project may be loading slowly

### **Branch Creation Issues**

1. **Check Builder permissions** - Ensure you have branch creation rights
2. **Verify branch UI** - The script looks for common branch creation patterns
3. **Manual verification** - Try creating a branch manually to see the UI flow
4. **Custom selectors** - If branch creation fails, the script continues with prompt injection

### **Performance Issues**

1. **Reduce tab count** if system is struggling
2. **Increase delays** by modifying timeout values
3. **Use headless mode** for better performance

## 📊 Monitoring & Debugging

### **Console Output**
The script provides detailed logging:
- Tab-by-tab progress updates
- Input field detection results
- Selector success/failure information
- Prompt submission confirmations

### **Browser Inspection**
- Keep `--headless false` to observe the process
- Watch for prompt text appearing in input fields
- Monitor AI generation progress across tabs

## 🎨 Customization

### **Modifying Prompts**
```javascript
// In burst-builder.js
const PROMPT_TEXT = process.env.PROMPT_TEXT || "Your custom prompt here";
```

### **Adjusting Delays**
```javascript
// Increase wait times if needed
await p.waitForTimeout(5000); // Page load wait
await promptInput.type(PROMPT_TEXT, { delay: 150 }); // Typing delay
```

### **Adding New Selectors**
```javascript
const selectors = [
  'your-custom-selector',
  // ... existing selectors
];
```

## 🚨 Limitations

- **Maximum 55 tabs** for large-scale testing (optimized with batching)
- **Requires Chrome/Chromium** browser
- **SSO session must be valid** for Builder.io
- **Project must be accessible** with your permissions
- **System resources** - 55 tabs require significant RAM (8GB+ recommended)

## 🤝 Contributing

Feel free to submit issues and enhancement requests. The script is designed to be modular and easily extensible.

## 📝 License

This project is open source and available under the MIT License.

## 🆘 Support

If you encounter issues:

1. **Check the console output** for detailed error messages
2. **Verify your Builder.io access** and project URL
3. **Ensure all dependencies** are properly installed
4. **Try with fewer tabs** to isolate performance issues

---

**Happy load testing! 🚀**
