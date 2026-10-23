import { Link } from 'react-router-dom'

import { LegalPage, type LegalSection } from '../components/LegalPage'
import { usePageMeta } from '../hooks/usePageMeta'

const SECTIONS: LegalSection[] = [
  {
    id: 'scope',
    heading: 'What this service is',
    body: (
      <>
        <p>
          Blood Donation Network is an open-source software project. It demonstrates two
          things a donor directory usually does not do: it escalates a blood request
          through widening search radii on a timer, and it forecasts short-term demand per
          blood group and district from historical issue records.
        </p>
        <p>
          This deployment is a <strong>demonstration</strong>. It is not operated by a
          hospital, a blood bank or a medical provider, and it is not a channel for
          coordinating a real transfusion. If you need blood, contact a licensed blood
          bank or hospital directly. Nothing on this site is medical advice.
        </p>
        <p>
          The operator is the maintainer of the{' '}
          <a
            href="https://github.com/pranitajeyan-cyber/blood-donation-network"
            target="_blank"
            rel="noreferrer"
          >
            public repository
          </a>
          . There is no registered company behind it and no data protection officer,
          because there is no organisation.
        </p>
      </>
    ),
  },
  {
    id: 'collected',
    heading: 'What the database stores',
    body: (
      <>
        <p>
          An account is required to raise a request or to receive donor alerts. When you
          create one, these fields are written to the application database:
        </p>
        <dl className="legal__fields">
          <div>
            <dt>Account</dt>
            <dd>
              Name, email address, phone number, role (donor, hospital or admin), and a
              password hash. The phone number and email address are unique per account.
            </dd>
          </div>
          <div>
            <dt>Donor profile</dt>
            <dd>
              Blood group, district, availability flag, date of last donation, verification
              status, and latitude/longitude if you chose to provide a location.
            </dd>
          </div>
          <div>
            <dt>Identity attestation</dt>
            <dd>
              If you complete the simulated DigiLocker step, the attestation token returned
              by that flow is stored. The identity number itself never reaches this server.
            </dd>
          </div>
          <div>
            <dt>Activity</dt>
            <dd>
              Blood requests you raise or fulfil, alerts sent to you and their delivery
              status, recorded donations, and inventory and consumption entries.
            </dd>
          </div>
          <div>
            <dt>Audit trail</dt>
            <dd>
              Privileged actions recorded with the acting account ID, the action, the
              affected record and a timestamp. This is what the admin console reads.
            </dd>
          </div>
        </dl>
        <p>
          The demo dataset is generated locally. Accounts in it use{' '}
          <code>example.com</code> addresses, which are reserved for documentation and are
          not real mailboxes.
        </p>
      </>
    ),
  },
  {
    id: 'not-collected',
    heading: 'What is deliberately not collected',
    body: (
      <>
        <ul>
          <li>
            <strong>No government identity numbers.</strong> The verification flow records
            only an attestation token, so a database leak cannot expose an ID number.
          </li>
          <li>
            <strong>No payment details.</strong> There is nothing to buy and no billing
            integration.
          </li>
          <li>
            <strong>No clinical records.</strong> Blood group and donation dates are the
            only health-adjacent data points, and they are limited to what matching
            requires.
          </li>
          <li>
            <strong>No analytics, advertising identifiers or session recording.</strong> The
            client has no third-party script tags.
          </li>
        </ul>
        <p>
          Please do not enter another person's medical or contact details without their
          consent, and do not put real patient information into a demonstration instance.
        </p>
      </>
    ),
  },
  {
    id: 'storage',
    heading: 'Cookies and local storage',
    body: (
      <>
        <p>
          The application sets no cookies. After you sign in, the API returns a JSON Web
          Token which the browser keeps in <code>localStorage</code> under the key{' '}
          <code>bdn.token</code>. Signing out removes it.
        </p>
        <p>
          Because the API authenticates with a bearer token rather than a cookie, that
          token is readable by JavaScript running on this origin. That is a deliberate
          trade-off, acceptable here because the site loads no third-party scripts and
          shares an origin with its own API. A service handling real medical data should
          use short-lived tokens in httpOnly, <code>Secure</code>, <code>SameSite</code>{' '}
          cookies instead.
        </p>
        <p>
          The token expires after 24 hours by default. Clearing site data signs you out
          immediately.
        </p>
      </>
    ),
  },
  {
    id: 'third-parties',
    heading: 'Third parties',
    body: (
      <>
        <p>
          At runtime the page makes no requests to other domains. The typefaces are served
          from this origin rather than from a font CDN, and there is no analytics or error
          reporting service.
        </p>
        <p>
          Following the &ldquo;Source&rdquo; link takes you to GitHub, which is governed by
          its own privacy policy once you leave this site. Whoever hosts a deployment
          (a cloud provider, a reverse proxy) will see ordinary request metadata such as IP
          address and user agent, as any web server does.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    heading: 'Retention and deletion',
    body: (
      <>
        <p>
          Records stay in the database until the operator removes them; there is no
          self-service delete-account control. On a local instance the entire dataset can
          be reset by stopping the server, deleting <code>bdn.db</code> and restarting to
          reseed.
        </p>
        <p>
          If you registered on a hosted instance and want your account removed, open an
          issue on the repository with the email address you used. Requests are handled by
          the maintainer, not an automated system.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    heading: 'How the data is protected',
    body: (
      <>
        <p>
          Passwords are hashed with PBKDF2-HMAC-SHA256 at 200,000 iterations with a random
          16-byte salt per password, and compared in constant time. Plaintext passwords are
          never stored or logged. Sessions are signed with a server-side secret, and
          role checks are enforced on the API for every console endpoint rather than only
          in the interface.
        </p>
        <p>
          These are reasonable engineering defaults, not a compliance certification. The
          default signing key in the repository is explicitly insecure and must be replaced
          before any public deployment, and transport security (HTTPS) is the deployer's
          responsibility. Because this is demonstration software, treat it as unsuitable
          for confidential personal data.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    heading: 'Age and donor eligibility',
    body: (
      <>
        <p>
          The service is not directed at children, and in most jurisdictions blood
          donation requires the donor to be an adult. The 120-day lockout between donations
          implemented here is a simplification of real eligibility rules; a collecting
          blood bank remains responsible for the actual medical screening.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    heading: 'Changes to this notice',
    body: (
      <>
        <p>
          This notice describes the code as it exists today and is versioned alongside it in
          the repository, so its history is visible in the commit log. If a change
          materially affects what is stored, the update note will say so.
        </p>
        <p>
          Questions or corrections belong in the issue tracker. See also the{' '}
          <Link to="/terms">terms of use</Link>.
        </p>
      </>
    ),
  },
]

export default function Privacy() {
  usePageMeta({
    title: 'Privacy',
    description:
      'What this demonstration stores: account fields, donor profile, the attestation token, and an audit trail. What it deliberately does not: identity numbers, payments, analytics.',
  })

  return (
    <LegalPage
      title="Privacy"
      summary="What this demonstration actually stores, where it lives, and what it refuses to collect. Written to match the code rather than to sound reassuring."
      updated="23 October 2026"
      notice={
        <p>
          This is a demonstration deployment, not a medical service. Please do not enter
          real patient information or another person's details without their consent.
        </p>
      }
      sections={SECTIONS}
    />
  )
}
