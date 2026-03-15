'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--xbox-accent)] text-black font-bold text-sm flex items-center justify-center mt-0.5">
        {number}
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-white mb-2">{title}</h3>
        <div className="text-sm text-gray-300 space-y-2">{children}</div>
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-yellow-900/20 border border-yellow-600/40 rounded px-4 py-3 text-yellow-300 text-sm">
      {children}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-gray-800 border border-gray-700 px-1.5 py-0.5 rounded text-xs text-gray-200 font-mono">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-gray-800 border border-gray-700 rounded p-4 text-xs text-gray-200 font-mono overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

export default function XboxGuidePage() {
  const router = useRouter();

  const [nasHost, setNasHost] = useState('<nas-ip>');
  const [nasPort, setNasPort] = useState('<port>');
  const [isHttps, setIsHttps] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    const port = window.location.port;
    const https = window.location.protocol === 'https:';
    setNasHost(host);
    // If on a default port (80/443), port string is empty - make it explicit
    setNasPort(port || (https ? '443' : '80'));
    setIsHttps(https);
  }, []);

  const isLocalhost = nasHost === 'localhost' || nasHost === '127.0.0.1';
  // Callback URL using the protocol and address the user is currently on
  const currentCallbackUrl = `${isHttps ? 'https' : 'http'}://${nasHost}${nasPort !== (isHttps ? '443' : '80') ? `:${nasPort}` : ''}/api/auth/xbox/callback`;
  // HTTPS callback URL for options E/F - keep same host, assume port 443 mapping
  const httpsCallbackUrl = `https://${nasHost}:${nasPort}/api/auth/xbox/callback`;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>

        <div className="flex items-center gap-3 mb-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-7 h-7 text-[var(--xbox-accent)]">
            <path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.902-4.998-8.446-7.902-11.417-2.903 2.973-9.68 9.516-7.898 11.417zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912A11.977 11.977 0 0 0 24 12c0-3.17-1.226-6.056-3.228-8.207-1.003-.85-4.462 1.63-5.51 2.834zM3.228 3.793C1.226 5.944 0 8.83 0 12c0 2.99 1.102 5.73 2.967 7.833-.076-1.372.85-3.422 2.26-5.74l.006.006c1.775-2.702 4.18-5.593 5.567-7.099-1.418-1.493-5.552-4.84-7.572-3.207zM12 0C8.977 0 6.211 1.119 4.102 2.967c-.072.068 1.25.906 1.25.906S7.236 2.022 12 2.022c4.761 0 6.507 1.838 6.507 1.838s1.322-.837 1.39-.906C17.789 1.119 15.023 0 12 0z"/>
          </svg>
          <h1 className="text-2xl font-bold text-[var(--xbox-accent)]">Xbox OAuth Setup Guide</h1>
        </div>
        <p className="text-gray-400 text-sm">
          Follow these steps to create an Azure app registration and configure Xbox sign-in for cpak.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-8">

        {/* Step 1 */}
        <Step number={1} title="Create a Free Azure Account">
          <p>
            Go to{' '}
            <a href="https://azure.microsoft.com/free" target="_blank" rel="noopener noreferrer" className="text-[var(--xbox-accent)] hover:underline">
              azure.microsoft.com/free
            </a>{' '}
            and sign up for a free account using your personal Microsoft account.
          </p>
          <Note>
            A free Azure account is sufficient. No paid subscription or credit card charge is needed for app registrations.
          </Note>
        </Step>

        {/* Step 2 */}
        <Step number={2} title="Register a New Application">
          <ol className="space-y-2 list-none">
            <li>
              1. Go to{' '}
              <a href="https://entra.microsoft.com" target="_blank" rel="noopener noreferrer" className="text-[var(--xbox-accent)] hover:underline">
                entra.microsoft.com
              </a>
            </li>
            <li>2. In the left sidebar, navigate to <strong className="text-white">Applications → App registrations</strong></li>
            <li>3. Click <strong className="text-white">New registration</strong></li>
            <li>4. Fill in the form:
              <ul className="mt-2 ml-4 space-y-1.5">
                <li>• <strong className="text-white">Name:</strong> anything you like, e.g. <Code>cpak</Code></li>
                <li>• <strong className="text-white">Supported account types:</strong> select <Code>Accounts in this organizational directory only (Default Directory only – Single tenant)</Code></li>
                <li>• <strong className="text-white">Redirect URI:</strong> choose <Code>Web</Code> and enter your redirect URI (see note below)</li>
              </ul>
            </li>
            <li>5. Click <strong className="text-white">Register</strong></li>
          </ol>
          <Note>
            <strong>Redirect URI - important:</strong> Microsoft requires HTTPS for any redirect URI that is not <Code>localhost</Code>.
            Depending on how you are running cpak, choose one of the options below:
            <ul className="mt-2 space-y-3 list-none">
              <li>
                <strong className="text-yellow-200">Option A - running on this machine (localhost)</strong><br />
                Use <Code>{`http://localhost:${isLocalhost ? nasPort : '8000'}/api/auth/xbox/callback`}</Code>. HTTP is allowed for localhost on any port. Access cpak via <Code>{`http://localhost:${isLocalhost ? nasPort : '8000'}`}</Code> when adding your Xbox profile.
              </li>
              <li>
                <strong className="text-yellow-200">Option B - local port-forward from your desktop to the NAS</strong><br />
                Forward a local port on your desktop to cpak running on the NAS, then register <Code>http://localhost:8000/api/auth/xbox/callback</Code>.
                Open cpak via <Code>http://localhost:8000</Code>, complete sign-in, then remove the rule. Subsequent syncs do not use OAuth.
                <div className="mt-3 space-y-3 text-xs">
                  <div>
                    <span className="text-gray-400 uppercase tracking-wide font-semibold">SSH tunnel (any OS)</span>
                    <div className="mt-1 space-y-1">
                      <div className="flex items-start gap-2"><span className="text-green-400 shrink-0">Create</span><Code>{`ssh -L 8000:localhost:${nasPort} user@${nasHost}`}</Code></div>
                      <div className="flex items-start gap-2"><span className="text-red-400 shrink-0">Undo</span><span className="text-gray-400">Close the terminal / Ctrl+C</span></div>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 uppercase tracking-wide font-semibold">Windows - netsh (run as Administrator)</span>
                    <div className="mt-1 space-y-1">
                      <div className="flex items-start gap-2"><span className="text-green-400 shrink-0">Create</span><Code>{`netsh interface portproxy add v4tov4 listenport=8000 listenaddress=127.0.0.1 connectport=${nasPort} connectaddress=${nasHost}`}</Code></div>
                      <div className="flex items-start gap-2"><span className="text-red-400 shrink-0">Undo</span><Code>netsh interface portproxy delete v4tov4 listenport=8000 listenaddress=127.0.0.1</Code></div>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 uppercase tracking-wide font-semibold">macOS - pfctl</span>
                    <div className="mt-1 space-y-1">
                      <div className="flex items-start gap-2"><span className="text-green-400 shrink-0">Create</span><Code>{`echo "rdr pass on lo0 proto tcp from any to 127.0.0.1 port 8000 -> ${nasHost} port ${nasPort}" | sudo pfctl -ef -`}</Code></div>
                      <div className="flex items-start gap-2"><span className="text-red-400 shrink-0">Undo</span><Code>sudo pfctl -F all -f /etc/pf.conf</Code></div>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-400 uppercase tracking-wide font-semibold">Linux - socat</span>
                    <div className="mt-1 space-y-1">
                      <div className="flex items-start gap-2"><span className="text-green-400 shrink-0">Create</span><Code>{`socat TCP-LISTEN:8000,bind=127.0.0.1,fork TCP:${nasHost}:${nasPort}`}</Code></div>
                      <div className="flex items-start gap-2"><span className="text-red-400 shrink-0">Undo</span><span className="text-gray-400">Kill the socat process (Ctrl+C or pkill socat)</span></div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-gray-400 text-xs">The commands above are pre-filled with <Code>{nasHost}</Code> and port <Code>{nasPort}</Code> detected from the address bar.</div>
                <div className="mt-2 bg-red-900/20 border border-red-600/40 rounded px-3 py-2 text-red-300 text-xs">
                  <strong>⚠ SSH &quot;administratively prohibited&quot; error?</strong> Your NAS has TCP forwarding disabled in sshd_config, common on Synology, QNAP, and similar appliances, on truenas scale this can be enabled in the UI. Use the <strong>netsh / pfctl / socat</strong> approach above, or switch to <strong>Option C</strong> or <strong>Option D</strong>.
                </div>
              </li>
              <li>
                <strong className="text-yellow-200">Option C - self-signed certificate (built-in)</strong><br />
                cpak includes built-in support for self-signed HTTPS via Caddy&apos;s internal CA. Set the environment variable
                <div className="mt-1 mb-1"><Code>HTTPS_MODE=self-signed</Code></div>
                when running the container. Caddy will serve HTTPS on port 443 and automatically redirect port 80 to HTTPS. Map port 443 in your container, e.g.{' '}
                <Code>{`-p ${nasPort}:443`}</Code>, then register
                <div className="mt-1 mb-1"><Code>{httpsCallbackUrl}</Code></div>
                as the redirect URI. The first time you open cpak your browser will show an &quot;untrusted certificate&quot; warning, click <strong className="text-yellow-200">Advanced → Proceed</strong> to accept it. After that, the OAuth sign-in flow will work normally because the browser has already accepted the certificate exception.
              </li>
              <li>
                <strong className="text-yellow-200">Option D - your own certificate (Let&apos;s Encrypt, ZeroSSL, corporate CA…)</strong><br />
                If you already have a valid certificate for your domain or IP, set{' '}
                <Code>HTTPS_MODE=custom-cert</Code> and mount the PEM files into the container:
                <div className="mt-2 space-y-1 text-xs">
                  <div className="flex items-start gap-2"><span className="text-gray-400 shrink-0">cert</span><Code>-v /path/to/cert.pem:/etc/caddy/tls/cert.pem:ro</Code></div>
                  <div className="flex items-start gap-2"><span className="text-gray-400 shrink-0">key</span><Code>-v /path/to/key.pem:/etc/caddy/tls/key.pem:ro</Code></div>
                </div>
                <div className="mt-2">Register <Code>{httpsCallbackUrl}</Code> as the redirect URI. Because the certificate is trusted by browsers, no warning is shown and Microsoft will also accept the redirect URI without issues.</div>
              </li>
            </ul>
          </Note>
        </Step>

        {/* Step 3 */}
        <Step number={3} title="Copy the Application (Client) ID">
          <p>
            After the app is created you will land on its Overview page. Find and copy the{' '}
            <strong className="text-white">Application (client) ID</strong> - it looks like{' '}
            <Code>xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</Code>.
          </p>
          <p>This is the <strong className="text-white">Client ID</strong> you will paste into cpak Settings.</p>
        </Step>

        {/* Step 4 */}
        <Step number={4} title="Create a Client Secret">
          <ol className="space-y-2 list-none">
            <li>1. In the left sidebar of your app, click <strong className="text-white">Certificates &amp; secrets</strong></li>
            <li>2. Under <strong className="text-white">Client secrets</strong>, click <strong className="text-white">New client secret</strong></li>
            <li>3. Add a description (e.g. <Code>cpak</Code>) and choose an expiry. Click <strong className="text-white">Add</strong></li>
            <li>4. Copy the <strong className="text-white">Value</strong> column immediately - it is only shown once</li>
          </ol>
          <Note>
            Copy the <strong>Value</strong>, not the Secret ID. The value will start with random characters and contain letters, numbers and symbols.
          </Note>
        </Step>

        {/* Step 5 */}
        <Step number={5} title="Update the Manifest">
          <p>
            Two manifest settings must be updated so that personal Microsoft accounts (Xbox live accounts) can sign in.
          </p>
          <ol className="space-y-3 list-none mt-3">
            <li>
              1. In the left sidebar click <strong className="text-white">Manifest</strong>
            </li>
            <li>
              2. Find <Code>requestedAccessTokenVersion</Code> inside the <Code>api</Code> object and set it to <Code>2</Code>:
              <div className="mt-2">
                <CodeBlock>{`"api": {
  "acceptMappedClaims": null,
  "knownClientApplications": [],
  "requestedAccessTokenVersion": 2,
  "oauth2PermissionScopes": [],
  "preAuthorizedApplications": []
}`}</CodeBlock>
              </div>
            </li>
            <li>
              3. Find <Code>signInAudience</Code> at the top level and set it to <Code>AzureADandPersonalMicrosoftAccount</Code>:
              <div className="mt-2">
                <CodeBlock>{`"signInAudience": "AzureADandPersonalMicrosoftAccount",`}</CodeBlock>
              </div>
            </li>
            <li>4. Click <strong className="text-white">Save</strong></li>
          </ol>
          <Note>
            Without these two changes Xbox / personal Microsoft accounts will be rejected during sign-in.
          </Note>
        </Step>

        {/* Step 6 */}
        <Step number={6} title="Enter the Credentials in cpak">
          <p>Go back to <strong className="text-white">Settings → Xbox OAuth Settings</strong> and fill in:</p>
          <ul className="mt-2 ml-4 space-y-1.5">
            <li>• <strong className="text-white">Application (Client) ID</strong> - from Step 3</li>
            <li>• <strong className="text-white">Client Secret</strong> - the Value from Step 4</li>
            <li>• <strong className="text-white">Redirect URI</strong> - the same URI you registered in Step 2</li>
          </ul>
          <p className="mt-2">Click <strong className="text-white">Save Xbox Settings</strong>, then add your Xbox profile and sign in.</p>
        </Step>

      </div>

      {/* Footer back button */}
      <div className="mt-12 pt-6 border-t border-gray-800">
        <button
          onClick={() => router.back()}
          className="px-6 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded font-medium transition text-sm"
        >
          ← Back to Settings
        </button>
      </div>
    </div>
  );
}
