# n8n-nodes-arrowsterr

Arrowsterr nodes for [n8n](https://n8n.io). Use them to pull your AI visibility data into a workflow, or to start a workflow when Arrowsterr sends an event.

You need an Arrowsterr plan with API access (Pro and up).

## What is inside

**Arrowsterr** (action node)

| Resource | Operations |
|---|---|
| Workspace | Get the workspace your key belongs to |
| Brand | Get many |
| Visibility | Get over time (by day), Get by AI model (totals or by day) |
| Competitor | Get many, with visibility, mentions, position and sentiment |
| Prompt | Get many, each with its topic |
| Topic Bank | Get many keywords |
| Editorial Calendar | Get many items |
| Webhook | Get many, Create, Delete |

Lists come out as one n8n item per row. Turn off **Split Into Items** to get the full reply as one item. The node can also be used as a tool by an AI Agent node.

**Arrowsterr Trigger**

Starts a workflow when Arrowsterr sends an event. Pick one event or all of them:

- Daily result: after a brand's daily check, with its visibility and the change
- Visibility alert: visibility moved by your alert size, or a competitor overtook the brand
- Brief ready: a content brief is ready
- Post published: a draft went live on your CMS
- Shopping alert: AI Shopping found a price, stock or reseller problem

When you turn the workflow on, the trigger adds a webhook in Arrowsterr. When you turn it off, the trigger removes it. Arrowsterr only sends events to `https://` addresses, so your n8n must be reachable over https.

## Install

### On n8n Cloud or self-hosted n8n, once the node is published

1. In n8n, go to **Settings**, then **Community Nodes**.
2. Click **Install**.
3. Type `n8n-nodes-arrowsterr`, tick the box and click **Install**.
4. The Arrowsterr nodes now show up when you search for "Arrowsterr" in a workflow.

### On self-hosted n8n, before the node is published

1. Build the package on your computer:

   ```bash
   cd integrations/n8n-nodes-arrowsterr
   npm install
   npm run build
   npm pack
   ```

   This makes a file named `n8n-nodes-arrowsterr-0.1.0.tgz`.
2. Copy that file to the machine that runs n8n.
3. Install it in n8n's nodes folder:

   ```bash
   mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes
   npm install /path/to/n8n-nodes-arrowsterr-0.1.0.tgz
   ```

4. Restart n8n.

## Connect your Arrowsterr account

1. In Arrowsterr, go to **Settings**, then **Workspace & members**, then **Integrations**, then **API keys**. Make a key and copy it. It starts with `aw_live_`.
2. In n8n, add an Arrowsterr node and click **Create new credential**.
3. Paste the key in **API Key**. Leave **Base URL** as it is.
4. Click **Save**. n8n checks the key right away.

## Example workflows

- **Weekly report to Slack.** Schedule Trigger (every Monday), then Arrowsterr (Visibility, Get by AI model), then Slack.
- **Alert the team.** Arrowsterr Trigger (Visibility alert), then Slack or email with the `reasons` field.
- **Fill a sheet.** Schedule Trigger, then Arrowsterr (Competitor, Get many), then Google Sheets (Append row).
- **Plan content.** Arrowsterr Trigger (Brief ready), then your project tool to make a task.

## For developers

```bash
npm install
npm run build      # compiles to dist/ with tsc and copies the icons
npm run dev        # rebuilds when files change
```

To try it in a local n8n, run `npm link` here, then `npm link n8n-nodes-arrowsterr` inside `~/.n8n/custom`, and start n8n.

### Publish to npm

1. Make sure the version in `package.json` is new.
2. Sign in with `npm login`.
3. Run `npm publish`. The `prepublishOnly` script builds the package first.
4. Check it with `npx @n8n/scan-community-package n8n-nodes-arrowsterr`.

### Get it verified by n8n

Verified nodes can be installed from the nodes panel on n8n Cloud. Submit the package in the [n8n Creator Portal](https://creators.n8n.io). n8n reviews it against its community node rules before it shows up for everyone.

## License

MIT
