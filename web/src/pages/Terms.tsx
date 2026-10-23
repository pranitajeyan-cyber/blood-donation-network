import { Link } from 'react-router-dom'

import { LegalPage, type LegalSection } from '../components/LegalPage'
import { usePageMeta } from '../hooks/usePageMeta'

const SECTIONS: LegalSection[] = [
  {
    id: 'agreement',
    heading: 'What you are agreeing to',
    body: (
      <>
        <p>
          These terms cover your use of this website and the JSON API it calls. There is no
          account signup fee, no paid tier and no commercial relationship: the software is
          published under the MIT licence, and running or using it means accepting the
          terms below.
        </p>
        <p>
          They describe a demonstration project. They are not a contract with a hospital,
          a blood bank or any regulated entity, because none is operating this site.
        </p>
      </>
    ),
  },
  {
    id: 'not-medical',
    heading: 'It is not a medical service',
    body: (
      <>
        <p>
          Nothing here is medical advice, a diagnosis, or a guarantee that a donor will be
          found. A request raised in this interface may notify nobody at all, and that
          outcome is a legitimate result of the matching rules rather than a fault.
        </p>
        <p>
          <strong>Do not use this site for a medical emergency.</strong> Contact a hospital
          or a licensed blood bank. Blood group compatibility, donor eligibility and
          transfusion safety are clinical determinations that this software does not make.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    heading: 'Accounts and credentials',
    body: (
      <>
        <p>
          You are responsible for the credentials on your account and for activity
          performed with them. Sign out of shared machines.
        </p>
        <p>
          The public demonstration accounts listed on the sign-in page are shared with
          everyone reading the repository. Never use a password there that you use
          elsewhere. An administrator may reset the demonstration database at any time,
          which will delete any data you entered.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    heading: 'Acceptable use',
    body: (
      <>
        <ul>
          <li>
            Do not enter another person's personal or medical details without their
            consent, and do not use this instance for real patient information.
          </li>
          <li>
            Do not use the service to solicit donations fraudulently, to impersonate a
            hospital, or to harass donors who receive an alert.
          </li>
          <li>
            Do not attempt to bypass authentication or role checks, or to extract other
            users' data through the API.
          </li>
          <li>
            Do not run automated load against a publicly hosted instance. Clone it and run
            your own copy instead.
          </li>
        </ul>
        <p>
          Access may be withdrawn, without notice, from any account that does these things.
        </p>
      </>
    ),
  },
  {
    id: 'donors',
    heading: 'Donors and eligibility',
    body: (
      <>
        <p>
          Marking yourself available records an intention, not a medical clearance. The
          120-day interval, the age rules and the screening that decides whether someone
          can actually donate are the responsibility of the collecting blood bank.
        </p>
        <p>
          Alerts are informational. You may accept or decline any of them, and you should
          never travel to donate on the basis of an alert without confirming arrangements
          with the hospital that raised the request.
        </p>
      </>
    ),
  },
  {
    id: 'forecasts',
    heading: 'Forecasts and figures',
    body: (
      <>
        <p>
          The shortage forecast is a statistical estimate produced from this project's own
          historical data, and the accuracy figure shown on the home page comes from a
          real held-out backtest of that model. It is not a promise about any future
          hospital or district, and it is not clinical guidance.
        </p>
        <p>
          Every count and chart on the public pages is read from the live database at the
          time you load the page. Nothing is a placeholder, and nothing is illustrative.
          If the database is reseeded, the figures will change.
        </p>
      </>
    ),
  },
  {
    id: 'availability',
    heading: 'Availability and changes',
    body: (
      <>
        <p>
          The service is provided as-is, with no uptime commitment, and may be modified,
          suspended or taken offline at any time. The demonstration data may be reset
          without notice, which will remove accounts and requests you created.
        </p>
        <p>
          Interfaces may change between versions. The API surface is documented at{' '}
          <a href="/docs" target="_blank" rel="noreferrer">
            /docs
          </a>
          , and version history lives in the repository.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    heading: 'Warranty and liability',
    body: (
      <>
        <p>
          The software is provided &ldquo;as is&rdquo;, without warranty of any kind,
          express or implied, including fitness for a particular purpose. As stated in the
          MIT licence, the authors and copyright holders are not liable for any claim,
          damage or other liability arising from the software or its use.
        </p>
        <p>
          You use it at your own risk, and you are responsible for complying with the law
          where you deploy it, including data protection and medical device regulation if
          you adapt it for real use.
        </p>
      </>
    ),
  },
  {
    id: 'licence',
    heading: 'Licence',
    body: (
      <>
        <p>
          The source is released under the MIT licence. You may use, copy, modify, merge,
          publish, distribute, sublicense and sell copies of it, provided the copyright
          notice and permission notice are included. The full text is in the{' '}
          <a
            href="https://github.com/pranitajeyan-cyber/blood-donation-network/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
          >
            repository
          </a>
          .
        </p>
        <p>
          These terms do not restrict any right the licence grants you over the code.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    heading: 'Contact and changes to these terms',
    body: (
      <>
        <p>
          Questions, corrections and takedown requests belong in the repository's issue
          tracker. As with the privacy notice, changes are versioned in the same commit
          history as the code they describe.
        </p>
        <p>
          Read the <Link to="/privacy">privacy notice</Link> for what is stored and why.
        </p>
      </>
    ),
  },
]

export default function Terms() {
  usePageMeta({
    title: 'Terms of use',
    description:
      'The terms for using this open-source demonstration: not a medical service, no uptime commitment, MIT licensed, and demonstration data may be reset at any time.',
  })

  return (
    <LegalPage
      title="Terms of use"
      summary="This is demonstration software under the MIT licence. It is not a medical service, it will not guarantee a donor, and the data may be reset."
      updated="23 October 2026"
      notice={
        <p>
          For a real transfusion need, contact a hospital or a licensed blood bank. Do not
          rely on this site.
        </p>
      }
      sections={SECTIONS}
    />
  )
}
