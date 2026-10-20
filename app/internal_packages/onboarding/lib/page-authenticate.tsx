import { localized, React } from 'mailspring-exports';
import * as OnboardingActions from './onboarding-actions';

/**
 * Replaces the vendor's onboarding webview.
 *
 * Upstream loads `${identityServer}/onboarding?...` in a Webview, so the first-run screens —
 * including the "Disable Cloud Features?" step — are HTML served by id.getmailspring.com.
 * This fork has no identity server: the pro features run locally, which makes that page both
 * a remote dependency and, here, untrue (nothing gets disabled by skipping it).
 *
 * The onboarding store only needs one thing from this page: identityJSONReceived with
 * `{ skipped: true }` clears any stored identity and moves on to account setup.
 */
export default class AuthenticatePage extends React.Component<{ account?: object }> {
  static displayName = 'AuthenticatePage';

  _onContinue = () => {
    OnboardingActions.identityJSONReceived({ skipped: true });
  };

  render() {
    return (
      <div className="page authenticate">
        <div className="steps-container">
          <h1 style={{ marginTop: 120 }}>{localized('No Mailspring ID needed')}</h1>
          <p className="hero-text" style={{ fontSize: 16, maxWidth: 620, margin: '20px auto 0' }}>
            {localized(
              'This is a self-built fork. It never talks to Mailspring’s servers, so there is no Mailspring ID and no cloud metadata storage.'
            )}
          </p>
          <p style={{ maxWidth: 620, margin: '28px auto 0', textAlign: 'left', lineHeight: 1.7 }}>
            {localized(
              'Available locally: snooze, send later, send reminders, activity, undo send, and open/link tracking through your own tracking server.'
            )}
          </p>
          <p style={{ maxWidth: 620, margin: '12px auto 0', textAlign: 'left', lineHeight: 1.7 }}>
            {localized(
              'Still off: message translation, contact enrichment and thread sharing — those need a server component this fork does not ship.'
            )}
          </p>
        </div>
        <div className="footer">
          <button key="next" className="btn btn-large btn-continue" onClick={this._onContinue}>
            {localized('Continue')}
          </button>
        </div>
      </div>
    );
  }
}
