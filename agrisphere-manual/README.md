# Agrisphere: manual deployment

This standalone version uses HTML, CSS, browser JavaScript, Node.js HTTP APIs,
and a JSON file for storage. AI is disabled. It does not require ChatGPT or Ollama.
Records, analytics, profile, in-app reminders, report snapshots, CSV and HTML
downloads remain available. PDF export uses the browser's Print > Save as PDF.
It is one shared farm workspace, not separate accounts for multiple farmers.

## 1. Test on Windows

Extract this ZIP into a NEW folder. Open the folder containing package.json in
VS Code, then open Terminal > New Terminal. Node.js 24 is required.

```powershell
npm.cmd test
npm.cmd start
```

Open http://localhost:3000. No npm install is required locally: there are no
external dependencies. Stop with Ctrl+C. Do not paste terminal commands into JS files.

## 2. Upload to your GitHub account

1. Sign in at https://github.com and create a new private repository named
   agrisphere-farm-reports. You may initialize it with a README.
2. Use Add file > Upload files. Upload the CONTENTS of the extracted project
   folder, including lib, public, test, package.json and server.js.
3. Commit the upload. Confirm package.json and server.js appear at the repository
   top level, alongside lib and public. Upload the extracted files, not the ZIP.
4. Do not upload .env or the data folder created by local testing. The supplied
   .gitignore excludes these when using Git commands; browser uploads require
   you to leave them out yourself.

## 3. Deploy in your Render account

1. Open https://dashboard.render.com and sign in using your own account.
2. Choose New > Web Service. Connect GitHub and authorize this repository.
3. Select agrisphere-farm-reports and set:

| Setting | Value |
| --- | --- |
| Language / Runtime | Node |
| Branch | main (or the branch you uploaded) |
| Root Directory | Leave blank |
| Build Command | npm install --omit=dev |
| Start Command | npm start |
| Health Check Path | /healthz |

4. Add environment variables:
   - NODE_ENV: production
   - APP_PASSWORD: your own private password of at least 12 characters
   - PUBLIC_ORIGIN: your Render HTTPS address without a trailing slash, if
     already shown. If not yet available, add it after the first deployment.
5. For a short demonstration, select the Free instance and deploy. Do not set
   DATA_DIR for the free instance. Wait until Render reports Live.
6. Copy the actual onrender.com address from Render. Set PUBLIC_ORIGIN to that
   address in Environment, then save and redeploy. Do this before adding records.
7. Open the HTTPS address. In the browser's sign-in prompt use username sumit
   and the APP_PASSWORD you entered. Your supervisor can use the same demo
   credentials. Everyone signed in sees and can edit the same workspace.
8. Keep the password in Render's environment settings, not GitHub or screenshots.

Free hosting loses local JSON data on restart, redeploy, or idle shutdown.
The site starts again with sample entries. Export reports before these events;
report exports do not provide a full restorable backup. Free services sleep
after 15 idle minutes, so open the site ahead of your presentation.

## 4. Preserve data across restarts

If you need lasting storage, use a paid Render web service with a persistent
disk. Review the current costs in Render before selecting it. Mount the disk
at /var/data and set DATA_DIR=/var/data/agrisphere. Keep a single running
instance because this JSON store does not support multiple server processes.
Only files on that mounted disk survive. Existing free-instance data is not
automatically copied to the disk. A managed database is a future alternative.

## 5. Demonstrate and explain

1. Show GitHub source and the Render build/deployment log.
2. Edit the profile and save; refresh to confirm it loads.
3. Add a revenue record of INR 1000 and an expense record of INR 200.
   Remove sample entries first if demonstrating a balance of INR 800.
4. Generate a report covering today's date. Download CSV; open HTML and print PDF.
5. Add a reminder, mark it complete, and show the report in History.
6. Explain: browser sends HTTP API requests; Node validates input; the server
   writes JSON; analytics calculate recorded revenue minus expenses; reports
   preserve snapshots. Reminders are in-app only. AI is disabled in this version.

The earlier ChatGPT-hosted version and laptop data are separate from this copy.
No personal records, model credentials, or existing hosting credentials are included.

## Troubleshooting

- package.json not found: open the INNER folder containing that file.
- Browser asks for credentials: username sumit, password from APP_PASSWORD.
- Cross-origin request rejected: correct PUBLIC_ORIGIN to the exact HTTPS URL.
- Deployment fails immediately: check APP_PASSWORD is at least 12 characters.
- Changes disappear on Free: expected ephemeral storage behavior; use a disk
  with a paid service for persistence.
- Port in use locally: stop your old server before npm.cmd start.

Official documentation (checked 14 September 2026):
- https://render.com/docs/deploy-node-express-app
- https://render.com/docs/free
- https://render.com/docs/disks
