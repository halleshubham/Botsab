import { Link } from "react-router-dom";
import { Bot } from "lucide-react";

const LAST_UPDATED = "26 May 2025";
const COMPANY = "Botsab";
const CONTACT_EMAIL = "halleshubham@gmail.com";
const GITHUB_URL = "https://github.com/halleshubham/Botsab";

export function Terms() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="border-b">
        <div className="mx-auto max-w-4xl flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Bot className="h-5 w-5 text-primary" />
            Botsab
          </Link>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
            <Link to="/login" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Terms of Use</h1>
            <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
          </div>

          {/* Disclaimer banner */}
          <div className="rounded-xl border-2 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-700 px-5 py-4 text-sm space-y-1.5">
            <p className="font-semibold text-yellow-800 dark:text-yellow-400">Important Disclaimer</p>
            <p className="text-yellow-700 dark:text-yellow-300">
              {COMPANY} is an <strong>independent, open-source project</strong>. It is <strong>not</strong> affiliated
              with, endorsed by, or officially connected to WhatsApp LLC or Meta Platforms, Inc. in any way.
              This is <strong>not</strong> the official WhatsApp Business API or Cloud API offered by Meta.
              WhatsApp® is a registered trademark of WhatsApp LLC.
            </p>
          </div>

          <Section title="1. Acceptance of Terms">
            <p>
              By accessing or using {COMPANY} ("Service"), you agree to be bound by these Terms of Use ("Terms").
              If you do not agree to these Terms, you may not use the Service. We reserve the right to modify
              these Terms at any time. Continued use after changes constitutes acceptance.
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              {COMPANY} is an open-source WhatsApp automation tool that allows users to send messages, manage
              groups, and integrate via webhooks and REST API. The source code is available at{" "}
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {GITHUB_URL}
              </a>.
            </p>
            <p>
              The Service is provided as a hosted version of the open-source software for convenience. You may
              also self-host the software under the terms of its open-source licence.
            </p>
          </Section>

          <Section title="3. WhatsApp Disclaimer & Compliance">
            <p>
              <strong>3.1 No Affiliation.</strong> {COMPANY} has no business relationship with WhatsApp LLC or
              Meta Platforms, Inc. We do not represent, and are not endorsed by, WhatsApp or Meta. Use of
              "WhatsApp" on this platform refers solely to interoperability with the WhatsApp messaging
              application.
            </p>
            <p>
              <strong>3.2 Not Official API.</strong> This Service uses unofficial, reverse-engineered methods
              to interact with WhatsApp. It is <em>not</em> the WhatsApp Business Platform (Cloud API) offered
              by Meta. Using this Service may violate WhatsApp's Terms of Service, and WhatsApp may ban or
              restrict accounts that use it.
            </p>
            <p>
              <strong>3.3 User Responsibility.</strong> You are solely responsible for ensuring your use of the
              Service complies with WhatsApp's Terms of Service, all applicable laws, and regulations including
              but not limited to anti-spam laws, data protection laws (PDPA, GDPR where applicable), and
              telemarketing regulations. {COMPANY} accepts no liability for account bans, restrictions, or
              legal consequences arising from your use.
            </p>
            <p>
              <strong>3.4 Opt-Out Compliance.</strong> You must respect opt-out requests from recipients. The
              Service provides built-in opt-out detection, but you remain responsible for compliance.
            </p>
          </Section>

          <Section title="4. Permitted Use">
            <p>You may use the Service only for lawful purposes. You agree NOT to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Send unsolicited bulk messages (spam) to people who have not consented to receive them</li>
              <li>Harass, threaten, defame, or abuse any person</li>
              <li>Distribute illegal content, malware, or phishing material</li>
              <li>Violate any applicable local, national, or international law or regulation</li>
              <li>Attempt to circumvent or reverse-engineer the Service beyond what is permitted by the open-source licence</li>
              <li>Resell access to the Service without our express written permission</li>
              <li>Use the Service to conduct fraudulent activities</li>
            </ul>
          </Section>

          <Section title="5. Account & Subscription">
            <p>
              <strong>5.1 Approval.</strong> All accounts require superadmin approval before access is granted.
              We reserve the right to approve, reject, suspend, or terminate any account at our sole discretion,
              with or without notice.
            </p>
            <p>
              <strong>5.2 Billing.</strong> Subscription fees are billed in advance. All fees are
              non-refundable unless required by applicable law. We reserve the right to change pricing with
              30 days' notice.
            </p>
            <p>
              <strong>5.3 Suspension.</strong> We may immediately suspend or terminate your account if we
              determine, in our sole discretion, that you have violated these Terms or that continued access
              poses a risk to the Service, other users, or third parties.
            </p>
          </Section>

          <Section title="6. Intellectual Property">
            <p>
              The {COMPANY} source code is released as open-source software. The hosted Service, branding,
              logos, and documentation are owned by {COMPANY} and protected by applicable intellectual property
              laws. You may not use our name, logo, or branding without express written permission.
            </p>
            <p>
              You retain all rights to the content of messages you send and the data you upload to the Service.
              By using the Service, you grant us a limited licence to process that data solely for the purpose
              of operating the Service.
            </p>
          </Section>

          <Section title="7. Disclaimer of Warranties">
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
              IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, NON-INFRINGEMENT, OR UNINTERRUPTED, ERROR-FREE OPERATION.
            </p>
            <p>
              WE DO NOT WARRANT THAT THE SERVICE WILL MEET YOUR REQUIREMENTS, THAT IT WILL BE AVAILABLE AT ANY
              PARTICULAR TIME, OR THAT IT WILL ACCURATELY DELIVER MESSAGES. MESSAGE DELIVERY DEPENDS ON
              WHATSAPP'S PLATFORM, WHICH WE DO NOT CONTROL.
            </p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>
              TO THE FULLEST EXTENT PERMITTED BY LAW, {COMPANY.toUpperCase()} AND ITS OWNERS, OPERATORS, AND
              CONTRIBUTORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
              PUNITIVE DAMAGES ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE, INCLUDING BUT NOT
              LIMITED TO:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>WhatsApp account bans or restrictions</li>
              <li>Loss of business, revenue, or data</li>
              <li>Undelivered or incorrectly delivered messages</li>
              <li>Legal liability arising from messages sent through the Service</li>
              <li>Security breaches of WhatsApp accounts connected to the Service</li>
            </ul>
            <p>
              OUR TOTAL CUMULATIVE LIABILITY TO YOU SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE THREE MONTHS
              PRECEDING THE CLAIM.
            </p>
          </Section>

          <Section title="9. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless {COMPANY} and its owners, operators, and
              contributors from and against any claims, liabilities, damages, losses, and expenses (including
              reasonable legal fees) arising out of or in connection with your use of the Service, your
              violation of these Terms, or your violation of any third-party rights including WhatsApp's
              Terms of Service.
            </p>
          </Section>

          <Section title="10. Open Source">
            <p>
              {COMPANY} is proudly open source. The source code is hosted at{" "}
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {GITHUB_URL}
              </a>{" "}
              and is available for self-hosting, contributions, and inspection. We believe in transparency.
            </p>
            <p>
              The open-source licence governs the use of the code itself. These Terms of Use govern the use of
              the hosted Service. Self-hosting the code is permitted under the terms of the applicable
              open-source licence.
            </p>
          </Section>

          <Section title="11. Governing Law">
            <p>
              These Terms shall be governed by and construed in accordance with the laws of India. Any disputes
              arising from these Terms or use of the Service shall be subject to the exclusive jurisdiction of
              the courts of India.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              For questions regarding these Terms, please contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">{CONTACT_EMAIL}</a>.
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t mt-16 py-6">
        <div className="mx-auto max-w-4xl px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} {COMPANY}</span>
          <div className="flex gap-5">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold border-b pb-2">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}
