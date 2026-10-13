# Privacy notes

This is a client-side Chrome MV3 extension; the source package has no telemetry SDK or analytics endpoint. Export files are assembled in the browser and downloaded by Chrome, not sent to a developer-run server.

For functionality, the extension contacts ChatGPT's authenticated session/conversation APIs and eligible file URLs. These requests can include credentials/authentication headers held by the active ChatGPT session, and therefore **network traffic is not exclusively local**. The extension does not introduce a separate off-site data collection service.

The ZIP can contain full conversations, message metadata, source DIL, IDs, file names, and private documents. Keep it under your control. Inbound uploads are not downloaded by default, but their names and metadata may still appear in the conversation JSON and registries. Popup download pacing is stored in extension popup `localStorage`.

Avoid public issue attachments that include real conversations, screenshots, filenames revealing private data, auth tokens, or network captures. Review the report and all JSON files before sharing any archive.

The use of private ChatGPT endpoints and browser-specific permissions can change. Read [SECURITY.md](../SECURITY.md) before deploying in sensitive environments.
