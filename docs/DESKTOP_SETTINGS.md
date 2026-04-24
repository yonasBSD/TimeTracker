# Desktop App Settings Configuration

The TimeTracker desktop app includes a comprehensive settings system that allows users to configure the server URL and API token.

## First sign-in (connection wizard)

On first launch (or whenever credentials are missing), the app shows a **two-step** flow:

1. **Step 1 — Server**  
   Enter the base URL of your TimeTracker server (protocol and port as needed, e.g. `https://timetracker.example.com` or `http://192.168.1.50:5000`). If you omit the scheme, `https://` is assumed when validating. Use **Test server** to confirm the host speaks the TimeTracker API (`GET /api/v1/info` must return JSON with `api_version: "v1"`). **Continue to token** is enabled only after a successful test.

2. **Step 2 — API token**  
   Paste an API token from the web app (**Admin → Security & Access → API tokens**). **Log in** verifies the token against the server (see **Connection testing** below).

Command-line `--server-url` / `TIMETRACKER_SERVER_URL` can pre-fill the stored server URL and skip typing it in step 1; you still complete token entry unless the token is already saved.

## Settings Location

Settings are stored using Electron's secure storage (`electron-store`), which saves data in a JSON file in the user's application data directory:

- **Windows**: `%APPDATA%\timetracker-desktop\config.json`
- **macOS**: `~/Library/Application Support/timetracker-desktop/config.json`
- **Linux**: `~/.config/timetracker-desktop/config.json`

## Settings Access

Users can access settings in two ways:

### 1. Settings Screen (In-App)

1. Open the TimeTracker desktop app
2. Click on "Settings" in the navigation menu
3. The settings screen will display:
   - **Server URL**: Current server URL (editable)
   - **API Token**: Masked API token (editable)
   - **Save Settings** button: Saves the configuration
   - **Test Connection** button: Validates the connection

### 2. Command Line Arguments

The server URL can be set via command line when launching the app:

```bash
# Windows
TimeTracker.exe --server-url https://your-server.com

# Linux/macOS
./TimeTracker --server-url https://your-server.com
```

### 3. Environment Variable

The server URL can also be set via environment variable:

```bash
# Windows
set TIMETRACKER_SERVER_URL=https://your-server.com
TimeTracker.exe

# Linux/macOS
export TIMETRACKER_SERVER_URL=https://your-server.com
./TimeTracker
```

## Settings Features

### Server URL Configuration

- **Validation**: URLs are normalized (trailing slashes removed). If you type a host without a scheme (e.g. `internal.company.com:8443`), `https://` is prepended for validation.
- **Persistence**: Server URL is saved to secure storage and persists across app restarts
- **Change Detection**: The app automatically reinitializes the API client when the server URL changes

### API Token Configuration

- **Security**: API tokens are stored securely using Electron's secure storage
- **Masking**: Existing tokens are displayed as `••••••••` for security
- **Validation**: Tokens must start with `tt_` to be considered valid
- **Update**: Users can update their API token without re-entering the server URL

### Connection Testing

The settings screen includes a **Test Connection** button (and **Save Settings** runs the same checks). The flow is:

1. **Public check** — `GET /api/v1/info` without credentials. The response must be JSON with `api_version: "v1"` and an `endpoints` object. If the server returns `setup_required: true`, finish initial web setup in a browser first.
2. **Authenticated check** — With your token, the app calls `GET /api/v1/users/me`. If the token does not include the `read:users` scope, it falls back to `GET /api/v1/timer/status` (requires `read:time_entries`). One of these must succeed for the session to be considered valid.

Errors are shown with specific causes when possible (DNS, connection refused, timeout, TLS/certificate issues, HTTP status, wrong app).

### Session loss and background checks

While you are signed in, the app re-validates the session about every **30 seconds**. If the server repeatedly rejects the token (**401**), the app signs you out to the login wizard (step 2) and shows a short message so you can fix the token or server URL.

## Settings File Structure

The settings file (`config.json`) contains:

```json
{
  "server_url": "https://your-server.com",
  "api_token": "tt_your_api_token_here"
}
```

## Implementation Details

### Settings Loading

When the settings view is opened:
1. The app loads current settings from secure storage
2. Server URL is displayed in the input field
3. API token is masked if it exists
4. Settings are ready for editing

### Settings Saving

When "Save Settings" is clicked:
1. Server URL is validated and normalized
2. API token is validated (if changed)
3. Values are written to secure storage (URL, token, sync options)
4. API client is reinitialized with the new URL and token
5. The same **public + authenticated** checks as **Test Connection** are run
6. On full success, a success message is shown. If the **public** check fails, an error message is shown (values were already saved—correct them and save again). If only the **session** check fails, a **warning** is shown with the server message.

### Settings Validation

- **Server URL**: Must resolve to a valid HTTP/HTTPS URL after normalization
- **API Token**: Must start with `tt_` and be non-empty
- **Connection**: Server must expose TimeTracker `GET /api/v1/info`, and the token must pass the authenticated check described above

## Security Considerations

1. **Secure Storage**: Settings are stored using Electron's secure storage, which provides encryption on some platforms
2. **Token Masking**: API tokens are masked when displayed (`••••••••`)
3. **No Plain Text Logging**: API tokens are never logged to console or files
4. **Local Storage Only**: Settings are stored locally and never transmitted except to the configured server

## Troubleshooting

### Settings Not Saving

- Check that the app has write permissions to the application data directory
- Verify that the server URL is a valid HTTP/HTTPS URL
- Ensure the API token starts with `tt_`

### Connection Test Fails

- Verify the server URL is correct and accessible
- Check that the API token is valid and not expired
- Ensure the server is running and the API is accessible
- Check network connectivity and firewall settings

### Settings File Location

To manually edit or backup settings:

**Windows:**
```
%APPDATA%\timetracker-desktop\config.json
```

**macOS:**
```
~/Library/Application Support/timetracker-desktop/config.json
```

**Linux:**
```
~/.config/timetracker-desktop/config.json
```

## Code References

- Login wizard and settings UI: `desktop/src/renderer/index.html`
- Connection and settings logic: `desktop/src/renderer/js/app.js` (initApp, wizard handlers, loadSettings, handleSaveSettings, handleTestConnection, checkConnection)
- HTTP client: `desktop/src/renderer/js/api/client.js` (`testPublicServerInfo`, `validateSession`, URL normalization, error classification)
- Unit tests: `desktop/test/api-client.test.js` (run `npm test` from `desktop/`)
- Storage: `desktop/src/shared/config.js` (storeGet, storeSet, storeDelete, storeClear)
- Main process: `desktop/src/main/main.js` (command line argument parsing)

`npm run build` and `npm start` run **`prebuild` / `prestart`**, which rebuild the renderer bundle (`bundle.js`) via esbuild so packaged builds do not ship a stale UI.
