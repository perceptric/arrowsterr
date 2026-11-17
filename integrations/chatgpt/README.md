# Arrowsterr in the ChatGPT app directory

Arrowsterr's MCP server (`https://app.arrowsterr.com/api/mcp`) already works in ChatGPT with OAuth and dynamic client registration. This folder holds what OpenAI's directory review asks for. Check each field against the form when you submit, since OpenAI changes it from time to time.

## Before you submit

1. **Verify your OpenAI organization.** Only organization owners can submit. Go to platform.openai.com, then Settings, then Organization, and finish business verification.
2. **Make a reviewer account.** Create an Arrowsterr account with sample data (a brand with a few weeks of results and some Content Plan pieces), on Starter or higher. Turn off two-step sign-in for it. Reviewers can't use codes or magic links.
3. **Record a demo video.** Show connecting Arrowsterr in ChatGPT, approving it, and running the 5 test prompts in `review.json`. Upload it somewhere the reviewer can open, like an unlisted YouTube link.
4. **Check the support page.** `supportURL` points to docs.arrowsterr.com. Make sure it shows a way to contact support, or change it to a contact page.

## Submit

1. Go to platform.openai.com/plugins and choose **Upload plugin**.
2. Zip this folder (plugin.json, mcp.json, logo.png, composer-icon.png) and upload it.
3. Under **Connect MCP server**, pick OAuth with dynamic client registration.
4. OpenAI shows a domain token. Add it to the server's `.env` as `OPENAI_APPS_CHALLENGE=<token>`, restart the app, then click verify. Arrowsterr serves it at `https://app.arrowsterr.com/.well-known/openai-apps-challenge`.
5. Fill **Review details** with the reviewer account's email and password, the 5 positive and 3 negative test cases from `review.json`, and the demo video link.
6. Submit for review.

## What the server already does for review

- Every tool has `readOnlyHint`, `destructiveHint` and `openWorldHint` set.
- Tools that change data say so in their descriptions and ask the person first.
- `remove_from_content_plan` is marked destructive and deletes up to 10 pieces per call.
- AI answer text is marked as outside data in tool results.
- The approval screen knows chatgpt.com, so ChatGPT users see no "unknown app" warning.
