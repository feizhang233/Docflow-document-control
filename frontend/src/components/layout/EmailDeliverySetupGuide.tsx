const smtpExample = `SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_USERNAME=notifications@your-domain.com
SMTP_PASSWORD='replace_with_provider_app_password'
SMTP_FROM_EMAIL=notifications@your-domain.com
PUBLIC_APP_URL=https://your-docflow-site.com`

export function EmailDeliverySetupGuide() {
  return <details className="email-delivery-guide">
    <summary>How to set up the sending mailbox</summary>
    <div className="email-delivery-guide-content">
      <p>For administrators: configure one sending mailbox on the DocFlow server for all accounts and projects. The email addresses saved below are recipients. Adding a recipient does not connect a sending mailbox.</p>
      <ol>
        <li>
          <h3>Prepare your sending account</h3>
          <p>Get the outgoing SMTP server, port, security mode, username and SMTP password from your email provider. Use an app password or SMTP authorization code when your provider requires one. DocFlow currently supports SMTP username/password authentication; providers that require OAuth need a compatible mail relay.</p>
        </li>
        <li>
          <h3>Save the settings on the server</h3>
          <p>In the deployed project folder, edit the existing <code>.env</code> file beside <code>docker-compose.yml</code>. Add or update these fields with your provider&apos;s values. Keep the existing database and account settings.</p>
          <pre aria-label="Example outgoing email configuration"><code>{smtpExample}</code></pre>
          <dl>
            <div><dt><code>SMTP_HOST</code></dt><dd>The outgoing mail server hostname, without https://.</dd></div>
            <div><dt><code>SMTP_PORT</code> / <code>SMTP_SECURITY</code></dt><dd>Use the provider&apos;s pair: usually 587 / starttls or 465 / ssl.</dd></div>
            <div><dt><code>SMTP_USERNAME</code> / <code>SMTP_PASSWORD</code></dt><dd>The sending account&apos;s login and SMTP credential. Store them only on the server.</dd></div>
            <div><dt><code>SMTP_FROM_EMAIL</code></dt><dd>The sender shown in each email. Use your sending account or a sender address approved by the provider.</dd></div>
            <div><dt><code>PUBLIC_APP_URL</code></dt><dd>Your public DocFlow website address, used for document links.</dd></div>
          </dl>
          <p>For Gmail accounts with app passwords available, use <code>smtp.gmail.com</code>, port <code>587</code>, <code>starttls</code>, your full Gmail address and an app password created after enabling 2-Step Verification. See <a href="https://support.google.com/accounts/answer/185833?hl=en" target="_blank" rel="noopener noreferrer">Google&apos;s app password instructions (opens in a new tab)</a> and <a href="https://support.google.com/mail/answer/7104828?hl=en" target="_blank" rel="noopener noreferrer">Gmail SMTP settings (opens in a new tab)</a>.</p>
        </li>
        <li>
          <h3>Apply the configuration</h3>
          <p>Run this in the deployed project folder:</p>
          <pre aria-label="Apply outgoing email settings"><code>docker compose up -d --force-recreate backend</code></pre>
          <p>Recreating the backend loads the new settings. A simple restart does not reload Docker environment variables. When installing updated application code, use <code>docker compose up -d --build</code> to update the application as well. For a non-Docker installation, set the same variables for the backend process and restart that process.</p>
        </li>
        <li>
          <h3>Check delivery to your own email</h3>
          <p>Add your own recipient address below, choose a project and update types, and keep the subscription active. Use an account with editing access to make a real document change in that project, or synchronize a comment change with Comments selected. Delivery is checked every 30 seconds by default; queued mail can take longer.</p>
          <p>The setup notice disappearing only means the server has a mail hostname and sender address. Confirm a test email arrives. <strong>Last email: sent</strong> means the mail provider accepted it; check your inbox and spam folder. If delivery fails, verify the credentials, security mode and server network access. After fixing the settings and applying them, use <strong>Retry</strong> when a failed delivery is shown.</p>
        </li>
      </ol>
      <p>Existing queued updates are processed when sending is enabled. Notifications use English templates; document content and comments retain their original language.</p>
    </div>
  </details>
}
