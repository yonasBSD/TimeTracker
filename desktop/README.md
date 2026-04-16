# TimeTracker Desktop App

Electron-based desktop application for TimeTracker.

## Building

### Prerequisites

- Node.js 18+
- npm

### Install Dependencies

```bash
npm install
```

### Build for Current Platform

```bash
npm run build
```

### Build for Specific Platform

```bash
# Windows
npm run build:win

# macOS
npm run mac

# Linux
npm run build:linux
```

### Build for All Platforms

```bash
npm run build:all
```

## Code Signing (Windows)

To avoid the "Unknown Publisher" warning, you need to sign the Windows executable with a code signing certificate.

### Quick Setup

1. **Obtain a Code Signing Certificate:**
   - Purchase from a CA (Sectigo, DigiCert, etc.) - $150-600/year
   - Or create a self-signed certificate for testing

2. **Local Build:**
   ```powershell
   # Windows PowerShell
   $env:CSC_LINK_FILE = "path/to/certificate.pfx"
   $env:CSC_KEY_PASSWORD = "YourCertificatePassword"
   npm run build:win
   ```

3. **CI/CD (GitHub Actions):**
   - Store certificate as Base64 in GitHub Secret: `WINDOWS_CODE_SIGN_CERT`
   - Store password in GitHub Secret: `WINDOWS_CODE_SIGN_PASSWORD`
   - The workflow will automatically sign the executable

For detailed instructions, see [Windows Code Signing Guide](../../docs/WINDOWS_CODE_SIGNING.md).

## Development

### Renderer bundle

The UI is bundled from [`src/renderer/js/app.js`](src/renderer/js/app.js) into [`src/renderer/js/bundle.js`](src/renderer/js/bundle.js) with esbuild (`npm run build:renderer`). Anything the app needs at runtime (including [`src/renderer/js/utils/helpers.js`](src/renderer/js/utils/helpers.js), which sets `window.Helpers`) must be imported from `app.js` so it is included in the bundle. After changing renderer source files, run `npm run build:renderer` before packaging or committing an updated `bundle.js`.

### Run in Development Mode

```bash
npm start
```

(`npm start` runs `build:renderer` first via **prestart**, then launches Electron. `npm run build` uses **prebuild** the same way so installers do not ship a stale `bundle.js`.)

### Run with DevTools

```bash
npm run dev
```

## Configuration

### Getting an API Token

Before connecting the desktop app, you need to create an API token:

1. **Log in to TimeTracker Web App** as an administrator
2. Navigate to **Admin > Security & Access > Api-tokens** (`/admin/api-tokens`)
3. Click **"Create Token"**
4. Fill in the required information:
   - **Name**: A descriptive name (e.g., "Desktop App - Windows")
   - **User**: Select the user this token will authenticate as
   - **Scopes**: Select at least the following permissions:
     - `read:projects` - View projects
     - `read:tasks` - View tasks
     - `read:time_entries` - View time entries (required for timer status; the app uses this if `read:users` is not granted)
     - `write:time_entries` - Create and update time entries
     - `read:users` - Recommended: lets the app verify your session with `GET /api/v1/users/me` (otherwise it falls back to timer status)
   - **Expires In**: Optional expiration period (leave empty for no expiration)
5. Click **"Create Token"**
6. **Important**: Copy the generated token immediately - you won't be able to see it again!
   - Token format: `tt_<32_random_characters>`
   - Example: `tt_abc123def456ghi789jkl012mno345pq`

### Connecting the App

The desktop app can be configured in multiple ways:

#### Method 1: In-App Login (Recommended)

1. **Launch the desktop app**
2. **Step 1 — Server**: Enter your TimeTracker **base URL** (e.g. `https://your-server.com` or `http://192.168.1.10:5000`). Trailing slashes are normalized away. You may omit the scheme for convenience; the app assumes `https://` when checking.
3. Click **Test server** and confirm you see a success message (the app calls `GET /api/v1/info` and checks for a TimeTracker response).
4. Click **Continue to token**.
5. **Step 2 — API token**: Paste the `tt_…` token from the web app, then **Log in**. The app verifies the token with the server (user profile or timer status).
6. If successful, the main window opens. If initial server setup is not finished in the browser, `setup_required` in the API response is surfaced so you can complete setup first.

#### Method 2: Command Line

```bash
TimeTracker.exe --server-url https://your-server.com
```

Then enter your API token in the login screen.

#### Method 3: Environment Variable

```bash
# Windows
set TIMETRACKER_SERVER_URL=https://your-server.com
TimeTracker.exe

# Linux/macOS
export TIMETRACKER_SERVER_URL=https://your-server.com
./TimeTracker
```

#### Method 4: Settings Screen

1. Launch the app
2. Navigate to **Settings** tab
3. Enter your **Server URL** and **API Token**
4. Click **"Save Settings"** or **"Test Connection"** to verify

### Connection Status

The app shows a connection status indicator in the header:
- **Green dot (●)**: Connected and authenticated
- **Red dot (●)**: Connection error or authentication failed
- **Gray circle (○)**: Not connected

The connection is automatically checked every 30 seconds.

### Automated tests (renderer client)

From the `desktop/` directory:

```bash
npm test
```

Runs Node’s test runner on `test/api-client.test.js` (URL normalization, TimeTracker JSON shape checks, and error classification).

### Troubleshooting

**Login or “Test server” shows a TLS or certificate message:**
- Use a certificate trusted by the OS, or for lab use only, try `http://` on a trusted network if your server supports it.

**Token rejected after “server OK”:**
- Verify the token starts with `tt_`, is not expired, and includes at least `read:time_entries` (and ideally `read:users`).

**"Connection failed" error:**
- Verify the server URL is correct and accessible
- Check your internet connection
- Ensure the server is running and the API is accessible
- For local development, use `http://localhost:5000` or your local IP address
- Check the connection status indicator in the header

**Settings not saving:**
- Ensure you have write permissions in the app's data directory
- Check that electron-store is working properly
- Try clearing settings and re-entering them

**Window stuck on loading, blank content, or unstable navigation (especially Windows):**
- Use the latest release or rebuild from source; older builds could mis-handle `file:` navigation in the main process or ship a renderer bundle without helpers loaded.
- From source, run `npm install` and `npm run build:renderer`, then `npm start` or rebuild the installer.
- See [Desktop build Windows troubleshooting](../../docs/admin/configuration/DESKTOP_BUILD_WINDOWS_TROUBLESHOOTING.md) for environment-specific build issues.

For more details, see [Desktop Settings Guide](../../docs/DESKTOP_SETTINGS.md).

## Project Structure

```
desktop/
├── src/
│   ├── main/          # Main process (Electron)
│   ├── renderer/      # Renderer process (UI)
│   └── shared/        # Shared code
├── assets/            # Icons and assets
├── scripts/           # Build scripts
└── dist/              # Build output
```

## Version Management

The version is automatically synced from `setup.py` before building. The build scripts handle this automatically.

## License

MIT
