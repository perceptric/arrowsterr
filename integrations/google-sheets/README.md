# Arrowsterr for Sheets

This script adds an **Arrowsterr** menu to a Google Sheet. It fills tabs with your Arrowsterr data and can update them every week on its own.

It makes these tabs:

| Tab | What is in it |
|---|---|
| Visibility | One row per day: your visibility, how many AI answers were checked, which AI models were checked, and the top competitor. |
| By AI model | One row per AI model: visibility, answers, average position and sentiment. |
| Competitors | Every brand AI names next to yours, most visible first. |
| Prompts | Every prompt you track, with its topic. |

Visibility and sentiment both run from 0 to 100. Position is your average spot in the list of brands an answer names, where 1 is best.

You need an Arrowsterr plan with API access (Pro and up).

## Install

1. Open the Google Sheet you want to use, or make a new one.
2. Click **Extensions**, then **Apps Script**.
3. Click the gear icon (**Project Settings**) and turn on **Show "appsscript.json" manifest file in editor**.
4. Go back to the editor. Open `appsscript.json` and replace everything in it with the `appsscript.json` from this folder.
5. Open `Code.gs` and replace everything in it with the `Code.gs` from this folder.
6. Click **Save**, then close the Apps Script tab.
7. Reload the Google Sheet. An **Arrowsterr** menu shows up next to **Help** after a few seconds.

The first time you use the menu, Google asks you to allow the script. Click **Continue**, pick your Google account and click **Allow**. If Google says the app is not verified, click **Advanced**, then **Go to project**. This is normal for a script you added yourself.

## Use it

1. Get an API key in Arrowsterr: **Settings**, then **Workspace & members**, then **Integrations**, then **API keys**. It starts with `aw_live_`.
2. In the sheet, click **Arrowsterr**, then **Set API key**, and paste it.
3. Click **Arrowsterr**, then **Choose brand and days**. Type the number of your brand, then how many days to look back.
4. Click **Arrowsterr**, then **Refresh everything**.

You can also refresh one tab at a time from the menu. Each refresh replaces what is in that tab. Hover over cell A1 of a tab to see when it last updated.

Want charts? Select the data in a tab and click **Insert**, then **Chart**. The chart updates each time the tab refreshes.

## Weekly refresh

Click **Arrowsterr**, then **Turn on weekly refresh**. The tabs update every Monday morning, even when the sheet is closed. Click **Turn off weekly refresh** to stop.

The weekly refresh runs as you, with your key. If you share the sheet, other people see the data, but they cannot see your key.

## Good to know

- Your API key is saved in your own Google account settings for this script. It is never written into the sheet.
- The brand and days are saved with the sheet, so everyone who opens it refreshes the same brand.
- Each person who wants to use the menu needs to set their own key.
- The script only talks to `app.arrowsterr.com`. It can read and change only the sheet it is added to.

## Troubleshooting

- **"Set your API key first."** Use **Set API key** from the menu.
- **"Arrowsterr said: This API key is not valid."** Make a new key in Arrowsterr and set it again.
- **"Arrowsterr said: The API is on Pro and up."** Your workspace needs a plan with API access.
- **No menu.** Reload the sheet. If it still does not show, open **Extensions**, then **Apps Script**, and check that both files were saved.
- **Weekly refresh did not run.** In Apps Script, click **Executions** on the left to see what happened.
