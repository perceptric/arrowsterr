# Arrowsterr for Looker Studio

This connector pulls your Arrowsterr data into Looker Studio, so you can build charts and client reports.

It has four reports. You pick one each time you add a data source:

| Report | What you get |
|---|---|
| Visibility over time | One row per day: your visibility, how many AI answers were checked, and the top competitor that day. |
| Visibility by AI model | One row per day and AI model: visibility, answers, average position and sentiment. |
| Competitors | Every brand AI names next to yours, with visibility, mentions, position and sentiment. |
| Prompts | Every prompt you track, with its topic. |

Visibility shows as a percent, and sentiment runs from 0 to 100. Position is your average spot in the list of brands an answer names, where 1 is best.

You need an Arrowsterr plan with API access (Pro and up).

## Part 1: Get your API key

1. Sign in to Arrowsterr.
2. Go to **Settings**, then **Workspace & members**, then **Integrations**.
3. Under **API keys**, make a new key and copy it. It starts with `aw_live_`.
4. Keep it somewhere safe, since Arrowsterr shows it only once.

## Part 2: Set up the connector (one time)

Someone at your company does this once. After that, anyone you share it with can use it.

### Option A: In the Apps Script editor (no coding tools)

1. Go to [script.google.com](https://script.google.com) and click **New project**.
2. Name the project "Arrowsterr connector".
3. Click the gear icon (**Project Settings**) and turn on **Show "appsscript.json" manifest file in editor**.
4. Go back to the editor. Open `appsscript.json` and replace everything in it with the `appsscript.json` from this folder.
5. Open `Code.gs` and replace everything in it with the `Code.gs` from this folder.
6. Click **Save**.
7. Click **Deploy**, then **New deployment**. Give it a description like "Version 1" and click **Deploy**.
8. Copy the **Deployment ID** it shows. You can find it later under **Deploy**, then **Manage deployments**.
9. Your connector link is:
   `https://lookerstudio.google.com/datasources/create?connectorId=YOUR_DEPLOYMENT_ID`

Tip: to try changes before you make a new version, use **Deploy**, then **Test deployments**. The **Head deployment ID** there always runs your latest saved code.

When you change the code later, make a new version under **Deploy**, then **Manage deployments**, then the pencil icon. The link stays the same.

### Option B: With clasp (for developers)

```bash
npm install -g @google/clasp
clasp login
cd integrations/looker-studio
clasp create --type standalone --title "Arrowsterr connector" --rootDir .
clasp push
clasp deploy --description "Arrowsterr connector v1"
```

`clasp deploy` prints a deployment ID. Put it in the link from step 9 above.

## Part 3: Use it in a report

1. Open the connector link from Part 2.
2. Click **Authorize** and allow access when Google asks.
3. Paste your Arrowsterr API key when the connector asks for it.
4. Pick a **Brand** and a **Report**. Type how many **Days** to look back, or leave it empty for 30.
5. Click **Connect**, then **Create report**.

Add one data source per report. For example, add "Visibility over time" for a line chart and "Competitors" for a bar chart, both in the same report.

Good first charts:

- A time series chart on "Visibility over time" with Day and Visibility.
- A time series chart on "Visibility by AI model" with Day, AI model as the breakdown, and Visibility.
- A bar chart on "Competitors" with Named brand and Visibility.
- A table on "Prompts" with Topic and Prompt.

Data refreshes every time the report loads, with a 10 minute cache.

## Share it with an agency's clients

Your clients do not need an Arrowsterr key to view a report you built.

1. Build the report with your own key, as in Part 3.
2. In the report, click **Resource**, then **Manage added data sources**, then **Edit** on each data source.
3. Next to **Data credentials**, make sure it says **Owner's credentials**. That way the report uses your key for everyone who views it.
4. Click **Share** and add your client's email, or copy a view-only link.

To make one report for many clients, make a copy of the report for each one. In the copy, edit each data source and pick that client's brand. Brand and Days can also be changed by report editors, since both allow overrides.

If you want another agency or a client to build their own reports, send them the connector link from Part 2. They will use their own Arrowsterr key.

## Publish it in the Looker Studio gallery (optional)

Only needed if you want anyone to find the connector by searching in Looker Studio.

1. Check that the links in `appsscript.json` work: the logo, privacy policy, terms and support pages.
2. Make a deployment as in Part 2 and test it.
3. Fill in Google's [partner connector form](https://developers.google.com/looker-studio/connector/publish-connector) with your deployment ID.
4. Google reviews the connector. This takes a few weeks.

## Troubleshooting

- **"Arrowsterr said: This API key is not valid."** Make a new key in Arrowsterr and enter it again. In the data source, click **Edit connection** and **Revoke** to clear the old key.
- **"The API is on Pro and up."** Your workspace needs a plan with API access.
- **No brands in the list.** Add a brand in Arrowsterr first, then reload the data source settings.
- **Empty charts.** Arrowsterr has not checked any AI answers in that date range yet. Try more days.
