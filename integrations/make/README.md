# Arrowsterr for Make

These files define an Arrowsterr custom app for [Make](https://www.make.com). Once it is set up, anyone you invite can use Arrowsterr in their Make scenarios.

You need an Arrowsterr plan with API access (Pro and up).

## What the app has

| Module | Type | What it does |
|---|---|---|
| Watch events | Instant trigger | Starts when Arrowsterr sends an event, like a daily result or a visibility alert |
| Get workspace | Action | Gets the workspace your key belongs to |
| List brands | Search | Lists every brand |
| Get visibility over time | Search | One bundle per day, with the top competitors |
| Get visibility by AI model | Search | One bundle per AI model |
| List competitors | Search | Brands AI names next to yours, with visibility, position and sentiment |
| List prompts | Search | Tracked prompts, each with its topic |
| List Topic Bank keywords | Search | Keywords with volume, difficulty, intent and stage |
| List Editorial Calendar items | Search | Calendar items with status and due date |
| List webhooks | Search | Webhooks in the workspace |
| Create a webhook | Action | Sends an event to a URL you choose |
| Delete a webhook | Action | Stops a webhook |
| Make an API call | Action | Calls any Arrowsterr API path with your connection |

Every module that needs a brand shows a dropdown of your brands.

## How the files map to Make

Make's app editor has a tab for each part of an app. Each file here holds what goes in one tab.

```
app.json                       Name, label, description and color for the new app
base.json                      Base tab
connection/parameters.json     Connection: Parameters tab
connection/api.json            Connection: Communication tab
webhook/webhook.json           Webhook name, label and type
webhook/parameters.json        Webhook: Parameters tab
webhook/api.json               Webhook: Communication tab
webhook/attach.json            Webhook: Attach tab
webhook/detach.json            Webhook: Detach tab
rpcs/listBrands/api.json       Remote procedure "listBrands": Communication tab
modules/<name>/module.json     Module name, type, label and description
modules/<name>/api.json        Module: Communication tab
modules/<name>/parameters.json Module: Static parameters tab
modules/<name>/expect.json     Module: Mappable parameters tab
modules/<name>/interface.json  Module: Interface tab
modules/<name>/samples.json    Module: Samples tab (only Watch events has one)
```

## Set up the app (one time)

Plan on about an hour. You copy and paste each file into the matching tab.

### 1. Make the app

1. Sign in to Make and open **Custom apps** in the left menu. If you do not see it, turn on developer mode in your profile settings.
2. Click **Create a new app**.
3. Fill in the form from `app.json`: Name `arrowsterr`, Label `Arrowsterr`, the description and the color `#0943B0`.
4. For the icon, upload a square PNG of the Arrowsterr mark at 512 by 512 pixels. The mark is in `public/brand/` in this repo.
5. Click **Save**.

### 2. Base

1. Open the **Base** tab.
2. Replace what is there with `base.json`, and save.

### 3. Connection

1. Open **Connections** and click **Create a new connection**.
2. Label: `Arrowsterr`. Type: **API key**. Click **Save**.
3. In the **Communication** tab, paste `connection/api.json`.
4. In the **Parameters** tab, paste `connection/parameters.json`. Save.

### 4. Remote procedure for the brand dropdown

1. Open **Remote procedures** and click **Create a new remote procedure**.
2. Connection: `Arrowsterr`. Name: `listBrands`. Label: `List brands`. Save.
3. In the **Communication** tab, paste `rpcs/listBrands/api.json`. Save.
4. The name must be exactly `listBrands`, since the modules call it as `rpc://listBrands`.

### 5. Webhook for the instant trigger

1. Open **Webhooks** and click **Create a new webhook**.
2. Label: `Arrowsterr events`. Type: **Dedicated**. Connection: `Arrowsterr`. Save.
3. Paste the files into their tabs: `webhook/api.json` into **Communication**, `webhook/parameters.json` into **Parameters**, `webhook/attach.json` into **Attach**, and `webhook/detach.json` into **Detach**.
4. Save. Make adds the webhook in Arrowsterr when a scenario turns on, and removes it when the scenario is deleted.

### 6. Modules

For each folder in `modules/`:

1. Open **Modules** and click **Create a new module**.
2. Use the type, name, label and description from that folder's `module.json`. Pick the `Arrowsterr` connection. For **Watch events**, pick the `Arrowsterr events` webhook instead.
3. Paste each file into its tab, using the map above. Leave a tab empty when its file holds `[]`.
4. Save.

Tip for developers: the [Make Apps Editor for VS Code](https://marketplace.visualstudio.com/items?itemName=Integromat.apps-sdk) lets you edit the same tabs as files, which is faster than the web editor.

## Test it

1. Make a new scenario and add **Arrowsterr > List brands**.
2. Click **Create a connection** and paste your Arrowsterr API key. Get one in Arrowsterr under **Settings**, then **Workspace & members**, then **Integrations**, then **API keys**.
3. Click **Run once**. You should see one bundle per brand.
4. Add **Arrowsterr > Watch events** to a new scenario and turn it on. In Arrowsterr, open **Settings**, then **Integrations**, and check that a new webhook is listed.

## Share it

Custom apps start out private.

- **Invite people.** Open the app in **Custom apps** and copy its invite link. Send it to customers or clients. They open it once to add the app to their Make organization.
- **List it for everyone.** Click **Publish**, then **Request review**. Make checks the app before it shows up in Make's app directory.

Each person who uses the app connects it with their own Arrowsterr API key.

## Troubleshooting

- **"[401] This API key is not valid."** Make a new key in Arrowsterr and create the connection again.
- **"[403] The API is on Pro and up."** The workspace needs a plan with API access.
- **The brand dropdown is empty.** Check that the remote procedure is named `listBrands` and uses the Arrowsterr connection.
- **Watch events never fires.** Arrowsterr sends events only when something happens, like the daily check. Use **Run once** on the trigger, then wait for the next daily result.
