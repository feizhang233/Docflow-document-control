# DocFlow Sending Mailbox Setup Guide

DocFlow supports email subscriptions, a change queue and outgoing email delivery. To send notifications, connect it to an actual **SMTP mail service**. This service sends project updates to the notification addresses saved by each account.

- **Sending mailbox:** An administrator configures it on the deployment server. All accounts and projects share this sending service.
- **Recipient addresses:** Each account manages its own addresses under **Notification → Email addresses** in the left sidebar. An account can save up to 5 distinct addresses and subscribe each address to multiple projects.

Adding a recipient does not configure a sending mailbox. Expand **How to set up the sending mailbox** on the same page to read the in-app instructions.

## 1. Prepare the sending account

Obtain the SMTP hostname, port, security mode, login username, SMTP password or app password, and approved sender address from your email provider or company mail administrator.

The current version supports SMTP username/password authentication and unauthenticated delivery through a trusted internal relay. If your provider requires OAuth, use an approved, compatible SMTP relay; DocFlow cannot connect directly using OAuth. POP or IMAP settings are not required for outgoing email.

### Gmail example

If app passwords are available for your Google account:

1. Enable **2-Step Verification** in your Google account.
2. Open [App passwords](https://myaccount.google.com/apppasswords) and create an app password for DocFlow.
3. Use your full Gmail address as the username and the generated app password as the SMTP password.

App passwords may be unavailable because of organization or account security policies. In that case, ask your mail administrator for a compatible sending service. Changing your Google account password revokes existing app passwords; generate a new one and update the server configuration. See [Google's app password instructions](https://support.google.com/accounts/answer/185833?hl=en).

The example below uses Gmail's `smtp.gmail.com`, port `587` and `starttls`, as documented in [Gmail's SMTP settings](https://support.google.com/mail/answer/7104828?hl=en).

## 2. Update the deployment server configuration

For the repository's default Docker Compose deployment, edit the existing `.env` file beside `docker-compose.yml` in the **project directory on the actual deployment server**. Add or update the following fields. Preserve existing database passwords, API keys and other settings. `.env.example` is a reference; editing it does not change the running service.

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_USERNAME=your-sending-account@gmail.com
SMTP_PASSWORD='replace_with_your_app_password'
SMTP_FROM_EMAIL=your-sending-account@gmail.com
SMTP_TIMEOUT_SECONDS=15
EMAIL_POLL_SECONDS=30
PUBLIC_APP_URL=https://your-docflow-site.com
```

Replace the example account, password and website address with your actual values. Single-quote the password to prevent Docker Compose from interpreting a `$` in it as a variable. If the password itself contains a single quote, escape it according to your deployment environment's rules. Keep credentials in the server configuration; do not commit them to GitHub or enter them in the Notification recipient form.

| Setting | What to enter |
| --- | --- |
| `SMTP_HOST` | The provider's outgoing mail hostname, without `https://` |
| `SMTP_PORT` | The port required by your provider |
| `SMTP_SECURITY` | Usually `starttls` with 587 or `ssl` with 465; follow your provider's requirements. Use `plain` only for a trusted internal relay |
| `SMTP_USERNAME` | The sending account's SMTP username, which may be its full email address or a provider-specific login |
| `SMTP_PASSWORD` | The SMTP password, authorization code or app password required by your provider |
| `SMTP_FROM_EMAIL` | The sender address shown to recipients; the provider must allow the sending account to use this address |
| `SMTP_TIMEOUT_SECONDS` | Connection timeout in seconds; default 15 |
| `EMAIL_POLL_SECONDS` | Interval between checks for queued email; default 30 seconds |
| `PUBLIC_APP_URL` | The public DocFlow website address used for document links; leave blank to omit links |

Other email providers use the same fields. Substitute their hostname, credentials and security mode. Leave `SMTP_USERNAME` and `SMTP_PASSWORD` blank only when your company relay explicitly allows unauthenticated delivery.

## 3. Apply the configuration

Run this in the project directory on the deployment server:

```bash
docker compose up -d --force-recreate backend
```

This recreates the backend container and loads the new configuration while preserving the existing database volume. A simple `docker compose restart backend` does not update container environment variables. See [Docker's restart documentation](https://docs.docker.com/reference/cli/docker/compose/restart/) and [docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/).

If you also need to install updated application code, including the new in-app instructions, update the code first, then run:

```bash
docker compose up -d --build
```

For a non-Docker installation, add these variables to the backend service configuration or the `.env` file in the backend's working directory, then restart that backend process. Editing a `.env` file on your local computer does not change the remote server's mail settings.

## 4. Test actual delivery

1. Open **Notification → Email addresses** and add your own recipient address first.
2. Select an accessible project and the update types to receive. Select **Comments** when testing comment notifications, and keep the subscription **Active**.
3. Use an account with editing access to make a real document change in that project, or synchronize an actual comment change through the existing synchronization feature. View-only accounts can receive notifications but cannot edit documents to trigger a test.
4. Wait for processing. The backend checks the queue every 30 seconds by default; queued mail or retries may take longer.
5. Check **Last email** on the subscription and your inbox and spam folder.

When **Email delivery is not enabled yet** disappears, it only means `SMTP_HOST` and `SMTP_FROM_EMAIL` are populated. It does not confirm authentication or connectivity. Confirm that a test email actually arrives.

**Last email: sent** means the mail server accepted the message; it does not confirm that a recipient received or read it. Email templates default to English. Document content and comments retain their original language, and comment updates include previous and current content.

Valid queued updates are processed automatically when sending is enabled. Subscriptions record changes made after they are added. Pausing cancels queued email for that subscription; resuming sends only new changes.

## 5. Troubleshooting

| Symptom | What to check |
| --- | --- |
| Delivery still shows as disabled | Edit the actual deployment directory's `.env`, fill in the hostname and sender address, recreate the backend container, then refresh the page |
| Email remains queued or a connection error appears | Check the hostname, port and security mode; confirm that the deployment server can reach the provider's SMTP port and the backend is running |
| Authentication fails | Verify the SMTP username and credential; use an authorization code or app password when required, and confirm SMTP login is allowed for the account |
| The sender address is rejected | Set `SMTP_FROM_EMAIL` to the sending account or another address approved by the provider |
| No email is generated | Check the project, update types, Active state and current project access; trigger a real change. Identical synchronization content and row reordering do not send email |
| Status is sent but the inbox is empty | Check spam, mailbox rules and the provider's delivery records. For a custom domain, check sender-domain authentication as required by your mail provider |
| Delivery still fails after changing settings | Recreate the backend to load the new values. Delivery is attempted up to 5 times; after the final failed attempt, use **Retry** on the subscription card |

To inspect server startup problems, use `docker compose ps backend` and `docker compose logs --tail=100 backend`. The page shows a simplified delivery error without passwords or the provider's full response. A mail delivery failure does not undo saved document or comment changes.
