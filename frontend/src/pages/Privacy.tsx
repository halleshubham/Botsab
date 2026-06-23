import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot } from "lucide-react";
import { getPublicConfig } from "@/lib/api";

const LAST_UPDATED = "26 May 2025";
const COMPANY = "Botsab";

export function Privacy() {
  const [contactEmail, setContactEmail] = useState<string>("");

  useEffect(() => {
    getPublicConfig()
      .then((r) => setContactEmail(r.data.contactEmail))
      .catch(() => {});
  }, []);

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
            <Link to="/terms" className="hover:text-foreground">Terms of Use</Link>
            <Link to="/login" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="prose prose-gray max-w-none space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
          </div>

          <Section title="1. Overview">
            <p>
              This Privacy Policy describes how {COMPANY} ("we", "us", or "our") collects, uses, and protects
              information when you use our software platform and related services (the "Service"). By using the
              Service, you agree to the collection and use of information in accordance with this policy.
            </p>
            <p>
              We are committed to protecting your personal information and your right to privacy. If you have
              questions or concerns, please contact us at{" "}
              <ContactLink email={contactEmail} />.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <Subsection title="2.1 Account Information">
              <p>When you register, we collect your email address and a hashed version of your password. We do not store your password in plain text.</p>
            </Subsection>
            <Subsection title="2.2 Usage Data">
              <p>We may collect information about how you interact with the Service, including IP addresses, browser type, pages visited, and timestamps. This data is used solely for security, debugging, and improving the Service.</p>
            </Subsection>
            <Subsection title="2.3 WhatsApp Session Data">
              <p>
                When you connect a WhatsApp account, we store encrypted session credentials on our servers solely
                to maintain your WhatsApp connection. We do not read, store, or process the content of your
                personal WhatsApp messages beyond what is technically necessary to operate the Service.
              </p>
              <p>
                Contact data synced from your WhatsApp address book (names, phone numbers) is stored in our
                database to enable the contact picker feature. This data is tied to your account and is never
                shared with third parties.
              </p>
            </Subsection>
            <Subsection title="2.4 Message Campaigns">
              <p>
                Message content, recipient lists, and campaign metadata you create are stored on our servers to
                enable bulk sending features. You are solely responsible for the content and legality of the
                messages you send.
              </p>
            </Subsection>
          </Section>

          <Section title="3. How We Use Your Information">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>To provide, operate, and maintain the Service</li>
              <li>To process your subscription and manage your account</li>
              <li>To detect and prevent fraud, abuse, and security incidents</li>
              <li>To comply with legal obligations</li>
              <li>To communicate important service updates and security notices</li>
              <li>To improve the Service based on aggregate, anonymised usage patterns</li>
            </ul>
            <p>We do not sell, rent, or trade your personal information to third parties for marketing purposes.</p>
          </Section>

          <Section title="4. Data Retention">
            <p>
              We retain your account data for as long as your account is active. Upon account deletion, we will
              delete your personal data within 30 days, except where we are required to retain it by law or for
              legitimate business purposes (e.g., billing records).
            </p>
            <p>
              WhatsApp session files are deleted immediately upon instance logout or account deletion.
            </p>
          </Section>

          <Section title="5. Data Security">
            <p>
              We implement industry-standard security measures including encrypted storage, hashed credentials,
              and access controls. However, no method of transmission over the Internet or electronic storage is
              100% secure. We cannot guarantee absolute security.
            </p>
            <p>
              In the event of a data breach that affects your personal information, we will notify you as
              required by applicable law.
            </p>
          </Section>

          <Section title="6. Third-Party Services">
            <p>
              The Service operates on infrastructure provided by third-party cloud providers. These providers
              have their own privacy policies and may process your data in accordance with those policies.
            </p>
            <p>
              <strong>WhatsApp / Meta:</strong> Our Service interacts with WhatsApp's platform on your behalf.
              WhatsApp is a product of Meta Platforms, Inc. We have no affiliation with WhatsApp or Meta.
              Your use of WhatsApp through our Service is subject to WhatsApp's own Terms of Service and
              Privacy Policy.
            </p>
          </Section>

          <Section title="7. Your Rights">
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and associated data</li>
              <li>Data portability (export of your contact lists and campaign history)</li>
              <li>Object to processing of your data in certain circumstances</li>
            </ul>
            <p>
              To exercise these rights, contact us at{" "}
              <ContactLink email={contactEmail} />.
            </p>
          </Section>

          <Section title="8. Cookies">
            <p>
              The Service does not currently use cookies for tracking or analytics. We may use browser
              localStorage to store your session token and preferences.
            </p>
          </Section>

          <Section title="9. Children's Privacy">
            <p>
              The Service is not directed to individuals under the age of 18. We do not knowingly collect
              personal information from minors. If you become aware that a child has provided us with personal
              information, please contact us immediately.
            </p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>
              We reserve the right to update this Privacy Policy at any time. We will notify you of significant
              changes by posting a notice on the Service or by email. Your continued use of the Service after
              changes are posted constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="11. Contact Us">
            <p>
              For questions, complaints, or requests regarding this Privacy Policy, please contact:
            </p>
            <p className="font-medium">
              {COMPANY}<br />
              {contactEmail && (
                <>Email: <ContactLink email={contactEmail} /></>
              )}
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t mt-16 py-6">
        <div className="mx-auto max-w-4xl px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} {COMPANY}</span>
          <div className="flex gap-5">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <Link to="/terms" className="hover:text-foreground">Terms of Use</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ContactLink({ email }: { email: string }) {
  if (!email) return null;
  return (
    <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>
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

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
